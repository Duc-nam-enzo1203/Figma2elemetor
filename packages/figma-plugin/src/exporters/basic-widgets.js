/**
 * Basic Elementor Free Widget Builders (`heading`, `text-editor`, `button`, `image`, `icon`, `video`, `divider`, etc.).
 */
import { boxValue, applyGlobalColor, appendCustomCss, applyTextShadowAndEffects, applyTypographySettings, inferHeadingTag, getTextGradientCss, buildTextClipRule, collectSubtreeTexts, escapeHtml, scopeSvgIds, svgMarkupToDataUri } from './compiler-helpers.js';

export function buildHeading(node, allocId) {
  const text = node.text || {};
  const gradCss = getTextGradientCss(text);
  const settings = {
    title: text.characters || (node.content && node.content.name) || 'Heading',
    header_size: inferHeadingTag(node),
    align: text.align === 'justified' ? 'justify' : (text.align || 'left'),
  };
  if (node.responsive?.tablet?.align) settings.align_tablet = node.responsive.tablet.align;
  if (node.responsive?.mobile?.align) settings.align_mobile = node.responsive.mobile.align;
  const fallbackColor = text.color || (text.gradient && (text.gradient.color2 || text.gradient.color1)) || null;
  if (fallbackColor) {
    settings.title_color = fallbackColor;
    if (!gradCss) {
      applyGlobalColor(settings, 'title_color', fallbackColor);
    }
  }
  if (node.link) {
    settings.link = { url: node.link, is_external: '', nofollow: '' };
  }
  applyTypographySettings(settings, 'typography', text, node.responsive);
  applyTextShadowAndEffects(settings, text, 'selector .elementor-heading-title');
  if (gradCss) {
    appendCustomCss(settings, buildTextClipRule('selector .elementor-heading-title', gradCss));
  }
  if (node.layout && Number(node.layout.maxWidth) > 0) {
    appendCustomCss(settings, `selector { max-width: ${Math.round(Number(node.layout.maxWidth))}px; }`);
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'heading',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildTextEditor(node, allocId) {
  const text = node.text || {};
  const gradCss = getTextGradientCss(text);
  const raw = String(text.characters || '').trim();
  const inlineGradStyle = gradCss
    ? `background:${gradCss};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;`
    : '';
  const pSpace = Number(text.paragraphSpacing) > 0 ? Math.round(Number(text.paragraphSpacing)) : 0;

  let paragraphs = '';
  if (Array.isArray(text.richSegments) && text.richSegments.length > 1) {
    const lines = [[]];
    for (const seg of text.richSegments) {
      const parts = String(seg.characters || '').split(/\n/);
      parts.forEach((part, pIdx) => {
        if (pIdx > 0) lines.push([]);
        if (!part) return;
        const styles = [];
        if (seg.color && seg.color !== text.color) styles.push(`color:${seg.color}`);
        if (seg.fontWeight && seg.fontWeight !== text.fontWeight) styles.push(`font-weight:${seg.fontWeight}`);
        if (seg.fontStyle === 'italic' && text.fontStyle !== 'italic') styles.push('font-style:italic');
        if (seg.decoration) styles.push(`text-decoration:${seg.decoration}`);
        const escaped = escapeHtml(part);
        lines[lines.length - 1].push(styles.length > 0 ? `<span style="${styles.join(';')};">${escaped}</span>` : escaped);
      });
    }
    const nonEmptyLines = lines.map((l) => l.join('')).filter((l) => l.length > 0);
    paragraphs = nonEmptyLines
      .map((lineHtml, idx) => {
        const mb = (pSpace > 0 && idx < nonEmptyLines.length - 1) ? pSpace : 0;
        return `<p style="margin:0${mb > 0 ? ` 0 ${mb}px 0` : ''};${inlineGradStyle}">${lineHtml}</p>`;
      })
      .join('');
  } else {
    const rawLines = raw.split(/\n+/).filter(Boolean);
    paragraphs = rawLines
      .map((line, idx) => {
        const mb = (pSpace > 0 && idx < rawLines.length - 1) ? pSpace : 0;
        return `<p style="margin:0${mb > 0 ? ` 0 ${mb}px 0` : ''};${inlineGradStyle}">${escapeHtml(line)}</p>`;
      })
      .join('');
  }
  const settings = {
    editor: paragraphs || '<p style="margin:0;"></p>',
    align: text.align === 'justified' ? 'justify' : (text.align || 'left'),
  };
  if (node.responsive?.tablet?.align) settings.align_tablet = node.responsive.tablet.align;
  if (node.responsive?.mobile?.align) settings.align_mobile = node.responsive.mobile.align;
  const fallbackColor = text.color || (text.gradient && (text.gradient.color2 || text.gradient.color1)) || null;
  if (fallbackColor) {
    settings.text_color = fallbackColor;
    if (!gradCss) {
      applyGlobalColor(settings, 'text_color', fallbackColor);
    }
  }
  applyTypographySettings(settings, 'typography', text, node.responsive);
  applyTextShadowAndEffects(settings, text, 'selector');
  if (gradCss) {
    appendCustomCss(settings, buildTextClipRule('selector', gradCss));
  }
  if (node.layout && Number(node.layout.maxWidth) > 0) {
    appendCustomCss(settings, `selector { max-width: ${Math.round(Number(node.layout.maxWidth))}px; }`);
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'text-editor',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildButton(node, allocId, options = {}) {
  const { linearBorder = true, resolveMedia = null } = options;
  const text = node.text || {};
  const style = node.style || {};
  const layout = node.layout || {};
  const settings = {
    text: (node.content && node.content.characters) || text.characters || (node.content && node.content.name) || 'Button',
    align: layout.sizingH === 'FILL' ? 'justify' : (text.align || 'center'),
  };

  if (style.gradient) {
    settings.background_background = 'gradient';
    settings.background_gradient_type = style.gradient.type || 'linear';
    settings.background_color = style.gradient.color1;
    settings.background_color_stop = { unit: '%', size: style.gradient.stop1, sizes: [] };
    settings.background_color_b = style.gradient.color2;
    settings.background_color_b_stop = { unit: '%', size: style.gradient.stop2, sizes: [] };
    settings.background_gradient_angle = { unit: 'deg', size: style.gradient.angle || 180, sizes: [] };
  } else if (style.background) {
    settings.background_background = 'classic';
    settings.background_color = style.background;
    applyGlobalColor(settings, 'background_color', style.background);
  } else {
    settings.background_background = 'classic';
    settings.background_color = 'rgba(0,0,0,0)';
  }

  if (node.buttonIcon) {
    settings.selected_icon = {
      value: node.buttonIcon.value || 'fas fa-arrow-right',
      library: node.buttonIcon.library || 'fa-solid',
    };
    settings.icon_align = node.buttonIcon.align || 'right';
    const iconGap = (typeof layout.gap === 'number' && layout.gap > 0) ? Math.round(layout.gap) : 8;
    settings.icon_indent = { unit: 'px', size: iconGap, sizes: [] };
  }

  if (node.link) {
    settings.link = { url: node.link, is_external: '', nofollow: '' };
  }
  const btnTextColor = text.color || (text.gradient && (text.gradient.color2 || text.gradient.color1)) || null;
  if (btnTextColor) {
    settings.button_text_color = btnTextColor;
    applyGlobalColor(settings, 'button_text_color', btnTextColor);
  }
  applyTypographySettings(settings, 'typography', text, node.responsive);
  applyTextShadowAndEffects(settings, text, 'selector .elementor-button-text');
  if (style.radius) settings.border_radius = boxValue(style.radius);
  if (style.borderWidth && style.borderColor) {
    settings.border_border = style.borderStyle || 'solid';
    settings.border_width = boxValue(style.borderWidth);
    settings.border_color = style.borderColor;
    applyGlobalColor(settings, 'border_color', style.borderColor);
  }
  if (node.hoverStyle) {
    if (node.hoverStyle.color) settings.hover_color = node.hoverStyle.color;
    if (node.hoverStyle.background) settings.button_background_hover_color = node.hoverStyle.background;
    if (node.hoverStyle.borderColor) settings.button_hover_border_color = node.hoverStyle.borderColor;
  }
  if (style.boxShadow) {
    settings.button_box_shadow_box_shadow_type = 'yes';
    settings.button_box_shadow_box_shadow = style.boxShadow;
    if (style.boxShadow.position === 'inset') {
      settings.button_box_shadow_box_shadow_position = 'inset';
    }
  }
  if (layout.padding && (layout.padding.top || layout.padding.right || layout.padding.bottom || layout.padding.left)) {
    settings.text_padding = boxValue(layout.padding);
  }
  if (style.backgroundImage && resolveMedia) {
    const btnBgMedia = resolveMedia(style.backgroundImage, style.backgroundImageDataUri);
    if (btnBgMedia && btnBgMedia.url) {
      const safeUrl = String(btnBgMedia.url).replace(/"/g, '%22');
      appendCustomCss(settings, `selector .elementor-button {\n  background-image: url("${safeUrl}");\n  background-size: ${style.backgroundSize || 'cover'};\n  background-position: ${style.backgroundPosition || 'center center'};\n  background-repeat: ${style.backgroundRepeat || 'no-repeat'};\n}`);
    }
  }
  if (Number(layout.minHeight) > 0) {
    appendCustomCss(settings, `selector .elementor-button { min-height: ${Math.round(Number(layout.minHeight))}px; }`);
  }
  if (layout.sizingH === 'FIXED' && Number(layout.width) > 0) {
    appendCustomCss(settings, `selector .elementor-button { min-width: ${Math.round(Number(layout.width))}px; }`);
  }
  if (linearBorder !== false && style.borderGradient && style.borderWidth) {
    const bw = style.borderWidth;
    const bt = Math.round(Number(bw.top) || 0);
    const br = Math.round(Number(bw.right) || 0);
    const bb = Math.round(Number(bw.bottom) || 0);
    const bl = Math.round(Number(bw.left) || 0);
    if (bt > 0 || br > 0 || bb > 0 || bl > 0) {
      const g = style.borderGradient;
      const gradCss = style.devModeBorderImage && style.devModeBorderImage.startsWith('linear-gradient')
        ? style.devModeBorderImage
        : `linear-gradient(${g.angle}deg, ${g.color1} ${g.stop1}%, ${g.color2} ${g.stop2}%)`;
      const bwCss = (bt === br && br === bb && bb === bl) ? `${bt}px` : `${bt}px ${br}px ${bb}px ${bl}px`;
      appendCustomCss(settings, `selector .elementor-button {\n  border-style: solid !important;\n  border-width: ${bwCss} !important;\n  border-image: ${gradCss} 1 !important;\n}`);
    }
  }
  const btnTextGrad = getTextGradientCss(text);
  if (btnTextGrad) {
    appendCustomCss(settings, buildTextClipRule('selector .elementor-button-text', btnTextGrad));
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'button',
    isInner: false,
    settings,
    elements: [],
  };
}

export function buildSiteLogo(node, allocId, resolveMedia) {
  const sha = (node.image && node.image.sha256) || (node.raster && node.raster.sha256) || (node.svg && node.svg.sha256) || '';
  const fallback = (node.image && node.image.dataUri) || (node.raster && node.raster.dataUri) || '';
  const media = resolveMedia ? resolveMedia(sha, fallback) : { id: '', url: fallback };
  const w = Math.max(20, Math.round(Number(node.layout && node.layout.width) || 120));

  const applyLogoBoxStyles = (logoSettings) => {
    const st = node.style || {};
    if (st.radius) logoSettings.image_border_radius = boxValue(st.radius);
    if (st.borderWidth && st.borderColor) {
      logoSettings.image_border_border = st.borderStyle || 'solid';
      logoSettings.image_border_width = boxValue(st.borderWidth);
      logoSettings.image_border_color = st.borderColor;
    }
    if (st.boxShadow) {
      logoSettings.image_box_shadow_box_shadow_type = 'yes';
      logoSettings.image_box_shadow_box_shadow = st.boxShadow;
    }
    if (node.link) {
      logoSettings.link_to = 'custom';
      logoSettings.link = { url: node.link, is_external: '', nofollow: '' };
    }
    return logoSettings;
  };

  if (media && Number(media.id) > 0 && media.url) {
    const imgRef = { id: Number(media.id), url: media.url };
    return {
      id: allocId(node.id),
      elType: 'widget',
      widgetType: 'theme-site-logo',
      isInner: false,
      settings: applyLogoBoxStyles({ image: imgRef, image_size: 'full', custom_image: imgRef, use_custom_image: 'yes', width: { unit: 'px', size: w, sizes: [] } }),
      elements: [],
    };
  }

  if (node.svg && node.svg.markup) {
    const svgImg = { url: svgMarkupToDataUri(node.svg.markup), id: '' };
    return {
      id: allocId(node.id),
      elType: 'widget',
      widgetType: 'theme-site-logo',
      isInner: false,
      settings: applyLogoBoxStyles({ image: svgImg, image_size: 'full', custom_image: svgImg, use_custom_image: 'yes', width: { unit: 'px', size: w, sizes: [] } }),
      elements: [],
    };
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'theme-site-logo',
    isInner: false,
    settings: applyLogoBoxStyles({ image: media, image_size: 'full', custom_image: media, use_custom_image: 'yes', width: { unit: 'px', size: w, sizes: [] } }),
    elements: [],
  };
}

export function buildImage(node, allocId, resolveMedia) {
  const elId = allocId(node.id);
  const sha = (node.image && node.image.sha256) || (node.raster && node.raster.sha256) || (node.svg && node.svg.sha256) || '';
  const fallback = (node.image && node.image.dataUri) || (node.raster && node.raster.dataUri) || '';
  const media = resolveMedia ? resolveMedia(sha, fallback) : { id: 0, url: fallback };
  const w = node.layout && node.layout.width ? Number(node.layout.width) : null;
  const h = node.layout && node.layout.height ? Number(node.layout.height) : null;

  if (node.svg && node.svg.markup && (!media || !media.url)) {
    const scopedSvg = scopeSvgIds(node.svg.markup, elId);
    return {
      id: elId,
      elType: 'widget',
      widgetType: 'html',
      isInner: false,
      settings: {
        html: `<div class="f2e-image-svg" style="display:inline-flex;align-items:center;max-width:100%;${w ? `width:${w}px;` : ''}${h && !(w && w > 320) ? `height:${h}px;` : 'height:auto;'}line-height:0;">${scopedSvg}</div>`,
      },
      elements: [],
    };
  }

  const settings = { image: media, image_size: 'full' };
  if (node.link) {
    settings.link_to = 'custom';
    settings.link = { url: node.link, is_external: '', nofollow: '' };
  }
  if (w) {
    settings.width = { unit: 'px', size: w, sizes: [] };
    if (w > 320) settings.width_mobile = { unit: '%', size: 100, sizes: [] };
  }
  if (h) {
    settings.height = { unit: 'px', size: h, sizes: [] };
    if (w && w > 320) settings.height_mobile = { unit: 'px', size: Math.max(180, Math.round(h * (360 / w))), sizes: [] };
    settings.object_fit = 'cover';
  }
  const st = node.style || {};
  if (st.radius) settings.image_border_radius = boxValue(st.radius);
  if (st.borderWidth && st.borderColor) {
    settings.image_border_border = st.borderStyle || 'solid';
    settings.image_border_width = boxValue(st.borderWidth);
    settings.image_border_color = st.borderColor;
  }
  if (st.boxShadow) {
    settings.image_box_shadow_box_shadow_type = 'yes';
    settings.image_box_shadow_box_shadow = st.boxShadow;
    if (st.boxShadow.position === 'inset') settings.image_box_shadow_box_shadow_position = 'inset';
  }
  const pad = node.layout && node.layout.padding;
  if (pad && (pad.top || pad.right || pad.bottom || pad.left)) settings._padding = boxValue(pad);
  if (st.gradient) {
    settings._background_background = 'gradient';
    settings._background_gradient_type = st.gradient.type || 'linear';
    settings._background_color = st.gradient.color1;
    settings._background_color_stop = { unit: '%', size: st.gradient.stop1 ?? 0, sizes: [] };
    settings._background_color_b = st.gradient.color2;
    settings._background_color_b_stop = { unit: '%', size: st.gradient.stop2 ?? 100, sizes: [] };
    settings._background_gradient_angle = { unit: 'deg', size: st.gradient.angle ?? 180, sizes: [] };
  } else if (st.background) {
    settings._background_background = 'classic';
    settings._background_color = st.background;
  }
  return { id: elId, elType: 'widget', widgetType: 'image', isInner: false, settings, elements: [] };
}

export function buildIconOrInlineSvg(node, allocId, resolveMedia) {
  const elId = allocId(node.id);
  const sha = node.svg && node.svg.sha256 ? node.svg.sha256 : '';
  const media = sha && resolveMedia ? resolveMedia(sha, '') : { id: 0, url: '' };
  const w = Math.max(12, Math.round(Number(node.layout && node.layout.width) || 24));
  const h = Math.max(12, Math.round(Number(node.layout && node.layout.height) || 24));

  if (node.svg && node.svg.markup) {
    if (media && Number(media.id) > 0 && media.url && w <= 64 && h <= 64) {
      const iconSettings = {
        selected_icon: { value: { id: Number(media.id), url: media.url }, library: 'svg' },
        size: { unit: 'px', size: w, sizes: [] },
      };
      if (node.text?.align && /^(left|center|right)$/i.test(node.text.align)) {
        iconSettings.align = node.text.align.toLowerCase();
      }
      return { id: elId, elType: 'widget', widgetType: 'icon', isInner: false, settings: iconSettings, elements: [] };
    }

    const scopedSvg = scopeSvgIds(node.svg.markup, elId);
    const svgWMatch = scopedSvg.match(/\bwidth=["'](\d+(?:\.\d+)?)/i);
    const svgHMatch = scopedSvg.match(/\bheight=["'](\d+(?:\.\d+)?)/i);
    const boxW = Math.max(w, svgWMatch ? Math.round(parseFloat(svgWMatch[1])) : w);
    const boxH = Math.max(h, svgHMatch ? Math.round(parseFloat(svgHMatch[1])) : h);
    return {
      id: elId,
      elType: 'widget',
      widgetType: 'html',
      isInner: false,
      settings: {
        html: `<div class="f2e-inline-svg" style="display:inline-flex;align-items:center;justify-content:center;width:${boxW}px;height:${boxH}px;flex-shrink:0;line-height:0;">${scopedSvg}</div>`,
      },
      elements: [],
    };
  }

  const color = (node.svg && node.svg.color) || (node.style && node.style.background) || '#1E293B';
  const iName = String((node.content && node.content.name) || '').toLowerCase();
  let faFallback = 'fas fa-circle';
  if (iName.includes('arrow') && iName.includes('left')) faFallback = 'fas fa-arrow-left';
  else if (iName.includes('arrow')) faFallback = 'fas fa-arrow-right';
  else if (iName.includes('chevron')) faFallback = 'fas fa-chevron-right';
  else if (iName.includes('check')) faFallback = 'fas fa-check';
  else if (iName.includes('phone') || iName.includes('tel')) faFallback = 'fas fa-phone-alt';
  else if (iName.includes('mail') || iName.includes('envelope')) faFallback = 'fas fa-envelope';
  else if (iName.includes('star')) faFallback = 'fas fa-star';
  else if (iName.includes('plus')) faFallback = 'fas fa-plus';
  else if (iName.includes('search')) faFallback = 'fas fa-search';
  else if (iName.includes('close') || iName.includes('times')) faFallback = 'fas fa-times';
  return {
    id: elId,
    elType: 'widget',
    widgetType: 'icon',
    isInner: false,
    settings: { selected_icon: { value: faFallback, library: 'fa-solid' }, primary_color: color, size: { unit: 'px', size: w, sizes: [] } },
    elements: [],
  };
}

export function buildCustomHtml(node, allocId) {
  const elId = allocId(node.id);
  const rawHtml = (node.svg && node.svg.markup) || (node.text && node.text.characters) || '';
  const html = (node.svg && node.svg.markup) ? scopeSvgIds(rawHtml, elId) : rawHtml;
  return { id: elId, elType: 'widget', widgetType: 'html', isInner: false, settings: { html }, elements: [] };
}

export function buildVideo(node, allocId, resolveMedia) {
  const settings = {
    video_type: 'youtube',
    youtube_url: node.link || 'https://www.youtube.com/watch?v=XHOmBV4js_E',
  };
  const sha = (node.image && node.image.sha256) || (node.raster && node.raster.sha256) || '';
  const fallback = (node.image && node.image.dataUri) || (node.raster && node.raster.dataUri) || '';
  if ((sha || fallback) && resolveMedia) {
    const media = resolveMedia(sha, fallback);
    if (media && (media.url || media.id)) {
      settings.show_image_overlay = 'yes';
      settings.image_overlay = media;
    }
  }
  return { id: allocId(node.id), elType: 'widget', widgetType: 'video', isInner: false, settings, elements: [] };
}

export function buildGoogleMaps(node, allocId) {
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'google_maps',
    isInner: false,
    settings: {
      address: (node.content && node.content.name) || 'Hanoi, Vietnam',
      zoom: { unit: 'px', size: 14, sizes: [] },
      height: { unit: 'px', size: Math.max(200, Number(node.layout && node.layout.height) || 360), sizes: [] },
    },
    elements: [],
  };
}

export function buildDivider(node, allocId, parentNode = null) {
  const w = Number(node.layout && node.layout.width) || 0;
  const h = Number(node.layout && node.layout.height) || 0;
  const parentIsRow = Boolean(parentNode && parentNode.layout && parentNode.layout.direction === 'row');
  const isVertical = (parentIsRow && h >= w) || (h >= 16 && w <= 6);
  const color = (node.style && (node.style.borderColor || node.style.background)) || '#16A34A';

  if (isVertical) {
    const thickness = Math.max(1, Math.min(8, w || 1));
    const minH = Math.max(24, Math.round(h || 80));
    const vOpacity = (node.style && typeof node.style.opacity === 'number') ? node.style.opacity : 1;
    const vBg = (node.style && node.style.gradient)
      ? `linear-gradient(${node.style.gradient.angle ?? 180}deg, ${node.style.gradient.color1} ${node.style.gradient.stop1 ?? 0}%, ${node.style.gradient.color2} ${node.style.gradient.stop2 ?? 100}%)`
      : color;
    return {
      id: allocId(node.id),
      elType: 'widget',
      widgetType: 'html',
      isInner: false,
      settings: {
        html: `<div class="f2e-vertical-divider" style="width:${thickness}px;min-height:${minH}px;height:100%;background:${vBg};opacity:${vOpacity};"></div>`,
        _element_width: 'auto',
        _flex_size: 'none',
        _flex_align_self: 'stretch',
        hide_tablet: 'hidden-tablet',
        hide_mobile: 'hidden-mobile',
      },
      elements: [],
    };
  }

  const weight = Math.max(1, Math.min(20, h || 1));
  const divStyle = (node.style && /^(solid|dashed|dotted|double)$/i.test(node.style.borderStyle || ''))
    ? node.style.borderStyle.toLowerCase()
    : 'solid';
  const settings = { style: divStyle, weight: { unit: 'px', size: weight, sizes: [] }, color, align: 'left' };
  if (w > 0 && w < 400) settings.width = { unit: 'px', size: w, sizes: [] };
  if (node.style && node.style.gradient) {
    const g = node.style.gradient;
    const gradCss = `linear-gradient(${g.angle ?? 90}deg, ${g.color1} ${g.stop1 ?? 0}%, ${g.color2} ${g.stop2 ?? 100}%)`;
    appendCustomCss(settings, `selector .elementor-divider-separator {\n  border-image: ${gradCss} 1 !important;\n}`);
  }
  return { id: allocId(node.id), elType: 'widget', widgetType: 'divider', isInner: false, settings, elements: [] };
}

export function buildSpacer(node, allocId) {
  const space = Math.max(8, Number(node.layout && node.layout.height) || 24);
  return { id: allocId(node.id), elType: 'widget', widgetType: 'spacer', isInner: false, settings: { space: { unit: 'px', size: space, sizes: [] } }, elements: [] };
}

export function buildAudio(node, allocId) {
  return { id: allocId(node.id), elType: 'widget', widgetType: 'audio', isInner: false, settings: { link: { url: node.link || 'https://soundcloud.com/shayne-m-1/sets/ambient' }, visual: 'yes' }, elements: [] };
}

export function buildShortcode(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes);
  const raw = (node.text && node.text.characters) || (texts[0] && texts[0].text && texts[0].text.characters) || '';
  const sc = raw.trim().startsWith('[') ? raw.trim() : `[${(node.content && node.content.name) || 'shortcode'}]`;
  return { id: allocId(node.id), elType: 'widget', widgetType: 'shortcode', isInner: false, settings: { shortcode: sc }, elements: [] };
}

export function buildMenuAnchor(node, allocId) {
  const raw = String((node.content && node.content.name) || 'section').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  return { id: allocId(node.id), elType: 'widget', widgetType: 'menu-anchor', isInner: false, settings: { anchor: raw }, elements: [] };
}

export function buildSidebar(node, allocId) {
  return { id: allocId(node.id), elType: 'widget', widgetType: 'sidebar', isInner: false, settings: { sidebar: 'sidebar-1' }, elements: [] };
}

export function buildReadMore(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes);
  const label = (node.text && node.text.characters) || (texts[0] && texts[0].text && texts[0].text.characters) || (node.content && node.content.name) || 'Read More';
  return { id: allocId(node.id), elType: 'widget', widgetType: 'read-more', isInner: false, settings: { link_text: label }, elements: [] };
}

export function buildTextPath(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes);
  const t = node.text || (texts[0] && texts[0].text) || {};
  const settings = { text: t.characters || (node.content && node.content.name) || 'Curved Text', path: 'wave', align: t.align || 'center' };
  if (t.color) settings.text_color_normal = t.color;
  applyTypographySettings(settings, 'text_typography', t, node.responsive);
  return { id: allocId(node.id), elType: 'widget', widgetType: 'text-path', isInner: false, settings, elements: [] };
}
