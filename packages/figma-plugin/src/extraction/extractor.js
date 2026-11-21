/**
 * Core Extraction Pipeline for Figma Plugin API
 * - Safely guards against Figma `Symbol(figma.mixed)` values on every property
 * - Extracts native Auto-Layout OR falls back to Virtual Auto-Layout Inference
 * - Extracts child positioning (`layoutPositioning === 'ABSOLUTE'`, `x`, `y`, `layoutSizingHorizontal`, `layoutSizingVertical`, `layoutGrow`, `layoutAlign`)
 * - Extracts solid & linear/radial gradient backgrounds, strokes (linked & per-side),
 *   corner radii (uniform & 4-corner), drop/inner shadows, opacity, clipContent
 * - Extracts full typography (font family, weight, size, line-height, letter-spacing, transform, color)
 * - Exports Vector/Icon/Logo groups as clean inline SVG strings + SHA-256 hash
 * - Exports Image nodes as PNG/JPG (1x/2x) + Base64 & SHA-256 hash
 */

import { sha256, utf8Decode, bytesToBase64, uuid } from '../utils/crypto.js';
import {
  resolveWidget,
  visibleChildren,
  hasImageFill,
  collectTextDescendants,
  isAtomicLeafWidget,
  isVectorGraphic,
} from '../tagging/widget-resolver.js';
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
  const x = Math.round(safeNum(node.x, 0));
  const y = Math.round(safeNum(node.y, 0));

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
      minWidth: typeof node.minWidth === 'number' ? Math.round(node.minWidth) : null,
      maxWidth: typeof node.maxWidth === 'number' ? Math.round(node.maxWidth) : null,
      minHeight: typeof node.minHeight === 'number' ? Math.round(node.minHeight) : null,
      maxHeight: typeof node.maxHeight === 'number' ? Math.round(node.maxHeight) : null,
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

    if (hasIndividualStrokes && node.strokeWeight !== Number(node.strokeTopWeight)) {
      const bt = Math.round(safeNum(node.strokeTopWeight, 0));
      const br = Math.round(safeNum(node.strokeRightWeight, 0));
      const bb = Math.round(safeNum(node.strokeBottomWeight, 0));
      const bl = Math.round(safeNum(node.strokeLeftWeight, 0));
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
  }

  if (lineHeightObj && lineHeightObj.unit !== 'AUTO') {
    if (lineHeightObj.unit === 'PIXELS') {
      text.lineHeight = Math.round(safeNum(lineHeightObj.value, text.fontSize * 1.35));
      text.lineHeightUnit = 'px';
    } else if (lineHeightObj.unit === 'PERCENT') {
      text.lineHeight = Math.round(safeNum(lineHeightObj.value, 135) / 10) / 10;
      text.lineHeightUnit = 'em';
    }
  } else {
    // If AUTO, generate explicit line-height based on font size for 100% theme immunity
    text.lineHeight = Math.round(text.fontSize * (text.fontSize >= 32 ? 1.2 : 1.4));
    text.lineHeightUnit = 'px';
  }

  if (letterSpacingObj && safeNum(letterSpacingObj.value, 0) !== 0) {
    text.letterSpacing = Math.round(safeNum(letterSpacingObj.value, 0) * 10) / 10;
  }

  if (node.textCase === 'UPPER') text.transform = 'uppercase';
  else if (node.textCase === 'LOWER') text.transform = 'lowercase';
  else if (node.textCase === 'TITLE') text.transform = 'capitalize';

  if (node.textDecoration === 'UNDERLINE') text.decoration = 'underline';
  else if (node.textDecoration === 'STRIKETHROUGH') text.decoration = 'line-through';

  // Extract solid color considering both fill opacity and node opacity (e.g. 30% opacity on text)
  let color = extractSolidColor(fillsArr);
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
  const iconChild = kids.find((c) => c.type !== 'TEXT' && (c.type === 'VECTOR' || c.type === 'INSTANCE' || c.type === 'FRAME' || c.type === 'GROUP' || c.type === 'BOOLEAN_OPERATION' || c.type === 'LINE' || isVectorGraphic(c)));

  if (!iconChild) return null;

  const iconName = safeStr(iconChild.name).toLowerCase();
  let align = 'right';
  if (textChild && typeof iconChild.x === 'number' && typeof textChild.x === 'number') {
    align = iconChild.x < textChild.x ? 'left' : 'right';
  } else if (textChild && kids.indexOf(iconChild) < kids.indexOf(textChild)) {
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
  } else {
    // Default for CTA button vector graphics
    faIcon = 'fas fa-arrow-right';
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

/**
 * Unwraps CSS variables generated by Figma Dev Mode (`var(--token-name, fallback)`)
 * and strips CSS comments (`/* 140% *\/`) so exact values are extracted deterministically.
 */
export function resolveCssVars(rawVal) {
  if (typeof rawVal !== 'string') return '';
  let s = rawVal.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  let prev = '';
  while (s.includes('var(') && s !== prev) {
    prev = s;
    s = s.replace(/var\(\s*--[^,)]+\s*,\s*([^()]+)\)/g, '$1').trim();
  }
  return s;
}

/**
 * Normalizes CSS color strings from Figma Dev Mode (e.g. `#FFF` -> `#FFFFFF`, `#000` -> `#000000`, `var(--c, #16A34A)` -> `#16A34A`).
 */
export function normalizeCssColor(rawColor) {
  const s = resolveCssVars(rawColor);
  if (!s) return null;
  const hex3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(s);
  if (hex3) {
    return `#${hex3[1]}${hex3[1]}${hex3[2]}${hex3[2]}${hex3[3]}${hex3[3]}`.toUpperCase();
  }
  const hex6 = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(s);
  if (hex6) {
    return s.toUpperCase();
  }
  if (/^rgba?\([^)]+\)$/i.test(s)) {
    return s;
  }
  const match = s.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/i);
  return match ? normalizeCssColor(match[0]) : null;
}

/**
 * Apply full Dev Mode CSS from Figma (node.getCSSAsync()) to an IR entry.
 * Treats Figma Dev Mode as the authoritative source of truth for borders, padding, flex layout, and typography.
 */
export function applyDevModeCSSToNode(entry, devModeCSS) {
  if (!entry || !devModeCSS || typeof devModeCSS !== 'object') return;
  entry.devModeCSS = devModeCSS;
  entry.devModeCSSString = Object.entries(devModeCSS)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  const style = entry.style || (entry.style = {});
  const layout = entry.layout || (entry.layout = {});
  const cssKeys = Object.keys(devModeCSS);
  if (cssKeys.length === 0) return;

  // 1. Authoritative Dev Mode Borders & Gradient Border
  const hasAnyDevBorder = Boolean(
    devModeCSS['border'] ||
    devModeCSS['border-top'] ||
    devModeCSS['border-right'] ||
    devModeCSS['border-bottom'] ||
    devModeCSS['border-left'] ||
    devModeCSS['border-width'] ||
    devModeCSS['border-image'] ||
    devModeCSS['border-image-source']
  );

  // If Dev Mode CSS returned layout/box properties for a non-TEXT node and has NO border properties at all,
  // remove any phantom stroke from `node.strokes` that is not actually rendered in Dev Mode!
  if (!hasAnyDevBorder && entry.type !== 'text' && (devModeCSS['display'] || devModeCSS['background'] || devModeCSS['background-color'] || devModeCSS['border-radius'] || devModeCSS['padding'])) {
    delete style.borderWidth;
    delete style.borderColor;
    delete style.borderGradient;
  }

  if (devModeCSS['border-image-source'] || devModeCSS['border-image']) {
    const bImg = resolveCssVars(devModeCSS['border-image-source'] || devModeCSS['border-image']);
    style.devModeBorderImage = bImg;
    if (bImg.includes('linear-gradient')) {
      const angleMatch = bImg.match(/([\d.]+)deg/);
      const angle = angleMatch ? parseInt(angleMatch[1], 10) : 180;
      const colors = (bImg.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g) || ['#64A14F', '#038132']).map((c) => normalizeCssColor(c) || c);
      style.borderGradient = {
        angle,
        color1: colors[0] || '#64A14F',
        stop1: 0,
        color2: colors[1] || colors[0] || '#038132',
        stop2: 100,
      };
      if (!style.borderColor) style.borderColor = colors[0] || '#64A14F';
    }
  }

  if (devModeCSS['border-radius']) {
    const rClean = resolveCssVars(devModeCSS['border-radius']);
    const parts = rClean.split(/\s+/).map((p) => parseFloat(p) || 0);
    if (parts.length === 1 && parts[0] > 0) {
      style.radius = { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0], isLinked: true };
    } else if (parts.length === 2) {
      style.radius = { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1], isLinked: false };
    } else if (parts.length === 3) {
      style.radius = { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1], isLinked: false };
    } else if (parts.length >= 4) {
      style.radius = { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3], isLinked: false };
    }
  }

  if (devModeCSS['border-top'] || devModeCSS['border-right'] || devModeCSS['border-bottom'] || devModeCSS['border-left']) {
    const parseSide = (val) => {
      const clean = resolveCssVars(val);
      if (!clean || clean === 'none' || clean === '0') return { w: 0, c: null };
      const wMatch = clean.match(/([\d.]+)px/);
      const c = normalizeCssColor(clean);
      return {
        w: wMatch ? Math.max(1, Math.round(parseFloat(wMatch[1]))) : 0,
        c,
      };
    };
    const st = parseSide(devModeCSS['border-top']);
    const sr = parseSide(devModeCSS['border-right']);
    const sb = parseSide(devModeCSS['border-bottom']);
    const sl = parseSide(devModeCSS['border-left']);
    if (st.w > 0 || sr.w > 0 || sb.w > 0 || sl.w > 0) {
      style.borderWidth = {
        top: st.w,
        right: sr.w,
        bottom: sb.w,
        left: sl.w,
        isLinked: st.w === sr.w && sr.w === sb.w && sb.w === sl.w,
      };
      const sideColor = st.c || sr.c || sb.c || sl.c;
      if (sideColor) {
        style.borderColor = sideColor;
      }
    }
  }

  if (devModeCSS['border-width'] || devModeCSS['border']) {
    const bClean = resolveCssVars(devModeCSS['border']);
    const bwClean = resolveCssVars(devModeCSS['border-width']);
    if (bClean === 'none' || bClean === '0' || bwClean === '0' || bwClean === '0px') {
      delete style.borderWidth;
      delete style.borderColor;
    } else {
      if (bwClean) {
        const bwParts = bwClean.split(/\s+/).map((p) => Math.round(parseFloat(p) || 0));
        if (bwParts.length === 1 && bwParts[0] > 0) {
          style.borderWidth = { top: bwParts[0], right: bwParts[0], bottom: bwParts[0], left: bwParts[0], isLinked: true };
        } else if (bwParts.length === 4) {
          style.borderWidth = { top: bwParts[0], right: bwParts[1], bottom: bwParts[2], left: bwParts[3], isLinked: false };
        }
      } else if (bClean) {
        const bwMatch = bClean.match(/([\d.]+)px/);
        if (bwMatch && !style.borderWidth) {
          const bw = Math.max(1, Math.round(parseFloat(bwMatch[1])));
          style.borderWidth = { top: bw, right: bw, bottom: bw, left: bw, isLinked: true };
        }
      }
      if (bClean) {
        const c = normalizeCssColor(bClean);
        if (c) style.borderColor = c;
      }
    }
  }

  if (devModeCSS['border-color']) {
    const c = normalizeCssColor(devModeCSS['border-color']);
    if (c) style.borderColor = c;
  }

  // 2. Authoritative Dev Mode Background & Gradient
  const devBg = resolveCssVars(devModeCSS['background'] || devModeCSS['background-color'] || '');
  if (devBg) {
    if (devBg.includes('linear-gradient')) {
      const angleMatch = devBg.match(/([\d.]+)deg/);
      const angle = angleMatch ? parseInt(angleMatch[1], 10) : 180;
      const colors = (devBg.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g) || []).map((c) => normalizeCssColor(c) || c);
      if (colors.length >= 2) {
        style.gradient = {
          type: 'linear',
          angle,
          color1: colors[0],
          stop1: 0,
          color2: colors[colors.length - 1],
          stop2: 100,
        };
      }
    } else {
      const solidBg = normalizeCssColor(devBg);
      if (solidBg) style.background = solidBg;
    }
  }

  // 3. Authoritative Dev Mode Flexbox, Padding, Gap & Box Sizing
  const disp = resolveCssVars(devModeCSS['display'] || '');
  if (disp === 'flex' || disp === 'inline-flex') {
    layout.mode = 'flex';
    const fDir = resolveCssVars(devModeCSS['flex-direction'] || '');
    layout.direction = fDir === 'column' ? 'column' : 'row';
    layout.inferred = false;
  } else if (disp === 'grid') {
    layout.mode = 'grid';
    layout.inferred = false;
  }

  if (devModeCSS['flex-wrap']) {
    const fw = resolveCssVars(devModeCSS['flex-wrap']);
    layout.wrap = fw === 'wrap';
  }

  if (devModeCSS['justify-content']) {
    const jc = resolveCssVars(devModeCSS['justify-content']);
    if (jc === 'space-between') layout.justify = 'SPACE_BETWEEN';
    else if (jc === 'center') layout.justify = 'CENTER';
    else if (jc === 'flex-end' || jc === 'end') layout.justify = 'MAX';
    else if (jc === 'flex-start' || jc === 'start') layout.justify = 'MIN';
  }

  if (devModeCSS['align-items']) {
    const ai = resolveCssVars(devModeCSS['align-items']);
    if (ai === 'center') layout.align = 'CENTER';
    else if (ai === 'flex-end' || ai === 'end') layout.align = 'MAX';
    else if (ai === 'baseline') layout.align = 'BASELINE';
    else if (ai === 'flex-start' || ai === 'start') layout.align = 'MIN';
  }

  // Child flex sizing from Dev Mode (`flex: 1 0 0` and `align-self: stretch`)
  if (devModeCSS['flex']) {
    const flexVal = resolveCssVars(devModeCSS['flex']);
    if (flexVal.startsWith('1 ') || flexVal === '1') {
      layout.flexGrow = 1;
      if (!layout.sizingH || layout.sizingH === 'HUG') {
        layout.sizingH = 'FILL';
      }
    }
  }
  if (devModeCSS['align-self'] && resolveCssVars(devModeCSS['align-self']) === 'stretch') {
    layout.alignSelf = 'stretch';
  }

  if (devModeCSS['padding']) {
    const pClean = resolveCssVars(devModeCSS['padding']);
    const pParts = pClean.split(/\s+/).map((p) => Math.round(parseFloat(p) || 0));
    if (pParts.length === 1) {
      layout.padding = { top: pParts[0], right: pParts[0], bottom: pParts[0], left: pParts[0], isLinked: true };
    } else if (pParts.length === 2) {
      layout.padding = { top: pParts[0], right: pParts[1], bottom: pParts[0], left: pParts[1], isLinked: false };
    } else if (pParts.length === 3) {
      layout.padding = { top: pParts[0], right: pParts[1], bottom: pParts[2], left: pParts[1], isLinked: false };
    } else if (pParts.length >= 4) {
      layout.padding = { top: pParts[0], right: pParts[1], bottom: pParts[2], left: pParts[3], isLinked: false };
    }
  }
  if (devModeCSS['padding-top'] || devModeCSS['padding-right'] || devModeCSS['padding-bottom'] || devModeCSS['padding-left']) {
    const curP = layout.padding || { top: 0, right: 0, bottom: 0, left: 0 };
    const pt = devModeCSS['padding-top'] ? Math.round(parseFloat(resolveCssVars(devModeCSS['padding-top'])) || 0) : curP.top;
    const pr = devModeCSS['padding-right'] ? Math.round(parseFloat(resolveCssVars(devModeCSS['padding-right'])) || 0) : curP.right;
    const pb = devModeCSS['padding-bottom'] ? Math.round(parseFloat(resolveCssVars(devModeCSS['padding-bottom'])) || 0) : curP.bottom;
    const pl = devModeCSS['padding-left'] ? Math.round(parseFloat(resolveCssVars(devModeCSS['padding-left'])) || 0) : curP.left;
    layout.padding = { top: pt, right: pr, bottom: pb, left: pl, isLinked: pt === pr && pr === pb && pb === pl };
  }

  if (devModeCSS['gap']) {
    const gClean = resolveCssVars(devModeCSS['gap']);
    const gParts = gClean.split(/\s+/).map((p) => Math.round(parseFloat(p) || 0));
    if (gParts.length === 1 && !isNaN(gParts[0])) {
      layout.gap = gParts[0];
    } else if (gParts.length >= 2) {
      layout.rowGap = gParts[0];
      layout.gap = gParts[1];
    }
  }
  if (devModeCSS['column-gap']) {
    const cg = Math.round(parseFloat(resolveCssVars(devModeCSS['column-gap'])) || 0);
    if (!isNaN(cg)) layout.gap = cg;
  }
  if (devModeCSS['row-gap']) {
    const rg = Math.round(parseFloat(resolveCssVars(devModeCSS['row-gap'])) || 0);
    if (!isNaN(rg)) layout.rowGap = rg;
  }

  if (devModeCSS['width'] && (!layout.width || layout.width === 0)) {
    const wVal = parseFloat(resolveCssVars(devModeCSS['width']));
    if (!isNaN(wVal)) layout.width = Math.round(wVal);
  }

  if (devModeCSS['height'] && (!layout.height || layout.height === 0)) {
    const hVal = parseFloat(resolveCssVars(devModeCSS['height']));
    if (!isNaN(hVal)) layout.height = Math.round(hVal);
  }

  // 4. Authoritative Dev Mode Typography
  if (entry.text) {
    const text = entry.text;
    if (devModeCSS['font-family']) {
      text.fontFamily = resolveCssVars(devModeCSS['font-family']).replace(/['"]/g, '').split(',')[0].trim();
    }
    if (devModeCSS['font-weight']) {
      text.fontWeight = String(resolveCssVars(devModeCSS['font-weight']));
    }
    if (devModeCSS['font-size']) {
      const fsMatch = resolveCssVars(devModeCSS['font-size']).match(/([\d.]+)px/);
      if (fsMatch) text.fontSize = Math.round(parseFloat(fsMatch[1]));
    }
    if (devModeCSS['line-height']) {
      const lhClean = resolveCssVars(devModeCSS['line-height']);
      const lhMatch = lhClean.match(/([\d.]+)px/);
      if (lhMatch) {
        text.lineHeight = Math.round(parseFloat(lhMatch[1]));
        text.lineHeightUnit = 'px';
      } else if (lhClean.includes('%')) {
        text.lineHeight = Math.round((parseFloat(lhClean) / 100) * 100) / 100;
        text.lineHeightUnit = 'em';
      }
    }
    if (devModeCSS['color']) {
      const normC = normalizeCssColor(devModeCSS['color']);
      if (normC) text.color = normC;
    }
    if (devModeCSS['letter-spacing']) {
      const lsMatch = resolveCssVars(devModeCSS['letter-spacing']).match(/([-\d.]+)px/);
      if (lsMatch) text.letterSpacing = parseFloat(lsMatch[1]);
    }
    if (devModeCSS['text-align']) {
      text.align = resolveCssVars(devModeCSS['text-align']).toLowerCase();
    }
    if (devModeCSS['text-transform']) {
      text.transform = resolveCssVars(devModeCSS['text-transform']);
    }
    if (devModeCSS['font-style']) {
      text.fontStyle = resolveCssVars(devModeCSS['font-style']);
    }
  }
}

/**
 * Full extraction of selected Figma nodes into the F2E Intermediate Representation (IR)
 */
export async function extractDesignSelection(selection, options = {}) {
  const {
    fileKey = 'local-figma',
    imageFormat = 'PNG',
    imageScale = 2,
    responsiveFrames = { tablet: null, mobile: null },
    designTokens = { colors: [], typography: [] },
    isRootSelection = true,
  } = options;

  const nodes = {};
  const assets = {};
  const assetPayloads = [];
  const warnings = [];
  const pendingExports = [];

  const visit = async (node, context = {}) => {
    const { insideAtomic = false, path = [], parentNode = null, isTopRoot = false } = context;
    if (!node || node.visible === false) return null;

    let choice = resolveWidget(node);
    // Guard: If top-level root artboard is heuristic-skip, fallback to container so export doesn't fail
    if (isTopRoot && choice.widget === 'skip' && choice.source !== 'override') {
      choice = { widget: 'container', source: 'root-fallback' };
    }
    if (choice.widget === 'skip') return null;
    if (insideAtomic) return null;

    const id = `f2e:${fileKey}:${node.id}`;
    let devModeCSS = null;
    if (typeof node.getCSSAsync === 'function') {
      try {
        devModeCSS = await node.getCSSAsync();
      } catch (e) { }
    }

    const layout = extractLayout(node, parentNode);
    const style = extractStyle(node);
    if (devModeCSS) {
      if (devModeCSS['border-image-source'] || devModeCSS['border-image']) {
        style.devModeBorderImage = devModeCSS['border-image-source'] || devModeCSS['border-image'];
      }
      if (devModeCSS['border']) {
        style.devModeBorder = devModeCSS['border'];
      }
    }

    // Skip empty decorative background placeholder frames (`bg`) that have no fill, no image, no border, and no children
    let rawKids = visibleChildren(node);
    if (
      !isTopRoot &&
      rawKids.length === 0 &&
      node.type !== 'TEXT' &&
      choice.widget === 'container' &&
      !style.background &&
      !style.gradient &&
      !style.borderColor &&
      !hasImageFill(node)
    ) {
      return null;
    }

    if (Array.isArray(layout.orderedIds) && layout.orderedIds.length === rawKids.length) {
      const byId = new Map(rawKids.map((k) => [k.id, k]));
      rawKids = layout.orderedIds.map((oid) => byId.get(oid)).filter(Boolean);
    }

    // Atomic leaf widgets consume their own subtree directly (do not produce child Elementor elements)
    const isLeafWidget = isAtomicLeafWidget(choice.widget);

    const childrenIds = [];
    if (!isLeafWidget) {
      for (const child of rawKids) {
        const childName = safeStr(child.name).trim().toLowerCase();
        const cid = await visit(child, {
          insideAtomic: false,
          path: [...path, childName],
          parentNode: node,
          isTopRoot: false,
        });
        if (cid !== null) childrenIds.push(cid);
      }
    }

    const rawLayerName = safeStr(node.name, 'Layer');
    const cleanName = rawLayerName.replace(/\[[a-z0-9_-]+\]\s*/i, '').trim() || rawLayerName;

    const entry = {
      id,
      sourceNodeId: node.id,
      type: safeStr(node.type, 'FRAME').toLowerCase(),
      widget: choice.widget === 'container-grid' ? 'container' : choice.widget,
      widgetSource: choice.source,
      children: childrenIds,
      layout: choice.widget === 'container-grid' ? { ...layout, mode: 'grid' } : layout,
      style,
      content: {
        name: cleanName,
        rawName: rawLayerName,
      },
      responsive: {},
    };

    for (const vp of ['tablet', 'mobile']) {
      if (responsiveFrames[vp]) {
        const matched = matchResponsiveOverride(responsiveFrames[vp], path, node.type);
        if (matched) entry.responsive[vp] = matched;
      }
    }

    const link = extractLink(node);
    if (link) entry.link = link;

    if (node.type === 'TEXT') {
      entry.text = extractTypography(node);
      entry.content.characters = entry.text.characters;
    }

    if (choice.widget === 'button') {
      const bIcon = extractButtonIcon(node);
      if (bIcon) entry.buttonIcon = bIcon;
      if (node.type === 'TEXT') {
        entry.text = extractTypography(node);
        entry.content.characters = entry.text.characters;
      } else {
        const textNodes = collectTextDescendants(node);
        if (textNodes.length > 0) {
          entry.text = extractTypography(textNodes[0]);
          entry.content.characters = entry.text.characters;
          if (typeof textNodes[0].getCSSAsync === 'function') {
            try {
              const btnTxtDevCSS = await textNodes[0].getCSSAsync();
              if (btnTxtDevCSS) applyDevModeCSSToNode({ text: entry.text }, btnTxtDevCSS);
            } catch (e) { }
          }
        } else {
          entry.content.characters = entry.content.name || 'Button';
        }
      }
    }

    if (devModeCSS) {
      applyDevModeCSSToNode(entry, devModeCSS);
    }

    if (choice.widget === 'nav-menu' || choice.widget === 'mega-menu') {
      const textNodes = collectTextDescendants(node);
      const menuItems = textNodes
        .map((tn) => ({
          name: safeStr(tn.characters || tn.name).trim(),
          link: extractLink(tn) || '#',
        }))
        .filter((item) => item.name.length > 0);

      entry.content.menuItems = menuItems;
      if (textNodes.length > 0) {
        entry.text = extractTypography(textNodes[0]);
      }
    }

    if (choice.widget === 'icon-list') {
      const textNodes = collectTextDescendants(node);
      const listItems = textNodes
        .map((tn, idx) => {
          let text = safeStr(tn.characters || tn.name).trim();
          text = text.replace(/^[\u2713\u2714\u2022\u00b7\u25cf\u25cb\u2013\u2014\-*]\s*/, '');
          return {
            id: `item_${idx + 1}`,
            text,
            link: extractLink(tn) || '',
          };
        })
        .filter((item) => item.text.length > 0);

      entry.content.iconList = listItems;
      if (textNodes.length > 0) {
        entry.text = extractTypography(textNodes[0]);
      }
    }

    if (choice.widget === 'icon-box' || choice.widget === 'image-box') {
      const textNodes = collectTextDescendants(node);
      if (textNodes.length > 0) {
        entry.content.title_text = safeStr(textNodes[0].characters || textNodes[0].name).trim();
        entry.text = extractTypography(textNodes[0]);
      }
      if (textNodes.length > 1) {
        entry.content.description_text = textNodes
          .slice(1)
          .map((tn) => safeStr(tn.characters || tn.name).trim())
          .filter(Boolean)
          .join('\n');
      }
      entry.content.position = (layout.direction === 'row') ? 'left' : 'top';

      const visualNode = findFirstVisualDescendant(node);
      if (visualNode && typeof visualNode.exportAsync === 'function') {
        if (hasImageFill(visualNode)) {
          pendingExports.push({ kind: 'raster', node: visualNode, id });
        } else {
          pendingExports.push({ kind: 'svg', node: visualNode, id });
        }
      }
    }

    if (choice.widget === 'counter') {
      const textNodes = collectTextDescendants(node);
      for (const tn of textNodes) {
        const str = safeStr(tn.characters || '').trim();
        if (/\d/.test(str)) {
          entry.content.counterNumber = str;
        } else if (!entry.content.counterTitle) {
          entry.content.counterTitle = str;
        }
      }
    }

    if (['accordion', 'nested-accordion', 'toggle', 'tabs', 'nested-tabs'].includes(choice.widget)) {
      const accordionItems = [];
      for (const child of rawKids) {
        const textNodes = collectTextDescendants(child);
        if (textNodes.length === 0) continue;
        const titleNode = textNodes[0];
        const bodyNodes = textNodes.slice(1);

        const titleText = safeStr(titleNode.characters || titleNode.name).trim();
        const titleTypography = extractTypography(titleNode);
        if (typeof titleNode.getCSSAsync === 'function') {
          try {
            const tCss = await titleNode.getCSSAsync();
            if (tCss) applyDevModeCSSToNode({ text: titleTypography }, tCss);
          } catch (e) { }
        }

        let bodyText = '';
        let bodyTypography = null;
        if (bodyNodes.length > 0) {
          bodyText = bodyNodes.map((bn) => safeStr(bn.characters || bn.name).trim()).filter(Boolean).join('\n');
          bodyTypography = extractTypography(bodyNodes[0]);
          if (typeof bodyNodes[0].getCSSAsync === 'function') {
            try {
              const bCss = await bodyNodes[0].getCSSAsync();
              if (bCss) applyDevModeCSSToNode({ text: bodyTypography }, bCss);
            } catch (e) { }
          }
        }

        const itemEntry = {
          sourceNodeId: child.id,
          layout: extractLayout(child, node),
          style: extractStyle(child),
        };
        if (typeof child.getCSSAsync === 'function') {
          try {
            const cCss = await child.getCSSAsync();
            if (cCss) applyDevModeCSSToNode(itemEntry, cCss);
          } catch (e) { }
        }

        accordionItems.push({
          id: child.id,
          title: titleText || safeStr(child.name, `Item ${accordionItems.length + 1}`),
          body: bodyText,
          titleTypography,
          bodyTypography,
          padding: itemEntry.layout.padding,
          borderWidth: itemEntry.style.borderWidth,
          borderColor: itemEntry.style.borderColor,
          background: itemEntry.style.background,
        });
      }
      entry.content.accordionItems = accordionItems;
    }

    if (choice.widget === 'form' || choice.widget === 'login' || choice.widget === 'search-form') {
      const formFields = [];
      let submitLabel = 'Send Message';
      for (const child of rawKids) {
        const lower = safeStr(child.name).toLowerCase();
        if (lower.includes('btn') || lower.includes('button') || lower.includes('submit')) {
          const btnTexts = collectTextDescendants(child);
          if (btnTexts.length > 0) {
            submitLabel = safeStr(btnTexts[0].characters || btnTexts[0].name).trim();
          }
          continue;
        }
        let fieldType = 'text';
        if (lower.includes('email') || lower.includes('mail')) fieldType = 'email';
        else if (lower.includes('phone') || lower.includes('tel') || lower.includes('số điện thoại')) fieldType = 'tel';
        else if (lower.includes('message') || lower.includes('comment') || lower.includes('nội dung') || (Number(child.height) || 0) >= 90) fieldType = 'textarea';

        const texts = collectTextDescendants(child).map((t) => safeStr(t.characters || t.name).trim()).filter(Boolean);
        const label = texts[0] || safeStr(child.name, `Field ${formFields.length + 1}`);
        formFields.push({
          id: `field_${formFields.length + 1}`,
          type: fieldType,
          label,
          placeholder: texts[1] || label,
          required: fieldType === 'email' ? 'true' : '',
        });
      }
      entry.content.formFields = formFields;
      entry.content.submitLabel = submitLabel;
    }

    const isVisualAssetWidget = [
      'icon',
      'image',
      'theme-site-logo',
      'site-logo',
      'theme-post-featured-image',
      'html',
    ].includes(choice.widget);

    if (isVisualAssetWidget && typeof node.exportAsync === 'function') {
      if (hasImageFill(node)) {
        pendingExports.push({ kind: 'raster', node, id });
      } else {
        // Multi-color SVG icon, logo frame, vector graphic, or illustrated shape
        pendingExports.push({ kind: 'svg', node, id });
      }
    } else if (hasImageFill(node) && typeof node.exportAsync === 'function') {
      pendingExports.push({ kind: 'raster', node, id });
    }

    nodes[id] = entry;
    return id;
  };

  const roots = [];
  for (const rootNode of selection) {
    const rid = await visit(rootNode, { insideAtomic: false, path: [], parentNode: null, isTopRoot: isRootSelection });
    if (rid !== null) roots.push(rid);
  }

  if (roots.length === 0) {
    throw new Error('Không có layer hiển thị nào để trích xuất.');
  }

  // Preserve the user-selected root frame(s) exactly as selected on canvas (never drop Container 1)
  const finalRoots = roots;

  // Process SVG and Raster exports with SHA-256 deduplication
  const seenHashes = new Map();
  const fmt = safeStr(imageFormat, 'PNG').toUpperCase() === 'JPG' ? 'JPG' : 'PNG';
  const mime = fmt === 'JPG' ? 'image/jpeg' : 'image/png';
  const scale = safeNum(imageScale, 2) === 1 ? 1 : 2;

  for (const item of pendingExports) {
    try {
      if (item.kind === 'svg') {
        const svgBytes = await item.node.exportAsync({ format: 'SVG' });
        const svgString = utf8Decode(svgBytes);
        const hash = await sha256(svgBytes);
        nodes[item.id].svg = {
          sha256: hash,
          markup: svgString,
          color: extractSolidColor(item.node.fills) || '#1E293B',
        };
        if (!seenHashes.has(hash)) {
          const asset = {
            assetId: `svg-${item.node.id}`,
            kind: 'svg',
            sha256: hash,
            mime: 'image/svg+xml',
            byteLength: svgBytes.byteLength,
            base64: bytesToBase64(svgBytes),
            markup: svgString,
          };
          assets[hash] = asset;
          assetPayloads.push(asset);
          seenHashes.set(hash, asset);
        }
      } else {
        const imgBytes = await item.node.exportAsync({
          format: fmt,
          constraint: { type: 'SCALE', value: scale },
        });
        const hash = await sha256(imgBytes);
        const b64 = bytesToBase64(imgBytes);
        const dataUri = `data:${mime};base64,${b64}`;

        nodes[item.id].raster = { sha256: hash, mime, dataUri };
        if (nodes[item.id].widget === 'image') {
          nodes[item.id].image = { sha256: hash, mime, dataUri };
        } else {
          nodes[item.id].style.backgroundImage = hash;
          nodes[item.id].style.backgroundImageDataUri = dataUri;
        }

        if (!seenHashes.has(hash)) {
          const asset = {
            assetId: `img-${item.node.id}`,
            kind: 'image',
            sha256: hash,
            mime,
            byteLength: imgBytes.byteLength,
            base64: b64,
          };
          assets[hash] = asset;
          assetPayloads.push(asset);
          seenHashes.set(hash, asset);
        }
      }
    } catch (err) {
      warnings.push({
        code: 'asset-export-failed',
        nodeId: item.node.id,
        message: `Could not export asset for "${safeStr(item.node.name)}": ${err && err.message ? err.message : err}`,
      });
    }
  }

  const document = {
    kind: 'f2e.document',
    schemaVersion: '1.0.0',
    revision: uuid(),
    title: safeStr(selection[0] && selection[0].name, 'Figma Design'),
    source: {
      provider: 'figma-plugin',
      fileKey,
      rootNodeId: safeStr(selection[0] && selection[0].id, ''),
    },
    roots: finalRoots,
    nodes,
    assets,
    tokens: designTokens,
    warnings,
  };

  return { document, assetPayloads };
}

export function detectColorRole(name) {
  const lower = safeStr(name).toLowerCase();
  if (/(^|[-_/ ])(primary|brand|main)([-_/ ]|$)/i.test(lower)) return 'primary';
  if (/(^|[-_/ ])(secondary)([-_/ ]|$)/i.test(lower)) return 'secondary';
  if (/(^|[-_/ ])(text|body|content|foreground)([-_/ ]|$)/i.test(lower)) return 'text';
  if (/(^|[-_/ ])(accent|highlight)([-_/ ]|$)/i.test(lower)) return 'accent';
  return 'custom';
}

export function detectTypographyRole(name) {
  const lower = safeStr(name).toLowerCase();
  if (/^h1\b|heading[\s_/-]?1/i.test(lower)) return 'h1';
  if (/^h2\b|heading[\s_/-]?2/i.test(lower)) return 'h2';
  if (/^h3\b|heading[\s_/-]?3/i.test(lower)) return 'h3';
  if (/^h4\b|heading[\s_/-]?4/i.test(lower)) return 'h4';
  if (/^h5\b|heading[\s_/-]?5/i.test(lower)) return 'h5';
  if (/^h6\b|heading[\s_/-]?6/i.test(lower)) return 'h6';
  if (/body|paragraph|regular|base/i.test(lower)) return 'body';
  if (/link|anchor/i.test(lower)) return 'link';
  return 'custom';
}

function findNodeCandidate(nodes, predicate, depth = 0) {
  if (!Array.isArray(nodes) || depth > 5) return null;
  for (const n of nodes) {
    if (!n || n.visible === false) continue;
    if (predicate(n)) return n;
    if (Array.isArray(n.children)) {
      const found = findNodeCandidate(n.children, predicate, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export async function extractLocalDesignSystem(figmaApi, activeSelection = null) {
  const colors = [];
  const typography = [];
  const selection = Array.isArray(activeSelection)
    ? activeSelection
    : (figmaApi && figmaApi.currentPage && Array.isArray(figmaApi.currentPage.selection) ? figmaApi.currentPage.selection : []);

  try {
    if (figmaApi && figmaApi.variables && typeof figmaApi.variables.getLocalVariablesAsync === 'function') {
      const collections = typeof figmaApi.variables.getLocalVariableCollectionsAsync === 'function'
        ? await figmaApi.variables.getLocalVariableCollectionsAsync()
        : [];
      const defaultModes = {};
      for (const col of collections || []) {
        defaultModes[col.id] = col.defaultModeId || (col.modes && col.modes[0] ? col.modes[0].modeId : null);
      }
      const colorVars = await figmaApi.variables.getLocalVariablesAsync('COLOR');
      for (const v of colorVars || []) {
        const val = v.valuesByMode ? v.valuesByMode[defaultModes[v.variableCollectionId]] : null;
        if (val && typeof val === 'object' && val.type !== 'VARIABLE_ALIAS' && typeof val.r === 'number') {
          const hex = rgbToHex(val, val.a !== undefined ? val.a : 1);
          const name = safeStr(v.name, 'Color');
          colors.push({
            name,
            value: hex,
            role: detectColorRole(name),
          });
        }
      }
    }
  } catch (e) { }

  try {
    if (figmaApi && typeof figmaApi.getLocalPaintStylesAsync === 'function') {
      const paintStyles = await figmaApi.getLocalPaintStylesAsync();
      for (const ps of paintStyles || []) {
        const hex = extractSolidColor(ps.paints);
        if (hex) {
          const name = safeStr(ps.name, 'Style');
          colors.push({
            name,
            value: hex,
            role: detectColorRole(name),
          });
        }
      }
    }
  } catch (e) { }

  try {
    if (figmaApi && typeof figmaApi.getLocalTextStylesAsync === 'function') {
      const textStyles = await figmaApi.getLocalTextStylesAsync();
      for (const ts of textStyles || []) {
        const fn = ts.fontName && typeof ts.fontName === 'object' ? ts.fontName : null;
        const name = safeStr(ts.name, 'Text Style');
        const entry = {
          name,
          role: detectTypographyRole(name),
          fontSize: Math.round(safeNum(ts.fontSize, 16)),
          fontFamily: fn ? safeStr(fn.family, 'Inter') : 'Inter',
          fontWeight: fn ? fontWeightOf(fn.style) : '400',
        };
        if (ts.lineHeight && typeof ts.lineHeight === 'object' && ts.lineHeight.unit !== 'AUTO') {
          entry.lineHeight = ts.lineHeight.unit === 'PERCENT'
            ? Math.round(safeNum(ts.lineHeight.value, 140)) / 100
            : Math.round(safeNum(ts.lineHeight.value, 24));
          entry.lineHeightUnit = ts.lineHeight.unit === 'PERCENT' ? 'em' : 'px';
        }
        if (ts.letterSpacing && typeof ts.letterSpacing === 'object' && ts.letterSpacing.unit === 'PIXELS') {
          entry.letterSpacing = Math.round(safeNum(ts.letterSpacing.value, 0) * 10) / 10;
        }
        typography.push(entry);
      }
    }
  } catch (e) { }

  // Extract Theme Styles (Typography H1-H6, Buttons, Form Fields)
  const themeStyles = {
    typography: {},
    buttons: null,
    formFields: null,
  };

  for (const t of typography) {
    if (t.role && t.role !== 'custom' && !themeStyles.typography[t.role]) {
      themeStyles.typography[t.role] = {
        fontFamily: t.fontFamily,
        fontSize: t.fontSize,
        fontWeight: t.fontWeight,
        lineHeight: t.lineHeight,
        lineHeightUnit: t.lineHeightUnit,
        letterSpacing: t.letterSpacing,
      };
    }
  }

  // Find button candidate in active selection
  const btnNode = findNodeCandidate(selection, (n) => {
    const name = safeStr(n.name).toLowerCase();
    const isTaggedBtn = typeof n.getPluginData === 'function' && n.getPluginData('f2e-widget') === 'button';
    const isNamedBtn = name.includes('button') || name.includes('btn') || name.includes('cta');
    return (isTaggedBtn || isNamedBtn) && (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE');
  });

  if (btnNode) {
    const bg = extractSolidColor(btnNode.fills) || '#2563EB';
    const textChild = findNodeCandidate(btnNode.children, (c) => c.type === 'TEXT');
    const textColor = textChild ? (extractSolidColor(textChild.fills) || '#FFFFFF') : '#FFFFFF';
    const textFn = textChild && textChild.fontName ? textChild.fontName : null;

    const r = typeof btnNode.cornerRadius === 'number'
      ? { top: btnNode.cornerRadius, right: btnNode.cornerRadius, bottom: btnNode.cornerRadius, left: btnNode.cornerRadius }
      : {
        top: safeNum(btnNode.topLeftRadius, 6),
        right: safeNum(btnNode.topRightRadius, 6),
        bottom: safeNum(btnNode.bottomRightRadius, 6),
        left: safeNum(btnNode.bottomLeftRadius, 6),
      };

    const pad = {
      top: safeNum(btnNode.paddingTop, 12),
      right: safeNum(btnNode.paddingRight, 20),
      bottom: safeNum(btnNode.paddingBottom, 12),
      left: safeNum(btnNode.paddingLeft, 20),
    };

    themeStyles.buttons = {
      backgroundColor: bg,
      textColor,
      typography: {
        fontFamily: textFn ? safeStr(textFn.family, 'Inter') : 'Inter',
        fontSize: textChild && typeof textChild.fontSize === 'number' ? Math.round(textChild.fontSize) : 15,
        fontWeight: textFn ? fontWeightOf(textFn.style) : '500',
      },
      borderRadius: r,
      padding: pad,
    };
  }

  // Find input / form field candidate in active selection
  const inputNode = findNodeCandidate(selection, (n) => {
    const name = safeStr(n.name).toLowerCase();
    const isTaggedForm = typeof n.getPluginData === 'function' && n.getPluginData('f2e-widget') === 'form';
    const isNamedInput = name.includes('input') || name.includes('field') || name.includes('text-field');
    return (isTaggedForm || isNamedInput) && (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE');
  });

  if (inputNode) {
    const bg = extractSolidColor(inputNode.fills) || '#FFFFFF';
    const border = extractSolidColor(inputNode.strokes) || '#E2E8F0';
    const textChild = findNodeCandidate(inputNode.children, (c) => c.type === 'TEXT');
    const textColor = textChild ? (extractSolidColor(textChild.fills) || '#1E293B') : '#1E293B';
    const textFn = textChild && textChild.fontName ? textChild.fontName : null;

    const r = typeof inputNode.cornerRadius === 'number'
      ? { top: inputNode.cornerRadius, right: inputNode.cornerRadius, bottom: inputNode.cornerRadius, left: inputNode.cornerRadius }
      : {
        top: safeNum(inputNode.topLeftRadius, 6),
        right: safeNum(inputNode.topRightRadius, 6),
        bottom: safeNum(inputNode.bottomRightRadius, 6),
        left: safeNum(inputNode.bottomLeftRadius, 6),
      };

    const pad = {
      top: safeNum(inputNode.paddingTop, 10),
      right: safeNum(inputNode.paddingRight, 14),
      bottom: safeNum(inputNode.paddingBottom, 10),
      left: safeNum(inputNode.paddingLeft, 14),
    };

    themeStyles.formFields = {
      backgroundColor: bg,
      borderColor: border,
      textColor,
      typography: {
        fontFamily: textFn ? safeStr(textFn.family, 'Inter') : 'Inter',
        fontSize: textChild && typeof textChild.fontSize === 'number' ? Math.round(textChild.fontSize) : 14,
        fontWeight: textFn ? fontWeightOf(textFn.style) : '400',
      },
      borderRadius: r,
      padding: pad,
    };
  }

  // Extract General Settings (Layout width, background color)
  const settings = {
    layout: {},
    background: {},
  };

  const rootNode = selection[0] || null;
  if (rootNode && typeof rootNode.width === 'number') {
    const rawW = Math.round(rootNode.width);
    let containerWidth = 1200;
    if (rawW >= 960 && rawW <= 1600) {
      containerWidth = rawW;
    } else if (rawW > 1600) {
      containerWidth = 1440;
    }
    settings.layout.containerWidth = containerWidth;
  }

  if (rootNode && Array.isArray(rootNode.fills)) {
    const bg = extractSolidColor(rootNode.fills);
    if (bg) {
      settings.background.color = bg;
    }
  }

  return { colors, typography, themeStyles, settings };
}

export function findFirstVisualDescendant(node, depth = 0) {
  if (!node || depth > 4) return null;
  const kids = visibleChildren(node);
  for (const child of kids) {
    if (child.type === 'TEXT') continue;
    if (hasImageFill(child)) return child;
    if (isVectorGraphic(child)) return child;
    const t = child.type;
    if (t === 'VECTOR' || t === 'LINE' || t === 'ELLIPSE' || t === 'POLYGON' || t === 'STAR' || t === 'BOOLEAN_OPERATION') {
      return child;
    }
    const lower = safeStr(child.name).toLowerCase();
    if (['icon', 'ic', 'svg', 'logo', 'img', 'image', 'pic'].some((kw) => lower.includes(kw))) {
      return child;
    }
    const found = findFirstVisualDescendant(child, depth + 1);
    if (found) return found;
  }
  return null;
}
