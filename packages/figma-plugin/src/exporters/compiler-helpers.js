/**
 * Shared Elementor v3/v4 compiler helpers (box values, typography, box styles, subtree collectors).
 */
import { bytesToBase64, utf8Bytes } from '../utils/crypto.js';

export function boxValue(box, isLinked = false) {
  const t = Math.round(Number(box && box.top) || 0);
  const r = Math.round(Number(box && box.right) || 0);
  const b = Math.round(Number(box && box.bottom) || 0);
  const l = Math.round(Number(box && box.left) || 0);
  return {
    unit: (box && box.unit) || 'px',
    top: String(t),
    right: String(r),
    bottom: String(b),
    left: String(l),
    isLinked: Boolean(box && box.isLinked !== undefined ? box.isLinked : (isLinked || (t === r && r === b && b === l))),
  };
}

export function scaleBox(box, factor, cap) {
  if (box && box.unit && box.unit !== 'px') {
    return {
      top: Number(box.top) || 0,
      right: Number(box.right) || 0,
      bottom: Number(box.bottom) || 0,
      left: Number(box.left) || 0,
      isLinked: Boolean(box.isLinked),
      unit: box.unit,
    };
  }
  return {
    top: Math.min(cap, Math.round((Number(box && box.top) || 0) * factor)),
    right: Math.min(cap, Math.round((Number(box && box.right) || 0) * factor)),
    bottom: Math.min(cap, Math.round((Number(box && box.bottom) || 0) * factor)),
    left: Math.min(cap, Math.round((Number(box && box.left) || 0) * factor)),
    isLinked: false,
    unit: 'px',
  };
}

export function flexGapValue(layout) {
  const main = Math.max(0, Math.round(Number(layout && layout.gap) || 0));
  const cross = layout && layout.wrap && typeof layout.rowGap === 'number' ? Math.max(0, Math.round(layout.rowGap)) : main;
  const isRow = ((layout && layout.direction) || 'column') === 'row';
  const col = isRow ? main : cross;
  const row = isRow ? cross : main;
  return {
    unit: 'px',
    size: row,
    column: String(col),
    row: String(row),
    isLinked: col === row,
  };
}

export function applyGlobalColor() {
  // Exact Figma hex colors are preserved directly on Elementor controls.
  // Verified Active Kit `__globals__` IDs are bound server-side by WordPress `GlobalStyles::bindGlobalsToElements()`.
}

export function appendCustomCss(settings, cssBlock) {
  if (!settings || !cssBlock || !String(cssBlock).trim()) return;
  const block = String(cssBlock).trim();
  settings.custom_css = settings.custom_css ? `${settings.custom_css}\n${block}` : block;
}

/**
 * Zero-Loss Dev Mode Residual CSS Passthrough:
 * Emits Figma Dev Mode properties that Elementor has no native UI control for
 * (multi-stop gradients, multi-layer box-shadow, backdrop-filter, filter, mix-blend-mode,
 * transform, aspect-ratio, clip-path, opacity, -webkit-text-stroke) into `custom_css`.
 */
export function applyDevModeResidualCss(settings, style = {}, targetSelector = 'selector') {
  if (!settings || !style) return;
  const decls = [];
  if (style.devModeBackgroundCss && !style.backgroundImage && !/url\(\s*</i.test(style.devModeBackgroundCss)) {
    decls.push(`  background: ${style.devModeBackgroundCss};`);
  }
  if (style.devModeBoxShadow) {
    decls.push(`  box-shadow: ${style.devModeBoxShadow};`);
  }
  if (typeof style.opacity === 'number' && style.opacity >= 0 && style.opacity < 1) {
    decls.push(`  opacity: ${style.opacity};`);
  }
  if (style.devModeExtraCss && typeof style.devModeExtraCss === 'object') {
    for (const [prop, val] of Object.entries(style.devModeExtraCss)) {
      if (!val) continue;
      // Avoid emitting -webkit-text-stroke on outer container if handled on text selector
      if (targetSelector === 'selector' && prop.startsWith('-webkit-text-stroke')) continue;
      decls.push(`  ${prop}: ${val};`);
    }
  }
  if (decls.length > 0) {
    appendCustomCss(settings, `${targetSelector} {\n${decls.join('\n')}\n}`);
  }
}

export function applyTextShadowAndEffects(settings, text = {}, selectorTarget = 'selector') {
  if (!settings || !text) return;
  if (text.textShadow && typeof text.textShadow === 'object') {
    settings.text_shadow_text_shadow_type = 'yes';
    settings.text_shadow_text_shadow = {
      horizontal: Math.round(Number(text.textShadow.horizontal) || 0),
      vertical: Math.round(Number(text.textShadow.vertical) || 0),
      blur: Math.round(Number(text.textShadow.blur) || 0),
      color: text.textShadow.color || 'rgba(0,0,0,0.25)',
    };
  }
  if (text.textStrokeCss) {
    appendCustomCss(settings, `${selectorTarget} {\n  -webkit-text-stroke: ${text.textStrokeCss};\n}`);
  }
}

export function applyCommonBoxStyle(settings, style = {}, resolveMedia, options = {}) {
  const hasImageBg = Boolean(style.backgroundImage && resolveMedia);
  let resolvedBgMedia = null;
  if (hasImageBg) {
    const media = resolveMedia(style.backgroundImage, style.backgroundImageDataUri);
    if (media && media.url) resolvedBgMedia = media;
  }

  if (resolvedBgMedia) {
    settings.background_background = 'classic';
    settings.background_image = resolvedBgMedia;
    settings.background_size = style.backgroundSize || 'cover';
    settings.background_position = style.backgroundPosition || 'center center';
    settings.background_repeat = style.backgroundRepeat || 'no-repeat';
    if (style.background) {
      settings.background_color = style.background;
    }
    if (style.gradient) {
      settings.background_overlay_background = 'gradient';
      settings.background_overlay_gradient_type = style.gradient.type;
      settings.background_overlay_color = style.gradient.color1;
      settings.background_overlay_color_stop = { unit: '%', size: style.gradient.stop1, sizes: [] };
      settings.background_overlay_color_b = style.gradient.color2;
      settings.background_overlay_color_b_stop = { unit: '%', size: style.gradient.stop2, sizes: [] };
      settings.background_overlay_gradient_angle = { unit: 'deg', size: style.gradient.angle, sizes: [] };
      settings.background_overlay_opacity = { unit: 'px', size: 1, sizes: [] };
    }
  } else if (style.gradient) {
    settings.background_background = 'gradient';
    settings.background_gradient_type = style.gradient.type;
    settings.background_color = style.gradient.color1;
    settings.background_color_stop = { unit: '%', size: style.gradient.stop1, sizes: [] };
    settings.background_color_b = style.gradient.color2;
    settings.background_color_b_stop = { unit: '%', size: style.gradient.stop2, sizes: [] };
    settings.background_gradient_angle = { unit: 'deg', size: style.gradient.angle, sizes: [] };
  } else if (style.background) {
    settings.background_background = 'classic';
    settings.background_color = style.background;
  }

  if (style.radius) {
    settings.border_radius = boxValue(style.radius);
  }

  const bt = Math.round(Number(style.borderWidth && style.borderWidth.top) || 0);
  const br = Math.round(Number(style.borderWidth && style.borderWidth.right) || 0);
  const bb = Math.round(Number(style.borderWidth && style.borderWidth.bottom) || 0);
  const bl = Math.round(Number(style.borderWidth && style.borderWidth.left) || 0);
  const hasAnyBorderWidth = bt > 0 || br > 0 || bb > 0 || bl > 0;
  const isVerticalDividerOnly = bt === 0 && bb === 0 && (br > 0 || bl > 0);

  if (hasAnyBorderWidth && style.borderColor) {
    settings.border_border = style.borderStyle || 'solid';
    settings.border_width = boxValue(style.borderWidth);
    settings.border_color = style.borderColor;
    // When a column divider border is right-only or left-only on Desktop, clear it on Mobile where columns stack vertically
    if (isVerticalDividerOnly) {
      settings.border_width_mobile = boxValue({ top: 0, right: 0, bottom: 0, left: 0 }, true);
    }
  }

  // Linear Gradient Border Solution:
  // Elementor does not natively support linear-gradient on border-color.
  // Preserve EXACT per-side border widths (`border-width: T R B L !important;`) so 1-sided borders
  // (e.g. `border-right: 1px solid`) NEVER turn into 4-sided full box borders!
  if (options.linearBorder !== false && style.borderGradient && hasAnyBorderWidth) {
    const g = style.borderGradient;
    const gradCss = style.devModeBorderImage && style.devModeBorderImage.startsWith('linear-gradient')
      ? style.devModeBorderImage
      : `linear-gradient(${g.angle}deg, ${g.color1} ${g.stop1}%, ${g.color2} ${g.stop2}%)`;
    const bgSolid = style.background || '#ffffff';
    const bgLayer = style.gradient
      ? `linear-gradient(${style.gradient.angle}deg, ${style.gradient.color1} ${style.gradient.stop1}%, ${style.gradient.color2} ${style.gradient.stop2}%)`
      : `linear-gradient(${bgSolid}, ${bgSolid})`;
    const bwCss = (bt === br && br === bb && bb === bl) ? `${bt}px` : `${bt}px ${br}px ${bb}px ${bl}px`;
    const allFourSides = bt > 0 && br > 0 && bb > 0 && bl > 0;

    let borderSnippet = '';
    if (style.radius && allFourSides) {
      borderSnippet = `selector {\n  border-style: solid !important;\n  border-color: transparent !important;\n  border-width: ${bwCss} !important;\n  background-image: ${bgLayer}, ${gradCss} !important;\n  background-origin: border-box !important;\n  background-clip: padding-box, border-box !important;\n}`;
    } else {
      borderSnippet = `selector {\n  border-style: solid !important;\n  border-width: ${bwCss} !important;\n  border-image: ${gradCss} 1 !important;\n}`;
      if (isVerticalDividerOnly) {
        borderSnippet += `\n@media (max-width: 767px) {\n  selector { border-width: 0 !important; }\n}`;
      }
    }
    appendCustomCss(settings, borderSnippet);
  }

  if (style.boxShadow) {
    settings.box_shadow_box_shadow_type = 'yes';
    settings.box_shadow_box_shadow = style.boxShadow;
    if (style.boxShadow.position === 'inset') {
      settings.box_shadow_box_shadow_position = 'inset';
    }
  }

  applyDevModeResidualCss(settings, style, 'selector');
}

export function applyTypographySettings(settings, prefix, text = {}, responsive = {}) {
  if (!text) return;
  settings[`${prefix}_typography`] = 'custom';
  if (text.fontFamily) settings[`${prefix}_font_family`] = text.fontFamily;
  if (text.fontWeight) settings[`${prefix}_font_weight`] = String(text.fontWeight);
  if (text.fontStyle) settings[`${prefix}_font_style`] = text.fontStyle;
  if (text.transform) settings[`${prefix}_text_transform`] = text.transform;
  if (text.decoration) settings[`${prefix}_text_decoration`] = text.decoration;

  const size = Number(text.fontSize) || 16;
  settings[`${prefix}_font_size`] = { unit: 'px', size, sizes: [] };

  // Rule-based responsive typography scaling matching professional Elementor dev standards
  let tabletSize;
  let mobileSize;
  if (responsive && responsive.tablet && responsive.tablet.fontSize) {
    tabletSize = responsive.tablet.fontSize;
  } else if (size >= 40) {
    tabletSize = Math.round(size * 0.78);
  } else if (size >= 28) {
    tabletSize = Math.round(size * 0.82);
  } else if (size >= 20) {
    tabletSize = Math.round(size * 0.88);
  } else if (size >= 15) {
    tabletSize = Math.max(14, size - 1);
  } else {
    tabletSize = size;
  }

  if (responsive && responsive.mobile && responsive.mobile.fontSize) {
    mobileSize = responsive.mobile.fontSize;
  } else if (size >= 40) {
    mobileSize = Math.max(22, Math.round(size * 0.60));
  } else if (size >= 28) {
    mobileSize = Math.max(18, Math.round(size * 0.70));
  } else if (size >= 20) {
    mobileSize = Math.max(16, Math.round(size * 0.80));
  } else if (size >= 15) {
    mobileSize = Math.max(13, size - 1);
  } else {
    mobileSize = size;
  }

  settings[`${prefix}_font_size_tablet`] = { unit: 'px', size: Number(tabletSize), sizes: [] };
  settings[`${prefix}_font_size_mobile`] = { unit: 'px', size: Number(mobileSize), sizes: [] };

  if (text.lineHeight) {
    settings[`${prefix}_line_height`] = {
      unit: text.lineHeightUnit || 'px',
      size: Number(text.lineHeight),
      sizes: [],
    };
  }
  if (typeof text.letterSpacing === 'number' && text.letterSpacing !== 0) {
    settings[`${prefix}_letter_spacing`] = {
      unit: text.letterSpacingUnit || 'px',
      size: Number(text.letterSpacing),
      sizes: [],
    };
  }
}


export function inferHeadingTag(node) {
  const name = String((node.content && (node.content.rawName || node.content.name)) || '').toLowerCase();
  const match = /\bh([1-6])\b/.exec(name);
  if (match) return `h${match[1]}`;
  const size = Number(node.text && node.text.fontSize) || 24;
  if (size >= 44) return 'h1';
  if (size >= 32) return 'h2';
  if (size >= 24) return 'h3';
  if (size >= 20) return 'h4';
  return 'h5';
}

export function getTextGradientCss(text) {
  if (!text) return null;
  if (typeof text.gradientCss === 'string' && text.gradientCss.includes('gradient')) {
    return text.gradientCss.trim();
  }
  if (text.gradient && text.gradient.color1 && text.gradient.color2) {
    const g = text.gradient;
    return `linear-gradient(${g.angle ?? 180}deg, ${g.color1} ${g.stop1 ?? 0}%, ${g.color2} ${g.stop2 ?? 100}%)`;
  }
  return null;
}

export function buildTextClipRule(selectorTarget, gradCss) {
  return `${selectorTarget} {\n  background: ${gradCss};\n  background-clip: text;\n  -webkit-background-clip: text;\n  -webkit-text-fill-color: transparent;\n}`;
}


export function collectSubtreeTexts(node, nodes) {
  if (!node) return [];
  if (Array.isArray(node.extractedTexts) && node.extractedTexts.length > 0 && (!node.children || node.children.length === 0)) {
    return node.extractedTexts.map((t, idx) => ({
      id: `${node.id}-txt-${idx}`,
      text: t,
      responsive: node.responsive,
    }));
  }
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.text && n.text.characters) out.push(n);
    for (const cid of n.children || []) walk(nodes[cid]);
  };
  walk(node);
  return out;
}

export function scopeSvgIds(svgMarkup, scopeSuffix) {
  if (typeof svgMarkup !== 'string' || !svgMarkup.includes('<svg')) return svgMarkup || '';
  const suffix = String(scopeSuffix || 'f2e').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!suffix) return svgMarkup;

  const ids = [];
  const idAttrRegex = /\bid\s*=\s*(["'])([^"']+)\1/g;
  let match;
  while ((match = idAttrRegex.exec(svgMarkup)) !== null) {
    if (match[2] && !ids.includes(match[2])) {
      ids.push(match[2]);
    }
  }
  if (ids.length === 0) return svgMarkup;

  ids.sort((a, b) => b.length - a.length);
  const escRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = svgMarkup;
  for (const oldId of ids) {
    const newId = `${oldId}_${suffix}`;
    const eId = escRegex(oldId);
    out = out
      .replace(new RegExp(`(\\bid\\s*=\\s*)(["'])${eId}\\2`, 'g'), `$1$2${newId}$2`)
      .replace(new RegExp(`url\\(\\s*(["']?)#${eId}\\1\\s*\\)`, 'g'), `url(#${newId})`)
      .replace(new RegExp(`((?:xlink:)?href\\s*=\\s*)(["'])#${eId}\\2`, 'g'), `$1$2#${newId}$2`);
  }
  return out;
}

export function svgMarkupToDataUri(markup) {
  if (!markup || typeof markup !== 'string') return '';
  return `data:image/svg+xml;base64,${bytesToBase64(utf8Bytes(markup))}`;
}

export function collectSubtreeImages(node, nodes) {
  if (!node) return [];
  if (Array.isArray(node.extractedImages) && node.extractedImages.length > 0) {
    return node.extractedImages.filter(Boolean);
  }
  const out = [];
  const seen = new Set();
  const pushUnique = (imgObj) => {
    if (!imgObj || (!imgObj.sha256 && !imgObj.dataUri)) return;
    const key = `${imgObj.sha256 || ''}|${(imgObj.dataUri || '').slice(0, 48)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(imgObj);
  };
  const walk = (n) => {
    if (!n) return;
    if (Array.isArray(n.extractedImages) && n.extractedImages.length > 0) {
      for (const ei of n.extractedImages) pushUnique(ei);
    }
    if (n.image) pushUnique(n.image);
    if (n.raster) pushUnique(n.raster);
    if (!n.image && !n.raster && n.style && n.style.backgroundImage) {
      pushUnique({ sha256: n.style.backgroundImage, dataUri: n.style.backgroundImageDataUri || '' });
    }
    if (!n.image && !n.raster && !(n.style && n.style.backgroundImage) && n.svg) {
      pushUnique({
        sha256: n.svg.sha256 || '',
        dataUri: n.svg.markup ? svgMarkupToDataUri(n.svg.markup) : '',
      });
    }
    for (const cid of n.children || []) walk(nodes[cid]);
  };
  walk(node);
  return out;
}


export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

