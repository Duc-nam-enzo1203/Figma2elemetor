/**
 * Design System & Site Settings extraction (Local Variables/Styles + Dev Mode auto-synthesis).
 */
import { visibleChildren } from '../tagging/widget-resolver.js';
import { safeNum, safeStr, fontWeightOf, rgbToHex, extractSolidColor } from './primitives.js';
import { normalizeCssColor } from './devmode-css.js';

export function formatTokenTitle(name) {
  const clean = safeStr(name, 'Color')
    .replace(/^(color|colors|theme|mode|tokens?)[/_ -]+/i, '')
    .replace(/[/_]+/g, ' ')
    .trim();
  return clean || safeStr(name, 'Color');
}

async function resolveColorVariableVal(figmaApi, rawVal, defaultModes, depth = 0) {
  if (!rawVal || depth > 5) return null;
  if (rawVal.type === 'VARIABLE_ALIAS' && rawVal.id && typeof figmaApi?.variables?.getVariableByIdAsync === 'function') {
    try {
      const targetVar = await figmaApi.variables.getVariableByIdAsync(rawVal.id);
      if (targetVar && targetVar.valuesByMode) {
        const targetMode = defaultModes[targetVar.variableCollectionId] || Object.keys(targetVar.valuesByMode)[0];
        const nextVal = targetVar.valuesByMode[targetMode];
        return resolveColorVariableVal(figmaApi, nextVal, defaultModes, depth + 1);
      }
    } catch (e) {}
    return null;
  }
  if (typeof rawVal === 'object' && typeof rawVal.r === 'number') {
    return rawVal;
  }
  return null;
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
        const rawVal = v.valuesByMode ? v.valuesByMode[defaultModes[v.variableCollectionId]] : null;
        const val = await resolveColorVariableVal(figmaApi, rawVal, defaultModes);
        if (val && typeof val === 'object' && typeof val.r === 'number') {
          const hex = rgbToHex(val, val.a !== undefined ? val.a : 1);
          const rawName = safeStr(v.name, 'Color');
          colors.push({
            name: formatTokenTitle(rawName),
            value: hex,
            role: detectColorRole(rawName),
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
        if (ts.letterSpacing && typeof ts.letterSpacing === 'object') {
          const rawLs = safeNum(ts.letterSpacing.value, 0);
          if (rawLs !== 0) {
            if (ts.letterSpacing.unit === 'PERCENT') {
              entry.letterSpacing = Math.round((rawLs / 100) * 1000) / 1000;
              entry.letterSpacingUnit = 'em';
            } else if (ts.letterSpacing.unit === 'PIXELS') {
              entry.letterSpacing = Math.round(rawLs * 10) / 10;
              entry.letterSpacingUnit = 'px';
            }
          }
        }
        typography.push(entry);
      }
    }
  } catch (e) { }

  // Auto-Synthesize Design System from Dev Mode CSS & Active Selection when Local Styles/Variables are sparse
  const parseHexRgb = (hex) => {
    const clean = String(hex || '').replace('#', '').trim();
    if (clean.length === 3) {
      return [
        parseInt(clean[0] + clean[0], 16),
        parseInt(clean[1] + clean[1], 16),
        parseInt(clean[2] + clean[2], 16),
      ];
    }
    if (clean.length >= 6) {
      return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
      ];
    }
    return [0, 0, 0];
  };

  const getColorMetrics = (hex) => {
    const [r, g, b] = parseHexRgb(hex);
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = 0.2126 * rn + 0.7152 * gn + 0.0722 * bn;
    return { sat, lum };
  };

  const normalizeHex6 = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    const c = normalizeCssColor(raw) || raw.trim();
    if (!c) return null;
    const rgbMatch = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/i.exec(c);
    if (rgbMatch) {
      const clamp255 = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
      return `#${[clamp255(rgbMatch[1]), clamp255(rgbMatch[2]), clamp255(rgbMatch[3])]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')}`.toUpperCase();
    }
    if (!c.startsWith('#')) return null;
    const hex = c.slice(1).toUpperCase();
    if (hex.length === 3) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
    if (hex.length === 6) return `#${hex}`;
    if (hex.length === 8) return `#${hex.slice(0, 6)}`;
    return null;
  };

  const extractVarNameFromCssVal = (rawVal) => {
    const m = /var\(\s*--([a-zA-Z0-9_-]+)/.exec(String(rawVal || ''));
    if (!m) return null;
    return m[1]
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase())
      .trim();
  };

  const scanRoots = selection.length > 0
    ? selection
    : (figmaApi && figmaApi.currentPage && Array.isArray(figmaApi.currentPage.children)
      ? figmaApi.currentPage.children.slice(0, 2)
      : []);

  const colorStats = new Map();
  const typoStats = new Map();
  let scannedNodes = 0;
  let cssCalls = 0;

  const recordColor = (rawHex, usage, varName = null) => {
    const hex = normalizeHex6(rawHex);
    if (!hex) return;
    let rec = colorStats.get(hex);
    if (!rec) {
      const m = getColorMetrics(hex);
      rec = { hex, count: 0, textCount: 0, btnCount: 0, bgCount: 0, borderCount: 0, varName: null, sat: m.sat, lum: m.lum };
      colorStats.set(hex, rec);
    }
    rec.count += 1;
    if (usage === 'text') rec.textCount += 1;
    else if (usage === 'btn') rec.btnCount += 1;
    else if (usage === 'bg') rec.bgCount += 1;
    else if (usage === 'border') rec.borderCount += 1;
    if (varName && !rec.varName) rec.varName = varName;
  };

  const scanNodeForDesignSystem = async (n, depth = 0) => {
    if (!n || n.visible === false || scannedNodes >= 140 || depth > 8) return;
    scannedNodes += 1;

    const lowerName = safeStr(n.name).toLowerCase();
    const isBtn = lowerName.includes('button') || lowerName.includes('btn') || lowerName.includes('cta');

    // Check boundVariables for remote Team Library variables
    let boundVarName = null;
    if (n.boundVariables && typeof figmaApi?.variables?.getVariableByIdAsync === 'function') {
      const fRef = Array.isArray(n.boundVariables.fills)
        ? n.boundVariables.fills[0]
        : (n.boundVariables.fills && typeof n.boundVariables.fills === 'object' && n.boundVariables.fills.type === 'VARIABLE_ALIAS' ? n.boundVariables.fills : null);
      if (fRef && fRef.id) {
        try {
          const bv = await figmaApi.variables.getVariableByIdAsync(fRef.id);
          if (bv && bv.name) boundVarName = formatTokenTitle(bv.name);
        } catch (e) {}
      }
    }

    let css = null;
    if (typeof n.getCSSAsync === 'function' && cssCalls < 65) {
      cssCalls += 1;
      try {
        css = await n.getCSSAsync();
      } catch (e) { }
    }

    if (n.type === 'TEXT') {
      const cssColor = css && css['color'];
      const textHex = normalizeHex6(cssColor) || extractSolidColor(n.fills);
      if (textHex) {
        recordColor(textHex, isBtn ? 'btn' : 'text', boundVarName || extractVarNameFromCssVal(cssColor));
      }

      const fn = n.fontName && typeof n.fontName === 'object' ? n.fontName : null;
      const cssFontFamily = css && css['font-family']
        ? String(css['font-family']).split(',')[0].replace(/['"]/g, '').trim()
        : null;
      const cssFontSize = css && css['font-size'] ? parseFloat(css['font-size']) : null;
      const cssFontWeight = css && css['font-weight'] ? String(parseInt(css['font-weight'], 10) || '') : null;

      const fontFamily = cssFontFamily || (fn ? safeStr(fn.family, 'Inter') : 'Inter');
      const fontSize = Math.round(cssFontSize || safeNum(n.fontSize, 16));
      const fontWeight = cssFontWeight || (fn ? fontWeightOf(fn.style) : '400');

      let lineHeight;
      let lineHeightUnit;
      if (css && css['line-height'] && css['line-height'] !== 'normal') {
        const lhClean = String(css['line-height']).replace(/\/\*[\s\S]*?\*\//g, '').trim();
        const lhNum = parseFloat(lhClean);
        if (!Number.isNaN(lhNum) && lhNum > 0) {
          if (lhClean.endsWith('%')) {
            lineHeight = Math.round(lhNum) / 100;
            lineHeightUnit = 'em';
          } else {
            lineHeight = Math.round(lhNum);
            lineHeightUnit = 'px';
          }
        }
      } else if (n.lineHeight && typeof n.lineHeight === 'object' && n.lineHeight.unit !== 'AUTO') {
        lineHeight = n.lineHeight.unit === 'PERCENT'
          ? Math.round(safeNum(n.lineHeight.value, 140)) / 100
          : Math.round(safeNum(n.lineHeight.value, 24));
        lineHeightUnit = n.lineHeight.unit === 'PERCENT' ? 'em' : 'px';
      }

      const tKey = `${fontFamily.toLowerCase()}|${fontSize}|${fontWeight}`;
      let tRec = typoStats.get(tKey);
      if (!tRec) {
        tRec = {
          fontFamily,
          fontSize,
          fontWeight,
          lineHeight,
          lineHeightUnit,
          count: 0,
          sample: safeStr(n.characters || n.name).trim().slice(0, 28),
        };
        typoStats.set(tKey, tRec);
      }
      tRec.count += 1;
    } else {
      // Frame / Vector / Shape colors from Dev Mode CSS + fills/strokes
      const bgRaw = css && (css['background'] || css['background-color']);
      if (bgRaw && !String(bgRaw).includes('gradient')) {
        recordColor(bgRaw, isBtn ? 'btn' : 'bg', boundVarName || extractVarNameFromCssVal(bgRaw));
      } else if (bgRaw && String(bgRaw).includes('gradient')) {
        const colorMatches = String(bgRaw).match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/gi) || [];
        for (const cm of colorMatches.slice(0, 2)) {
          recordColor(cm, isBtn ? 'btn' : 'bg', boundVarName || extractVarNameFromCssVal(bgRaw));
        }
      } else {
        const solidBg = extractSolidColor(n.fills);
        if (solidBg) recordColor(solidBg, isBtn ? 'btn' : 'bg', boundVarName);
      }

      const strokeRaw = css && (css['stroke'] || css['border'] || css['border-color']);
      if (strokeRaw) {
        const cm = String(strokeRaw).match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/i);
        if (cm) recordColor(cm[0], 'border', extractVarNameFromCssVal(strokeRaw));
      } else {
        const solidStroke = extractSolidColor(n.strokes);
        if (solidStroke) recordColor(solidStroke, 'border');
      }
    }

    for (const child of visibleChildren(n)) {
      if (scannedNodes >= 140) break;
      await scanNodeForDesignSystem(child, depth + 1);
    }
  };

  for (const r of scanRoots) {
    await scanNodeForDesignSystem(r, 0);
  }

  // Merge auto-synthesized Dev Mode colors when file has no Local Variables / Paint Styles
  const existingColorHexes = new Set(colors.map((c) => normalizeHex6(c.value)).filter(Boolean));
  const usedColorRoles = new Set(colors.map((c) => c.role).filter((r) => r && r !== 'custom'));

  if (colors.length === 0) {
    const sortedScannedColors = [...colorStats.values()]
      .filter((c) => !existingColorHexes.has(c.hex))
      .sort((a, b) => {
        const aScore = a.btnCount * 5 + (a.sat >= 0.25 && a.lum > 0.16 ? 4 : 0) + a.count;
        const bScore = b.btnCount * 5 + (b.sat >= 0.25 && b.lum > 0.16 ? 4 : 0) + b.count;
        return bScore - aScore;
      });

    // Assign semantic roles smartly from Dev Mode colors
    const brandCandidates = sortedScannedColors.filter(
      (c) => c.sat >= 0.25 && c.lum >= 0.16 && c.lum <= 0.88 && (c.btnCount > 0 || c.bgCount > 0 || c.borderCount > 0 || c.sat >= 0.45)
    );
    const darkTextCandidates = sortedScannedColors
      .filter((c) => c.textCount > 0 && c.lum <= 0.35)
      .sort((a, b) => b.textCount - a.textCount || a.lum - b.lum);

    const roleAssignments = new Map();
    if (!usedColorRoles.has('primary') && brandCandidates[0]) {
      roleAssignments.set(brandCandidates[0].hex, { role: 'primary', label: brandCandidates[0].varName || 'Primary Brand' });
      usedColorRoles.add('primary');
    }
    if (!usedColorRoles.has('text') && darkTextCandidates[0] && !roleAssignments.has(darkTextCandidates[0].hex)) {
      roleAssignments.set(darkTextCandidates[0].hex, { role: 'text', label: darkTextCandidates[0].varName || 'Body Text' });
      usedColorRoles.add('text');
    }
    const remainingBrand = brandCandidates.filter((c) => !roleAssignments.has(c.hex));
    if (!usedColorRoles.has('secondary') && remainingBrand[0]) {
      roleAssignments.set(remainingBrand[0].hex, { role: 'secondary', label: remainingBrand[0].varName || 'Secondary Brand' });
      usedColorRoles.add('secondary');
    }
    if (!usedColorRoles.has('accent') && remainingBrand[1]) {
      roleAssignments.set(remainingBrand[1].hex, { role: 'accent', label: remainingBrand[1].varName || 'Accent' });
      usedColorRoles.add('accent');
    }

    for (const c of sortedScannedColors.slice(0, 12)) {
      const assigned = roleAssignments.get(c.hex);
      let fallbackName = c.varName;
      if (!fallbackName) {
        if (c.hex === '#FFFFFF') fallbackName = 'Surface White';
        else if (c.hex === '#000000') fallbackName = 'Ink Black';
        else if (c.borderCount > c.bgCount && c.borderCount > c.textCount) fallbackName = 'Border Neutral';
        else if (c.lum > 0.9) fallbackName = 'Surface Tint';
        else if (c.lum < 0.25) fallbackName = 'Dark Slate';
        else fallbackName = `Color ${c.hex}`;
      }
      colors.push({
        name: assigned ? assigned.label : fallbackName,
        value: c.hex,
        role: assigned ? assigned.role : 'custom',
        source: 'devmode',
      });
      existingColorHexes.add(c.hex);
    }
  }

  // Merge auto-synthesized Dev Mode typography when Local Text Styles are missing
  if (typography.length === 0) {
    const existingTypoKeys = new Set(
      typography.map((t) => `${safeStr(t.fontFamily).toLowerCase()}|${t.fontSize}|${t.fontWeight}`)
    );
    const usedTypoRoles = new Set(typography.map((t) => t.role).filter((r) => r && r !== 'custom'));

    const sortedScannedTypos = [...typoStats.values()]
      .filter((t) => !existingTypoKeys.has(`${t.fontFamily.toLowerCase()}|${t.fontSize}|${t.fontWeight}`))
      .sort((a, b) => b.fontSize - a.fontSize || Number(b.fontWeight) - Number(a.fontWeight));

    for (const t of sortedScannedTypos.slice(0, 10)) {
      let role = 'custom';
      let label = `${t.fontFamily} ${t.fontSize}px`;
      if (t.fontSize >= 36 && !usedTypoRoles.has('h1')) {
        role = 'h1';
        label = 'Heading 1 (H1)';
      } else if (t.fontSize >= 28 && !usedTypoRoles.has('h2')) {
        role = 'h2';
        label = 'Heading 2 (H2)';
      } else if (t.fontSize >= 22 && !usedTypoRoles.has('h3')) {
        role = 'h3';
        label = 'Heading 3 (H3)';
      } else if (t.fontSize >= 18 && Number(t.fontWeight) >= 600 && !usedTypoRoles.has('h4')) {
        role = 'h4';
        label = 'Heading 4 (H4)';
      } else if (t.fontSize >= 14 && t.fontSize <= 17 && Number(t.fontWeight) <= 500 && !usedTypoRoles.has('body')) {
        role = 'body';
        label = 'Body Regular';
      } else if (t.fontSize >= 12 && t.fontSize <= 15 && Number(t.fontWeight) >= 500 && !usedTypoRoles.has('link')) {
        role = 'link';
        label = 'Label / Link';
      }
      if (role !== 'custom') usedTypoRoles.add(role);

      typography.push({
        name: label,
        role,
        fontSize: t.fontSize,
        fontFamily: t.fontFamily,
        fontWeight: t.fontWeight,
        ...(t.lineHeight ? { lineHeight: t.lineHeight, lineHeightUnit: t.lineHeightUnit || 'px' } : {}),
        source: 'devmode',
      });
    }
  }

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
        letterSpacingUnit: t.letterSpacingUnit,
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
