import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_GPS_PINA_DIR = 'C:\\Users\\ADMIN\\Downloads\\gps-pina-copy--figelem';

export function getGpsPinaDir() {
  return process.env.F2E_GPS_PINA_DIR || DEFAULT_GPS_PINA_DIR;
}

export function hasGpsPinaFixture(dir = getGpsPinaDir()) {
  return (
    fs.existsSync(path.join(dir, 'design.json')) &&
    fs.existsSync(path.join(dir, 'assets', 'images')) &&
    fs.existsSync(path.join(dir, 'assets', 'svg'))
  );
}

function rgbaObjToCss(color, opacity = 1) {
  if (!color) return 'rgba(0,0,0,0)';
  const r = Math.round((color.r || 0) * 255);
  const g = Math.round((color.g || 0) * 255);
  const b = Math.round((color.b || 0) * 255);
  const a = color.a !== undefined ? color.a * opacity : opacity;
  if (a >= 0.999) {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
  }
  return `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})`;
}

function convertFills(rawFills) {
  if (!Array.isArray(rawFills)) return [];
  return rawFills.map((f) => {
    if (!f || typeof f !== 'object') return f;
    if (f.type === 'IMAGE' || f.imageRef) {
      return {
        type: 'IMAGE',
        visible: f.visible !== false,
        opacity: f.opacity ?? 1,
        imageHash: f.imageRef || f.imageHash || 'img',
        scaleMode: f.scaleMode || 'FILL',
        _imageRef: f.imageRef,
      };
    }
    return f;
  });
}

function findFirstImageRef(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node.fills)) {
    const imgFill = node.fills.find((f) => f && f.visible !== false && (f.imageRef || f.type === 'IMAGE'));
    if (imgFill && imgFill.imageRef) return imgFill.imageRef;
  }
  if (Array.isArray(node.children)) {
    for (const c of node.children) {
      const found = findFirstImageRef(c);
      if (found) return found;
    }
  }
  return null;
}

function buildCssFromFigelemNode(node) {
  const css = {};
  if (node.type === 'TEXT' && node.textStyle) {
    const ts = node.textStyle;
    if (ts.fontFamily) css['font-family'] = ts.fontFamily;
    if (ts.fontSize) css['font-size'] = `${ts.fontSize}px`;
    if (ts.fontWeight) css['font-weight'] = String(ts.fontWeight);
    if (ts.lineHeightPx) css['line-height'] = `${ts.lineHeightPx}px`;
    const solid = Array.isArray(node.fills) && node.fills.find((f) => f.type === 'SOLID' && f.visible !== false);
    if (solid && solid.color) css.color = rgbaObjToCss(solid.color, solid.opacity ?? 1);
  }
  if (node.cornerRadius && Number(node.cornerRadius) > 0) {
    css['border-radius'] = `${node.cornerRadius}px`;
  }
  if (Array.isArray(node.fills) && node.type !== 'TEXT') {
    const solid = node.fills.find((f) => f.type === 'SOLID' && f.visible !== false);
    if (solid && solid.color) {
      css.background = rgbaObjToCss(solid.color, solid.opacity ?? 1);
    }
  }
  return css;
}

const DEFAULT_OVERRIDES = new Map([
  ['47:10', { 'f2e-widget': 'theme-site-logo' }],
  ['47:41', { 'f2e-widget': 'nav-menu' }],
  ['47:6640', { 'f2e-widget': 'nested-accordion' }],
  ['47:6683', { 'f2e-widget': 'form' }],
  ['47:6878', { 'f2e-widget': 'image' }],
]);

export const CURATED_GPS_PINA_SECTION_IDS = [
  '47:8',     // Header (SVG logo + Nav + CTA)
  '47:54',    // Hero (composite bg + foreground PNG)
  '47:5888',  // Real Scenarios (bg PNG + SVG icon cards)
  '47:5927',  // Core Features (icon-box grid)
  '47:6249',  // Device Showcase (product PNG)
  '47:6302',  // Regulatory (PNG badges + SVG stamp)
  '47:6635',  // FAQ (nested-accordion)
  '47:6746',  // Footer (bg PNG + map PNG + SVG logo + social SVGs)
];

/**
 * Loads `design.json` from `gps-pina-copy--figelem` and returns a Figma Plugin API-compatible
 * selection tree backed by real PNG and SVG bytes on disk.
 */
export function loadGpsPinaSelection(options = {}) {
  const baseDir = options.dir || getGpsPinaDir();
  if (!hasGpsPinaFixture(baseDir)) {
    throw new Error(`External fixture directory not found: ${baseDir}`);
  }
  const sectionIds = options.sectionIds || CURATED_GPS_PINA_SECTION_IDS;
  const design = JSON.parse(fs.readFileSync(path.join(baseDir, 'design.json'), 'utf8'));
  const manifest = design.assetManifest || {};
  const homeFrame = (design.frames || [])[0];
  if (!homeFrame) {
    throw new Error('design.json has no root frame');
  }

  const fileCache = new Map();
  const readAssetBytes = (relPath) => {
    const abs = path.join(baseDir, relPath);
    if (!fileCache.has(abs)) {
      fileCache.set(abs, new Uint8Array(fs.readFileSync(abs)));
    }
    return fileCache.get(abs);
  };

  const adaptNode = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const node = {
      id: raw.id,
      name: raw.name || 'Layer',
      type: raw.type || 'FRAME',
      visible: raw.visible !== false,
      x: raw.x ?? 0,
      y: raw.y ?? 0,
      width: raw.width ?? 100,
      height: raw.height ?? 40,
      opacity: raw.opacity ?? 1,
      clipsContent: Boolean(raw.clipsContent),
      layoutMode: raw.layoutMode || 'NONE',
      layoutWrap: raw.layoutWrap || 'NO_WRAP',
      itemSpacing: raw.itemSpacing ?? 0,
      counterAxisSpacing: raw.counterAxisSpacing ?? 0,
      paddingTop: raw.paddingTop ?? 0,
      paddingRight: raw.paddingRight ?? 0,
      paddingBottom: raw.paddingBottom ?? 0,
      paddingLeft: raw.paddingLeft ?? 0,
      primaryAxisAlignItems: raw.primaryAxisAlignItems || 'MIN',
      counterAxisAlignItems: raw.counterAxisAlignItems || 'MIN',
      primaryAxisSizingMode: raw.primaryAxisSizingMode || 'AUTO',
      counterAxisSizingMode: raw.counterAxisSizingMode || 'FIXED',
      layoutSizingHorizontal: raw.layoutSizingHorizontal || 'FIXED',
      layoutSizingVertical: raw.layoutSizingVertical || 'HUG',
      layoutGrow: raw.layoutGrow ?? 0,
      layoutAlign: raw.layoutAlign || 'INHERIT',
      layoutPositioning: raw.layoutPositioning || 'AUTO',
      cornerRadius: raw.cornerRadius ?? 0,
      fills: convertFills(raw.fills),
      strokes: Array.isArray(raw.strokes) ? raw.strokes : [],
      strokeWeight: raw.strokeWeight ?? 0,
      ...(raw.strokeTopWeight !== undefined ? { strokeTopWeight: raw.strokeTopWeight } : {}),
      ...(raw.strokeRightWeight !== undefined ? { strokeRightWeight: raw.strokeRightWeight } : {}),
      ...(raw.strokeBottomWeight !== undefined ? { strokeBottomWeight: raw.strokeBottomWeight } : {}),
      ...(raw.strokeLeftWeight !== undefined ? { strokeLeftWeight: raw.strokeLeftWeight } : {}),
      effects: Array.isArray(raw.effects) ? raw.effects : [],
    };

    if (raw.type === 'TEXT') {
      const ts = raw.textStyle || {};
      node.characters = raw.characters || '';
      node.fontSize = ts.fontSize || 16;
      node.fontName = { family: ts.fontFamily || 'Inter', style: ts.fontStyle || 'Regular' };
      node.lineHeight = ts.lineHeightPx
        ? { unit: 'PIXELS', value: ts.lineHeightPx }
        : { unit: 'AUTO' };
      node.letterSpacing = { unit: 'PIXELS', value: ts.letterSpacingPx || 0 };
      node.textAlignHorizontal = ts.textAlignHorizontal || 'LEFT';
      node.textCase = ts.textCase || 'ORIGINAL';
      node.textDecoration = ts.textDecoration || 'NONE';
      node.getRangeFontSize = () => node.fontSize;
      node.getRangeFontName = () => node.fontName;
      node.getRangeFills = () => node.fills;
    }

    const overrideObj = DEFAULT_OVERRIDES.get(raw.id) || {};
    node.getPluginData = (k) => (overrideObj[k] !== undefined ? String(overrideObj[k]) : '');
    node.getCSSAsync = async () => buildCssFromFigelemNode(raw);

    if (Array.isArray(raw.children)) {
      node.children = raw.children.map(adaptNode).filter(Boolean);
    }

    const imgRef = (raw.fills || []).find((f) => f && f.imageRef)?.imageRef;
    const svgRef = raw.svgRef || null;
    const nestedBgRef = (!imgRef && !svgRef) ? findFirstImageRef(raw) : null;

    if (svgRef && manifest[svgRef]) {
      node.exportAsync = async ({ format }) => {
        if (format === 'SVG') {
          return readAssetBytes(manifest[svgRef].path);
        }
        return readAssetBytes(manifest[svgRef].path);
      };
    } else if (imgRef && manifest[imgRef]) {
      node.exportAsync = async () => readAssetBytes(manifest[imgRef].path);
    } else if (nestedBgRef && manifest[nestedBgRef]) {
      node.exportAsync = async () => readAssetBytes(manifest[nestedBgRef].path);
    }

    return node;
  };

  const selectedSections = (homeFrame.children || [])
    .filter((sec) => sectionIds.includes(sec.id))
    .map(adaptNode)
    .filter(Boolean);

  const rootAdapted = adaptNode({ ...homeFrame, children: [] });
  rootAdapted.children = selectedSections;

  return {
    fileName: design.fileName || 'GPS PINA (Copy)',
    root: rootAdapted,
    selection: [rootAdapted],
    manifest,
  };
}

/**
 * Loads all 13 real PNG files from `assets/images/` for complete binary coverage.
 */
export function loadAllGpsPinaPngAssets(dir = getGpsPinaDir()) {
  const imgDir = path.join(dir, 'assets', 'images');
  const files = fs.readdirSync(imgDir).filter((f) => f.toLowerCase().endsWith('.png')).sort();
  return files.map((fileName) => {
    const absPath = path.join(imgDir, fileName);
    const bytes = fs.readFileSync(absPath);
    return {
      fileName,
      absPath,
      mime: 'image/png',
      bytes,
    };
  });
}
