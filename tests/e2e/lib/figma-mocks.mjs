import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_SRC = path.resolve(__dirname, '../../../packages/figma-plugin/src');

let cachedApi = null;

export async function importPluginApi() {
  if (cachedApi) return cachedApi;
  const [extractorMod, compilerMod, verifierMod, validatorMod, resolverMod] = await Promise.all([
    import(pathToFileURL(path.join(PLUGIN_SRC, 'extraction/extractor.js')).href),
    import(pathToFileURL(path.join(PLUGIN_SRC, 'exporters/elementor-compiler.js')).href),
    import(pathToFileURL(path.join(PLUGIN_SRC, 'exporters/fidelity-verifier.js')).href),
    import(pathToFileURL(path.join(PLUGIN_SRC, 'exporters/schema-validator.js')).href),
    import(pathToFileURL(path.join(PLUGIN_SRC, 'tagging/widget-resolver.js')).href),
  ]);

  cachedApi = {
    extractDesignSelection: extractorMod.extractDesignSelection,
    applyDevModeCSSToNode: extractorMod.applyDevModeCSSToNode,
    extractLocalDesignSystem: extractorMod.extractLocalDesignSystem,
    compileElementorV3: compilerMod.compileElementorV3,
    compileElementorV4: compilerMod.compileElementorV4,
    compileElementorClipboard: compilerMod.compileElementorClipboard,
    verifyAndHealElementorJson: verifierMod.verifyAndHealElementorJson,
    validateElementorV3Tree: validatorMod.validateElementorV3Tree,
    validateElementorV4Tree: validatorMod.validateElementorV4Tree,
    resolveWidget: resolverMod.resolveWidget,
  };
  return cachedApi;
}

export function hexToFigmaRgb(hex, a = 1) {
  const clean = String(hex || '#000000').replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return { r, g, b, a };
}

export function solidFill(hex, opacity = 1) {
  const { r, g, b } = hexToFigmaRgb(hex);
  return { type: 'SOLID', visible: true, opacity, color: { r, g, b } };
}

export function imageFill(imageHash = 'img-hash', scaleMode = 'FILL') {
  return { type: 'IMAGE', visible: true, opacity: 1, imageHash, scaleMode };
}

function attachPluginData(node, pluginData = {}) {
  const map = new Map(Object.entries(pluginData));
  node.getPluginData = (k) => (map.has(k) ? String(map.get(k)) : '');
  node.setPluginData = (k, v) => { map.set(k, String(v)); };
  return node;
}

export function createMockTextNode(opts = {}) {
  const {
    id = 't-1',
    name = 'Text',
    characters = 'Sample Text',
    fontSize = 16,
    fontFamily = 'Inter',
    fontStyle = 'Regular',
    color = '#0F172A',
    fills = null,
    lineHeight = { unit: 'AUTO' },
    letterSpacing = { unit: 'PIXELS', value: 0 },
    textAlignHorizontal = 'LEFT',
    textCase = 'ORIGINAL',
    textDecoration = 'NONE',
    width = 300,
    height = 24,
    x = 0,
    y = 0,
    visible = true,
    layoutSizingHorizontal = 'HUG',
    layoutSizingVertical = 'HUG',
    layoutPositioning = 'AUTO',
    pluginData = {},
    css = null,
    hyperlink = null,
  } = opts;

  const node = {
    id,
    name,
    type: 'TEXT',
    visible,
    x,
    y,
    width,
    height,
    characters,
    fontSize,
    fontName: { family: fontFamily, style: fontStyle },
    lineHeight,
    letterSpacing,
    textAlignHorizontal,
    textCase,
    textDecoration,
    fills: fills !== null ? fills : [solidFill(color)],
    strokes: [],
    effects: [],
    opacity: 1,
    layoutSizingHorizontal,
    layoutSizingVertical,
    layoutPositioning,
    hyperlink,
    getRangeFontSize: () => (typeof fontSize === 'number' ? fontSize : 16),
    getRangeFontName: () => (fontNameOrFallback(fontFamily, fontStyle)),
    getRangeFills: () => [solidFill(color)],
    getCSSAsync: async () => css || {},
  };
  return attachPluginData(node, pluginData);
}

function fontNameOrFallback(family, style) {
  return {
    family: typeof family === 'string' ? family : 'Inter',
    style: typeof style === 'string' ? style : 'Regular',
  };
}

export function createMockVectorNode(opts = {}) {
  const {
    id = 'v-1',
    name = 'Icon',
    type = 'VECTOR',
    width = 24,
    height = 24,
    x = 0,
    y = 0,
    visible = true,
    color = '#16A34A',
    fills = null,
    strokes = [],
    svgMarkup = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" stroke="#16A34A" stroke-width="2" fill="none"/></svg>',
    css = null,
    pluginData = {},
    exportAsync = null,
  } = opts;

  const node = {
    id,
    name,
    type,
    visible,
    x,
    y,
    width,
    height,
    fills: fills !== null ? fills : [solidFill(color)],
    strokes,
    effects: [],
    opacity: 1,
    layoutSizingHorizontal: 'FIXED',
    layoutSizingVertical: 'FIXED',
    layoutPositioning: 'AUTO',
    getCSSAsync: async () => css || {},
    exportAsync: exportAsync || (async ({ format }) => {
      if (format === 'SVG') return new Uint8Array(Buffer.from(svgMarkup, 'utf8'));
      return new Uint8Array(0);
    }),
  };
  return attachPluginData(node, pluginData);
}

export function createMockImageNode(opts = {}) {
  const {
    id = 'img-1',
    name = 'Photo',
    type = 'RECTANGLE',
    width = 400,
    height = 400,
    x = 0,
    y = 0,
    visible = true,
    imageBytes = new Uint8Array(0),
    imageHash = 'hash-1',
    cornerRadius = 0,
    css = null,
    pluginData = {},
    exportAsync = null,
    layoutSizingHorizontal = 'FIXED',
    layoutSizingVertical = 'FIXED',
    layoutPositioning = 'AUTO',
  } = opts;

  const node = {
    id,
    name,
    type,
    visible,
    x,
    y,
    width,
    height,
    cornerRadius,
    fills: [imageFill(imageHash)],
    strokes: [],
    effects: [],
    opacity: 1,
    layoutSizingHorizontal,
    layoutSizingVertical,
    layoutPositioning,
    getCSSAsync: async () => css || {},
    exportAsync: exportAsync || (async () => new Uint8Array(imageBytes)),
  };
  return attachPluginData(node, pluginData);
}

export function createMockFrameNode(opts = {}) {
  const {
    id = 'f-1',
    name = 'Container',
    type = 'FRAME',
    visible = true,
    x = 0,
    y = 0,
    width = 1200,
    height = 600,
    layoutMode = 'VERTICAL',
    layoutWrap = 'NO_WRAP',
    itemSpacing = 0,
    counterAxisSpacing = 0,
    paddingTop = 0,
    paddingRight = 0,
    paddingBottom = 0,
    paddingLeft = 0,
    primaryAxisAlignItems = 'MIN',
    counterAxisAlignItems = 'MIN',
    primaryAxisSizingMode = 'AUTO',
    counterAxisSizingMode = 'FIXED',
    layoutSizingHorizontal = 'FIXED',
    layoutSizingVertical = 'HUG',
    layoutGrow = 0,
    layoutAlign = 'INHERIT',
    layoutPositioning = 'AUTO',
    clipsContent = false,
    fills = [],
    strokes = [],
    strokeWeight = 0,
    strokeTopWeight,
    strokeRightWeight,
    strokeBottomWeight,
    strokeLeftWeight,
    cornerRadius = 0,
    topLeftRadius,
    topRightRadius,
    bottomRightRadius,
    bottomLeftRadius,
    effects = [],
    opacity = 1,
    children = [],
    css = null,
    pluginData = {},
    exportAsync = null,
    extraProps = {},
  } = opts;

  const node = {
    id,
    name,
    type,
    visible,
    x,
    y,
    width,
    height,
    layoutMode,
    layoutWrap,
    itemSpacing,
    counterAxisSpacing,
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    primaryAxisAlignItems,
    counterAxisAlignItems,
    primaryAxisSizingMode,
    counterAxisSizingMode,
    layoutSizingHorizontal,
    layoutSizingVertical,
    layoutGrow,
    layoutAlign,
    layoutPositioning,
    clipsContent,
    fills,
    strokes,
    strokeWeight,
    ...(strokeTopWeight !== undefined ? { strokeTopWeight } : {}),
    ...(strokeRightWeight !== undefined ? { strokeRightWeight } : {}),
    ...(strokeBottomWeight !== undefined ? { strokeBottomWeight } : {}),
    ...(strokeLeftWeight !== undefined ? { strokeLeftWeight } : {}),
    cornerRadius,
    ...(topLeftRadius !== undefined ? { topLeftRadius } : {}),
    ...(topRightRadius !== undefined ? { topRightRadius } : {}),
    ...(bottomRightRadius !== undefined ? { bottomRightRadius } : {}),
    ...(bottomLeftRadius !== undefined ? { bottomLeftRadius } : {}),
    effects,
    opacity,
    children,
    getCSSAsync: async () => css || {},
    ...(exportAsync ? { exportAsync } : {}),
    ...extraProps,
  };
  return attachPluginData(node, pluginData);
}

export function createMockFigmaApi(opts = {}) {
  const {
    colorVariables = [],
    collections = [{ id: 'col-1', defaultModeId: 'mode-1', modes: [{ modeId: 'mode-1' }] }],
    paintStyles = [],
    textStyles = [],
    selection = [],
    children = selection,
  } = opts;

  return {
    variables: {
      getLocalVariablesAsync: async (type) => (type === 'COLOR' ? colorVariables : []),
      getLocalVariableCollectionsAsync: async () => collections,
    },
    getLocalPaintStylesAsync: async () => paintStyles,
    getLocalTextStylesAsync: async () => textStyles,
    currentPage: {
      selection,
      children,
    },
  };
}
