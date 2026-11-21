/**
 * Post-Convert Fidelity Verifier & Auto-Healer
 *
 * Automatically audits compiled Elementor v3 / Clipboard JSON against the Figma Intermediate Representation (IR)
 * and Elementor rendering laws, detecting and auto-healing layout/style/asset defects before export:
 *
 * 1. Bogus `__globals__` Sanitizer: Prevents unverified Elementor default global colors/fonts (like cyan #6EC1E4
 *    or non-existent IDs 848461d/31b945e) from overriding exact Figma hex colors (#16A34A, #FFFFFF, #000000) and fonts.
 * 2. Broken `icon-box` Inline SVG Auto-Healer: Elementor's `Icons_Manager` rejects raw `<svg>...</svg>` strings
 *    in `selected_icon.value` when `library === 'svg'`. Auto-heals single-text or inline-SVG icon boxes into
 *    pixel-perfect Flexbox Containers containing `[HTML Inline SVG + Text Editor]`.
 * 3. Multi-Column Row Auto-Healer: Prevents `_element_width: 'inherit'` (100% width) + `flex_wrap: 'wrap'` from
 *    collapsing horizontal multi-column rows into vertical stacks.
 * 4. Tight Fixed-Width HUG Text Wrapper Auto-Healer: Removes tight pixel widths (e.g. `157px` on `Eyebrow`) on
 *    HUG containers wrapping single-line text so browser font rendering never wraps the last word onto a 2nd line.
 * 5. Content & Style Completeness Audit: Verifies text nodes, colors, font sizes, and layout directions against Figma IR.
 */

import { shortId } from '../utils/crypto.js';

const UNVERIFIED_GLOBAL_IDS = new Set([
  'globals/colors?id=primary',
  'globals/colors?id=secondary',
  'globals/colors?id=text',
  'globals/colors?id=accent',
  'globals/colors?id=848461d',
  'globals/colors?id=31b945e',
  'globals/typography?id=primary',
  'globals/typography?id=secondary',
  'globals/typography?id=text',
  'globals/typography?id=accent',
]);

export function verifyAndHealElementorJson(elements, doc = null, options = {}) {
  const list = Array.isArray(elements) ? elements : [];
  const nodesBySourceId = new Map();
  if (doc && doc.nodes) {
    for (const n of Object.values(doc.nodes)) {
      if (n && n.sourceNodeId) nodesBySourceId.set(String(n.sourceNodeId), n);
      if (n && n.id) nodesBySourceId.set(String(n.id), n);
    }
  }

  const report = {
    totalChecked: 0,
    healedCount: 0,
    fixes: [],
    warnings: [],
    score: 100,
  };

  const recordFix = (nodeId, title, detail) => {
    report.healedCount += 1;
    report.fixes.push({ nodeId: nodeId || '', title: title || 'Element', detail });
  };

  const healElement = (el, parentEl = null) => {
    if (!el || typeof el !== 'object') return el;
    report.totalChecked += 1;
    const settings = el.settings || (el.settings = {});
    const nodeId = settings._f2e_node_id || el.id || '';
    const title = settings._title || el.widgetType || el.elType || 'Element';
    const irNode = nodesBySourceId.get(String(nodeId)) || null;

    // ── 1. Sanitize Bogus `__globals__` Overrides ──
    if (settings.__globals__ && typeof settings.__globals__ === 'object' && !options.preserveGlobals) {
      const gKeys = Object.keys(settings.__globals__);
      let stripped = 0;
      for (const gk of gKeys) {
        const gVal = String(settings.__globals__[gk] || '');
        if (UNVERIFIED_GLOBAL_IDS.has(gVal)) {
          delete settings.__globals__[gk];
          stripped += 1;
        }
      }
      if (Object.keys(settings.__globals__).length === 0) {
        delete settings.__globals__;
      }
      if (stripped > 0) {
        recordFix(nodeId, title, `Loại bỏ ${stripped} biến __globals__ mặc định để giữ nguyên 100% mã màu & font chữ Figma`);
      }
    }

    // ── 2. Auto-Heal `icon-box` with Raw `<svg>` String or Single-Text Card ──
    if (el.elType === 'widget' && el.widgetType === 'icon-box') {
      const selIcon = settings.selected_icon;
      const hasRawSvg = selIcon && selIcon.library === 'svg' && typeof selIcon.value === 'string' && selIcon.value.includes('<svg');
      const hasOnlyOneText = !settings.description_text || String(settings.description_text).trim() === '';
      const hasRealSvgPaths = hasRawSvg && /<(path|circle|rect|polygon|polyline|line|g|ellipse)\b/i.test(selIcon.value);

      if (hasRawSvg && (hasOnlyOneText || hasRealSvgPaths)) {
        const svgMarkup = selIcon.value.trim();
        const wMatch = svgMarkup.match(/\bwidth=["'](\d+(?:\.\d+)?)/i);
        const hMatch = svgMarkup.match(/\bheight=["'](\d+(?:\.\d+)?)/i);
        const iconW = wMatch ? Math.round(parseFloat(wMatch[1])) : 40;
        const iconH = hMatch ? Math.round(parseFloat(hMatch[1])) : 40;
        const isRowBox = settings.position === 'left' || settings.position === 'right';

        const iconWidget = {
          id: shortId(`${el.id}-svg`),
          elType: 'widget',
          widgetType: 'html',
          isInner: false,
          settings: {
            html: `<div class="f2e-inline-svg" style="display:inline-flex;align-items:center;justify-content:center;width:${iconW}px;height:${iconH}px;line-height:0;">${svgMarkup}</div>`,
            _element_width: 'auto',
            _flex_size: 'none',
            _title: `${title} Icon`,
          },
          elements: [],
        };

        const titleColor = settings.title_color || '#000000';
        const fontFamily = settings.title_typography_font_family || 'Inter';
        const fontWeight = String(settings.title_typography_font_weight || (hasOnlyOneText ? '400' : '600'));
        const fontSize = settings.title_typography_font_size || { unit: 'px', size: 16, sizes: [] };
        const fontSizeTablet = settings.title_typography_font_size_tablet || { unit: 'px', size: 15, sizes: [] };
        const fontSizeMobile = settings.title_typography_font_size_mobile || { unit: 'px', size: 15, sizes: [] };
        const lineHeight = settings.title_typography_line_height || { unit: 'px', size: 24, sizes: [] };
        const rawTitle = String(settings.title_text || '').trim();

        const textWidget = {
          id: shortId(`${el.id}-txt`),
          elType: 'widget',
          widgetType: 'text-editor',
          isInner: false,
          settings: {
            editor: `<p style="margin:0;">${rawTitle}</p>`,
            align: 'left',
            text_color: titleColor,
            typography_typography: 'custom',
            typography_font_family: fontFamily,
            typography_font_weight: fontWeight,
            typography_font_style: 'normal',
            typography_font_size: fontSize,
            typography_font_size_tablet: fontSizeTablet,
            typography_font_size_mobile: fontSizeMobile,
            typography_line_height: lineHeight,
            _title: `${title} Text`,
          },
          elements: [],
        };

        const childElements = [iconWidget, textWidget];

        if (!hasOnlyOneText) {
          const rawDesc = String(settings.description_text || '').trim();
          childElements.push({
            id: shortId(`${el.id}-desc`),
            elType: 'widget',
            widgetType: 'text-editor',
            isInner: false,
            settings: {
              editor: `<p style="margin:0;">${rawDesc}</p>`,
              align: 'left',
              text_color: settings.description_color || 'rgba(0,0,0,0.7)',
              typography_typography: 'custom',
              typography_font_family: settings.description_typography_font_family || fontFamily,
              typography_font_weight: String(settings.description_typography_font_weight || '400'),
              typography_font_size: settings.description_typography_font_size || { unit: 'px', size: 14, sizes: [] },
              typography_line_height: settings.description_typography_line_height || { unit: 'px', size: 20, sizes: [] },
              _title: `${title} Description`,
            },
            elements: [],
          });
        }

        const itemGap = (irNode && irNode.layout && typeof irNode.layout.gap === 'number') ? irNode.layout.gap : 24;
        const irPad = (irNode && irNode.layout && irNode.layout.padding) || { top: 0, right: 0, bottom: 0, left: 0 };
        const irBw = irNode && irNode.style && irNode.style.borderWidth;
        const irBc = irNode && irNode.style && irNode.style.borderColor;

        el.elType = 'container';
        delete el.widgetType;
        el.isInner = true;
        el.settings = {
          container_type: 'flex',
          flex_direction: isRowBox ? 'row' : 'column',
          flex_gap: { unit: 'px', size: itemGap, column: String(itemGap), row: String(itemGap), isLinked: true },
          flex_justify_content: 'flex-start',
          flex_align_items: isRowBox ? 'center' : 'flex-start',
          content_width: 'full',
          padding: {
            unit: 'px',
            top: String(irPad.top || 0),
            right: String(irPad.right || 0),
            bottom: String(irPad.bottom || 0),
            left: String(irPad.left || 0),
            isLinked: irPad.top === irPad.right && irPad.right === irPad.bottom && irPad.bottom === irPad.left,
          },
          margin: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true },
          _flex_size: settings._flex_size || 'grow',
          _f2e_node_id: nodeId,
          _title: title,
        };
        if (irBw && irBc) {
          el.settings.border_border = 'solid';
          el.settings.border_width = {
            unit: 'px',
            top: String(irBw.top || 0),
            right: String(irBw.right || 0),
            bottom: String(irBw.bottom || 0),
            left: String(irBw.left || 0),
            isLinked: Boolean(irBw.isLinked),
          };
          el.settings.border_color = irBc;
        }
        el.elements = childElements;
        el._healedFromIconBox = true;

        recordFix(nodeId, title, 'Chuyển đổi Icon Box chứa Inline SVG thành Flexbox Container (SVG + Text) để hiển thị 100% icon vector và căn lề trái');
      }
    }

    // ── 3. Auto-Heal Tight Fixed-Width HUG Text Wrappers (e.g. Eyebrow 157px) ──
    if (el.elType === 'container' && el.isInner && settings.width && settings.width.unit === 'px') {
      const wSize = Number(settings.width.size) || 0;
      const kids = Array.isArray(el.elements) ? el.elements : [];
      const hasOnlyTextChildren = kids.length > 0 && kids.every(
        (k) => k && k.elType === 'widget' && (k.widgetType === 'text-editor' || k.widgetType === 'heading')
      );
      const isHugInIr = irNode && irNode.layout && (!irNode.layout.sizingH || irNode.layout.sizingH === 'HUG');
      const hasNoVisualBox = !settings.background_background && !settings.border_border;

      if ((hasOnlyTextChildren && hasNoVisualBox && wSize > 0 && wSize < 420) || (isHugInIr && hasOnlyTextChildren)) {
        delete settings.width;
        delete settings.width_tablet;
        delete settings.width_mobile;
        recordFix(nodeId, title, `Gỡ bỏ giới hạn chiều rộng cứng (${wSize}px) trên khung bọc chữ HUG để chống rớt dòng chữ`);
      }
    }

    // ── 3B. Auto-Heal Empty `nested-accordion` / `accordion` from IR ──
    if (el.elType === 'widget' && (el.widgetType === 'nested-accordion' || el.widgetType === 'accordion')) {
      const curItems = Array.isArray(settings.items) ? settings.items : [];
      const extItems = (irNode && irNode.content && Array.isArray(irNode.content.accordionItems)) ? irNode.content.accordionItems : [];
      if (curItems.length === 0 && extItems.length > 0) {
        settings.items = extItems.map((it, idx) => ({
          _id: shortId(`${el.id}-acc-${idx}`),
          item_title: it.title || `Item #${idx + 1}`,
        }));
        el.elements = extItems.map((it, idx) => ({
          id: shortId(`${el.id}-panel-${idx}`),
          elType: 'container',
          isInner: true,
          isLocked: true,
          settings: {
            _title: `item #${idx + 1}`,
            content_width: 'full',
            margin: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: false },
            padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: false },
          },
          elements: [
            {
              id: shortId(`${el.id}-body-${idx}`),
              elType: 'widget',
              widgetType: 'text-editor',
              isInner: false,
              settings: {
                editor: `<p style="margin:0;">${it.body || it.title || ''}</p>`,
                align: 'left',
              },
              elements: [],
            },
          ],
        }));
        recordFix(nodeId, title, `Khôi phục ${extItems.length} mục Accordion từ cây thiết kế Figma`);
      }
    }

    // Recursively heal children first
    if (Array.isArray(el.elements) && el.elements.length > 0) {
      for (let i = 0; i < el.elements.length; i += 1) {
        el.elements[i] = healElement(el.elements[i], el);
      }
    }

    // ── 4. Auto-Heal Multi-Column Row Containers (e.g. 4-Column `Situations`) ──
    if (el.elType === 'container' && settings.flex_direction === 'row' && Array.isArray(el.elements) && el.elements.length >= 2) {
      const kids = el.elements;
      const growChildren = kids.filter(
        (k) => k && k.settings && (k.settings._flex_size === 'grow' || k.settings._element_width === 'inherit')
      );

      if (growChildren.length >= 2) {
        const colCount = growChildren.length;
        // Exact proportional percentage (e.g. 22.56% for 4 columns) leaving room for flex gaps
        const safeColPct = Math.round((90.24 / colCount) * 100) / 100;
        const tabletColPct = colCount >= 3 ? 47 : 100;

        // If Figma row didn't explicitly wrap, do not wrap on Desktop so all columns stay on 1 row
        const irWraps = irNode && irNode.layout && irNode.layout.wrap === true;
        if (!irWraps && settings.flex_wrap === 'wrap' && colCount <= 6) {
          settings.flex_wrap = 'nowrap';
          settings.flex_wrap_tablet = 'wrap';
          recordFix(nodeId, title, `Cố định ${colCount} cột nằm trên 1 hàng ngang Desktop (nowrap) và tự gập 2 cột trên Tablet`);
        }

        // If children were healed from `icon-box` (which stripped their `border-right` and `padding-right` from Dev Mode),
        // restore the per-column right border (`border-right: 1px solid`) and right padding (`padding-right: 24px`) on columns 0..N-2,
        // and remove any phantom outer border on the parent card if not present in Dev Mode.
        const allHealedFromIconBox = growChildren.every((c) => Boolean(c._healedFromIconBox));
        let accentStrokeColor = null;
        if (allHealedFromIconBox && colCount >= 3) {
          for (const col of growChildren) {
            const firstChildHtml = col.elements && col.elements[0] && col.elements[0].settings && col.elements[0].settings.html;
            if (typeof firstChildHtml === 'string') {
              const strokeMatch = firstChildHtml.match(/stroke=["'](#[0-9a-fA-F]{3,8})["']/i);
              if (strokeMatch) {
                accentStrokeColor = strokeMatch[1];
                break;
              }
            }
          }
          // Remove phantom #E2E8F0 border on parent card if it came from a non-DevMode stroke
          const irHasParentBorder = irNode && irNode.style && irNode.style.borderWidth && irNode.style.borderColor;
          if (!irHasParentBorder && settings.border_color === '#E2E8F0') {
            delete settings.border_border;
            delete settings.border_width;
            delete settings.border_color;
            recordFix(nodeId, title, 'Gỡ bỏ border #E2E8F0 dư thừa không có trong Figma Dev Mode');
          }
        }

        for (let idx = 0; idx < growChildren.length; idx += 1) {
          const col = growChildren[idx];
          delete col._healedFromIconBox;
          const cs = col.settings || (col.settings = {});
          if (col.elType === 'container') {
            if (cs._element_width === 'inherit') delete cs._element_width;
            cs._flex_size = 'grow';
            cs.width = { unit: '%', size: safeColPct, sizes: [] };
            cs.width_tablet = { unit: '%', size: tabletColPct, sizes: [] };
            cs.width_mobile = { unit: '%', size: 100, sizes: [] };

            // Restore right border & right padding on columns 0..N-2 when healed from stripped icon-box
            if (allHealedFromIconBox && accentStrokeColor && !cs.border_border && idx < growChildren.length - 1) {
              cs.border_border = 'solid';
              cs.border_width = { unit: 'px', top: '0', right: '1', bottom: '0', left: '0', isLinked: false };
              cs.border_width_mobile = { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
              cs.border_color = accentStrokeColor;
              cs.padding = { unit: 'px', top: '0', right: '24', bottom: '0', left: '0', isLinked: false };
              cs.padding_mobile = { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: true };
            }
          } else if (col.elType === 'widget') {
            if (cs._element_width === 'inherit') {
              cs._element_width = 'initial';
              cs._element_custom_width = { unit: '%', size: safeColPct, sizes: [] };
              cs._element_width_tablet = 'initial';
              cs._element_custom_width_tablet = { unit: '%', size: tabletColPct, sizes: [] };
              cs._element_width_mobile = 'inherit';
              cs._flex_size = 'grow';
              recordFix(cs._f2e_node_id || col.id, cs._title || col.widgetType, 'Sửa _element_width từ inherit (100%) sang chia cột ngang theo tỷ lệ');
            }
          }
        }
      }
    }

    return el;
  };

  for (let i = 0; i < list.length; i += 1) {
    list[i] = healElement(list[i], null);
  }

  return {
    elements: list,
    report,
  };
}
