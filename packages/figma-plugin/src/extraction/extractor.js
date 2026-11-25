/** Core Extraction Pipeline: converts Figma nodes into `f2e.document` IR (layout, styles, vectors, images). */

import { sha256, utf8Decode, bytesToBase64, uuid } from '../utils/crypto.js';
import {
  resolveWidget,
  visibleChildren,
  hasImageFill,
  hasDescendantImageFill,
  collectTextDescendants,
  isAtomicLeafWidget,
  isVectorGraphic,
  isSliderControlChild,
  detectCompositeBackgroundChildren,
} from '../tagging/widget-resolver.js';
import { inferVirtualLayout } from '../optimizer/auto-layout-fixer.js';

import { safeNum, safeStr, fontWeightOf, rgbToHex, extractSolidColor, extractGradient, extractLayout, extractStyle, extractTypography, extractLink, extractButtonIcon, captureResponsiveTree, matchResponsiveOverride } from './primitives.js';
import { resolveCssVars, normalizeCssColor, applyDevModeCSSToNode, inspectNodeDevMode } from './devmode-css.js';
import { detectColorRole, detectTypographyRole, extractLocalDesignSystem } from './design-system.js';

export {
  safeNum, safeStr, fontWeightOf, rgbToHex, extractSolidColor, extractGradient,
  extractLayout, extractStyle, extractTypography, extractLink, extractButtonIcon,
  captureResponsiveTree, matchResponsiveOverride,
  resolveCssVars, normalizeCssColor, applyDevModeCSSToNode, inspectNodeDevMode,
  detectColorRole, detectTypographyRole, extractLocalDesignSystem,
};

/**
 * Full extraction of selected Figma nodes into the F2E Intermediate Representation (IR)
 */
export async function extractDesignSelection(selection, options = {}) {
  const {
    fileKey = 'local-figma',
    imageFormat = 'PNG',
    imageScale = 2,
    useDevModeCss = true,
    responsiveFrames = { tablet: null, mobile: null },
    designTokens = { colors: [], typography: [] },
    isRootSelection = true,
    onProgress = null,
  } = options;

  const nodes = {};
  const assets = {};
  const assetPayloads = [];
  const warnings = [];
  const pendingExports = [];

  // Fast synchronous node count for accurate percentage progress
  let totalVisibleNodes = 0;
  if (typeof onProgress === 'function') {
    const countNodes = (n) => {
      if (!n || n.visible === false) return;
      totalVisibleNodes += 1;
      for (const c of visibleChildren(n)) countNodes(c);
    };
    for (const rootNode of selection) countNodes(rootNode);
  }
  let visitedNodes = 0;

  const visit = async (node, context = {}) => {
    const { insideAtomic = false, path = [], parentNode = null, isTopRoot = false } = context;
    if (!node || node.visible === false) return null;

    visitedNodes += 1;
    if (typeof onProgress === 'function' && (isTopRoot || visitedNodes === 1 || visitedNodes % 8 === 0 || visitedNodes >= totalVisibleNodes)) {
      onProgress('nodes', Math.min(visitedNodes, Math.max(1, totalVisibleNodes)), Math.max(1, totalVisibleNodes), safeStr(node.name));
    }

    let choice = resolveWidget(node);
    // Guard: If top-level root artboard is heuristic-skip, fallback to container so export doesn't fail
    if (isTopRoot && choice.widget === 'skip' && choice.source !== 'override') {
      choice = { widget: 'container', source: 'root-fallback' };
    }
    if (choice.widget === 'skip') return null;
    if (insideAtomic) return null;

    const id = `f2e:${fileKey}:${node.id}`;
    let devModeCSS = null;
    if (useDevModeCss && typeof node.getCSSAsync === 'function') {
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

    // Detect composite background layers (e.g. BG + Mask + Line + Main + Overlay behind Menu/Text/Group)
    let hasCompositeBg = false;
    let compositeFgNodes = [];
    if (!isLeafWidget && rawKids.length >= 2) {
      const { bgChildren, fgChildren, bgIds } = detectCompositeBackgroundChildren(node);
      if (bgChildren.length > 0 && fgChildren.length > 0) {
        hasCompositeBg = true;
        compositeFgNodes = fgChildren;
        rawKids = rawKids.filter((c) => !bgIds.has(c.id));
        if (layout.inferred) {
          const fgInferred = inferVirtualLayout(node, rawKids);
          Object.assign(layout, fgInferred);
          if (Array.isArray(fgInferred.orderedIds) && fgInferred.orderedIds.length === rawKids.length) {
            const byId = new Map(rawKids.map((k) => [k.id, k]));
            rawKids = fgInferred.orderedIds.map((oid) => byId.get(oid)).filter(Boolean);
          }
        }
      }
    }

    const childrenIds = [];
    if (!isLeafWidget) {
      for (const child of rawKids) {
        if (resolveWidget(child).widget === 'background') continue;
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

    const extractTextWithDevMode = async (tn) => {
      if (!tn) return null;
      const typo = extractTypography(tn);
      if (!typo) return null;
      if (useDevModeCss && typeof tn.getCSSAsync === 'function') {
        try {
          const tCss = await tn.getCSSAsync();
          if (tCss && Object.keys(tCss).length > 0) {
            applyDevModeCSSToNode({ type: 'text', text: typo, style: {}, layout: {} }, tCss);
          }
        } catch (e) { }
      }
      return typo;
    };

    const link = extractLink(node);
    if (link) entry.link = link;

    if (node.type === 'TEXT') {
      entry.text = extractTypography(node);
      entry.content.characters = entry.text.characters;
    }

    // Apply outer node's Dev Mode CSS first so FRAME box styles do not overwrite child text typography
    if (devModeCSS) {
      applyDevModeCSSToNode(entry, devModeCSS);
    }

    if (node.type === 'TEXT' && entry.text) {
      entry.extractedTexts = [entry.text];
    } else if (isLeafWidget) {
      // For any atomic leaf widget wrapping child TEXT nodes (e.g. Frame tagged as heading, text-editor,
      // button, counter, icon-box, image-box, icon-list, nav-menu, price-table, call-to-action, testimonial,
      // flip-box, progress, alert, blockquote, etc.), extract every descendant TEXT node with its full Dev Mode CSS!
      const textNodes = collectTextDescendants(node);
      if (textNodes.length > 0) {
        const extractedList = [];
        for (const tn of textNodes) {
          const tObj = await extractTextWithDevMode(tn);
          if (tObj && safeStr(tObj.characters).trim().length > 0) {
            tObj.nodeName = safeStr(tn.name, '');
            tObj.link = extractLink(tn) || '';
            extractedList.push(tObj);
          }
        }
        if (extractedList.length > 0) {
          entry.extractedTexts = extractedList;
          if (!entry.text) {
            entry.text = extractedList[0];
          }
          if (!entry.content.characters) {
            entry.content.characters = extractedList[0].characters;
          }
        }
      }
    }

    if (choice.widget === 'button') {
      const bIcon = extractButtonIcon(node);
      if (bIcon) entry.buttonIcon = bIcon;
      if (!entry.content.characters) {
        entry.content.characters = (entry.text && entry.text.characters) || entry.content.name || 'Button';
      }
    }

    if (choice.widget === 'nav-menu' || choice.widget === 'mega-menu') {
      const extractedList = entry.extractedTexts || [];
      const menuItems = extractedList
        .map((t) => ({
          name: safeStr(t.characters || t.nodeName).trim(),
          link: t.link || '#',
        }))
        .filter((item) => item.name.length > 0);

      entry.content.menuItems = menuItems;
    }

    if (choice.widget === 'icon-list') {
      const extractedList = entry.extractedTexts || [];
      const listItems = extractedList
        .map((t, idx) => {
          let text = safeStr(t.characters || t.nodeName).trim();
          text = text.replace(/^[\u2713\u2714\u2022\u00b7\u25cf\u25cb\u2013\u2014\-*]\s*/, '');
          return {
            id: `item_${idx + 1}`,
            text,
            link: t.link || '',
            color: t.color || null,
          };
        })
        .filter((item) => item.text.length > 0);

      const findDeepVectorColor = async (vNode, depth = 0) => {
        if (!vNode || depth > 5) return null;
        const direct = extractSolidColor(vNode.strokes) || extractSolidColor(vNode.fills);
        if (direct) return direct;
        if (typeof vNode.getCSSAsync === 'function' && useDevModeCss) {
          try {
            const vCss = await vNode.getCSSAsync();
            const c = vCss && (normalizeCssColor(vCss['stroke']) || normalizeCssColor(vCss['fill']));
            if (c) return c;
          } catch (e) { }
        }
        for (const k of visibleChildren(vNode)) {
          const found = await findDeepVectorColor(k, depth + 1);
          if (found) return found;
        }
        return null;
      };

      entry.content.iconList = listItems;
      const visualNode = findFirstVisualDescendant(node);
      if (visualNode) {
        entry.content.iconColor = await findDeepVectorColor(visualNode);
        entry.content.iconSize = Math.round(safeNum(visualNode.width, 0)) || null;
      }
    }

    if (choice.widget === 'icon-box' || choice.widget === 'image-box') {
      const extractedList = entry.extractedTexts || [];
      if (extractedList.length > 0) {
        entry.content.title_text = safeStr(extractedList[0].characters).trim();
        entry.content.titleTypography = extractedList[0];
        entry.text = extractedList[0];
      }
      if (extractedList.length > 1) {
        entry.content.description_text = extractedList
          .slice(1)
          .map((t) => safeStr(t.characters).trim())
          .filter(Boolean)
          .join('\n');
        entry.content.descriptionTypography = extractedList[1];
      }
      entry.content.position = (layout.direction === 'row') ? 'left' : 'top';

      const visualNode = findFirstVisualDescendant(node);
      if (visualNode) {
        entry.content.iconSize = Math.round(safeNum(visualNode.width, 40)) || 40;
        entry.content.iconColor = extractSolidColor(visualNode.fills) || extractSolidColor(visualNode.strokes) || null;
        if (typeof visualNode.exportAsync === 'function') {
          if (hasImageFill(visualNode) || (collectTextDescendants(visualNode).length === 0 && hasDescendantImageFill(visualNode))) {
            pendingExports.push({
              kind: 'raster',
              node: visualNode,
              id,
              onResult: (ref) => {
                entry.image = ref;
                entry.raster = ref;
              },
            });
          } else {
            pendingExports.push({ kind: 'svg', node: visualNode, id });
          }
        }
      }
    }

    if (choice.widget === 'counter' || choice.widget === 'countdown') {
      const extractedList = entry.extractedTexts || (entry.text ? [entry.text] : []);
      const numItem = extractedList.find((t) => /\d/.test(safeStr(t.characters))) || extractedList[0] || null;
      const titleItem = extractedList.find((t) => t !== numItem) || null;
      if (numItem) {
        entry.content.counterNumber = safeStr(numItem.characters).trim();
        entry.content.numberTypography = numItem;
      }
      if (titleItem) {
        entry.content.counterTitle = safeStr(titleItem.characters).trim();
        entry.content.titleTypography = titleItem;
      }
    }

    if (choice.widget === 'social-icons' || choice.widget === 'share-buttons') {
      const socialItems = [];
      for (const child of rawKids) {
        const cStyle = extractStyle(child);
        const cLayout = extractLayout(child, node);
        if (useDevModeCss && typeof child.getCSSAsync === 'function') {
          try {
            const cCss = await child.getCSSAsync();
            if (cCss) applyDevModeCSSToNode({ style: cStyle, layout: cLayout }, cCss);
          } catch (e) { }
        }
        socialItems.push({
          id: child.id,
          name: safeStr(child.name, 'social'),
          link: extractLink(child) || '#',
          background: cStyle.background || null,
          borderColor: cStyle.borderColor || null,
          radius: cStyle.radius || null,
          width: cLayout.width || 40,
        });
      }
      entry.content.socialItems = socialItems;
    }

    if (['image-gallery', 'image-carousel', 'gallery', 'media-carousel'].includes(choice.widget)) {
      let imgNodes = hasImageFill(node)
        ? [node]
        : collectVisualImageDescendants(node, { includeVectors: false });
      if (imgNodes.length === 0) {
        imgNodes = collectVisualImageDescendants(node, { includeVectors: true, minVectorSize: 25 });
      }
      if (imgNodes.length > 0) {
        entry.extractedImages = new Array(imgNodes.length).fill(null);
        imgNodes.forEach((imgNode, idx) => {
          if (typeof imgNode.exportAsync === 'function') {
            pendingExports.push({
              kind: 'raster',
              node: imgNode,
              id,
              onResult: (ref) => {
                entry.extractedImages[idx] = ref;
              },
            });
          }
        });
      }
    }

    if (choice.widget === 'flip-box') {
      const allDirectKids = Array.isArray(node.children) ? node.children.filter(Boolean) : [];
      const isBackName = (nm) => /\b(back|hover|rear|flip|overlay)\b/i.test(safeStr(nm).replace(/[-_]/g, ' '));
      const isFrontName = (nm) => /\b(front|normal|default)\b/i.test(safeStr(nm).replace(/[-_]/g, ' '));

      let backNode = allDirectKids.find((c) => isBackName(c.name)) || null;
      let frontNode = allDirectKids.find((c) => c !== backNode && isFrontName(c.name)) || null;

      if (!backNode) {
        const frameKids = allDirectKids.filter(
          (c) => c.visible !== false && c.type !== 'TEXT' && (c.type === 'FRAME' || c.type === 'GROUP' || c.type === 'INSTANCE' || c.type === 'COMPONENT')
        );
        if (frameKids.length >= 2 && !frameKids[0].isMask) {
          frontNode = frontNode || frameKids[0];
          backNode = frameKids[1];
        }
      }

      const collectTextsExcluding = async (rootN, excludeNode) => {
        const found = [];
        const walkT = (cur) => {
          if (!cur || cur === excludeNode) return;
          if (cur.type === 'TEXT') found.push(cur);
          else if (Array.isArray(cur.children)) {
            for (const ch of cur.children) walkT(ch);
          }
        };
        if (rootN) walkT(rootN);
        const out = [];
        for (const tn of found) {
          const tObj = await extractTextWithDevMode(tn);
          if (tObj && safeStr(tObj.characters).trim().length > 0) {
            tObj.nodeName = safeStr(tn.name, '');
            out.push(tObj);
          }
        }
        return out;
      };

      const collectImgsExcluding = (rootN, excludeNode) => {
        if (!rootN) return [];
        const imgs = [];
        const walkI = (cur) => {
          if (!cur || cur === excludeNode) return;
          if (hasImageFill(cur)) {
            imgs.push(cur);
            return;
          }
          if (Array.isArray(cur.children)) {
            for (const ch of cur.children) walkI(ch);
          }
        };
        walkI(rootN);
        return imgs;
      };

      const frontScope = frontNode || node;
      const frontTexts = await collectTextsExcluding(frontScope, backNode);
      const frontStyle = frontNode ? extractStyle(frontNode) : style;
      const frontLayout = frontNode ? extractLayout(frontNode, node) : layout;
      if (frontNode && useDevModeCss && typeof frontNode.getCSSAsync === 'function') {
        try {
          const fCss = await frontNode.getCSSAsync();
          if (fCss) applyDevModeCSSToNode({ style: frontStyle, layout: frontLayout }, fCss);
        } catch (e) { }
      }

      const flipFront = {
        texts: frontTexts,
        background: frontStyle.background || null,
        gradient: frontStyle.gradient || null,
        padding: frontLayout.padding || null,
        image: null,
      };

      const frontImgCandidates = collectImgsExcluding(frontScope, backNode);
      const frontExportTarget = (frontNode && Array.isArray(frontNode.children) && frontNode.children.some((c) => c && c.isMask))
        ? frontNode
        : (frontImgCandidates[0] || null);
      if (frontExportTarget && typeof frontExportTarget.exportAsync === 'function') {
        pendingExports.push({
          kind: 'raster',
          node: frontExportTarget,
          id,
          onResult: (ref) => {
            flipFront.image = ref;
          },
        });
      }

      let flipBack = null;
      if (backNode) {
        const backTexts = await collectTextsExcluding(backNode, null);
        const backStyle = extractStyle(backNode);
        const backLayout = extractLayout(backNode, node);
        if (useDevModeCss && typeof backNode.getCSSAsync === 'function') {
          try {
            const bCss = await backNode.getCSSAsync();
            if (bCss) applyDevModeCSSToNode({ style: backStyle, layout: backLayout }, bCss);
          } catch (e) { }
        }
        flipBack = {
          texts: backTexts,
          background: backStyle.background || null,
          gradient: backStyle.gradient || null,
          padding: backLayout.padding || null,
          image: null,
        };
        const backImgs = collectImgsExcluding(backNode, null);
        if (backImgs[0] && typeof backImgs[0].exportAsync === 'function') {
          pendingExports.push({
            kind: 'raster',
            node: backImgs[0],
            id,
            onResult: (ref) => {
              flipBack.image = ref;
            },
          });
        }
      }

      entry.content.flipBox = { front: flipFront, back: flipBack };
    }

    if (['call-to-action', 'testimonial', 'price-table'].includes(choice.widget)) {
      const imgNodes = collectVisualImageDescendants(node, { includeVectors: false });
      if (imgNodes.length > 0) {
        entry.extractedImages = new Array(imgNodes.length).fill(null);
        imgNodes.forEach((imgNode, idx) => {
          if (typeof imgNode.exportAsync === 'function') {
            pendingExports.push({
              kind: 'raster',
              node: imgNode,
              id,
              onResult: (ref) => {
                entry.extractedImages[idx] = ref;
              },
            });
          }
        });
      }
      if (choice.widget === 'call-to-action') {
        const btnChild = rawKids.find((c) => c && c.type !== 'TEXT' && resolveWidget(c).widget === 'button');
        if (btnChild) {
          const btnTexts = collectTextDescendants(btnChild);
          if (btnTexts.length > 0) {
            entry.content.ctaButtonText = safeStr(btnTexts[0].characters).trim();
          }
        }
      }
    }

    if (['slides', 'testimonial-carousel', 'reviews'].includes(choice.widget)) {
      const slides = [];
      entry.extractedImages = [];
      const sliderNav = { hasDots: false, hasArrows: false, dotsColor: null, arrowsColor: null };
      for (const slideChild of rawKids) {
        if (!slideChild || slideChild.visible === false) continue;
        if (isSliderControlChild(slideChild)) {
          const sn = safeStr(slideChild.name).toLowerCase();
          const sStyle = extractStyle(slideChild);
          const firstGrand = visibleChildren(slideChild)[0];
          const gColor = firstGrand ? (extractSolidColor(firstGrand.fills) || extractSolidColor(firstGrand.strokes)) : null;
          const ctrlColor = sStyle.background || sStyle.borderColor || gColor || null;
          if (/\b(arrow|prev|next|chevron|arrows|slider-nav|carousel-nav|slider-btn|nav-btn|controls)\b/i.test(sn)) {
            sliderNav.hasArrows = true;
            if (!sliderNav.arrowsColor && ctrlColor) sliderNav.arrowsColor = ctrlColor;
          } else {
            sliderNav.hasDots = true;
            if (!sliderNav.dotsColor && ctrlColor) sliderNav.dotsColor = ctrlColor;
          }
          continue;
        }
        const slideTextNodes = collectTextDescendants(slideChild);
        const slideTexts = [];
        for (const tn of slideTextNodes) {
          const tObj = await extractTextWithDevMode(tn);
          if (tObj && safeStr(tObj.characters).trim().length > 0) {
            tObj.nodeName = safeStr(tn.name, '');
            tObj.link = extractLink(tn) || '';
            slideTexts.push(tObj);
          }
        }
        const slideStyle = extractStyle(slideChild);
        if (useDevModeCss && typeof slideChild.getCSSAsync === 'function') {
          try {
            const sCss = await slideChild.getCSSAsync();
            if (sCss) applyDevModeCSSToNode({ type: 'frame', style: slideStyle, layout: {} }, sCss);
          } catch (e) { }
        }
        const slideObj = {
          id: slideChild.id,
          name: safeStr(slideChild.name, 'Slide'),
          texts: slideTexts,
          background: slideStyle.background || null,
          image: null,
        };
        slides.push(slideObj);

        if (hasImageFill(slideChild) && typeof slideChild.exportAsync === 'function') {
          const slideFgNodes = visibleChildren(slideChild);
          pendingExports.push({
            kind: slideFgNodes.length > 0 ? 'composite-bg' : 'raster',
            node: slideChild,
            id,
            fgNodes: slideFgNodes,
            hasDirectImageFill: true,
            onResult: (ref) => {
              slideObj.image = ref;
              entry.extractedImages.push(ref);
            },
          });
        } else {
          const descImg = collectVisualImageDescendants(slideChild, { includeVectors: false })[0];
          if (descImg && typeof descImg.exportAsync === 'function') {
            pendingExports.push({
              kind: 'raster',
              node: descImg,
              id,
              onResult: (ref) => {
                slideObj.image = ref;
                entry.extractedImages.push(ref);
              },
            });
          }
        }
      }
      entry.content.slides = slides;
      if (sliderNav.hasDots || sliderNav.hasArrows) {
        entry.content.sliderNav = sliderNav;
      }
    }

    if (['accordion', 'nested-accordion', 'toggle', 'tabs', 'nested-tabs'].includes(choice.widget)) {
      const accordionItems = [];

      const extractExpandIconStyle = async (containerNode) => {
        const kids = visibleChildren(containerNode);
        for (const k of kids) {
          if (!k || k.type === 'TEXT') continue;
          const kTexts = collectTextDescendants(k);
          if (kTexts.length > 0) continue;
          const kName = safeStr(k.name).toLowerCase();
          const kw = Math.round(safeNum(k.width, 0));
          const kh = Math.round(safeNum(k.height, 0));
          const isIconLike =
            kName.includes('plus') ||
            kName.includes('minus') ||
            kName.includes('chevron') ||
            kName.includes('arrow') ||
            kName.includes('icon') ||
            (kw > 0 && kw <= 48 && kh > 0 && kh <= 48);
          if (!isIconLike) continue;

          const kEntry = { layout: extractLayout(k, containerNode), style: extractStyle(k) };
          if (useDevModeCss && typeof k.getCSSAsync === 'function') {
            try {
              const kCss = await k.getCSSAsync();
              if (kCss) applyDevModeCSSToNode(kEntry, kCss);
            } catch (e) { }
          }
          // Find stroke/fill color of the inner vector icon (e.g. "Plus" stroke: #16A34A)
          let iconStrokeColor = kEntry.style.borderColor || null;
          const innerKids = visibleChildren(k);
          for (const ik of innerKids) {
            const c = extractSolidColor(ik.strokes) || extractSolidColor(ik.fills);
            if (c) {
              iconStrokeColor = c;
              break;
            }
            if (useDevModeCss && typeof ik.getCSSAsync === 'function') {
              try {
                const ikCss = await ik.getCSSAsync();
                const sc = ikCss && (normalizeCssColor(ikCss['stroke']) || normalizeCssColor(ikCss['fill']) || normalizeCssColor(ikCss['color']));
                if (sc) {
                  iconStrokeColor = sc;
                  break;
                }
              } catch (e) { }
            }
          }
          return {
            width: kEntry.layout.width || kw || 32,
            height: kEntry.layout.height || kh || 32,
            background: kEntry.style.background || null,
            radius: kEntry.style.radius || null,
            color: iconStrokeColor || extractSolidColor(k.strokes) || extractSolidColor(k.fills) || null,
          };
        }
        return null;
      };

      // Check if this node is a single FAQ card (direct children include a TEXT node + icon, e.g. "FAQ 1" -> [Question, Plus wrap])
      const hasDirectTextChild = rawKids.some((c) => c && c.type === 'TEXT');
      if (hasDirectTextChild) {
        const textNodes = collectTextDescendants(node);
        if (textNodes.length > 0) {
          const titleNode = textNodes[0];
          const bodyNodes = textNodes.slice(1);
          const titleText = safeStr(titleNode.characters || titleNode.name).trim();
          const titleTypography = await extractTextWithDevMode(titleNode);
          let bodyText = '';
          let bodyTypography = null;
          if (bodyNodes.length > 0) {
            bodyText = bodyNodes.map((bn) => safeStr(bn.characters || bn.name).trim()).filter(Boolean).join('\n');
            bodyTypography = await extractTextWithDevMode(bodyNodes[0]);
          }
          const expandIconStyle = await extractExpandIconStyle(node);
          accordionItems.push({
            id: node.id,
            title: titleText || safeStr(node.name, 'Item 1'),
            body: bodyText,
            titleTypography,
            bodyTypography,
            padding: entry.layout.padding,
            borderWidth: entry.style.borderWidth,
            borderColor: entry.style.borderColor,
            background: entry.style.background,
            radius: entry.style.radius,
            expandIconStyle,
          });
        }
      } else {
        for (const child of rawKids) {
          const textNodes = collectTextDescendants(child);
          if (textNodes.length === 0) continue;
          const titleNode = textNodes[0];
          const bodyNodes = textNodes.slice(1);

          const titleText = safeStr(titleNode.characters || titleNode.name).trim();
          const titleTypography = await extractTextWithDevMode(titleNode);

          let bodyText = '';
          let bodyTypography = null;
          if (bodyNodes.length > 0) {
            bodyText = bodyNodes.map((bn) => safeStr(bn.characters || bn.name).trim()).filter(Boolean).join('\n');
            bodyTypography = await extractTextWithDevMode(bodyNodes[0]);
          }

          const itemEntry = {
            sourceNodeId: child.id,
            layout: extractLayout(child, node),
            style: extractStyle(child),
          };
          if (useDevModeCss && typeof child.getCSSAsync === 'function') {
            try {
              const cCss = await child.getCSSAsync();
              if (cCss) applyDevModeCSSToNode(itemEntry, cCss);
            } catch (e) { }
          }
          const expandIconStyle = await extractExpandIconStyle(child);

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
            radius: itemEntry.style.radius,
            expandIconStyle,
          });
        }
      }
      entry.content.accordionItems = accordionItems;
    }

    if (choice.widget === 'form' || choice.widget === 'login' || choice.widget === 'search-form') {
      const formFields = [];
      let submitLabel = 'Send Message';
      let hasAnyExternalLabel = false;

      const isPureRedAsterisk = (color) => {
        if (!color || typeof color !== 'string') return false;
        const c = color.trim().toUpperCase();
        return c === '#FF0000' || c === '#F00' || c === '#EF4444' || c === '#DC2626' || c === '#E11D48';
      };

      const isInputLikeName = (name) => {
        const lower = safeStr(name).toLowerCase();
        return (
          lower.includes('input') ||
          lower.includes('field') ||
          lower.includes('select') ||
          lower.includes('dropdown') ||
          lower.includes('picker') ||
          lower.includes('date') ||
          lower.includes('time') ||
          lower.includes('search') ||
          lower.includes('textarea') ||
          lower.includes('textbox') ||
          lower.includes('placeholder')
        );
      };

      const isButtonLikeNode = (n, parentRef = null) => {
        if (!n || n.type === 'TEXT') return false;
        const lower = safeStr(n.name).toLowerCase();
        if (isInputLikeName(lower)) return false;
        if (parentRef && safeStr(parentRef.name).toLowerCase().includes('input')) return false;

        const tCount = collectTextDescendants(n).length;
        if (tCount === 0 || tCount > 2) return false;
        if (lower.includes('btn') || lower.includes('button') || lower.includes('submit') || lower.includes('cta') || lower.includes('book')) return true;
        const resolved = resolveWidget(n);
        return resolved && resolved.widget === 'button';
      };

      const isThinLineNode = (n) => {
        if (!n || n.type === 'TEXT') return false;
        const nh = Number(n.height) || 0;
        const nw = Number(n.width) || 0;
        return n.type === 'LINE' || (nh > 0 && nh <= 4 && nw >= 40);
      };

      const isInputBoxLike = (k) => {
        if (!k || k.type === 'TEXT' || isThinLineNode(k)) return false;
        const kName = safeStr(k.name).toLowerCase();
        if (kName.includes('label')) return false;
        const st = extractStyle(k);
        return Boolean(
          st.background ||
          st.borderColor ||
          st.radius ||
          kName.includes('input') ||
          kName.includes('textarea') ||
          kName.includes('select') ||
          kName.includes('box') ||
          kName.includes('field') ||
          kName.includes('content')
        );
      };

      const findInputBoxNode = (fieldNode) => {
        const kids = visibleChildren(fieldNode);
        for (const k of kids) {
          if (isInputBoxLike(k)) return k;
        }
        return fieldNode;
      };

      const isSingleFieldPair = (nodeToCheck, kids) => {
        if (!kids || kids.length !== 2) return false;
        if (nodeToCheck.layoutMode === 'HORIZONTAL') return false;
        const [first, second] = kids;
        const firstTexts = collectTextDescendants(first);
        const secondTexts = collectTextDescendants(second);
        if (firstTexts.length === 0 || firstTexts.length > 2) return false;
        if (secondTexts.length > 2) return false;
        const firstName = safeStr(first.name).toLowerCase();
        const firstStyle = first.type === 'TEXT' ? {} : extractStyle(first);
        const firstLooksLikeLabel =
          first.type === 'TEXT' ||
          firstName.includes('label') ||
          firstName.includes('title') ||
          (!firstStyle.background && !firstStyle.borderColor && !firstStyle.radius);
        return firstLooksLikeLabel && isInputBoxLike(second);
      };

      const hasVectorMatching = (n, matchFn) => {
        const q = [n];
        while (q.length > 0) {
          const cur = q.shift();
          if (!cur) continue;
          const nm = safeStr(cur.name).toLowerCase();
          if (matchFn(nm, cur)) return true;
          for (const ch of visibleChildren(cur)) q.push(ch);
        }
        return false;
      };

      const parseSingleField = async (fieldNode, parentRef, widthPct = '100') => {
        const lowerName = safeStr(fieldNode.name).toLowerCase();
        const childTextNodes = collectTextDescendants(fieldNode);
        const texts = childTextNodes.map((t) => safeStr(t.characters || t.name).trim()).filter(Boolean);
        if (texts.length === 0) return;

        const fieldKids = visibleChildren(fieldNode);
        const isPair = isSingleFieldPair(fieldNode, fieldKids);
        if (isPair) hasAnyExternalLabel = true;

        let label = texts[0];
        let placeholderIdx = (isPair || texts.length > 1) ? 1 : 0;
        if (texts.length >= 2 && texts[1] === '*') {
          label = `${texts[0]} *`;
          placeholderIdx = (isPair || texts.length > 2) ? 2 : 0;
        }

        const placeholder = texts[placeholderIdx] || label.replace(/\s*\*$/, '').trim();
        const isRequired = label.includes('*') || lowerName.includes('required');
        const cleanLabel = label.replace(/\s*\*$/, '').trim() || label;
        const combinedSearch = `${lowerName} ${cleanLabel.toLowerCase()} ${placeholder.toLowerCase()}`;

        const inputBox = findInputBoxNode(fieldNode);
        const inputBoxEntry = {
          layout: extractLayout(inputBox, fieldNode),
          style: extractStyle(inputBox),
        };
        if (useDevModeCss && typeof inputBox.getCSSAsync === 'function') {
          try {
            const ibCss = await inputBox.getCSSAsync();
            if (ibCss) applyDevModeCSSToNode(inputBoxEntry, ibCss);
          } catch (e) { }
        }
        const inputHeight = Number(inputBoxEntry.layout.height || inputBox.height || 0);

        const hasCalendarIcon = hasVectorMatching(fieldNode, (nm) => nm.includes('calendar') || nm.includes('lịch') || nm.includes('date'));
        const hasDropdownIcon = hasVectorMatching(fieldNode, (nm) => nm.includes('select') || nm.includes('arrow') || nm.includes('chevron') || nm.includes('dropdown') || nm.includes('down'));
        const hasClockIcon = hasVectorMatching(fieldNode, (nm) => nm.includes('clock') || nm.includes('time') || nm.includes('giờ'));

        let fieldType = 'text';
        if (combinedSearch.includes('email') || combinedSearch.includes('mail')) {
          fieldType = 'email';
        } else if (combinedSearch.includes('phone') || combinedSearch.includes('tel') || combinedSearch.includes('điện thoại') || combinedSearch.includes('sđt') || combinedSearch.includes('hotline')) {
          fieldType = 'tel';
        } else if (combinedSearch.includes('date') || combinedSearch.includes('ngày') || hasCalendarIcon) {
          fieldType = 'date';
        } else if (combinedSearch.includes('time') || combinedSearch.includes('giờ') || hasClockIcon) {
          fieldType = 'time';
        } else if (
          combinedSearch.includes('select') ||
          combinedSearch.includes('choose') ||
          combinedSearch.includes('chọn') ||
          combinedSearch.includes('type') ||
          combinedSearch.includes('loại') ||
          combinedSearch.includes('dropdown') ||
          hasDropdownIcon
        ) {
          fieldType = 'select';
        } else if (combinedSearch.includes('số lượng') || combinedSearch.includes('quantity') || combinedSearch.includes('tuổi') || combinedSearch.includes('age') || combinedSearch.includes('number')) {
          fieldType = 'number';
        } else if (
          combinedSearch.includes('message') ||
          combinedSearch.includes('comment') ||
          combinedSearch.includes('nội dung') ||
          combinedSearch.includes('ghi chú') ||
          combinedSearch.includes('nhu cầu') ||
          combinedSearch.includes('mô tả') ||
          inputHeight >= 80
        ) {
          fieldType = 'textarea';
        } else if (combinedSearch.includes('password') || combinedSearch.includes('mật khẩu')) {
          fieldType = 'password';
        } else if (combinedSearch.includes('url') || combinedSearch.includes('website') || combinedSearch.includes('link')) {
          fieldType = 'url';
        }

        // Extract label typography (from label text, ignoring pure red '*' color)
        if (!entry.content.labelTypography && childTextNodes[0]) {
          const lblT = await extractTextWithDevMode(childTextNodes[0]);
          if (lblT) {
            if (isPureRedAsterisk(lblT.color)) lblT.color = '#000000';
            entry.content.labelTypography = lblT;
          }
        }
        // Extract input field typography (from placeholder/value text inside input box, NEVER the red '*')
        const inputTextNode = childTextNodes[placeholderIdx] || childTextNodes[childTextNodes.length - 1];
        if (!entry.content.fieldTypography && inputTextNode) {
          const fldT = await extractTextWithDevMode(inputTextNode);
          if (fldT) {
            if (isPureRedAsterisk(fldT.color)) fldT.color = '#000000';
            entry.content.fieldTypography = fldT;
          }
        }
        if (!entry.content.fieldStyle && (inputBoxEntry.style.background || inputBoxEntry.style.borderColor || inputBoxEntry.style.radius)) {
          entry.content.fieldStyle = inputBoxEntry.style;
        }
        // Detect underline-style input (thin bottom line child) when no full box border is set
        const underlineChild = fieldKids.find((k) => isThinLineNode(k));
        if (underlineChild) {
          const uStyle = extractStyle(underlineChild);
          const uColor = uStyle.borderColor || uStyle.background;
          const uThick = Math.max(1, Math.round(safeNum(underlineChild.height, 1)));
          if (uColor) {
            if (!entry.content.fieldStyle) entry.content.fieldStyle = {};
            if (!entry.content.fieldStyle.borderColor) {
              entry.content.fieldStyle.borderColor = uColor;
              entry.content.fieldStyle.borderWidth = { top: 0, right: 0, bottom: uThick, left: 0, isLinked: false };
            }
          }
        }

        formFields.push({
          id: `field_${formFields.length + 1}`,
          type: fieldType,
          label: cleanLabel,
          placeholder,
          required: isRequired || fieldType === 'email' ? 'true' : '',
          width: widthPct,
          options: fieldType === 'select' ? `${placeholder}\nOption 1\nOption 2\nOption 3` : undefined,
        });
      };

      const walkFormChildren = async (kids, parentRef, depth = 0) => {
        for (const child of kids) {
          if (!child || child.visible === false) continue;

          if (isButtonLikeNode(child, parentRef)) {
            const btnEntry = { layout: extractLayout(child, parentRef), style: extractStyle(child) };
            if (useDevModeCss && typeof child.getCSSAsync === 'function') {
              try {
                const bCss = await child.getCSSAsync();
                if (bCss) applyDevModeCSSToNode(btnEntry, bCss);
              } catch (e) { }
            }
            const btnTexts = collectTextDescendants(child);
            if (btnTexts.length > 0) {
              submitLabel = safeStr(btnTexts[0].characters || btnTexts[0].name).trim();
              entry.content.buttonTypography = await extractTextWithDevMode(btnTexts[0]);
            }
            entry.content.buttonStyle = btnEntry.style;
            entry.content.buttonPadding = btnEntry.layout.padding;
            continue;
          }

          const grandKids = visibleChildren(child);
          const grandFrameKids = grandKids.filter((gk) => gk.type !== 'TEXT' && collectTextDescendants(gk).length > 0);
          const allTextsInChild = collectTextDescendants(child);

          // Case 0: Single field structured as [LabelFrame("Họ và tên" + "*"), InputBoxFrame("Nhập...")]
          if (isSingleFieldPair(child, grandKids)) {
            await parseSingleField(child, parentRef, '100');
            continue;
          }

          // Case 1: Wrapper container holding multiple field rows or a 2-column horizontal row of fields
          if (depth < 4 && grandFrameKids.length >= 2) {
            const isHorizontalRow = child.layoutMode === 'HORIZONTAL';
            if (isHorizontalRow) {
              const nonBtnCols = grandFrameKids.filter((gk) => !isButtonLikeNode(gk, child));
              const colPct = nonBtnCols.length === 2 ? '50' : (nonBtnCols.length === 3 ? '33' : '100');
              for (const colField of grandKids) {
                if (isButtonLikeNode(colField, child)) {
                  await walkFormChildren([colField], child, depth + 1);
                } else {
                  await parseSingleField(colField, child, colPct);
                }
              }
              continue;
            }
            // Vertical wrapper (e.g. "Fields" or "Inputs" group containing multiple fields)
            if (allTextsInChild.length >= 2 || grandFrameKids.every((gk) => collectTextDescendants(gk).length >= 1)) {
              await walkFormChildren(grandKids, child, depth + 1);
              continue;
            }
          }

          // Case 2: Single field node (e.g. Field -> [Label, Input Box] or single input instance)
          await parseSingleField(child, parentRef, '100');
        }
      };

      await walkFormChildren(rawKids, node, 0);
      entry.content.formFields = formFields;
      entry.content.submitLabel = submitLabel;
      entry.content.hasExternalLabels = hasAnyExternalLabel;
    }

    const isVisualAssetWidget = [
      'icon',
      'image',
      'theme-site-logo',
      'site-logo',
      'theme-post-featured-image',
      'html',
    ].includes(choice.widget);

    if (hasCompositeBg && typeof node.exportAsync === 'function') {
      pendingExports.push({ kind: 'composite-bg', node, id, fgNodes: compositeFgNodes });
    } else if (isVisualAssetWidget && typeof node.exportAsync === 'function') {
      if (hasImageFill(node) || (collectTextDescendants(node).length === 0 && hasDescendantImageFill(node))) {
        pendingExports.push({ kind: 'raster', node, id });
      } else {
        // Multi-color SVG icon, logo frame, vector graphic, or illustrated shape
        pendingExports.push({ kind: 'svg', node, id });
      }
    } else if (hasImageFill(node) && typeof node.exportAsync === 'function') {
      if (!isLeafWidget && rawKids.length > 0) {
        pendingExports.push({ kind: 'composite-bg', node, id, fgNodes: rawKids, hasDirectImageFill: true });
      } else {
        pendingExports.push({ kind: 'raster', node, id });
      }
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

  const recordRasterAsset = async (item, imgBytes, prefix = 'img') => {
    const hash = await sha256(imgBytes);
    const b64 = bytesToBase64(imgBytes);
    const dataUri = `data:${mime};base64,${b64}`;
    const ref = { sha256: hash, mime, dataUri };

    if (typeof item.onResult === 'function') {
      item.onResult(ref);
    } else {
      nodes[item.id].raster = ref;
      if (['image', 'theme-site-logo', 'site-logo', 'theme-post-featured-image'].includes(nodes[item.id].widget)) {
        nodes[item.id].image = ref;
      } else {
        nodes[item.id].style.backgroundImage = hash;
        nodes[item.id].style.backgroundImageDataUri = dataUri;
      }
    }

    if (!seenHashes.has(hash)) {
      const asset = {
        assetId: `${prefix}-${item.node.id}`,
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
  };

  const getSingleCleanImageHashBytes = async (targetNode) => {
    if (typeof figma === 'undefined' || typeof figma.getImageByHash !== 'function') return null;
    const visFills = Array.isArray(targetNode.fills)
      ? targetNode.fills.filter((f) => f && f.visible !== false)
      : [];
    if (visFills.length !== 1) return null;
    const f = visFills[0];
    if (!f || f.type !== 'IMAGE' || !f.imageHash) return null;
    if (f.scaleMode && f.scaleMode !== 'FILL' && f.scaleMode !== 'FIT') return null;
    try {
      const imgHandle = figma.getImageByHash(f.imageHash);
      if (imgHandle && typeof imgHandle.getBytesAsync === 'function') {
        const bytes = await imgHandle.getBytesAsync();
        if (bytes && bytes.byteLength > 0) return bytes;
      }
    } catch (e) { }
    return null;
  };

  for (let expIdx = 0; expIdx < pendingExports.length; expIdx += 1) {
    const item = pendingExports[expIdx];
    if (typeof onProgress === 'function') {
      onProgress('assets', expIdx + 1, pendingExports.length, safeStr(item.node && item.node.name));
    }
    try {
      if (item.kind === 'svg') {
        const svgBytes = await item.node.exportAsync({ format: 'SVG' });
        const svgString = utf8Decode(svgBytes);
        // Reactive safeguard: if Figma emitted an <svg><image href="data:image/..."/></svg>, re-export as raster
        if (/<image\b[^>]*\b(?:xlink:)?href\s*=\s*["']data:image\//i.test(svgString) && typeof item.node.exportAsync === 'function') {
          const fallbackBytes = await item.node.exportAsync({
            format: fmt,
            constraint: { type: 'SCALE', value: scale },
          });
          await recordRasterAsset(item, fallbackBytes, 'img');
          continue;
        }
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
      } else if (item.kind === 'composite-bg') {
        // Fast path: single clean IMAGE fill on container -> extract raw image bytes via getImageByHash without mutating canvas
        let imgBytes = item.hasDirectImageFill ? await getSingleCleanImageHashBytes(item.node) : null;

        if (!imgBytes) {
          // Non-destructive composite background baking: lock HUG Auto-Layout dimensions,
          // clear node strokes/effects/opacity (or strip CSS copies if read-only on INSTANCE),
          // temporarily hide foreground nodes, export, and restore everything in `finally`.
          const targetNode = item.node;
          const prevVisibility = (item.fgNodes || []).map((n) => [n, n.visible]);
          const prevLayoutState = {
            hasLayout: Boolean(targetNode.layoutMode && targetNode.layoutMode !== 'NONE'),
            pMode: targetNode.primaryAxisSizingMode,
            cMode: targetNode.counterAxisSizingMode,
            sH: targetNode.layoutSizingHorizontal,
            sV: targetNode.layoutSizingVertical,
            w: targetNode.width,
            h: targetNode.height,
          };
          const prevStrokes = targetNode.strokes;
          const prevEffects = targetNode.effects;
          const prevOpacity = targetNode.opacity;
          let clearedStrokes = false;
          let clearedEffects = false;
          let clearedOpacity = false;

          try {
            if (prevLayoutState.hasLayout) {
              try {
                if (prevLayoutState.pMode === 'AUTO') targetNode.primaryAxisSizingMode = 'FIXED';
                if (prevLayoutState.cMode === 'AUTO') targetNode.counterAxisSizingMode = 'FIXED';
                if (prevLayoutState.sH === 'HUG') targetNode.layoutSizingHorizontal = 'FIXED';
                if (prevLayoutState.sV === 'HUG') targetNode.layoutSizingVertical = 'FIXED';
              } catch (e) { }
            }

            try {
              if (Array.isArray(prevStrokes) && prevStrokes.length > 0) {
                targetNode.strokes = [];
                if (Array.isArray(targetNode.strokes) && targetNode.strokes.length === 0) clearedStrokes = true;
              } else {
                clearedStrokes = true;
              }
            } catch (e) { }

            try {
              if (Array.isArray(prevEffects) && prevEffects.length > 0) {
                targetNode.effects = [];
                if (Array.isArray(targetNode.effects) && targetNode.effects.length === 0) clearedEffects = true;
              } else {
                clearedEffects = true;
              }
            } catch (e) { }

            try {
              if (typeof prevOpacity === 'number' && prevOpacity < 1) {
                targetNode.opacity = 1;
                if (targetNode.opacity === 1) clearedOpacity = true;
              } else {
                clearedOpacity = true;
              }
            } catch (e) { }

            let allHidden = true;
            for (const [fg] of prevVisibility) {
              try {
                fg.visible = false;
                if (fg.visible !== false) allHidden = false;
              } catch (e) {
                allHidden = false;
              }
            }

            if (!allHidden) {
              const directFallback = await getSingleCleanImageHashBytes(targetNode);
              if (directFallback) {
                imgBytes = directFallback;
              } else {
                warnings.push({
                  code: 'composite-bg-instance-fg-visible',
                  nodeId: targetNode.id,
                  message: `Could not hide foreground child inside "${safeStr(targetNode.name)}" (possibly locked INSTANCE) during composite background export.`,
                });
              }
            }

            if (!imgBytes) {
              imgBytes = await targetNode.exportAsync({
                format: fmt,
                constraint: { type: 'SCALE', value: scale },
              });
            }
          } finally {
            for (const [fg, wasVisible] of prevVisibility) {
              try { fg.visible = wasVisible; } catch (e) { }
            }
            try { if (clearedStrokes && prevStrokes !== undefined) targetNode.strokes = prevStrokes; } catch (e) { }
            try { if (clearedEffects && prevEffects !== undefined) targetNode.effects = prevEffects; } catch (e) { }
            try { if (clearedOpacity && prevOpacity !== undefined) targetNode.opacity = prevOpacity; } catch (e) { }
            if (prevLayoutState.hasLayout) {
              try {
                if (prevLayoutState.pMode !== undefined) targetNode.primaryAxisSizingMode = prevLayoutState.pMode;
                if (prevLayoutState.cMode !== undefined) targetNode.counterAxisSizingMode = prevLayoutState.cMode;
                if (prevLayoutState.sH !== undefined) targetNode.layoutSizingHorizontal = prevLayoutState.sH;
                if (prevLayoutState.sV !== undefined) targetNode.layoutSizingVertical = prevLayoutState.sV;
              } catch (e) { }
            }
          }

          if (!item.onResult && nodes[item.id] && nodes[item.id].style) {
            const st = nodes[item.id].style;
            if (!clearedStrokes) {
              delete st.borderWidth;
              delete st.borderColor;
              delete st.borderGradient;
              delete st.devModeBorder;
              delete st.devModeBorderImage;
            }
            if (!clearedEffects) {
              delete st.boxShadow;
              delete st.devModeBoxShadow;
            }
            if (!clearedOpacity) {
              delete st.opacity;
            }
          }
        }

        await recordRasterAsset(item, imgBytes, 'bg');
      } else {
        const imgBytes = await item.node.exportAsync({
          format: fmt,
          constraint: { type: 'SCALE', value: scale },
        });
        await recordRasterAsset(item, imgBytes, 'img');
      }
    } catch (err) {
      warnings.push({
        code: 'asset-export-failed',
        nodeId: item.node.id,
        message: `Could not export asset for "${safeStr(item.node.name)}": ${err && err.message ? err.message : err}`,
      });
    }
  }

  for (const n of Object.values(nodes)) {
    if (n && Array.isArray(n.extractedImages)) {
      n.extractedImages = n.extractedImages.filter(Boolean);
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

const VISUAL_NAME_TOKENS = new Set(['icon', 'ic', 'svg', 'logo', 'img', 'image', 'pic', 'photo', 'avatar', 'thumb', 'thumbnail']);

export function collectVisualImageDescendants(node, options = {}, depth = 0) {
  if (!node || depth > 4) return [];
  const { includeVectors = true, minVectorSize = 0 } = options;
  const out = [];
  for (const child of visibleChildren(node)) {
    if (!child || child.type === 'TEXT') continue;
    if (hasImageFill(child)) {
      out.push(child);
      continue;
    }
    if (collectTextDescendants(child).length === 0 && hasDescendantImageFill(child)) {
      out.push(child);
      continue;
    }
    if (includeVectors && isVectorGraphic(child)) {
      const w = Number(child.width) || 0;
      const h = Number(child.height) || 0;
      if (minVectorSize <= 0 || w >= minVectorSize || h >= minVectorSize) {
        out.push(child);
        continue;
      }
    }
    out.push(...collectVisualImageDescendants(child, options, depth + 1));
  }
  return out;
}

export function findFirstVisualDescendant(node, depth = 0) {
  if (!node || depth > 4) return null;
  const kids = visibleChildren(node);
  for (const child of kids) {
    if (child.type === 'TEXT') continue;
    if (hasImageFill(child)) return child;
    const hasChildTexts = collectTextDescendants(child).length > 0;
    if (!hasChildTexts && hasDescendantImageFill(child)) return child;
    if (isVectorGraphic(child)) return child;
    const t = child.type;
    if (t === 'VECTOR' || t === 'LINE' || t === 'ELLIPSE' || t === 'POLYGON' || t === 'STAR' || t === 'BOOLEAN_OPERATION') {
      return child;
    }
    if (!hasChildTexts) {
      const tokens = safeStr(child.name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      if (tokens.some((tok) => VISUAL_NAME_TOKENS.has(tok))) {
        return child;
      }
    }
    const found = findFirstVisualDescendant(child, depth + 1);
    if (found) return found;
  }
  return null;
}

