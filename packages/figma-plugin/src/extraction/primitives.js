/**
 * Low-level Figma node primitive extractors (layout, style, typography, responsive).
 */
import { visibleChildren, isVectorGraphic } from '../tagging/widget-resolver.js';
import { inferVirtualLayout } from '../optimizer/auto-layout-fixer.js';

const WEIGHT_MAP = {
  thin: '100',
  hairline: '100',
  extralight: '200',
  ultralight: '200',
  light: '300',
  regular: '400',
  normal: '400',
  book: '400',
  medium: '500',
  semibold: '600',
  demibold: '600',
  bold: '700',
  extrabold: '800',
  ultrabold: '800',
  black: '900',
  heavy: '900',
};

/** Safe number coercion that never throws on `Symbol(figma.mixed)` */
export function safeNum(val, fallback = 0) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** Safe string coercion that never throws on `Symbol(figma.mixed)` */
export function safeStr(val, fallback = '') {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return fallback;
}

export function fontWeightOf(styleName) {
  const key = safeStr(styleName, '').toLowerCase().replace(/[\s_-]|italic|oblique/g, '');
  return WEIGHT_MAP[key] || '400';
}

export function rgbToHex(color, alpha = 1) {
  if (!color || typeof color !== 'object') return '#000000';
  const r = Math.round(Math.max(0, Math.min(1, safeNum(color.r, 0))) * 255);
  const g = Math.round(Math.max(0, Math.min(1, safeNum(color.g, 0))) * 255);
  const b = Math.round(Math.max(0, Math.min(1, safeNum(color.b, 0))) * 255);
  const a = alpha !== undefined ? safeNum(alpha, 1) : (color.a !== undefined ? safeNum(color.a, 1) : 1);
  if (a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
  }
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function extractSolidColor(paints) {
  if (!Array.isArray(paints)) return null;
  const paint = [...paints].reverse().find(
    (item) => item && item.type === 'SOLID' && item.visible !== false && safeNum(item.opacity, 1) > 0
  );
  if (!paint || !paint.color) return null;
  return rgbToHex(paint.color, safeNum(paint.opacity, 1));
}

export function extractGradient(paints) {
  if (!Array.isArray(paints)) return null;
  const paint = [...paints].reverse().find(
    (item) => item && safeStr(item.type).startsWith('GRADIENT_') && item.visible !== false && safeNum(item.opacity, 1) > 0
  );
  if (!paint || !Array.isArray(paint.gradientStops) || paint.gradientStops.length < 2) return null;

  const stop0 = paint.gradientStops[0];
  const stop1 = paint.gradientStops[paint.gradientStops.length - 1];
  let angle = 180;
  if (Array.isArray(paint.gradientHandlePositions) && paint.gradientHandlePositions.length >= 2) {
    const start = paint.gradientHandlePositions[0];
    const end = paint.gradientHandlePositions[1];
    const dx = safeNum(end && end.x) - safeNum(start && start.x);
    const dy = safeNum(end && end.y) - safeNum(start && start.y);
    angle = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
    if (angle < 0) angle += 360;
  }

  return {
    type: paint.type === 'GRADIENT_RADIAL' ? 'radial' : 'linear',
    color1: rgbToHex(stop0.color, stop0.color && stop0.color.a !== undefined ? stop0.color.a : 1),
    stop1: Math.round(safeNum(stop0.position, 0) * 100),
    color2: rgbToHex(stop1.color, stop1.color && stop1.color.a !== undefined ? stop1.color.a : 1),
    stop2: Math.round(safeNum(stop1.position, 1) * 100),
    angle,
  };
}

export function extractLayout(node, parentNode = null) {
  let width = Math.round(safeNum(node.width, 0));
  let height = Math.round(safeNum(node.height, 0));
  const strokeW = Math.max(1, Math.round(safeNum(node.strokeWeight, 1)));
  if (node.type === 'LINE') {
    const rot = Math.abs(safeNum(node.rotation, 0));
    const isVertLine = (rot >= 45 && rot <= 135) || (parentNode && parentNode.layoutMode === 'HORIZONTAL' && height === 0);
    if (isVertLine) {
      height = Math.max(width, height, 24);
      width = strokeW;
    } else if (height === 0) {
      height = strokeW;
    }
  } else if (width === 0 && height > 0) {
    width = strokeW;
  } else if (height === 0 && width > 0) {
    height = strokeW;
  }
  const rawX = safeNum(node.x, 0);
  const rawY = safeNum(node.y, 0);
  const x = parentNode && parentNode.type === 'GROUP'
    ? Math.round(rawX - safeNum(parentNode.x, 0))
    : Math.round(rawX);
  const y = parentNode && parentNode.type === 'GROUP'
    ? Math.round(rawY - safeNum(parentNode.y, 0))
    : Math.round(rawY);

  let layout;
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    layout = {
      width,
      height,
      x,
      y,
      mode: node.layoutMode === 'GRID' ? 'grid' : 'flex',
      direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
      gap: Math.max(0, Math.round(safeNum(node.itemSpacing, 0))),
      wrap: node.layoutWrap === 'WRAP',
      padding: {
        top: Math.round(safeNum(node.paddingTop, 0)),
        right: Math.round(safeNum(node.paddingRight, 0)),
        bottom: Math.round(safeNum(node.paddingBottom, 0)),
        left: Math.round(safeNum(node.paddingLeft, 0)),
      },
      justify: safeStr(node.primaryAxisAlignItems, 'MIN'),
      align: safeStr(node.counterAxisAlignItems, 'MIN'),
      primarySizing: safeStr(node.primaryAxisSizingMode, 'AUTO'),
      counterSizing: safeStr(node.counterAxisSizingMode, 'AUTO'),
      clipsContent: Boolean(node.clipsContent),
      inferred: false,
    };
    if (typeof node.counterAxisSpacing === 'number') {
      layout.rowGap = Math.max(0, Math.round(safeNum(node.counterAxisSpacing, 0)));
    }
    if (node.layoutMode === 'GRID') {
      layout.columns = Array.isArray(node.gridColumnSizes) ? node.gridColumnSizes.length : safeNum(node.gridColumnCount, 2);
      layout.rows = Array.isArray(node.gridRowSizes) ? node.gridRowSizes.length : safeNum(node.gridRowCount, 1);
    }
  } else {
    layout = inferVirtualLayout(node);
    layout.x = x;
    layout.y = y;
    layout.clipsContent = Boolean(node.clipsContent);
  }

  layout.minWidth = typeof node.minWidth === 'number' ? Math.round(node.minWidth) : (layout.minWidth ?? null);
  layout.maxWidth = typeof node.maxWidth === 'number' ? Math.round(node.maxWidth) : (layout.maxWidth ?? null);
  layout.minHeight = typeof node.minHeight === 'number' ? Math.round(node.minHeight) : (layout.minHeight ?? null);
  layout.maxHeight = typeof node.maxHeight === 'number' ? Math.round(node.maxHeight) : (layout.maxHeight ?? null);

  // Child sizing relative to parent Auto-Layout
  if (typeof node.layoutSizingHorizontal === 'string') {
    layout.sizingH = node.layoutSizingHorizontal; // 'FIXED' | 'HUG' | 'FILL'
  } else if (parentNode) {
    const parentIsRow = parentNode.layoutMode === 'HORIZONTAL';
    if (parentIsRow && safeNum(node.layoutGrow, 0) >= 1) layout.sizingH = 'FILL';
    else if (!parentIsRow && node.layoutAlign === 'STRETCH') layout.sizingH = 'FILL';
  }

  if (typeof node.layoutSizingVertical === 'string') {
    layout.sizingV = node.layoutSizingVertical; // 'FIXED' | 'HUG' | 'FILL'
  } else if (parentNode) {
    const parentIsRow = parentNode.layoutMode === 'HORIZONTAL';
    if (!parentIsRow && safeNum(node.layoutGrow, 0) >= 1) layout.sizingV = 'FILL';
    else if (parentIsRow && node.layoutAlign === 'STRETCH') layout.sizingV = 'FILL';
  }

  // Detect absolute positioning inside an Auto-Layout parent (or full-bleed background layers named "bg")
  const rawName = safeStr(node.name).trim().toLowerCase();
  const parentW = parentNode ? Math.round(safeNum(parentNode.width, 0)) : 0;
  const parentH = parentNode ? Math.round(safeNum(parentNode.height, 0)) : 0;
  if (node.layoutPositioning === 'ABSOLUTE') {
    layout.position = 'absolute';
  } else if (
    parentNode &&
    (rawName === 'bg' || rawName === 'background' || rawName === 'overlay') &&
    visibleChildren(node).length === 0 &&
    width >= parentW * 0.9 &&
    height >= parentH * 0.9
  ) {
    layout.position = 'absolute';
    layout.isBackgroundLayer = true;
  }

  return layout;
}

export function extractStyle(node) {
  const style = {};

  if (node.type !== 'TEXT') {
    const bg = extractSolidColor(node.fills);
    if (bg) style.background = bg;
    const gradient = extractGradient(node.fills);
    if (gradient) style.gradient = gradient;
  }

  // Corner radius (guards against `figma.mixed` symbol when corners differ)
  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    const r = Math.round(node.cornerRadius);
    style.radius = { top: r, right: r, bottom: r, left: r, isLinked: true };
  } else if (
    typeof node.topLeftRadius === 'number' ||
    typeof node.topRightRadius === 'number' ||
    typeof node.bottomRightRadius === 'number' ||
    typeof node.bottomLeftRadius === 'number'
  ) {
    const tl = Math.round(safeNum(node.topLeftRadius, 0));
    const tr = Math.round(safeNum(node.topRightRadius, 0));
    const br = Math.round(safeNum(node.bottomRightRadius, 0));
    const bl = Math.round(safeNum(node.bottomLeftRadius, 0));
    if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
      style.radius = { top: tl, right: tr, bottom: br, left: bl, isLinked: tl === tr && tr === br && br === bl };
    }
  }

  // Borders / Strokes (guards against `figma.mixed` on strokeWeight)
  const strokeSolid = extractSolidColor(node.strokes);
  const strokeGrad = extractGradient(node.strokes);
  const borderColor = strokeSolid || (strokeGrad ? strokeGrad.color1 : null);

  if (borderColor) {
    const hasIndividualStrokes =
      typeof node.strokeTopWeight === 'number' ||
      typeof node.strokeRightWeight === 'number' ||
      typeof node.strokeBottomWeight === 'number' ||
      typeof node.strokeLeftWeight === 'number';

    const roundStroke = (v) => {
      const n = safeNum(v, 0);
      return n > 0 ? Math.max(1, Math.round(n)) : 0;
    };

    if (hasIndividualStrokes) {
      const bt = roundStroke(node.strokeTopWeight);
      const br = roundStroke(node.strokeRightWeight);
      const bb = roundStroke(node.strokeBottomWeight);
      const bl = roundStroke(node.strokeLeftWeight);
      if (bt > 0 || br > 0 || bb > 0 || bl > 0) {
        style.borderWidth = { top: bt, right: br, bottom: bb, left: bl, isLinked: bt === br && br === bb && bb === bl };
      }
    } else if (typeof node.strokeWeight === 'number' && node.strokeWeight > 0) {
      const w = Math.max(1, Math.round(node.strokeWeight));
      style.borderWidth = { top: w, right: w, bottom: w, left: w, isLinked: true };
    }

    if (style.borderWidth) {
      style.borderColor = borderColor;
      if (strokeGrad) {
        style.borderGradient = strokeGrad;
      }
    }
  }

  // Box Shadow
  if (Array.isArray(node.effects)) {
    const shadow = node.effects.find(
      (ef) => ef && ef.visible !== false && (ef.type === 'DROP_SHADOW' || ef.type === 'INNER_SHADOW')
    );
    if (shadow && shadow.color) {
      style.boxShadow = {
        horizontal: Math.round(safeNum(shadow.offset && shadow.offset.x, 0)),
        vertical: Math.round(safeNum(shadow.offset && shadow.offset.y, 0)),
        blur: Math.round(safeNum(shadow.radius, 0)),
        spread: Math.round(safeNum(shadow.spread, 0)),
        color: rgbToHex(shadow.color, shadow.color.a !== undefined ? shadow.color.a : 0.25),
        position: shadow.type === 'INNER_SHADOW' ? 'inset' : '',
      };
    }
  }

  if (typeof node.opacity === 'number' && node.opacity < 1) {
    style.opacity = Math.round(node.opacity * 100) / 100;
  }

  return style;
}

export function extractTypography(node) {
  if (!node) return null;
  const characters = safeStr(node.characters, '');

  // Handle `figma.mixed` on fontSize, fontName, lineHeight, letterSpacing, fills
  let fontSize = typeof node.fontSize === 'number' ? Math.round(node.fontSize) : null;
  let fontName = node.fontName && typeof node.fontName === 'object' && node.fontName.family ? node.fontName : null;
  let lineHeightObj = node.lineHeight && typeof node.lineHeight === 'object' && node.lineHeight.unit ? node.lineHeight : null;
  let letterSpacingObj = node.letterSpacing && typeof node.letterSpacing === 'object' ? node.letterSpacing : null;
  let fillsArr = Array.isArray(node.fills) ? node.fills : null;

  if (characters.length > 0) {
    if (fontSize === null && typeof node.getRangeFontSize === 'function') {
      try {
        const s = node.getRangeFontSize(0, 1);
        if (typeof s === 'number') fontSize = Math.round(s);
      } catch (e) { }
    }
    if (!fontName && typeof node.getRangeFontName === 'function') {
      try {
        const fn = node.getRangeFontName(0, 1);
        if (fn && typeof fn === 'object' && fn.family) fontName = fn;
      } catch (e) { }
    }
    if (!lineHeightObj && typeof node.getRangeLineHeight === 'function') {
      try {
        const lh = node.getRangeLineHeight(0, 1);
        if (lh && typeof lh === 'object' && lh.unit) lineHeightObj = lh;
      } catch (e) { }
    }
    if (!letterSpacingObj && typeof node.getRangeLetterSpacing === 'function') {
      try {
        const ls = node.getRangeLetterSpacing(0, 1);
        if (ls && typeof ls === 'object') letterSpacingObj = ls;
      } catch (e) { }
    }
    if (!fillsArr && typeof node.getRangeFills === 'function') {
      try {
        const rf = node.getRangeFills(0, 1);
        if (Array.isArray(rf)) fillsArr = rf;
      } catch (e) { }
    }
  }

  const text = {
    characters,
    fontSize: fontSize || 16,
    fontFamily: fontName ? safeStr(fontName.family, 'Inter') : 'Inter',
    fontWeight: fontName ? fontWeightOf(fontName.style) : '400',
    align: safeStr(node.textAlignHorizontal, 'LEFT').toLowerCase(),
  };

  if (fontName && safeStr(fontName.style).toLowerCase().includes('italic')) {
    text.fontStyle = 'italic';
  } else {
    text.fontStyle = 'normal';
  }

  if (lineHeightObj && lineHeightObj.unit !== 'AUTO') {
    if (lineHeightObj.unit === 'PIXELS') {
      text.lineHeight = Math.round(safeNum(lineHeightObj.value, text.fontSize * 1.35));
      text.lineHeightUnit = 'px';
    } else if (lineHeightObj.unit === 'PERCENT') {
      text.lineHeight = Math.round(safeNum(lineHeightObj.value, 135)) / 100;
      text.lineHeightUnit = 'em';
    }
  } else {
    // If AUTO, generate explicit line-height based on font size for 100% theme immunity
    text.lineHeight = Math.round(text.fontSize * (text.fontSize >= 32 ? 1.2 : 1.4));
    text.lineHeightUnit = 'px';
  }

  if (letterSpacingObj && safeNum(letterSpacingObj.value, 0) !== 0) {
    const rawLs = safeNum(letterSpacingObj.value, 0);
    if (letterSpacingObj.unit === 'PERCENT') {
      text.letterSpacing = Math.round((rawLs / 100) * 1000) / 1000;
      text.letterSpacingUnit = 'em';
    } else {
      text.letterSpacing = Math.round(rawLs * 10) / 10;
      text.letterSpacingUnit = 'px';
    }
  }

  if (node.textCase === 'UPPER') text.transform = 'uppercase';
  else if (node.textCase === 'LOWER') text.transform = 'lowercase';
  else if (node.textCase === 'TITLE') text.transform = 'capitalize';

  if (node.textDecoration === 'UNDERLINE') text.decoration = 'underline';
  else if (node.textDecoration === 'STRIKETHROUGH') text.decoration = 'line-through';

  // Extract solid color OR gradient fill on TEXT nodes (e.g. background-clip: text)
  let color = extractSolidColor(fillsArr);
  const textGradient = extractGradient(fillsArr);
  if (textGradient) {
    text.gradient = textGradient;
    text.gradientCss = `linear-gradient(${textGradient.angle}deg, ${textGradient.color1} ${textGradient.stop1}%, ${textGradient.color2} ${textGradient.stop2}%)`;
    text.backgroundClipText = true;
    if (!color) {
      color = textGradient.color2 || textGradient.color1;
    }
  }
  const nodeOpacity = typeof node.opacity === 'number' ? node.opacity : 1;
  if (color && nodeOpacity < 1 && !color.startsWith('rgba')) {
    // Convert hex to rgba with node opacity
    const hex = color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    color = `rgba(${r}, ${g}, ${b}, ${Math.round(nodeOpacity * 100) / 100})`;
  }
  if (color) text.color = color;

  if (typeof node.paragraphSpacing === 'number' && node.paragraphSpacing > 0) {
    text.paragraphSpacing = Math.round(node.paragraphSpacing);
  }

  if (characters.length > 0 && typeof node.getStyledTextSegments === 'function') {
    try {
      const segs = node.getStyledTextSegments(['fontName', 'fills', 'textDecoration']);
      if (Array.isArray(segs) && segs.length > 1) {
        text.richSegments = segs.map((seg) => ({
          characters: safeStr(seg.characters, ''),
          fontWeight: seg.fontName && seg.fontName.style ? fontWeightOf(seg.fontName.style) : text.fontWeight,
          fontStyle: seg.fontName && safeStr(seg.fontName.style).toLowerCase().includes('italic') ? 'italic' : 'normal',
          decoration: seg.textDecoration === 'UNDERLINE' ? 'underline' : (seg.textDecoration === 'STRIKETHROUGH' ? 'line-through' : ''),
          color: extractSolidColor(Array.isArray(seg.fills) ? seg.fills : null) || text.color || null,
        }));
      }
    } catch (e) { }
  }

  return text;
}

export function extractLink(node) {
  const reactions = Array.isArray(node && node.reactions) ? node.reactions : [];
  for (const reaction of reactions) {
    const action = (reaction && reaction.action) || (Array.isArray(reaction && reaction.actions) ? reaction.actions[0] : null);
    if (action && action.type === 'URL' && action.url) {
      return safeStr(action.url);
    }
  }
  return null;
}

export function extractButtonIcon(node) {
  if (!node || !Array.isArray(node.children)) return null;
  const kids = node.children.filter((c) => c && c.visible !== false);
  const textChild = kids.find((c) => c.type === 'TEXT');
  if (!textChild) return null;

  // Icon child in a button MUST be a small vector graphic (width <= 36px, height <= 36px)
  const iconChild = kids.find((c) => {
    if (c.type === 'TEXT') return false;
    const w = Number(c.width) || 0;
    const h = Number(c.height) || 0;
    if (w > 36 || h > 36 || w === 0 || h === 0) return false;
    return c.type === 'VECTOR' || c.type === 'BOOLEAN_OPERATION' || c.type === 'LINE' || isVectorGraphic(c);
  });

  if (!iconChild) return null;

  const iconName = safeStr(iconChild.name).toLowerCase();
  let align = 'right';
  if (typeof iconChild.x === 'number' && typeof textChild.x === 'number') {
    align = iconChild.x < textChild.x ? 'left' : 'right';
  } else if (kids.indexOf(iconChild) < kids.indexOf(textChild)) {
    align = 'left';
  }

  let faIcon = 'fas fa-arrow-right';
  if (iconName.includes('left') || iconName.includes('prev') || iconName.includes('back')) {
    faIcon = 'fas fa-arrow-left';
  } else if (iconName.includes('up')) {
    faIcon = 'fas fa-arrow-up';
  } else if (iconName.includes('down')) {
    faIcon = 'fas fa-arrow-down';
  } else if (iconName.includes('chevron-right') || iconName.includes('chevron')) {
    faIcon = 'fas fa-chevron-right';
  } else if (iconName.includes('check')) {
    faIcon = 'fas fa-check';
  } else if (iconName.includes('plus')) {
    faIcon = 'fas fa-plus';
  } else if (iconName.includes('search')) {
    faIcon = 'fas fa-search';
  } else if (iconName.includes('play')) {
    faIcon = 'fas fa-play';
  } else if (iconName.includes('download')) {
    faIcon = 'fas fa-download';
  } else if (iconName.includes('phone') || iconName.includes('tel') || iconName.includes('call')) {
    faIcon = 'fas fa-phone-alt';
  } else if (iconName.includes('mail') || iconName.includes('envelope')) {
    faIcon = 'fas fa-envelope';
  } else if (iconName.includes('cart') || iconName.includes('bag')) {
    faIcon = 'fas fa-shopping-cart';
  } else if (iconName.includes('external') || iconName.includes('link')) {
    faIcon = 'fas fa-external-link-alt';
  } else if (iconName.includes('close') || iconName.includes('times')) {
    faIcon = 'fas fa-times';
  } else if (iconName.includes('phone') || iconName.includes('call')) {
    faIcon = 'fas fa-phone';
  } else if (iconName.includes('mail') || iconName.includes('envelope')) {
    faIcon = 'fas fa-envelope';
  } else if (iconName.includes('download')) {
    faIcon = 'fas fa-download';
  } else if (iconName.includes('external') || iconName.includes('link')) {
    faIcon = 'fas fa-external-link-alt';
  } else if (iconName.includes('cart') || iconName.includes('shop')) {
    faIcon = 'fas fa-shopping-cart';
  } else if (iconName.includes('arrow') || iconName.includes('ic') || isVectorGraphic(iconChild)) {
    faIcon = 'fas fa-arrow-right';
  } else {
    return null;
  }

  return {
    value: faIcon,
    library: 'fa-solid',
    align,
  };
}

export function captureResponsiveTree(rootNode) {
  const walk = (node, path = [], parent = null) => {
    const kids = visibleChildren(node);
    const name = safeStr(node.name).trim();
    return {
      nodeId: node.id,
      name,
      normName: name.toLowerCase(),
      type: node.type,
      pathKey: path.join('/'),
      layout: extractLayout(node, parent),
      style: extractStyle(node),
      text: node.type === 'TEXT' ? extractTypography(node) : null,
      children: kids.map((child) => walk(child, [...path, safeStr(child.name).trim().toLowerCase()], node)),
    };
  };
  return walk(rootNode, [], null);
}

export function matchResponsiveOverride(capturedTree, pathNames, expectedType) {
  if (!capturedTree) return null;
  let current = capturedTree;
  for (const seg of pathNames) {
    if (!current || !Array.isArray(current.children)) return null;
    current = current.children.find((c) => c.normName === seg);
  }
  if (!current || current.type !== expectedType) return null;
  return {
    width: current.layout && current.layout.width,
    direction: current.layout && current.layout.direction,
    gap: current.layout && current.layout.gap,
    padding: current.layout && current.layout.padding,
    columns: current.layout && current.layout.columns,
    fontSize: current.text && current.text.fontSize,
    align: current.text && current.text.align,
  };
}
