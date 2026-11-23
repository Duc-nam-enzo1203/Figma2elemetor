/**
 * High-Fidelity Elementor Compiler (Runs directly inside Figma Plugin & Node tests)
 *
 * Verified against `_references/elementor/includes/elements/container.php`,
 * `_references/elementor/includes/controls/groups/flex-container.php`,
 * `_references/elementor/includes/controls/groups/flex-item.php`, and
 * `_references/elementor/includes/widgets/common-base.php`.
 *
 * Key Layout Fidelity Rules for Elementor v3 Containers:
 * 1. In a `flex_direction: 'row'` container, Elementor's CSS sets `--container-widget-flex-grow: 1`
 *    and `--container-widget-align-self: stretch` by default! That causes every child widget/container
 *    to stretch to 100% width and height unless explicitly constrained.
 * 2. When a child in Figma is NOT `FILL` (i.e. `HUG` or `FIXED`), we MUST set:
 *    - For child Containers: `content_width: 'full'`, `width: { unit: 'px', size: W }`, `_flex_size: 'none'`
 *    - For child Widgets (Button, Heading, Text, Icon, HTML): `_element_width: 'auto'` (or `'initial'` with `_element_custom_width`) and `_flex_size: 'none'`
 * 3. When a child in Figma IS `FILL`, we set `_flex_size: 'grow'` (for main axis) or `_flex_align_self: 'stretch'` (for cross axis).
 * 4. Composite SVG graphics (such as multi-color logos and vector icons) use the `html` widget (`widgetType: 'html'`)
 *    when pasted via Clipboard (`Ctrl+V`) or when no WP attachment ID exists yet, so multi-color SVG paths render
 *    with 100% visual accuracy instead of falling back to a generic FontAwesome star!
 */

import { shortId } from '../utils/crypto.js';
import { verifyAndHealElementorJson } from './fidelity-verifier.js';

import { boxValue, scaleBox, flexGapValue, applyGlobalColor, appendCustomCss, applyDevModeResidualCss, applyTextShadowAndEffects, applyCommonBoxStyle, applyTypographySettings, inferHeadingTag, getTextGradientCss, buildTextClipRule, collectSubtreeTexts, collectSubtreeImages, escapeHtml, scopeSvgIds, svgMarkupToDataUri } from './compiler-helpers.js';
import { compileElementorV4 } from './elementor-v4.js';
import { buildNestedAccordion, buildNestedTabs } from './nested-widgets.js';
import { buildProForm, buildProNavMenu, buildProCta, buildProPriceTable, buildProFlipBox, buildProSlides, buildProLoopGrid, buildGenericProWidget } from './pro-widgets.js';

export { compileElementorV4 };

const FLEX_ALIGN_MAP = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  SPACE_BETWEEN: 'space-between',
  BASELINE: 'baseline',
};

export function compileElementorV3(doc, options = {}) {
  const { attachmentMap = {}, autoUnwrap = true, linearBorder = true } = options;
  const nodes = doc.nodes || {};
  const usedIds = new Set();

  const allocId = (seed) => {
    let id = shortId(seed);
    while (usedIds.has(id)) {
      id = shortId(`${seed}-${Math.random()}`);
    }
    usedIds.add(id);
    return id;
  };

  const resolveMedia = (sha, fallbackDataUri = '') => {
    if (sha && attachmentMap[sha] && attachmentMap[sha].url) {
      return { id: attachmentMap[sha].id, url: attachmentMap[sha].url };
    }
    return { id: '', url: fallbackDataUri || '' };
  };

  const buildElement = (nodeId, isRoot = false, parentNode = null) => {
    const node = nodes[nodeId];
    if (!node) return null;

    const wType = node.widget || 'container';
    let el;
    switch (wType) {
      case 'heading':
        el = buildHeading(node, allocId);
        break;
      case 'text-editor':
        el = buildTextEditor(node, allocId);
        break;
      case 'button':
        el = buildButton(node, allocId, { linearBorder });
        break;
      case 'image':
        el = buildImage(node, allocId, resolveMedia);
        break;
      case 'icon':
        el = buildIconOrInlineSvg(node, allocId, resolveMedia);
        break;
      case 'html':
        el = buildCustomHtml(node, allocId);
        break;
      case 'video':
        el = buildVideo(node, allocId);
        break;
      case 'google_maps':
        el = buildGoogleMaps(node, allocId);
        break;
      case 'divider':
        el = buildDivider(node, allocId, parentNode);
        break;
      case 'spacer':
        el = buildSpacer(node, allocId);
        break;
      case 'icon-box':
      case 'image-box':
        el = buildBoxWidget(node, nodes, wType, allocId, resolveMedia);
        break;
      case 'icon-list':
        el = buildIconList(node, nodes, allocId);
        break;
      case 'progress':
        el = buildProgress(node, nodes, allocId);
        break;
      case 'alert':
        el = buildAlert(node, nodes, allocId);
        break;
      case 'nested-accordion':
      case 'accordion':
      case 'toggle':
        el = buildNestedAccordion(node, nodes, allocId, buildElement);
        break;
      case 'nested-tabs':
      case 'tabs':
        el = buildNestedTabs(node, nodes, allocId, buildElement);
        break;
      case 'image-gallery':
      case 'image-carousel':
      case 'gallery':
      case 'media-carousel':
      case 'nested-carousel':
        el = buildGalleryOrCarousel(node, nodes, wType, allocId, resolveMedia);
        break;
      case 'testimonial':
      case 'testimonial-carousel':
      case 'reviews':
        el = buildTestimonial(node, nodes, allocId, resolveMedia);
        break;
      case 'star-rating':
        el = buildStarRating(node, allocId);
        break;
      case 'social-icons':
      case 'share-buttons':
        el = buildSocialIcons(node, nodes, allocId);
        break;
      case 'counter':
      case 'countdown':
        el = buildCounter(node, nodes, allocId);
        break;
      // Elementor Pro Widgets
      case 'form':
      case 'login':
      case 'search-form':
        el = buildProForm(node, nodes, allocId);
        break;
      case 'nav-menu':
      case 'mega-menu':
        el = buildProNavMenu(node, nodes, allocId);
        break;
      case 'call-to-action':
        el = buildProCta(node, nodes, allocId, resolveMedia);
        break;
      case 'price-table':
      case 'price-list':
        el = buildProPriceTable(node, nodes, allocId);
        break;
      case 'flip-box':
        el = buildProFlipBox(node, nodes, allocId, resolveMedia);
        break;
      case 'slides':
        el = buildProSlides(node, nodes, allocId, resolveMedia);
        break;
      case 'loop-grid':
      case 'loop-carousel':
      case 'posts':
      case 'portfolio':
      case 'woocommerce-products':
        el = buildProLoopGrid(node, allocId, wType);
        break;
      case 'theme-site-logo':
      case 'site-logo':
        el = buildSiteLogo(node, allocId, resolveMedia);
        break;
      case 'blockquote':
      case 'animated-headline':
      case 'table-of-contents':
      case 'lottie':
      case 'hotspot':
      case 'theme-site-title':
      case 'theme-post-title':
      case 'theme-post-excerpt':
      case 'theme-post-content':
      case 'theme-post-featured-image':
      case 'author-box':
      case 'post-comments':
      case 'post-navigation':
      case 'post-info':
      case 'breadcrumbs':
      case 'sitemap':
      case 'woocommerce-product-add-to-cart':
      case 'woocommerce-menu-cart':
      case 'woocommerce-cart':
      case 'woocommerce-checkout-page':
      case 'woocommerce-my-account':
        el = buildGenericProWidget(node, nodes, wType, allocId, resolveMedia);
        break;
      default:
        el = buildContainer(node, nodes, isRoot, parentNode, allocId, buildElement, resolveMedia, { autoUnwrap, linearBorder });
        break;
    }

    if (el && el.settings) {
      applyChildFlexAndPositionSettings(el, node, parentNode, isRoot);
      applyWidgetWrapperBoxStyles(el, node, resolveMedia);
      el.settings._f2e_node_id = node.sourceNodeId || node.id;
      el.settings._title = node.content && node.content.name ? node.content.name : wType;
    }
    return el;
  };

  const rawContent = [];
  for (const rootId of doc.roots || []) {
    // Container 1 (Root selection) is strictly preserved!
    // Never strip Container 1 when it contains multiple children (container 2 + container 3)
    const built = buildElement(rootId, true, null);
    if (built) rawContent.push(built);
  }

  const { elements: content, report: fidelityReport } = verifyAndHealElementorJson(rawContent, doc, options);

  return {
    title: doc.title || 'Figma Import',
    type: 'page',
    version: '0.4',
    page_settings: [],
    content,
    fidelityReport,
  };
}

/**
 * Crucial Layout Fidelity Function:
 * Prevents Elementor's `--container-widget-flex-grow: 1` in Row Containers from blowing up
 * children that were HUG or FIXED in Figma!
 */
function applyChildFlexAndPositionSettings(el, node, parentNode, isRoot) {
  if (isRoot || !parentNode) return;
  const settings = el.settings;
  const layout = node.layout || {};
  const parentLayout = parentNode.layout || {};
  const parentIsRow = (parentLayout.direction || 'column') === 'row';
  const parentOuterWidth = Number(parentLayout.width) || 1240;
  const pPadL = Number(parentLayout.padding && parentLayout.padding.left) || 0;
  const pPadR = Number(parentLayout.padding && parentLayout.padding.right) || 0;
  const parentWidth = (parentOuterWidth - pPadL - pPadR) > 200
    ? (parentOuterWidth - pPadL - pPadR)
    : parentOuterWidth;

  // 1. Absolute Positioning inside parent container
  if (layout.position === 'absolute') {
    settings.position = 'absolute';
    settings._position = 'absolute';
    const parentW = Number(parentLayout.width) || 0;
    const parentH = Number(parentLayout.height) || 0;
    const nodeW = Number(layout.width) || 0;
    const nodeH = Number(layout.height) || 0;
    const nodeX = Number(layout.x) || 0;
    const nodeY = Number(layout.y) || 0;

    // Detect if closer to right edge (e.g. top-right decorative icon in a card)
    if (parentW > 0 && nodeX + nodeW / 2 > parentW / 2) {
      settings._offset_orientation_h = 'end';
      const rightDist = Math.max(0, parentW - (nodeX + nodeW));
      settings._offset_x = { unit: 'px', size: rightDist, sizes: [] };
    } else {
      settings._offset_orientation_h = 'start';
      settings._offset_x = { unit: 'px', size: Math.max(0, nodeX), sizes: [] };
    }

    // Detect if closer to bottom edge
    if (parentH > 0 && nodeY + nodeH / 2 > parentH / 2) {
      settings._offset_orientation_v = 'end';
      const bottomDist = Math.max(0, parentH - (nodeY + nodeH));
      settings._offset_y = { unit: 'px', size: bottomDist, sizes: [] };
    } else {
      settings._offset_orientation_v = 'start';
      settings._offset_y = { unit: 'px', size: Math.max(0, nodeY), sizes: [] };
    }

    settings.z_index = layout.isBackgroundLayer ? 0 : 2;
    return;
  }

  const sizingH = layout.sizingH || 'HUG';
  const sizingV = layout.sizingV || 'HUG';
  const nodeW = Number(layout.width) || 0;

  if (el.elType === 'container') {
    if (parentIsRow) {
      if (sizingH === 'FILL') {
        settings._flex_size = 'grow';
        if (nodeW > 0 && parentWidth > 0) {
          const pct = Math.min(100, Math.round((nodeW / parentWidth) * 1000) / 10);
          settings.width = { unit: '%', size: pct, sizes: [] };
          if (pct >= 42 && pct <= 68) {
            settings.width_tablet = { unit: '%', size: 100, sizes: [] };
            settings.width_mobile = { unit: '%', size: 100, sizes: [] };
          } else if (pct >= 29 && pct <= 41) {
            settings.width_tablet = { unit: '%', size: 48, sizes: [] };
            settings.width_mobile = { unit: '%', size: 100, sizes: [] };
          } else {
            settings.width_mobile = { unit: '%', size: 100, sizes: [] };
          }
        } else {
          delete settings.width;
          settings.width_mobile = { unit: '%', size: 100, sizes: [] };
        }
      } else if (sizingH === 'HUG') {
        // Child container is HUG in Figma:
        // In any Row layout, a container can either be a major column (text column, content block) or an inline chip.
        // If its width is >= 240px, or it occupies >= 25% of parent row, calculate exact percentage so it sits side-by-side!
        if (nodeW >= 240 && parentWidth > 0 && nodeW < parentWidth) {
          const pct = Math.min(100, Math.round((nodeW / parentWidth) * 1000) / 10);
          settings._flex_size = 'grow';
          settings.width = { unit: '%', size: pct, sizes: [] };
          if (pct >= 42 && pct <= 68) {
            settings.width_tablet = { unit: '%', size: 100, sizes: [] };
            settings.width_mobile = { unit: '%', size: 100, sizes: [] };
          } else if (pct >= 29 && pct <= 41) {
            settings.width_tablet = { unit: '%', size: 48, sizes: [] };
            settings.width_mobile = { unit: '%', size: 100, sizes: [] };
          } else {
            settings.width_mobile = { unit: '%', size: 100, sizes: [] };
          }
        } else {
          // Small hug frame (badge, tag, inline chip container)
          settings._flex_size = 'none';
          settings.width = { unit: 'px', size: nodeW, sizes: [] };
          settings.width_mobile = { unit: '%', size: 100, sizes: [] };
        }
      } else if (nodeW > 0) {
        // sizingH === 'FIXED'
        // If it's a fixed-width column (like Form 336px, Sidebar 300px, or 4-col card)
        settings._flex_size = 'none';
        if (nodeW >= 180 && parentWidth > 0 && nodeW < parentWidth) {
          const pct = Math.min(100, Math.round((nodeW / parentWidth) * 1000) / 10);
          settings.width = { unit: '%', size: pct, sizes: [] };
          // Multi-column responsive wrapping matching Elementor Dev standards
          if (pct >= 18 && pct <= 28) {
            // 4-column row -> 2 columns on tablet (48%), 1 column on mobile (100%)
            settings.width_tablet = { unit: '%', size: 48, sizes: [] };
            settings.width_mobile = { unit: '%', size: 100, sizes: [] };
          } else if (pct >= 29 && pct <= 38) {
            // 3-column row -> 48% on tablet, 100% on mobile
            settings.width_tablet = { unit: '%', size: 48, sizes: [] };
            settings.width_mobile = { unit: '%', size: 100, sizes: [] };
          } else if (pct >= 42 && pct <= 58) {
            // 2-column row -> 100% on tablet, 100% on mobile
            settings.width_tablet = { unit: '%', size: 100, sizes: [] };
            settings.width_mobile = { unit: '%', size: 100, sizes: [] };
          } else {
            settings.width_mobile = { unit: '%', size: 100, sizes: [] };
          }
        } else {
          settings.width = { unit: 'px', size: nodeW, sizes: [] };
          settings.width_mobile = { unit: '%', size: 100, sizes: [] };
        }
      }
      if (sizingV === 'FILL') {
        settings._flex_align_self = 'stretch';
      }
    } else {
      // Parent is Column
      if (sizingH === 'FILL' || (parentWidth > 0 && nodeW >= parentWidth * 0.92)) {
        settings._flex_align_self = 'stretch';
      } else if (sizingH === 'FIXED' && nodeW > 0 && nodeW < parentWidth * 0.92) {
        // Only lock explicit FIXED width containers; never lock HUG containers (like Eyebrow text wrappers) to fixed pixel widths!
        settings.width = { unit: 'px', size: nodeW, sizes: [] };
        settings.width_mobile = { unit: '%', size: 100, sizes: [] };
      }
    }
    if (layout.alignSelf && !settings._flex_align_self) {
      settings._flex_align_self = layout.alignSelf;
    }
  } else {
    // Widget inside a Row or Column Container
    if (parentIsRow) {
      if (sizingH === 'FILL' || layout.flexGrow === 1) {
        settings._element_width = 'initial';
        settings._flex_size = 'grow';
      } else if (el.widgetType === 'form' && nodeW > 200) {
        settings._element_width = 'initial';
        settings._flex_size = 'grow';
      } else {
        // Prevent buttons, text links, and icons in a horizontal row from stretching to 100% width!
        settings._element_width = 'auto';
        settings._flex_size = 'none';
      }
    } else if (sizingH === 'FILL') {
      settings._element_width = 'inherit';
    }
  }
}

const SELF_STYLED_WIDGETS = new Set([
  'button',
  'divider',
  'spacer',
  'icon',
  'image',
  'html',
  'theme-site-logo',
  'site-logo',
  'nested-accordion',
  'accordion',
  'toggle',
  'nested-tabs',
  'tabs',
]);

/**
 * Preserves Frame-level box styles (padding, background, gradient, border, border-radius, box-shadow)
 * on Elementor Widgets using Elementor's Advanced wrapper controls (`_padding`, `_background_*`, `_border_*`).
 */
function applyWidgetWrapperBoxStyles(el, node, resolveMedia) {
  if (!el || el.elType !== 'widget' || !node) return;
  const settings = el.settings;
  const style = node.style || {};
  const layout = node.layout || {};

  // Apply Dev Mode align-self and residual CSS (opacity, backdrop-filter, filter, mix-blend-mode, transform)
  // on ALL widgets (including text, button, image) so no Dev Mode visual property is ever silently dropped!
  if (layout.alignSelf && !settings._flex_align_self) {
    settings._flex_align_self = layout.alignSelf;
  }
  applyDevModeResidualCss(settings, style, 'selector');

  if (node.type === 'text' || node.type === 'vector') return;
  if (SELF_STYLED_WIDGETS.has(el.widgetType)) return;

  if (
    layout.padding &&
    !settings._padding &&
    (layout.padding.top || layout.padding.right || layout.padding.bottom || layout.padding.left)
  ) {
    settings._padding = boxValue(layout.padding);
  }

  if (!settings._background_background && !settings.background_color) {
    if (style.gradient) {
      settings._background_background = 'gradient';
      settings._background_gradient_type = style.gradient.type || 'linear';
      settings._background_color = style.gradient.color1;
      settings._background_color_stop = { unit: '%', size: style.gradient.stop1 ?? 0, sizes: [] };
      settings._background_color_b = style.gradient.color2;
      settings._background_color_b_stop = { unit: '%', size: style.gradient.stop2 ?? 100, sizes: [] };
      settings._background_gradient_angle = { unit: 'deg', size: style.gradient.angle ?? 180, sizes: [] };
    } else if (style.background) {
      settings._background_background = 'classic';
      settings._background_color = style.background;
    }
  }
  if (!settings._background_image && style.backgroundImage && resolveMedia) {
    const bgMedia = resolveMedia(style.backgroundImage, style.backgroundImageDataUri);
    if (bgMedia && bgMedia.url) {
      settings._background_background = 'classic';
      settings._background_image = bgMedia;
      settings._background_size = style.backgroundSize || 'cover';
      settings._background_position = style.backgroundPosition || 'center center';
      settings._background_repeat = style.backgroundRepeat || 'no-repeat';
    }
  }

  if (style.borderWidth && style.borderColor && !settings._border_border) {
    settings._border_border = style.borderStyle || 'solid';
    settings._border_width = boxValue(style.borderWidth);
    settings._border_color = style.borderColor;
  }

  if (style.radius && !settings._border_radius && !settings.border_radius) {
    settings._border_radius = boxValue(style.radius);
  }

  if (style.boxShadow && !settings._box_shadow_box_shadow) {
    settings._box_shadow_box_shadow_type = 'yes';
    settings._box_shadow_box_shadow = style.boxShadow;
    if (style.boxShadow.position === 'inset') {
      settings._box_shadow_box_shadow_position = 'inset';
    }
  }
}

export function compileElementorClipboard(doc, options = {}) {
  const v3 = compileElementorV3(doc, options);
  return {
    type: 'elementor',
    siteurl: options.siteUrl || 'https://localhost/wp-json/',
    elements: v3.content,
    fidelityReport: v3.fidelityReport,
  };
}


function buildContainer(node, nodes, isRoot, parentNode, allocId, buildElement, resolveMedia, options = {}) {
  const { autoUnwrap = true, linearBorder = true } = options;
  const layout = node.layout || {};
  const style = node.style || {};
  const settings = {};

  if (layout.mode === 'grid') {
    settings.container_type = 'grid';
    const cols = Math.max(1, Number(layout.columns) || 2);
    settings.grid_columns_grid = { unit: 'fr', size: cols, sizes: [] };
    settings.grid_columns_grid_tablet = {
      unit: 'fr',
      size: (node.responsive && node.responsive.tablet && node.responsive.tablet.columns) || Math.max(1, Math.ceil(cols / 2)),
      sizes: [],
    };
    settings.grid_columns_grid_mobile = {
      unit: 'fr',
      size: (node.responsive && node.responsive.mobile && node.responsive.mobile.columns) || 1,
      sizes: [],
    };
    settings.grid_gaps = flexGapValue(layout);
  } else {
    settings.container_type = 'flex';
    const dir = layout.direction === 'row' ? 'row' : 'column';
    settings.flex_direction = dir;
    settings.flex_gap = flexGapValue(layout);

    // If designer used an oversized gap (>160px) in a horizontal row, convert to space-between
    const rawGap = Number(layout.gap) || 0;
    const justifyKey = (dir === 'row' && rawGap > 160) ? 'SPACE_BETWEEN' : (layout.justify || 'MIN');
    settings.flex_justify_content = FLEX_ALIGN_MAP[justifyKey] || 'flex-start';
    settings.flex_align_items = FLEX_ALIGN_MAP[layout.align || 'MIN'] || 'flex-start';
    if (layout.wrap || (dir === 'row' && (node.children || []).length >= 3)) {
      settings.flex_wrap = 'wrap';
      settings.flex_wrap_tablet = 'wrap';
    }

    if (node.responsive && node.responsive.tablet && node.responsive.tablet.direction) {
      settings.flex_direction_tablet = node.responsive.tablet.direction;
    } else if (dir === 'row') {
      settings.flex_direction_tablet = 'row';
      const gapTablet = Math.max(12, Math.round(rawGap * 0.75));
      settings.flex_gap_tablet = { unit: 'px', size: gapTablet, column: String(gapTablet), row: String(gapTablet), isLinked: true };
    }
    if (node.responsive && node.responsive.mobile && node.responsive.mobile.direction) {
      settings.flex_direction_mobile = node.responsive.mobile.direction;
    } else if (dir === 'row' && (node.children || []).length >= 2 && (Number(layout.width) || 0) > 420) {
      settings.flex_direction_mobile = 'column';
      const gapMobile = Math.max(12, Math.round(rawGap * 0.5));
      settings.flex_gap_mobile = { unit: 'px', size: gapMobile, column: String(gapMobile), row: String(gapMobile), isLinked: true };
    }
  }

  if (layout.overflow && /^(hidden|auto|scroll|visible)$/.test(layout.overflow)) {
    settings.overflow = layout.overflow;
  } else if (layout.clipsContent) {
    settings.overflow = 'hidden';
  }

  // Preserve Dev Mode `min-height` OR Hero/Banner/Composite-BG height so full-bleed background sections never collapse vertically!
  const explicitMinH = Number(layout.minHeight) || 0;
  const nodeH = Math.round(Number(layout.height) || 0);
  const effectiveMinH = explicitMinH > 0
    ? explicitMinH
    : (style.backgroundImage && nodeH >= 120 ? nodeH : 0);
  if (effectiveMinH > 0) {
    settings.min_height = { unit: 'px', size: effectiveMinH, sizes: [] };
    if (effectiveMinH >= 480) {
      settings.min_height_tablet = { unit: 'px', size: Math.round(effectiveMinH * 0.78), sizes: [] };
      settings.min_height_mobile = { unit: 'px', size: Math.max(360, Math.round(effectiveMinH * 0.62)), sizes: [] };
    }
  }

  // Important: Top-level root sections get boxed widths and responsive padding matching Dev standards
  if (isRoot) {
    const rootW = Number(layout.width) || 1440;
    const padL = Number(layout.padding && layout.padding.left) || 0;
    const padR = Number(layout.padding && layout.padding.right) || 0;

    let isBoxed = false;
    let boxedWidth = 1200;

    // 1. Check if Root Frame has explicit Auto-Layout padding on both left & right
    if (padL >= 40 && padR >= 40 && rootW >= 1100) {
      isBoxed = true;
      boxedWidth = Math.max(960, Math.min(1320, rootW - padL - padR));
    } else if (Number(layout.maxWidth) > 0 && Number(layout.maxWidth) <= 1360) {
      isBoxed = true;
      boxedWidth = Math.max(960, Math.min(1320, Math.round(Number(layout.maxWidth))));
    } else if (rootW >= 1100 && Array.isArray(node.children) && node.children.length > 0) {
      // 2. Enhanced Heuristic: If padding on root was omitted (e.g. 0 padding or non-Auto-Layout freeform design),
      // analyze the bounding box of direct visible children!
      let minChildX = Infinity;
      let maxChildX = -Infinity;
      let visualChildCount = 0;

      for (const cid of node.children) {
        const cNode = nodes[cid];
        if (!cNode || cNode.visible === false) continue;
        const cL = cNode.layout || {};
        const cX = Number(cL.x) || 0;
        const cW = Number(cL.width) || 0;
        if (cW > 0) {
          minChildX = Math.min(minChildX, cX);
          maxChildX = Math.max(maxChildX, cX + cW);
          visualChildCount += 1;
        }
      }

      if (visualChildCount > 0 && minChildX < Infinity && maxChildX > -Infinity) {
        const spanW = maxChildX - minChildX;
        const gutterLeft = minChildX;
        const gutterRight = rootW - maxChildX;

        // If children are centered within 900px - 1360px and have balanced gutters >= 48px
        if (spanW >= 900 && spanW <= 1360 && gutterLeft >= 48 && gutterRight >= 48) {
          isBoxed = true;
          boxedWidth = Math.max(960, Math.min(1320, Math.round(spanW)));
        } else if (visualChildCount === 1) {
          // If there's a single centered inner frame wrapper
          const singleChild = nodes[node.children[0]];
          const scW = Number(singleChild?.layout?.width) || 0;
          if (scW >= 960 && scW <= 1360 && (rootW - scW) >= 80) {
            isBoxed = true;
            boxedWidth = Math.max(960, Math.min(1320, Math.round(scW)));
          }
        }
      }
    }

    if (isBoxed) {
      const padT = (layout.padding && typeof layout.padding.top === 'number') ? layout.padding.top : 64;
      const padB = (layout.padding && typeof layout.padding.bottom === 'number') ? layout.padding.bottom : 64;
      settings.content_width = 'boxed';
      settings.boxed_width = { unit: 'px', size: boxedWidth, sizes: [] };
      settings.boxed_width_tablet = { unit: 'px', size: 768, sizes: [] };
      settings.boxed_width_mobile = { unit: 'px', size: 360, sizes: [] };
      settings.padding = boxValue({ top: padT, right: 24, bottom: padB, left: 24 });
      settings.padding_tablet = boxValue({ top: Math.min(padT, 50), right: 24, bottom: Math.min(padB, 50), left: 24 });
      settings.padding_mobile = boxValue({ top: Math.min(padT, 30), right: 16, bottom: Math.min(padB, 30), left: 16 });
      settings.margin = boxValue({ top: 0, right: 0, bottom: 0, left: 0 });
    } else {
      const basePad = layout.padding || { top: 60, right: 24, bottom: 60, left: 24 };
      settings.content_width = 'full';
      delete settings.boxed_width;
      delete settings.boxed_width_tablet;
      delete settings.boxed_width_mobile;
      settings.padding = boxValue(basePad);
      settings.padding_tablet = boxValue((node.responsive && node.responsive.tablet && node.responsive.tablet.padding) || scaleBox(basePad, 0.85, 40));
      settings.padding_mobile = boxValue((node.responsive && node.responsive.mobile && node.responsive.mobile.padding) || scaleBox(basePad, 0.65, 24));
      settings.margin = boxValue({ top: 0, right: 0, bottom: 0, left: 0 });
    }
  } else {
    // Crucial: ALL child containers are ALWAYS strictly full width, never boxed!
    settings.content_width = 'full';
    delete settings.boxed_width;
    delete settings.boxed_width_tablet;
    delete settings.boxed_width_mobile;
    // For inner containers (Hero left, Hero right, CTA, Segments, cards):
    // Explicit padding and margin are mandatory in Elementor to prevent Elementor's theme engine
    // from injecting default 10px/20px container padding!
    const p = layout.padding;
    if (p && (p.top || p.right || p.bottom || p.left)) {
      settings.padding = boxValue(p);
      settings.padding_tablet = boxValue((node.responsive && node.responsive.tablet && node.responsive.tablet.padding) || scaleBox(p, 0.65, 36));
      settings.padding_mobile = boxValue((node.responsive && node.responsive.mobile && node.responsive.mobile.padding) || scaleBox(p, 0.4, 20));
    } else {
      settings.padding = boxValue({ top: 0, right: 0, bottom: 0, left: 0 });
    }

    if (layout.margin && (layout.margin.top || layout.margin.right || layout.margin.bottom || layout.margin.left)) {
      settings.margin = boxValue(layout.margin);
    } else {
      settings.margin = boxValue({ top: 0, right: 0, bottom: 0, left: 0 });
    }
  }

  // Absorb decorative background child (e.g. child named 'bg', 'background', 'overlay' or pure border frame)
  // BEFORE applyCommonBoxStyle so absorbed borderGradient, background, radius & borderWidth are emitted cleanly!
  const mergedStyle = { ...style };
  const mergeDecorativeChildStyle = (cStyle) => {
    if (!cStyle) return;
    if (!mergedStyle.gradient && !mergedStyle.background && !mergedStyle.backgroundImage) {
      if (cStyle.gradient) mergedStyle.gradient = cStyle.gradient;
      else if (cStyle.background) mergedStyle.background = cStyle.background;
      else if (cStyle.backgroundImage) {
        mergedStyle.backgroundImage = cStyle.backgroundImage;
        if (cStyle.backgroundImageDataUri) mergedStyle.backgroundImageDataUri = cStyle.backgroundImageDataUri;
      }
    }
    if (!mergedStyle.radius && cStyle.radius) mergedStyle.radius = cStyle.radius;
    if (!mergedStyle.borderWidth && cStyle.borderWidth) mergedStyle.borderWidth = cStyle.borderWidth;
    if (!mergedStyle.borderColor && cStyle.borderColor) mergedStyle.borderColor = cStyle.borderColor;
    if (!mergedStyle.borderStyle && cStyle.borderStyle) mergedStyle.borderStyle = cStyle.borderStyle;
    if (!mergedStyle.borderGradient && cStyle.borderGradient) mergedStyle.borderGradient = cStyle.borderGradient;
    if (!mergedStyle.devModeBorderImage && cStyle.devModeBorderImage) mergedStyle.devModeBorderImage = cStyle.devModeBorderImage;
    if (!mergedStyle.boxShadow && cStyle.boxShadow) mergedStyle.boxShadow = cStyle.boxShadow;
  };

  const childIds = [...(node.children || [])];
  const remainingChildIds = [];
  for (const cid of childIds) {
    const child = nodes[cid];
    if (child && child.layout?.position === 'absolute') {
      const cName = String(child.content?.name || '').toLowerCase();
      const isBgName = /^(bg|background|overlay|border|shadow|glow)$/i.test(cName);
      const hasNoText = !child.text && (!child.children || child.children.length === 0);
      if (isBgName && hasNoText) {
        mergeDecorativeChildStyle(child.style);
        continue;
      }
    }
    remainingChildIds.push(cid);
  }

  applyCommonBoxStyle(settings, mergedStyle, resolveMedia, { linearBorder });

  // ── Auto-Unwrap Redundant Inner Container & Explicit Unwrap Widgets ──
  // 1. First expand any explicitly unwrapped child containers (user selected "unwrap")
  const expandUnwrappedChildren = (ids) => {
    const result = [];
    for (const cid of ids) {
      const cNode = nodes[cid];
      if (!cNode) continue;
      const cWType = cNode.widgetType || cNode.widget || '';
      if (cWType === 'unwrap') {
        const subIds = (cNode.children || []).filter((subId) => {
          const sub = nodes[subId];
          return sub && sub.widget !== 'skip' && sub.widgetType !== 'skip';
        });
        result.push(...expandUnwrappedChildren(subIds));
      } else {
        result.push(cid);
      }
    }
    return result;
  };

  let activeChildIds = expandUnwrappedChildren(remainingChildIds);

  // 2. In Figma, a Section/Header frame (e.g. 1440px full-width) frequently contains a single inner
  // Auto-Layout Frame (e.g. 1200px / 1240px boxed content wrapper: Header -> Container -> [Logo, Nav, Button]).
  // In Elementor, a single container handles both the full-width background and the boxed_width constraint!
  // Unwrapping this redundant inner container avoids doubling the container count (DOM bloat)
  // and matches exactly how senior Elementor developers build sections.
  while (autoUnwrap !== false && activeChildIds.length === 1) {
    const singleChildId = activeChildIds[0];
    const singleChildNode = nodes[singleChildId];
    if (!singleChildNode) break;

    const childWType = singleChildNode.widgetType || singleChildNode.widget || 'container';
    const isChildContainer = (!childWType || childWType === 'container' || childWType === 'flexbox' || childWType === 'unwrap');
    if (!isChildContainer) break;
    if (!singleChildNode.children || singleChildNode.children.length === 0) break;

    // Auto-Unwrap Guard:
    // ONLY auto-unwrap a pure transparent layout wrapper (e.g. Header 1440px -> Container 1200px -> [Logo, Nav, Button]).
    // NEVER auto-unwrap an inner visual card (e.g. Section #FFF -> Contact band gradient + border + radius + padding 32px)!
    const parentHasBg = Boolean(settings.background_background || settings.background_color);
    const parentHasBorder = Boolean(settings.border_border || settings.border_width);
    const parentHasPadding = Boolean(
      layout.padding && (layout.padding.top > 0 || layout.padding.right > 0 || layout.padding.bottom > 0 || layout.padding.left > 0)
    );

    const cs = singleChildNode.style || {};
    const cl = singleChildNode.layout || {};
    const childHasBg = Boolean(cs.background || cs.gradient || cs.backgroundImage);
    const childHasBorder = Boolean(cs.borderColor || cs.borderWidth);
    const childHasRadius = Boolean(cs.radius && (cs.radius.top > 0 || cs.radius.right > 0 || cs.radius.bottom > 0 || cs.radius.left > 0));
    const childHasShadow = Boolean(cs.boxShadow);
    const childHasPadding = Boolean(
      cl.padding && (cl.padding.top > 0 || cl.padding.right > 0 || cl.padding.bottom > 0 || cl.padding.left > 0)
    );
    const childIsVisualCard = childHasBg || childHasBorder || childHasRadius || childHasShadow;

    if (childWType !== 'unwrap') {
      // 1. Both parent and child have backgrounds (classic, gradient, or image) -> distinct visual boxes
      if (parentHasBg && childHasBg) {
        const sameSolidBg = !cs.gradient && !cs.backgroundImage && settings.background_background === 'classic' && settings.background_color === cs.background;
        if (!sameSolidBg) break;
      }
      // 2. Child is a styled card (border, radius, shadow, or gradient) inside a padded or styled parent section
      if (childIsVisualCard && (parentHasBg || parentHasBorder || parentHasPadding)) {
        break;
      }
      // 3. Both parent and child have explicit padding -> unwrapping would destroy one of the paddings
      if (parentHasPadding && childHasPadding) {
        break;
      }
    }

    // Inherit boxed width from the inner container ONLY if this is the root container!
    const childLayout = singleChildNode.layout || {};
    const childWidth = Number(childLayout.width) || 0;
    if (isRoot && childWidth >= 960 && childWidth <= 1360) {
      settings.content_width = 'boxed';
      settings.boxed_width = { unit: 'px', size: Math.round(childWidth), sizes: [] };
      settings.boxed_width_tablet = { unit: 'px', size: 768, sizes: [] };
      settings.boxed_width_mobile = { unit: 'px', size: 360, sizes: [] };
    }

    // Inherit flex direction and alignment from the inner container
    const childDir = childLayout.direction === 'row' ? 'row' : 'column';
    settings.flex_direction = childDir;
    const rawGap = Number(childLayout.gap) || 0;
    settings.flex_gap = flexGapValue(childLayout);

    const justifyKey = (childDir === 'row' && rawGap > 160) ? 'SPACE_BETWEEN' : (childLayout.justify || 'MIN');
    settings.flex_justify_content = FLEX_ALIGN_MAP[justifyKey] || 'flex-start';
    settings.flex_align_items = FLEX_ALIGN_MAP[childLayout.align || 'MIN'] || 'flex-start';

    if (childLayout.wrap || (childDir === 'row' && (singleChildNode.children || []).length >= 3)) {
      settings.flex_wrap = 'wrap';
      settings.flex_wrap_tablet = 'wrap';
    }

    // Responsive flex from inner container
    if (singleChildNode.responsive && singleChildNode.responsive.tablet && singleChildNode.responsive.tablet.direction) {
      settings.flex_direction_tablet = singleChildNode.responsive.tablet.direction;
    } else if (childDir === 'row') {
      settings.flex_direction_tablet = 'row';
      const gapTablet = Math.max(12, Math.round(rawGap * 0.75));
      settings.flex_gap_tablet = { unit: 'px', size: gapTablet, column: String(gapTablet), row: String(gapTablet), isLinked: true };
    }
    if (singleChildNode.responsive && singleChildNode.responsive.mobile && singleChildNode.responsive.mobile.direction) {
      settings.flex_direction_mobile = singleChildNode.responsive.mobile.direction;
    } else if (childDir === 'row' && (singleChildNode.children || []).length >= 2 && childWidth > 420) {
      settings.flex_direction_mobile = 'column';
      const gapMobile = Math.max(12, Math.round(rawGap * 0.5));
      settings.flex_gap_mobile = { unit: 'px', size: gapMobile, column: String(gapMobile), row: String(gapMobile), isLinked: true };
    }

    // If parent had no background but child does, absorb child's background (classic or gradient)
    if (!parentHasBg) {
      if (singleChildNode.style?.gradient) {
        settings.background_background = 'gradient';
        settings.background_gradient_type = singleChildNode.style.gradient.type || 'linear';
        settings.background_color = singleChildNode.style.gradient.color1;
        settings.background_color_stop = { unit: '%', size: singleChildNode.style.gradient.stop1, sizes: [] };
        settings.background_color_b = singleChildNode.style.gradient.color2;
        settings.background_color_b_stop = { unit: '%', size: singleChildNode.style.gradient.stop2, sizes: [] };
        settings.background_gradient_angle = { unit: 'deg', size: singleChildNode.style.gradient.angle || 180, sizes: [] };
      } else if (singleChildNode.style?.background) {
        settings.background_background = 'classic';
        settings.background_color = singleChildNode.style.background;
        applyGlobalColor(settings, 'background_color', singleChildNode.style.background);
      }
    }
    if (!parentHasBorder && childHasBorder) {
      settings.border_border = 'solid';
      settings.border_width = boxValue(singleChildNode.style.borderWidth);
      settings.border_color = singleChildNode.style.borderColor;
      applyGlobalColor(settings, 'border_color', singleChildNode.style.borderColor);
    }
    if (!settings.border_radius && singleChildNode.style?.radius) {
      settings.border_radius = boxValue(singleChildNode.style.radius);
    }

    // Filter out any decorative background child from the inner container
    const innerRemainingIds = [];
    for (const innerCid of (singleChildNode.children || [])) {
      const innerChild = nodes[innerCid];
      if (innerChild && innerChild.layout?.position === 'absolute') {
        const cName = String(innerChild.content?.name || '').toLowerCase();
        const isBgName = /^(bg|background|overlay|border|shadow|glow)$/i.test(cName);
        const hasNoText = !innerChild.text && (!innerChild.children || innerChild.children.length === 0);
        if (isBgName && hasNoText) {
          if (!settings.background_background) {
            if (innerChild.style?.gradient) {
              settings.background_background = 'gradient';
              settings.background_gradient_type = innerChild.style.gradient.type || 'linear';
              settings.background_color = innerChild.style.gradient.color1;
              settings.background_color_stop = { unit: '%', size: innerChild.style.gradient.stop1, sizes: [] };
              settings.background_color_b = innerChild.style.gradient.color2;
              settings.background_color_b_stop = { unit: '%', size: innerChild.style.gradient.stop2, sizes: [] };
              settings.background_gradient_angle = { unit: 'deg', size: innerChild.style.gradient.angle || 180, sizes: [] };
            } else if (innerChild.style?.background) {
              settings.background_background = 'classic';
              settings.background_color = innerChild.style.background;
              applyGlobalColor(settings, 'background_color', innerChild.style.background);
            }
          }
          if (!settings.border_radius && innerChild.style?.radius) {
            settings.border_radius = boxValue(innerChild.style.radius);
          }
          if (!settings.border_border && innerChild.style?.borderColor && innerChild.style?.borderWidth) {
            settings.border_border = innerChild.style.borderStyle || 'solid';
            settings.border_width = boxValue(innerChild.style.borderWidth);
            settings.border_color = innerChild.style.borderColor;
          }
          if (linearBorder !== false && innerChild.style?.borderGradient && innerChild.style?.borderWidth && !mergedStyle.borderGradient) {
            mergedStyle.borderGradient = innerChild.style.borderGradient;
            mergedStyle.borderWidth = innerChild.style.borderWidth;
            if (innerChild.style.devModeBorderImage) mergedStyle.devModeBorderImage = innerChild.style.devModeBorderImage;
            if (!mergedStyle.radius && innerChild.style.radius) mergedStyle.radius = innerChild.style.radius;
            applyCommonBoxStyle(settings, { borderWidth: innerChild.style.borderWidth, borderGradient: innerChild.style.borderGradient, devModeBorderImage: innerChild.style.devModeBorderImage, radius: mergedStyle.radius, background: settings.background_color || mergedStyle.background, gradient: mergedStyle.gradient }, resolveMedia, { linearBorder });
          }
          continue;
        }
      }
      innerRemainingIds.push(innerCid);
    }

    // Unwrap: replace activeChildIds with the inner container's children
    activeChildIds = expandUnwrappedChildren(innerRemainingIds);
  }

  // 3. Final expansion pass
  activeChildIds = expandUnwrappedChildren(activeChildIds);

  // When unwrapping has happened or parent direction changed, construct an effective parent layout
  // for child flex sizing so children know they are in a ROW container!
  const effectiveParentNode = {
    ...node,
    layout: {
      ...(node.layout || {}),
      direction: settings.flex_direction || node.layout?.direction || 'column',
      width: settings.boxed_width?.size || node.layout?.width || 1240,
    },
  };

  const elements = [];
  for (const cid of activeChildIds) {
    const childEl = buildElement(cid, false, effectiveParentNode);
    if (childEl) {
      if (childEl.elType === 'container') childEl.isInner = true;
      elements.push(childEl);
    }
  }

  // Absolute invariant: child containers are NEVER boxed, always strictly full-width
  if (!isRoot) {
    settings.content_width = 'full';
    delete settings.boxed_width;
    delete settings.boxed_width_tablet;
    delete settings.boxed_width_mobile;
  }

  return {
    id: allocId(node.id),
    elType: 'container',
    isInner: !isRoot,
    settings,
    elements,
  };
}


function buildHeading(node, allocId) {
  const text = node.text || {};
  const gradCss = getTextGradientCss(text);
  const settings = {
    title: text.characters || (node.content && node.content.name) || 'Heading',
    header_size: inferHeadingTag(node),
    align: text.align === 'justified' ? 'justify' : (text.align || 'left'),
  };
  const fallbackColor = text.color || (text.gradient && (text.gradient.color2 || text.gradient.color1)) || null;
  if (fallbackColor) {
    settings.title_color = fallbackColor;
    if (!gradCss) {
      applyGlobalColor(settings, 'title_color', fallbackColor);
    }
  }
  applyTypographySettings(settings, 'typography', text, node.responsive);
  applyTextShadowAndEffects(settings, text, 'selector .elementor-heading-title');
  if (gradCss) {
    appendCustomCss(settings, buildTextClipRule('selector .elementor-heading-title', gradCss));
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

function buildTextEditor(node, allocId) {
  const text = node.text || {};
  const gradCss = getTextGradientCss(text);
  const raw = String(text.characters || '').trim();
  const inlineGradStyle = gradCss
    ? `background:${gradCss};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;`
    : '';
  const paragraphs = raw
    .split(/\n+/)
    .map((line) => `<p style="margin:0;${inlineGradStyle}">${escapeHtml(line)}</p>`)
    .join('');
  const settings = {
    editor: paragraphs || '<p style="margin:0;"></p>',
    align: text.align === 'justified' ? 'justify' : (text.align || 'left'),
  };
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
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'text-editor',
    isInner: false,
    settings,
    elements: [],
  };
}

function buildButton(node, allocId, options = {}) {
  const { linearBorder = true } = options;
  const text = node.text || {};
  const style = node.style || {};
  const layout = node.layout || {};
  const settings = {
    text: (node.content && node.content.characters) || text.characters || (node.content && node.content.name) || 'Button',
    align: text.align || 'center',
  };

  // Background (Classic or Gradient)
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
    settings.background_color = 'rgba(0,0,0,0)';
  }

  // Button Icon (e.g. arrow, chevron, plus, check from Figma vector children)
  if (node.buttonIcon) {
    settings.selected_icon = {
      value: node.buttonIcon.value || 'fas fa-arrow-right',
      library: node.buttonIcon.library || 'fa-solid',
    };
    settings.icon_align = node.buttonIcon.align || 'right';
    settings.icon_indent = { unit: 'px', size: 8, sizes: [] };
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
  if (style.radius) settings.border_radius = boxValue(style.radius);
  if (style.borderWidth && style.borderColor) {
    settings.border_border = 'solid';
    settings.border_width = boxValue(style.borderWidth);
    settings.border_color = style.borderColor;
    applyGlobalColor(settings, 'border_color', style.borderColor);
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

function buildSiteLogo(node, allocId, resolveMedia) {
  const sha = (node.image && node.image.sha256) || (node.raster && node.raster.sha256) || (node.svg && node.svg.sha256) || '';
  const fallback = (node.image && node.image.dataUri) || (node.raster && node.raster.dataUri) || '';
  const media = resolveMedia ? resolveMedia(sha, fallback) : { id: '', url: fallback };
  const w = Math.max(20, Math.round(Number(node.layout && node.layout.width) || 120));

  // If live push uploaded to WordPress media library
  if (media && Number(media.id) > 0 && media.url) {
    const imgRef = { id: Number(media.id), url: media.url };
    return {
      id: allocId(node.id),
      elType: 'widget',
      widgetType: 'theme-site-logo',
      isInner: false,
      settings: {
        image: imgRef,
        image_size: 'full',
        custom_image: imgRef,
        use_custom_image: 'yes',
        width: { unit: 'px', size: w, sizes: [] },
      },
      elements: [],
    };
  }

  // If we have SVG markup (Clipboard Ctrl+V paste or direct SVG -> base64 data URI)
  if (node.svg && node.svg.markup) {
    const svgImg = {
      url: svgMarkupToDataUri(node.svg.markup),
      id: '',
    };
    return {
      id: allocId(node.id),
      elType: 'widget',
      widgetType: 'theme-site-logo',
      isInner: false,
      settings: {
        image: svgImg,
        image_size: 'full',
        custom_image: svgImg,
        use_custom_image: 'yes',
        width: { unit: 'px', size: w, sizes: [] },
      },
      elements: [],
    };
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'theme-site-logo',
    isInner: false,
    settings: {
      image: media,
      image_size: 'full',
      custom_image: media,
      use_custom_image: 'yes',
      width: { unit: 'px', size: w, sizes: [] },
    },
    elements: [],
  };
}

function buildImage(node, allocId, resolveMedia) {
  const elId = allocId(node.id);
  const sha = (node.image && node.image.sha256) || (node.raster && node.raster.sha256) || (node.svg && node.svg.sha256) || '';
  const fallback = (node.image && node.image.dataUri) || (node.raster && node.raster.dataUri) || '';
  const media = resolveMedia ? resolveMedia(sha, fallback) : { id: 0, url: fallback };
  const w = node.layout && node.layout.width ? Number(node.layout.width) : null;
  const h = node.layout && node.layout.height ? Number(node.layout.height) : null;

  // If this image is an SVG graphic and not uploaded to WP media (e.g. direct Clipboard Ctrl+V):
  if (node.svg && node.svg.markup && (!media || !media.url)) {
    const scopedSvg = scopeSvgIds(node.svg.markup, elId);
    return {
      id: elId,
      elType: 'widget',
      widgetType: 'html',
      isInner: false,
      settings: {
        html: `<div class="f2e-image-svg" style="display:inline-flex;align-items:center;${w ? `width:${w}px;` : ''}${h ? `height:${h}px;` : ''}line-height:0;">${scopedSvg}</div>`,
      },
      elements: [],
    };
  }

  const settings = {
    image: media,
    image_size: 'full',
  };
  if (w) {
    settings.width = { unit: 'px', size: w, sizes: [] };
  }
  if (node.style && node.style.radius) {
    settings.image_border_radius = boxValue(node.style.radius);
  }
  return {
    id: elId,
    elType: 'widget',
    widgetType: 'image',
    isInner: false,
    settings,
    elements: [],
  };
}

/**
 * Renders SVG Icons & Multi-Color SVG Logos with 100% visual accuracy!
 * - If an uploaded WordPress SVG attachment ID exists (`media.id > 0`), uses Elementor `icon` widget with `library: 'svg'`.
 * - Otherwise (e.g. direct Clipboard `Ctrl+V` paste or multi-color inline SVG), uses Elementor's native `html` widget
 *   wrapping the exact `<svg>` markup so it never falls back to a broken FontAwesome star!
 */
function buildIconOrInlineSvg(node, allocId, resolveMedia) {
  const elId = allocId(node.id);
  const sha = node.svg && node.svg.sha256 ? node.svg.sha256 : '';
  const media = sha && resolveMedia ? resolveMedia(sha, '') : { id: 0, url: '' };
  const w = Math.max(12, Math.round(Number(node.layout && node.layout.width) || 24));
  const h = Math.max(12, Math.round(Number(node.layout && node.layout.height) || 24));

  if (node.svg && node.svg.markup) {
    if (media && Number(media.id) > 0 && media.url && w <= 64 && h <= 64) {
      return {
        id: elId,
        elType: 'widget',
        widgetType: 'icon',
        isInner: false,
        settings: {
          selected_icon: {
            value: { id: Number(media.id), url: media.url },
            library: 'svg',
          },
          size: { unit: 'px', size: w, sizes: [] },
        },
        elements: [],
      };
    }

    // Render exact inline SVG inside a clean flex wrapper via Elementor HTML widget
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
  return {
    id: elId,
    elType: 'widget',
    widgetType: 'icon',
    isInner: false,
    settings: {
      selected_icon: {
        value: 'fas fa-circle',
        library: 'fa-solid',
      },
      primary_color: color,
      size: { unit: 'px', size: w, sizes: [] },
    },
    elements: [],
  };
}

function buildCustomHtml(node, allocId) {
  const elId = allocId(node.id);
  const rawHtml = (node.svg && node.svg.markup) || (node.text && node.text.characters) || '';
  const html = (node.svg && node.svg.markup) ? scopeSvgIds(rawHtml, elId) : rawHtml;
  return {
    id: elId,
    elType: 'widget',
    widgetType: 'html',
    isInner: false,
    settings: { html },
    elements: [],
  };
}

function buildVideo(node, allocId) {
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'video',
    isInner: false,
    settings: {
      video_type: 'youtube',
      youtube_url: node.link || 'https://www.youtube.com/watch?v=XHOmBV4js_E',
    },
    elements: [],
  };
}

function buildGoogleMaps(node, allocId) {
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

function buildDivider(node, allocId, parentNode = null) {
  const w = Number(node.layout && node.layout.width) || 0;
  const h = Number(node.layout && node.layout.height) || 0;
  const parentIsRow = Boolean(parentNode && parentNode.layout && parentNode.layout.direction === 'row');
  const isVertical = (parentIsRow && h >= w) || (h >= 16 && w <= 6);
  const color = (node.style && (node.style.borderColor || node.style.background)) || '#16A34A';

  if (isVertical) {
    const thickness = Math.max(1, Math.min(8, w || 1));
    const minH = Math.max(24, Math.round(h || 80));
    return {
      id: allocId(node.id),
      elType: 'widget',
      widgetType: 'html',
      isInner: false,
      settings: {
        html: `<div class="f2e-vertical-divider" style="width:${thickness}px;min-height:${minH}px;height:100%;background-color:${color};opacity:0.5;"></div>`,
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
  const settings = {
    style: 'solid',
    weight: { unit: 'px', size: weight, sizes: [] },
    color,
    align: 'left',
  };
  if (w > 0 && w < 400) {
    settings.width = { unit: 'px', size: w, sizes: [] };
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'divider',
    isInner: false,
    settings,
    elements: [],
  };
}

function buildSpacer(node, allocId) {
  const space = Math.max(8, Number(node.layout && node.layout.height) || 24);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'spacer',
    isInner: false,
    settings: {
      space: { unit: 'px', size: space, sizes: [] },
    },
    elements: [],
  };
}


function buildBoxWidget(node, nodes, wType, allocId, resolveMedia) {
  const content = node.content || {};
  let title = content.title_text || '';
  let desc = content.description_text || '';
  const texts = collectSubtreeTexts(node, nodes);
  const titleNode = texts[0];
  const descNode = texts[1];

  const titleTypo = content.titleTypography || (titleNode && titleNode.text) || node.text || null;
  const descTypo = content.descriptionTypography || (descNode && descNode.text) || null;

  if (!title) {
    title = (titleTypo && titleTypo.characters) || content.name || 'Feature Title';
    desc = (descTypo && descTypo.characters) || '';
  }

  const pos = content.position || ((node.layout && node.layout.direction === 'row') ? 'left' : 'top');
  const settings = {
    title_text: title,
    description_text: desc,
    position: pos,
  };

  if (titleTypo && titleTypo.align) {
    settings.text_align = titleTypo.align === 'justified' ? 'justify' : titleTypo.align;
  }

  const titleGrad = getTextGradientCss(titleTypo);
  const titleColor = (titleTypo && (titleTypo.color || (titleTypo.gradient && titleTypo.gradient.color2))) || null;
  if (titleColor) {
    settings.title_color = titleColor;
    if (!titleGrad) {
      applyGlobalColor(settings, 'title_color', titleColor);
    }
  }
  if (titleTypo) {
    applyTypographySettings(settings, 'title_typography', titleTypo, node.responsive);
  }
  if (titleGrad) {
    appendCustomCss(settings, buildTextClipRule('selector .elementor-icon-box-title, selector .elementor-image-box-title', titleGrad));
  }

  const descColor = (descTypo && (descTypo.color || (descTypo.gradient && descTypo.gradient.color2))) || null;
  if (descColor) {
    settings.description_color = descColor;
    applyGlobalColor(settings, 'description_color', descColor);
  }
  if (descTypo) {
    applyTypographySettings(settings, 'description_typography', descTypo, node.responsive);
  }

  const sha = (node.raster && node.raster.sha256) || (node.image && node.image.sha256) || (node.svg && node.svg.sha256) || '';
  const fallback = (node.raster && node.raster.dataUri) || (node.image && node.image.dataUri) || '';
  const media = resolveMedia ? resolveMedia(sha, fallback) : { id: 0, url: fallback };

  const isRasterAsset = Boolean(
    node.raster ||
    node.image ||
    (media && media.url && /^data:image\/(png|jpeg|jpg|webp|gif)|(\.(png|jpe?g|webp|gif)(\?|$))/i.test(media.url))
  );
  const isSvgAsset = Boolean(node.svg) && !isRasterAsset;

  let finalWidgetType = wType;
  if (wType === 'icon-box' && (isRasterAsset || (!isSvgAsset && media && media.url))) {
    finalWidgetType = 'image-box';
  }

  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    const spaceKey = finalWidgetType === 'image-box' ? 'image_space' : 'icon_space';
    settings[spaceKey] = { unit: 'px', size: node.layout.gap, sizes: [] };
  }

  if (finalWidgetType === 'image-box') {
    if (media && media.url) {
      settings.image = { id: media.id || '', url: media.url };
    } else if (node.svg && node.svg.markup) {
      settings.image = { id: '', url: svgMarkupToDataUri(node.svg.markup) };
    } else {
      const imgs = collectSubtreeImages(node, nodes);
      settings.image = imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' };
    }
    settings.thumbnail_size = 'full';
  } else {
    if (isSvgAsset && media && Number(media.id) > 0 && media.url) {
      settings.selected_icon = { value: { id: Number(media.id), url: media.url }, library: 'svg' };
    } else if (node.svg && node.svg.markup) {
      settings.selected_icon = { value: node.svg.markup, library: 'svg' };
    } else {
      settings.selected_icon = { value: 'fas fa-bolt', library: 'fa-solid' };
    }
    settings.primary_color = content.iconColor || (node.svg && node.svg.color) || '#2563EB';
    if (content.iconSize && Number(content.iconSize) > 0) {
      settings.icon_size = { unit: 'px', size: Number(content.iconSize), sizes: [] };
    }
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: finalWidgetType,
    isInner: false,
    settings,
    elements: [],
  };
}

function inferIconListFaIcon(textStr, iconSize) {
  const s = String(textStr || '').toLowerCase();
  if (s.includes('@') && /\S+@\S+\.\S+/.test(s)) return 'fas fa-envelope';
  if (/(?:\+84|hotline|tel:|phone|\b0\d[\d\s.-]{7,})/.test(s)) return 'fas fa-phone-alt';
  if (/(?:hà nội|tp\.?\s*hcm|hồ chí minh|đà nẵng|phường|quận|đường|tầng|số\s+\d+|địa chỉ|street|address)/.test(s)) return 'fas fa-map-marker-alt';
  if (/(?:https?:\/\/|www\.)/.test(s)) return 'fas fa-globe';
  if (/(?:24\/7|giờ làm|thứ\s+[2-7])/.test(s)) return 'fas fa-clock';
  return iconSize >= 14 ? 'fas fa-check-circle' : 'fas fa-circle';
}

function buildIconList(node, nodes, allocId) {
  const items = (node.content && node.content.iconList) || [];
  const texts = collectSubtreeTexts(node, nodes);
  const iconSize = (node.content && node.content.iconSize && node.content.iconSize <= 32) ? node.content.iconSize : 6;
  let listData = [];
  if (items.length > 0) {
    listData = items.map((it, idx) => ({
      _id: shortId(`il-${idx}`),
      text: it.text,
      selected_icon: { value: inferIconListFaIcon(it.text, iconSize), library: 'fa-solid' },
      ...(it.link ? { link: { url: it.link } } : {}),
    }));
  } else {
    const validTexts = texts.filter((t) => t.text && t.text.characters && t.text.characters.trim().length > 1);
    listData = validTexts.map((t, idx) => {
      const cleanTxt = t.text.characters.replace(/^[\u2713\u2714\u2022\u00b7\u25cf\u25cb\u2013\u2014\-*]\s*/, '');
      return {
        _id: shortId(`il-${idx}`),
        text: cleanTxt,
        selected_icon: { value: inferIconListFaIcon(cleanTxt, iconSize), library: 'fa-solid' },
      };
    });
  }

  const firstTypo = node.text || (texts[0] && texts[0].text) || null;
  const isRow = (node.layout && node.layout.direction === 'row') || (Number(node.layout && node.layout.width) || 0) > 600;
  const gap = Math.max(12, Number(node.layout && node.layout.gap) || 24);
  const textColor = (firstTypo && (firstTypo.color || (firstTypo.gradient && firstTypo.gradient.color2))) || '#FFFFFF';
  const iconColor = (node.content && node.content.iconColor) || textColor;

  const settings = {
    icon_list: listData,
    view: isRow ? 'inline' : 'traditional',
    space_between: { unit: 'px', size: gap, sizes: [] },
    icon_size: { unit: 'px', size: iconSize, sizes: [] },
    icon_color: iconColor,
    text_color: textColor,
  };

  if (textColor) {
    applyGlobalColor(settings, 'text_color', textColor);
  }
  if (iconColor) {
    applyGlobalColor(settings, 'icon_color', iconColor);
  }

  if (firstTypo) {
    applyTypographySettings(settings, 'icon_typography', firstTypo, node.responsive);
    if (firstTypo.fontSize) {
      settings.typography_font_size = { unit: 'px', size: firstTypo.fontSize, sizes: [] };
    }
    const listGrad = getTextGradientCss(firstTypo);
    if (listGrad) {
      settings.custom_css = buildTextClipRule('selector .elementor-icon-list-text', listGrad);
    }
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'icon-list',
    isInner: false,
    settings,
    elements: [],
  };
}

function buildProgress(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes);
  const titleTypo = (texts[0] && texts[0].text) || node.text || null;
  const pctNode = texts.find((t) => /%/.test((t.text && t.text.characters) || ''));
  const pctVal = pctNode ? (parseInt(pctNode.text.characters.replace(/[^0-9]/g, ''), 10) || 85) : 85;
  const settings = {
    title: (titleTypo && titleTypo.characters) || (node.content && node.content.name) || 'Skill',
    percent: { unit: '%', size: Math.min(100, Math.max(0, pctVal)), sizes: [] },
  };
  if (titleTypo) {
    if (titleTypo.color) settings.title_color = titleTypo.color;
    applyTypographySettings(settings, 'typography', titleTypo, node.responsive);
  }
  if (node.style && node.style.background) {
    settings.bar_color = node.style.background;
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'progress',
    isInner: false,
    settings,
    elements: [],
  };
}

function buildAlert(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes);
  const titleTypo = (texts[0] && texts[0].text) || node.text || null;
  const descTypo = (texts[1] && texts[1].text) || null;
  const settings = {
    alert_title: (titleTypo && titleTypo.characters) || (node.content && node.content.name) || 'Notice',
    alert_description: (descTypo && descTypo.characters) || '',
  };
  if (titleTypo) {
    if (titleTypo.color) settings.title_color = titleTypo.color;
    applyTypographySettings(settings, 'typography_title', titleTypo, node.responsive);
  }
  if (descTypo) {
    if (descTypo.color) settings.description_color = descTypo.color;
    applyTypographySettings(settings, 'typography_description', descTypo, node.responsive);
  }
  if (node.style && node.style.background) {
    settings.background_color = node.style.background;
  }
  if (node.style && node.style.borderColor) {
    settings.border_color = node.style.borderColor;
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'alert',
    isInner: false,
    settings,
    elements: [],
  };
}


function buildGalleryOrCarousel(node, nodes, wType, allocId, resolveMedia) {
  const imgs = collectSubtreeImages(node, nodes)
    .map((img) => resolveMedia(img.sha256, img.dataUri))
    .filter((m) => m && (m.url || m.id));
  const isCarousel = wType.includes('carousel');
  const settings = isCarousel
    ? { carousel: imgs, slides_to_show: '3', navigation: 'both' }
    : { wp_gallery: imgs, gallery_columns: '3', open_lightbox: 'yes' };
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: isCarousel ? 'image-carousel' : 'image-gallery',
    isInner: false,
    settings,
    elements: [],
  };
}

function buildTestimonial(node, nodes, allocId, resolveMedia) {
  let textItems = collectSubtreeTexts(node, nodes);
  let imgs = collectSubtreeImages(node, nodes);
  const slides = (node.content && Array.isArray(node.content.slides)) ? node.content.slides : [];
  if (textItems.length === 0 && slides.length > 0 && Array.isArray(slides[0].texts)) {
    textItems = slides[0].texts.map((t, idx) => ({ id: `${node.id}-sl-txt-${idx}`, text: t }));
  }
  if (imgs.length === 0 && slides.length > 0 && slides[0].image) {
    imgs = [slides[0].image];
  }
  const sortedNodes = [...textItems].sort((a, b) => ((b.text && b.text.characters) || '').length - ((a.text && a.text.characters) || '').length);

  const contentNode = sortedNodes[0] || null;
  const nameNode = sortedNodes[1] || null;
  const jobNode = sortedNodes[2] || null;

  const settings = {
    testimonial_content: (contentNode && contentNode.text && contentNode.text.characters) || 'Great experience working with this team.',
    testimonial_name: (nameNode && nameNode.text && nameNode.text.characters) || (node.content && node.content.name) || 'Client Name',
    testimonial_job: (jobNode && jobNode.text && jobNode.text.characters) || 'Customer',
    testimonial_image: imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' },
  };

  if (contentNode && contentNode.text) {
    if (contentNode.text.color) settings.content_content_color = contentNode.text.color;
    applyTypographySettings(settings, 'content_typography', contentNode.text, node.responsive);
  }
  if (nameNode && nameNode.text) {
    if (nameNode.text.color) settings.name_text_color = nameNode.text.color;
    applyTypographySettings(settings, 'name_typography', nameNode.text, node.responsive);
  }
  if (jobNode && jobNode.text) {
    if (jobNode.text.color) settings.job_text_color = jobNode.text.color;
    applyTypographySettings(settings, 'job_typography', jobNode.text, node.responsive);
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'testimonial',
    isInner: false,
    settings,
    elements: [],
  };
}

function buildStarRating(node, allocId) {
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'star-rating',
    isInner: false,
    settings: {
      rating_scale: '5',
      rating: 5,
      star_style: 'star_fontawesome',
    },
    elements: [],
  };
}

function buildSocialIcons(node, nodes, allocId) {
  const platforms = ['facebook', 'twitter', 'x', 'instagram', 'linkedin', 'youtube', 'tiktok', 'github', 'telegram', 'whatsapp'];
  const list = [];
  const extractedSocials = (node.content && Array.isArray(node.content.socialItems)) ? node.content.socialItems : [];

  if (extractedSocials.length > 0) {
    for (const sItem of extractedSocials) {
      const name = String(sItem.name || '').toLowerCase();
      const matched = platforms.find((p) => name.includes(p)) || 'link';
      const iconVal = matched === 'x' || matched === 'twitter'
        ? 'fab fa-x-twitter'
        : (matched === 'link' ? 'fas fa-share-alt' : `fab fa-${matched}`);
      list.push({
        _id: shortId(sItem.id || name),
        social_icon: { value: iconVal, library: matched === 'link' ? 'fa-solid' : 'fa-brands' },
        link: { url: sItem.link || '#', is_external: 'true', nofollow: '' },
      });
    }
  } else {
    for (const cid of node.children || []) {
      const child = nodes[cid];
      if (!child) continue;
      const name = String((child.content && child.content.name) || '').toLowerCase();
      const matched = platforms.find((p) => name.includes(p)) || 'link';
      const iconVal = matched === 'x' || matched === 'twitter'
        ? 'fab fa-x-twitter'
        : (matched === 'link' ? 'fas fa-share-alt' : `fab fa-${matched}`);
      list.push({
        _id: shortId(cid),
        social_icon: { value: iconVal, library: matched === 'link' ? 'fa-solid' : 'fa-brands' },
        link: { url: child.link || '#', is_external: 'true', nofollow: '' },
      });
    }
  }

  const settings = { social_icon_list: list };
  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.icon_spacing = { unit: 'px', size: node.layout.gap, sizes: [] };
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'social-icons',
    isInner: false,
    settings,
    elements: [],
  };
}

function buildCounter(node, nodes, allocId) {
  const textNodes = collectSubtreeTexts(node, nodes);
  const numNode = textNodes.find((n) => /\d/.test((n.text && n.text.characters) || '')) || (node.text ? node : textNodes[0]);
  const labelNode = textNodes.find((n) => n !== numNode) || null;

  const numTypo = (numNode && numNode.text) || node.text || {};
  const numText = String(numTypo.characters || '100').trim();
  const labelText = (labelNode && labelNode.text && labelNode.text.characters) ? String(labelNode.text.characters).trim() : '';

  const numMatch = /^([^0-9+-]*?)([0-9.,]+)(.*)$/.exec(numText);
  let prefix = (numMatch && numMatch[1]) || '';
  const rawDigits = ((numMatch && numMatch[2]) || '100').replace(/,/g, '');
  const suffix = (numMatch && numMatch[3]) || '';

  // Preserve leading zero(s) such as "08" -> prefix: "0", ending_number: 8
  const leadZeroMatch = /^(0+)(?=\d)/.exec(rawDigits);
  if (leadZeroMatch) {
    prefix += leadZeroMatch[1];
  }
  const endingNumber = Number(rawDigits);

  const settings = {
    starting_number: 0,
    ending_number: Number.isFinite(endingNumber) ? endingNumber : 100,
    prefix,
    suffix,
    title: labelText,
  };

  const gradCss = getTextGradientCss(numTypo);
  const numColor = numTypo.color || (numTypo.gradient && (numTypo.gradient.color2 || numTypo.gradient.color1)) || null;
  if (numColor) {
    settings.number_color = numColor;
    if (!gradCss) {
      applyGlobalColor(settings, 'number_color', numColor);
    }
  }

  if (numTypo.fontFamily || numTypo.fontSize || numTypo.fontWeight) {
    applyTypographySettings(settings, 'typography_number', numTypo, (numNode && numNode.responsive) || node.responsive);
  }

  if (labelNode && labelNode.text) {
    const lblTypo = labelNode.text;
    const lblColor = lblTypo.color || (lblTypo.gradient && (lblTypo.gradient.color2 || lblTypo.gradient.color1)) || null;
    if (lblColor) {
      settings.title_color = lblColor;
      applyGlobalColor(settings, 'title_color', lblColor);
    }
    applyTypographySettings(settings, 'typography_title', lblTypo, labelNode.responsive || node.responsive);
  }

  if (gradCss) {
    appendCustomCss(
      settings,
      buildTextClipRule(
        'selector .elementor-counter-number-wrapper, selector .elementor-counter-number',
        gradCss
      )
    );
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'counter',
    isInner: false,
    settings,
    elements: [],
  };
}

// ── Elementor Pro Widget Builders ──

