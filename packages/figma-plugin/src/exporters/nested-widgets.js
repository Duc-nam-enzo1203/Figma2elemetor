/**
 * Elementor Nested Container Widgets (`nested-accordion`, `nested-tabs`).
 */
import { shortId } from '../utils/crypto.js';
import { boxValue, applyTypographySettings, collectSubtreeTexts, escapeHtml } from './compiler-helpers.js';

export function buildNestedAccordion(node, nodes, allocId, buildElement) {
  const items = [];
  const panels = [];
  const extractedItems = (node.content && Array.isArray(node.content.accordionItems)) ? node.content.accordionItems : [];
  const childIds = Array.isArray(node.children) ? node.children : [];

  let firstTitleTypo = null;
  let activeTitleColor = null;
  let normalTitleColor = null;
  let firstBodyTypo = null;
  let firstBodyText = '';
  let rowPadding = null;
  let rowBorderWidth = null;
  let rowBorderColor = null;
  let rowBackground = null;
  let rowRadius = null;
  let expandIconStyle = null;
  const leadingIcons = [];

  const findLeadingIconSvg = (irChild) => {
    if (!irChild) return null;
    const queue = [...(irChild.children || [])];
    while (queue.length > 0) {
      const cid = queue.shift();
      const cn = nodes[cid];
      if (!cn) continue;
      if (cn.svg && cn.svg.markup) {
        const w = Number(cn.layout && cn.layout.width) || 40;
        const h = Number(cn.layout && cn.layout.height) || 40;
        const nm = String((cn.content && cn.content.name) || '').toLowerCase();
        // Skip small right-hand expand/collapse plus/minus icon (<= 36px or named plus/minus/arrow/chevron)
        if ((w <= 36 && h <= 36 && (nm.includes('plus') || nm.includes('minus') || nm.includes('chevron') || nm.includes('arrow'))) || nm === 'icon/plus' || nm === 'icon/minus') {
          continue;
        }
        return { markup: cn.svg.markup, width: w, height: h };
      }
      if (Array.isArray(cn.children)) queue.push(...cn.children);
    }
    return null;
  };

  // Map childIds by sourceNodeId/id and build filtered fallback list (excluding decorative icons/dividers/spacers)
  const childBySourceId = new Map();
  const fallbackChildren = [];
  for (const cid of childIds) {
    const cn = nodes[cid];
    if (!cn) continue;
    if (cn.sourceNodeId) childBySourceId.set(String(cn.sourceNodeId), cn);
    childBySourceId.set(String(cn.id || cid), cn);
    const cTexts = collectSubtreeTexts(cn, nodes);
    if (cTexts.length === 0 && (cn.widget === 'icon' || cn.widget === 'divider' || cn.widget === 'spacer')) {
      continue;
    }
    fallbackChildren.push(cn);
  }

  // When extractedItems are present, iterate ONLY over them (never turn icon-only children like "Plus wrap" into fake accordion items!)
  const useExtracted = extractedItems.length > 0;
  const count = useExtracted ? extractedItems.length : fallbackChildren.length;
  for (let i = 0; i < count; i += 1) {
    const ext = useExtracted ? (extractedItems[i] || null) : null;
    let child = null;
    if (ext) {
      const nodeSourceId = String(node.sourceNodeId || node.id || '');
      if (ext.id && String(ext.id) === nodeSourceId) {
        child = node;
      } else if (ext.id && childBySourceId.has(String(ext.id))) {
        child = childBySourceId.get(String(ext.id));
      } else {
        child = fallbackChildren[i] || null;
      }
    } else {
      child = fallbackChildren[i] || null;
    }
    const cid = (child && child.id) || (ext && ext.id) || childIds[i];
    const childTexts = child ? collectSubtreeTexts(child, nodes) : [];

    const titleNodeTypo = (ext && ext.titleTypography) || (childTexts[0] && childTexts[0].text) || null;
    const bodyNodeTypo = (ext && ext.bodyTypography) || (childTexts[1] && childTexts[1].text) || null;

    const title = (ext && ext.title)
      || (childTexts[0] && childTexts[0].text && childTexts[0].text.characters)
      || (child && child.content && child.content.name)
      || `Item #${i + 1}`;

    const bodyText = (ext && ext.body)
      || (childTexts.length > 1
        ? childTexts.slice(1).map((t) => (t.text && t.text.characters) || '').filter(Boolean).join('\n')
        : '');

    if (titleNodeTypo) {
      if (!firstTitleTypo) firstTitleTypo = titleNodeTypo;
      if (items.length === 0 && titleNodeTypo.color && !activeTitleColor) {
        activeTitleColor = titleNodeTypo.color;
      } else if (items.length > 0 && titleNodeTypo.color && !normalTitleColor) {
        normalTitleColor = titleNodeTypo.color;
      }
    }
    if (bodyNodeTypo && !firstBodyTypo) firstBodyTypo = bodyNodeTypo;
    if (bodyText && !firstBodyText) firstBodyText = bodyText;

    const pad = (ext && ext.padding) || (child && child.layout && child.layout.padding);
    if (pad && !rowPadding && (pad.top || pad.bottom || pad.left || pad.right)) {
      rowPadding = pad;
    }
    const bw = (ext && ext.borderWidth) || (child && child.style && child.style.borderWidth);
    const bc = (ext && ext.borderColor) || (child && child.style && child.style.borderColor);
    if (bw && bc && !rowBorderWidth) {
      rowBorderWidth = bw;
      rowBorderColor = bc;
    }
    const bg = (ext && ext.background) || (child && child.style && child.style.background);
    if (bg && !rowBackground) {
      rowBackground = bg;
    }
    const rad = (ext && ext.radius) || (child && child.style && child.style.radius);
    if (rad && !rowRadius) {
      rowRadius = rad;
    }
    if (ext && ext.expandIconStyle && !expandIconStyle) {
      expandIconStyle = ext.expandIconStyle;
    }

    const iconInfo = findLeadingIconSvg(child);
    leadingIcons.push(iconInfo);

    const itemId = shortId((ext && ext.id) || cid || `${node.id}-item-${i}`);
    items.push({ _id: itemId, item_title: title });

    const effectiveBody = bodyText || firstBodyText || title;
    const bTypo = bodyNodeTypo || firstBodyTypo || {
      fontFamily: (firstTitleTypo && firstTitleTypo.fontFamily) || 'Inter',
      fontWeight: '400',
      fontSize: 16,
      lineHeight: 24,
      lineHeightUnit: 'px',
      color: 'rgba(0, 0, 0, 0.7)',
    };
    const leftIndent = iconInfo ? (iconInfo.width + 16) : (leadingIcons[0] ? (leadingIcons[0].width + 16) : 0);
    const bodyPadLeft = leftIndent > 0 ? leftIndent : ((rowPadding && rowPadding.left) || 0);
    const bodyPadRight = (rowPadding && rowPadding.right) || 0;

    const bodyHtml = String(effectiveBody || '')
      .split(/\n+/)
      .map((line) => `<p style="margin:0;">${escapeHtml(line)}</p>`)
      .join('');
    const textEditorSettings = {
      editor: bodyHtml || '<p style="margin:0;"></p>',
      align: 'left',
      text_color: bTypo.color || 'rgba(0, 0, 0, 0.7)',
      typography_typography: 'custom',
      typography_font_family: bTypo.fontFamily || 'Inter',
      typography_font_weight: String(bTypo.fontWeight || '400'),
      typography_font_size: { unit: 'px', size: bTypo.fontSize || 16, sizes: [] },
      typography_font_size_tablet: { unit: 'px', size: bTypo.fontSize || 16, sizes: [] },
      typography_font_size_mobile: { unit: 'px', size: Math.max(14, (bTypo.fontSize || 16) - 1), sizes: [] },
      typography_line_height: { unit: bTypo.lineHeightUnit || 'px', size: bTypo.lineHeight || 24, sizes: [] },
      _title: title,
    };

    const innerBodyContainer = {
      id: allocId(`${(ext && ext.id) || cid || node.id}-body-wrap-${i}`),
      elType: 'container',
      isInner: true,
      settings: {
        container_type: 'flex',
        flex_direction: 'column',
        margin: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: false },
        padding: {
          unit: 'px',
          top: '0',
          right: String(bodyPadRight),
          bottom: String((rowPadding && rowPadding.bottom) || 20),
          left: String(bodyPadLeft),
          isLinked: false,
        },
      },
      elements: [
        {
          id: allocId(`${(ext && ext.id) || cid || node.id}-body-txt-${i}`),
          elType: 'widget',
          widgetType: 'text-editor',
          isInner: false,
          settings: textEditorSettings,
          elements: [],
        },
      ],
    };

    panels.push({
      id: allocId(`${(ext && ext.id) || cid || node.id}-panel-${i}`),
      elType: 'container',
      isInner: true,
      isLocked: true,
      settings: {
        _title: `item #${i + 1}`,
        content_width: 'full',
        margin: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: false },
        padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: false },
      },
      elements: [innerBodyContainer],
    });
  }

  // Fallback to outer node card styles (e.g. single FAQ card with padding: 20px, bg: #FFF, border: 1px solid #E2E8F0, radius: 14px)
  if (!rowPadding && node.layout && node.layout.padding && (node.layout.padding.top || node.layout.padding.right || node.layout.padding.bottom || node.layout.padding.left)) {
    rowPadding = node.layout.padding;
  }
  if (!rowBorderWidth && node.style && node.style.borderWidth && node.style.borderColor) {
    rowBorderWidth = node.style.borderWidth;
    rowBorderColor = node.style.borderColor;
  }
  if (!rowBackground && node.style && node.style.background) {
    rowBackground = node.style.background;
  }
  if (!rowRadius && node.style && node.style.radius) {
    rowRadius = node.style.radius;
  }

  const settings = {
    items,
    accordion_item_title_position_horizontal: 'stretch',
    accordion_item_title_icon_position: 'end',
    faq_schema: '',
    content_border_border: 'none',
    _margin: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: false },
    _padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: false },
  };

  // Single closed FAQ cards with no expanded body in Figma should default to collapsed
  if (items.length === 1 && !firstBodyText) {
    settings.default_state = 'all_collapsed';
  }

  if (rowPadding) {
    settings.accordion_padding = boxValue(rowPadding);
  } else {
    settings.accordion_padding = { unit: 'px', top: '20', right: '0', bottom: '20', left: '0', isLinked: false };
  }

  if (rowBackground) {
    settings.accordion_background_normal_background = 'classic';
    settings.accordion_background_normal_color = rowBackground;
    settings.accordion_background_hover_background = 'classic';
    settings.accordion_background_hover_color = rowBackground;
    settings.accordion_background_active_background = 'classic';
    settings.accordion_background_active_color = rowBackground;
  }

  if (rowBorderWidth && rowBorderColor) {
    const bwObj = boxValue(rowBorderWidth);
    settings.accordion_border_normal_border = 'solid';
    settings.accordion_border_normal_width = bwObj;
    settings.accordion_border_normal_color = rowBorderColor;
    settings.accordion_border_hover_border = 'solid';
    settings.accordion_border_hover_width = bwObj;
    settings.accordion_border_hover_color = rowBorderColor;
    settings.accordion_border_active_border = 'solid';
    settings.accordion_border_active_width = bwObj;
    settings.accordion_border_active_color = rowBorderColor;
  }

  if (rowRadius) {
    settings.accordion_border_radius = boxValue(rowRadius);
  }

  if (firstTitleTypo) {
    settings.title_typography_typography = 'custom';
    settings.title_typography_font_family = firstTitleTypo.fontFamily || 'Inter';
    settings.title_typography_font_weight = String(firstTitleTypo.fontWeight || '600');
    settings.title_typography_font_size = { unit: 'px', size: firstTitleTypo.fontSize || 20, sizes: [] };
    settings.title_typography_font_size_mobile = { unit: 'px', size: Math.max(14, Math.round((firstTitleTypo.fontSize || 20) * 0.75)), sizes: [] };
    if (firstTitleTypo.lineHeight) {
      settings.title_typography_line_height = { unit: firstTitleTypo.lineHeightUnit || 'px', size: firstTitleTypo.lineHeight, sizes: [] };
    }
  }

  if (normalTitleColor || activeTitleColor || expandIconStyle) {
    settings.normal_title_color = normalTitleColor || activeTitleColor || '#000000';
    settings.active_title_color = activeTitleColor || normalTitleColor || '#16A34A';
    settings.normal_icon_color = (expandIconStyle && expandIconStyle.color) || normalTitleColor || '#475569';
    settings.active_icon_color = (expandIconStyle && expandIconStyle.color) || activeTitleColor || '#16A34A';
  }

  const cssRules = [];
  if (leadingIcons.some(Boolean)) {
    const iconW = (leadingIcons.find(Boolean) && leadingIcons.find(Boolean).width) || 40;
    const iconH = (leadingIcons.find(Boolean) && leadingIcons.find(Boolean).height) || 40;
    const padLeft = iconW + 16;
    cssRules.push(
      `selector .e-n-accordion-item-title-text { position: relative; padding-left: ${padLeft}px; display: inline-flex; align-items: center; min-height: ${iconH}px; }`,
      `selector .e-n-accordion-item-title-text:before { content: ''; position: absolute; width: ${iconW}px; height: ${iconH}px; left: 0; top: 50%; transform: translateY(-50%); background-repeat: no-repeat; background-position: center; background-size: contain; }`
    );
    leadingIcons.forEach((ic, idx) => {
      if (ic && ic.markup) {
        const encoded = encodeURIComponent(ic.markup.trim().replace(/\s+/g, ' '));
        cssRules.push(`selector .e-n-accordion-item:nth-child(${idx + 1}) .e-n-accordion-item-title-text:before { background-image: url("data:image/svg+xml;utf8,${encoded}"); }`);
      }
    });
    cssRules.push('selector [aria-expanded="true"] { border: none !important; }');
  }

  if (expandIconStyle && (expandIconStyle.background || expandIconStyle.radius)) {
    const iw = expandIconStyle.width || 32;
    const ih = expandIconStyle.height || 32;
    const ir = expandIconStyle.radius ? (expandIconStyle.radius.top ?? 16) : 16;
    const irUnit = (expandIconStyle.radius && expandIconStyle.radius.unit) || 'px';
    const ibg = expandIconStyle.background ? ` background: ${expandIconStyle.background};` : '';
    cssRules.push(
      `selector .e-n-accordion-item-title-icon { width: ${iw}px; height: ${ih}px; border-radius: ${ir}${irUnit};${ibg} display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }`
    );
  }

  if (cssRules.length > 0) {
    settings.custom_css = cssRules.join('\n');
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'nested-accordion',
    isInner: false,
    settings,
    elements: panels,
  };
}

export function buildNestedTabs(node, nodes, allocId, buildElement) {
  const tabs = [];
  const panels = [];
  const extractedItems = (node.content && Array.isArray(node.content.accordionItems)) ? node.content.accordionItems : [];
  const childIds = Array.isArray(node.children) ? node.children : [];
  const count = Math.max(childIds.length, extractedItems.length);

  for (let i = 0; i < count; i += 1) {
    const cid = childIds[i];
    const child = cid ? nodes[cid] : null;
    const ext = extractedItems[i] || null;
    const childTexts = child ? collectSubtreeTexts(child, nodes) : [];
    const title = (ext && ext.title)
      || (childTexts[0] && childTexts[0].text && childTexts[0].text.characters)
      || (child && child.content && child.content.name)
      || `Tab ${i + 1}`;
    tabs.push({ _id: shortId(cid || `${node.id}-tab-${i}`), tab_title: title });
    if (cid && child) {
      const panel = buildElement(cid, false, node);
      if (panel) {
        panel.elType = 'container';
        panel.isInner = true;
        panels.push(panel);
      }
    }
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'nested-tabs',
    isInner: false,
    settings: { tabs },
    elements: panels,
  };
}

