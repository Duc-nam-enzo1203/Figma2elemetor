/** High-Fidelity Elementor v3 Compiler (Figma Plugin & Node tests). */

import { shortId } from '../utils/crypto.js';
import { verifyAndHealElementorJson } from './fidelity-verifier.js';

import { boxValue, scaleBox, flexGapValue, applyGlobalColor, appendCustomCss, applyDevModeResidualCss, applyTextShadowAndEffects, applyCommonBoxStyle, applyTypographySettings, inferHeadingTag, getTextGradientCss, buildTextClipRule, collectSubtreeTexts, collectSubtreeImages, escapeHtml, scopeSvgIds, svgMarkupToDataUri } from './compiler-helpers.js';
import { compileElementorV4 } from './elementor-v4.js';
import { buildNestedAccordion, buildNestedTabs } from './nested-widgets.js';
import { buildProForm, buildProNavMenu, buildProCta, buildProPriceTable, buildProPriceList, buildProFlipBox, buildProSlides, buildProLoopGrid, buildGenericProWidget, buildProPaymentButton, buildProProgressTracker, buildProVideoPlaylist, buildProOffCanvas, buildProCountdown, buildProShareButtons } from './pro-widgets.js';

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
        el = buildButton(node, allocId, { linearBorder, resolveMedia });
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
        el = buildSocialIcons(node, nodes, allocId);
        break;
      case 'share-buttons':
        el = buildProShareButtons(node, nodes, allocId);
        break;
      case 'counter':
        el = buildCounter(node, nodes, allocId);
        break;
      case 'countdown':
        el = buildProCountdown(node, nodes, allocId);
        break;
      case 'audio':
        el = buildAudio(node, allocId);
        break;
      case 'shortcode':
        el = buildShortcode(node, nodes, allocId);
        break;
      case 'menu-anchor':
        el = buildMenuAnchor(node, allocId);
        break;
      case 'sidebar':
        el = buildSidebar(node, allocId);
        break;
      case 'read-more':
        el = buildReadMore(node, nodes, allocId);
        break;
      case 'text-path':
        el = buildTextPath(node, nodes, allocId);
        break;
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
        el = buildProPriceTable(node, nodes, allocId);
        break;
      case 'price-list':
        el = buildProPriceList(node, nodes, allocId);
        break;
      case 'flip-box':
        el = buildProFlipBox(node, nodes, allocId, resolveMedia);
        break;
      case 'slides':
        el = buildProSlides(node, nodes, allocId, resolveMedia);
        break;
      case 'paypal-button':
      case 'stripe-button':
        el = buildProPaymentButton(node, wType, allocId);
        break;
      case 'progress-tracker':
        el = buildProProgressTracker(node, allocId);
        break;
      case 'video-playlist':
        el = buildProVideoPlaylist(node, nodes, allocId);
        break;
      case 'off-canvas':
        el = buildProOffCanvas(node, nodes, allocId, buildElement);
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
      case 'taxonomy-filter':
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
      applyChildFlexAndPositionSettings(el, node, parentNode, isRoot, nodes);
      applyWidgetWrapperBoxStyles(el, node, resolveMedia);
      el.settings._f2e_node_id = node.sourceNodeId || node.id;
      el.settings._title = node.content && node.content.name ? node.content.name : wType;
    }
    return el;
  };

  const expandRootIds = (ids) => {
    const out = [];
    for (const rid of ids || []) {
      const rNode = nodes[rid];
      if (!rNode) continue;
      if ((rNode.widget || rNode.widgetType) === 'unwrap') {
        out.push(...expandRootIds(rNode.children || []));
      } else {
        out.push(rid);
      }
    }
    return out;
  };

  const rawContent = [];
  for (const rootId of expandRootIds(doc.roots || [])) {
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
function applyChildFlexAndPositionSettings(el, node, parentNode, isRoot, nodes = {}) {
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
          let pct = Math.min(100, Math.round((nodeW / parentWidth) * 1000) / 10);
          if (parentLayout.wrap && Number(parentLayout.gap) > 0 && pct >= 48 && pct <= 52) {
            pct = 48.5;
          }
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
          settings._flex_size = 'none';
          settings.width = { unit: 'px', size: nodeW, sizes: [] };
          settings.width_mobile = { unit: '%', size: 100, sizes: [] };
        }
      } else if (nodeW > 0) {
        settings._flex_size = 'none';
        const parentHasFillSibling = Array.isArray(parentNode.children) && parentNode.children.some((sid) => {
          const sib = nodes[sid];
          return sib && sib !== node && sib.layout && (sib.layout.sizingH === 'FILL' || sib.layout.flexGrow === 1);
        });
        if (parentHasFillSibling && nodeW < parentWidth * 0.5) {
          settings.width = { unit: 'px', size: Math.round(nodeW), sizes: [] };
          settings.width_tablet = { unit: '%', size: 100, sizes: [] };
          settings.width_mobile = { unit: '%', size: 100, sizes: [] };
        } else if (nodeW >= 180 && parentWidth > 0 && nodeW < parentWidth) {
          let pct = Math.min(100, Math.round((nodeW / parentWidth) * 1000) / 10);
          if (parentLayout.wrap && Number(parentLayout.gap) > 0 && pct >= 48 && pct <= 52) {
            pct = 48.5;
          }
          settings.width = { unit: '%', size: pct, sizes: [] };
          if (pct >= 18 && pct <= 28) {
            settings.width_tablet = { unit: '%', size: 48, sizes: [] };
            settings.width_mobile = { unit: '%', size: 100, sizes: [] };
          } else if (pct >= 29 && pct <= 38) {
            settings.width_tablet = { unit: '%', size: 48, sizes: [] };
            settings.width_mobile = { unit: '%', size: 100, sizes: [] };
          } else if (pct >= 42 && pct <= 58) {
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
      if (sizingH === 'FILL' || (parentWidth > 0 && nodeW >= parentWidth * 0.92)) {
        settings._flex_align_self = 'stretch';
      } else if (sizingH === 'FIXED' && nodeW > 0 && nodeW < parentWidth * 0.92) {
        // Never lock HUG containers to fixed pixel widths
        settings.width = { unit: 'px', size: nodeW, sizes: [] };
        settings.width_mobile = { unit: '%', size: 100, sizes: [] };
      }
    }
    if (layout.alignSelf && !settings._flex_align_self) {
      settings._flex_align_self = layout.alignSelf;
    }
  } else {
    const CARD_SIZED_WIDGETS = new Set([
      'flip-box', 'call-to-action', 'price-table', 'testimonial',
      'icon-box', 'image-box', 'slides', 'image-gallery', 'image-carousel',
      'nested-accordion', 'nested-tabs', 'progress', 'alert', 'counter',
    ]);
    if (parentIsRow) {
      if (sizingH === 'FILL' || layout.flexGrow === 1) {
        settings._element_width = 'initial';
        settings._flex_size = 'grow';
      } else if (el.widgetType === 'form' && nodeW > 200) {
        settings._element_width = 'initial';
        settings._flex_size = 'grow';
      } else if (CARD_SIZED_WIDGETS.has(el.widgetType) && nodeW >= 120) {
        settings._element_width = 'initial';
        settings._element_custom_width = { unit: 'px', size: Math.round(nodeW), sizes: [] };
        settings._element_custom_width_tablet = { unit: '%', size: nodeW <= 500 ? 48 : 100, sizes: [] };
        settings._element_custom_width_mobile = { unit: '%', size: 100, sizes: [] };
        settings._flex_size = 'none';
      } else {
        // Prevent buttons, text links, and icons in a horizontal row from stretching to 100% width!
        settings._element_width = 'auto';
        settings._flex_size = 'none';
      }
    } else if (sizingH === 'FILL') {
      settings._element_width = 'inherit';
    }
    if ((el.widgetType === 'heading' || el.widgetType === 'text-editor') && sizingH === 'FIXED' && nodeW > 0 && nodeW < parentWidth * 0.92 && (!node.layout || !node.layout.maxWidth)) {
      appendCustomCss(settings, `selector { max-width: ${Math.round(nodeW)}px; }`);
    }
  }
}

const SELF_STYLED_WIDGETS = new Set([
  'button',
  'divider',
  'spacer',
  'image',
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
  const residualSelector = el.widgetType === 'button' ? 'selector .elementor-button' : 'selector';
  applyDevModeResidualCss(settings, style, residualSelector);

  if (node.type === 'vector') return;
  if (node.type === 'text' && !style.background && !style.gradient && !style.borderWidth && !style.radius) return;
  if (SELF_STYLED_WIDGETS.has(el.widgetType)) return;

  // When Figma exported the entire Frame (including its background rect & padding) into an inline <svg width="W" height="H">,
  // skip adding _padding / _background_* again so we never double-pad the SVG!
  const svgAlreadyBakedFrame = Boolean(
    el.widgetType === 'html' &&
    node.svg &&
    node.svg.markup &&
    Number(layout.width) > 0 &&
    new RegExp(`width=["']?${Math.round(Number(layout.width))}\\b`).test(node.svg.markup) &&
    /<rect\b/i.test(node.svg.markup)
  );

  if (
    !svgAlreadyBakedFrame &&
    layout.padding &&
    !settings._padding &&
    (layout.padding.top || layout.padding.right || layout.padding.bottom || layout.padding.left)
  ) {
    settings._padding = boxValue(layout.padding);
  }

  if (!svgAlreadyBakedFrame && !settings._background_background && !settings.background_color) {
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

    const rawGap = Math.max(0, Number(layout.gap) || 0);
    const justifyKey = layout.justify || 'MIN';
    settings.flex_justify_content = FLEX_ALIGN_MAP[justifyKey] || 'flex-start';
    settings.flex_align_items = FLEX_ALIGN_MAP[layout.align || 'MIN'] || 'flex-start';
    if (layout.wrap) {
      settings.flex_wrap = 'wrap';
      settings.flex_wrap_tablet = 'wrap';
    } else if (dir === 'row' && (node.children || []).length >= 2) {
      settings.flex_wrap = 'nowrap';
      settings.flex_wrap_tablet = 'wrap';
    }

    if (node.responsive && node.responsive.tablet && node.responsive.tablet.direction) {
      settings.flex_direction_tablet = node.responsive.tablet.direction;
    } else if (dir === 'row') {
      settings.flex_direction_tablet = 'row';
      const gapTablet = rawGap > 0 ? Math.max(8, Math.round(rawGap * 0.75)) : 0;
      settings.flex_gap_tablet = { unit: 'px', size: gapTablet, column: String(gapTablet), row: String(gapTablet), isLinked: true };
    }
    if (node.responsive && node.responsive.mobile && node.responsive.mobile.direction) {
      settings.flex_direction_mobile = node.responsive.mobile.direction;
    } else if (dir === 'row' && (node.children || []).length >= 2 && (Number(layout.width) || 0) > 420) {
      settings.flex_direction_mobile = 'column';
      const gapMobile = rawGap > 0 ? Math.max(8, Math.round(rawGap * 0.5)) : 0;
      settings.flex_gap_mobile = { unit: 'px', size: gapMobile, column: String(gapMobile), row: String(gapMobile), isLinked: true };
    }
  }

  if (layout.overflow && /^(hidden|auto|scroll|visible)$/.test(layout.overflow)) {
    settings.overflow = layout.overflow;
  } else if (layout.clipsContent) {
    settings.overflow = 'hidden';
  }

  // Preserve Dev Mode `min-height`, FIXED height, OR Hero/Banner/Composite-BG height so sections never collapse vertically!
  const explicitMinH = Number(layout.minHeight) || 0;
  const nodeH = Math.round(Number(layout.height) || 0);
  const effectiveMinH = explicitMinH > 0
    ? explicitMinH
    : ((style.backgroundImage || layout.sizingV === 'FIXED') && nodeH > 0 ? nodeH : 0);
  if (effectiveMinH > 0) {
    settings.min_height = { unit: 'px', size: effectiveMinH, sizes: [] };
    if (effectiveMinH >= 480) {
      settings.min_height_tablet = { unit: 'px', size: Math.round(effectiveMinH * 0.78), sizes: [] };
      settings.min_height_mobile = { unit: 'px', size: Math.max(360, Math.round(effectiveMinH * 0.62)), sizes: [] };
    }
  }
  if (Number(layout.minWidth) > 0) {
    appendCustomCss(settings, `selector { min-width: ${Math.round(Number(layout.minWidth))}px; }`);
  }

  // Important: Top-level root sections get boxed widths and responsive padding matching Dev standards
  if (isRoot) {
    const rootW = Number(layout.width) || 1440;
    const padL = Number(layout.padding && layout.padding.left) || 0;
    const padR = Number(layout.padding && layout.padding.right) || 0;

    let isBoxed = false;
    let boxedWidth = 1200;

    const maxBoxedCap = rootW >= 1600 ? 1600 : 1320;
    if (padL >= 40 && padR >= 40 && rootW >= 1100) {
      isBoxed = true;
      boxedWidth = Math.max(960, Math.min(maxBoxedCap, rootW - padL - padR));
    } else if (Number(layout.maxWidth) > 0 && Number(layout.maxWidth) <= 1600) {
      isBoxed = true;
      boxedWidth = Math.max(960, Math.min(maxBoxedCap, Math.round(Number(layout.maxWidth))));
    } else if (rootW >= 1100 && Array.isArray(node.children) && node.children.length > 0) {
      // Fallback for non-Auto-Layout root frames: infer boxed width from direct children bounds
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

        if (spanW >= 900 && spanW <= 1360 && gutterLeft >= 48 && gutterRight >= 48) {
          isBoxed = true;
          boxedWidth = Math.max(960, Math.min(1320, Math.round(spanW)));
        } else if (visualChildCount === 1) {
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
      if ((layout.sizingH === 'FIXED' || layout.sizingH === 'HUG') && rootW > 0 && rootW < 960) {
        settings.width = { unit: 'px', size: Math.round(rootW), sizes: [] };
        if (rootW > 360) {
          settings.width_mobile = { unit: '%', size: 100, sizes: [] };
        }
      }
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

  // Unwrap redundant single transparent wrapper into parent container to avoid DOM bloat
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
    const maxUnwrapCap = (Number(layout.width) || 0) >= 1600 ? 1600 : 1360;
    if (isRoot && childWidth >= 960 && childWidth <= maxUnwrapCap) {
      settings.content_width = 'boxed';
      settings.boxed_width = { unit: 'px', size: Math.round(childWidth), sizes: [] };
      settings.boxed_width_tablet = { unit: 'px', size: 768, sizes: [] };
      settings.boxed_width_mobile = { unit: 'px', size: 360, sizes: [] };
    }

    // Inherit padding, min-height, boxShadow & residual Dev Mode CSS if parent didn't have them
    if (!parentHasPadding && childHasPadding) {
      settings.padding = boxValue(childLayout.padding);
      settings.padding_tablet = boxValue(scaleBox(childLayout.padding, 0.65, 36));
      settings.padding_mobile = boxValue(scaleBox(childLayout.padding, 0.4, 20));
    }
    const childMinH = Number(childLayout.minHeight) || ((childLayout.sizingV === 'FIXED' && Number(childLayout.height) >= 120) ? Math.round(Number(childLayout.height)) : 0);
    if (!settings.min_height && childMinH > 0) {
      settings.min_height = { unit: 'px', size: childMinH, sizes: [] };
    }
    if (!settings.box_shadow_box_shadow_type && cs.boxShadow) {
      settings.box_shadow_box_shadow_type = 'yes';
      settings.box_shadow_box_shadow = cs.boxShadow;
    }
    applyDevModeResidualCss(settings, cs, 'selector');

    // Inherit flex direction and alignment from the inner container
    const childDir = childLayout.direction === 'row' ? 'row' : 'column';
    settings.flex_direction = childDir;
    const rawGap = Math.max(0, Number(childLayout.gap) || 0);
    settings.flex_gap = flexGapValue(childLayout);

    const justifyKey = childLayout.justify || 'MIN';
    settings.flex_justify_content = FLEX_ALIGN_MAP[justifyKey] || 'flex-start';
    settings.flex_align_items = FLEX_ALIGN_MAP[childLayout.align || 'MIN'] || 'flex-start';

    if (childLayout.wrap) {
      settings.flex_wrap = 'wrap';
      settings.flex_wrap_tablet = 'wrap';
    } else if (childDir === 'row' && (singleChildNode.children || []).length >= 3) {
      settings.flex_wrap = 'nowrap';
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
      ...(settings.boxed_width?.size ? { padding: { top: 0, right: 0, bottom: 0, left: 0 } } : {}),
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

function buildTextEditor(node, allocId) {
  const text = node.text || {};
  const gradCss = getTextGradientCss(text);
  const raw = String(text.characters || '').trim();
  const inlineGradStyle = gradCss
    ? `background:${gradCss};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;`
    : '';
  const pSpace = Number(text.paragraphSpacing) > 0 ? Math.round(Number(text.paragraphSpacing)) : 0;

  let paragraphs = '';
  if (Array.isArray(text.richSegments) && text.richSegments.length > 1) {
    // Preserve per-segment bold, italic, underline, and color inside rich text
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

function buildButton(node, allocId, options = {}) {
  const { linearBorder = true, resolveMedia = null } = options;
  const text = node.text || {};
  const style = node.style || {};
  const layout = node.layout || {};
  const settings = {
    text: (node.content && node.content.characters) || text.characters || (node.content && node.content.name) || 'Button',
    align: layout.sizingH === 'FILL' ? 'justify' : (text.align || 'center'),
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
    settings.background_background = 'classic';
    settings.background_color = 'rgba(0,0,0,0)';
  }

  // Button Icon (e.g. arrow, chevron, plus, check from Figma vector children)
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

function buildSiteLogo(node, allocId, resolveMedia) {
  const sha = (node.image && node.image.sha256) || (node.raster && node.raster.sha256) || (node.svg && node.svg.sha256) || '';
  const fallback = (node.image && node.image.dataUri) || (node.raster && node.raster.dataUri) || '';
  const media = resolveMedia ? resolveMedia(sha, fallback) : { id: '', url: fallback };
  const w = Math.max(20, Math.round(Number(node.layout && node.layout.width) || 120));

  const applyLogoBoxStyles = (logoSettings) => {
    const st = node.style || {};
    if (st.radius) {
      logoSettings.image_border_radius = boxValue(st.radius);
    }
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

  // If live push uploaded to WordPress media library
  if (media && Number(media.id) > 0 && media.url) {
    const imgRef = { id: Number(media.id), url: media.url };
    return {
      id: allocId(node.id),
      elType: 'widget',
      widgetType: 'theme-site-logo',
      isInner: false,
      settings: applyLogoBoxStyles({
        image: imgRef,
        image_size: 'full',
        custom_image: imgRef,
        use_custom_image: 'yes',
        width: { unit: 'px', size: w, sizes: [] },
      }),
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
      settings: applyLogoBoxStyles({
        image: svgImg,
        image_size: 'full',
        custom_image: svgImg,
        use_custom_image: 'yes',
        width: { unit: 'px', size: w, sizes: [] },
      }),
      elements: [],
    };
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'theme-site-logo',
    isInner: false,
    settings: applyLogoBoxStyles({
      image: media,
      image_size: 'full',
      custom_image: media,
      use_custom_image: 'yes',
      width: { unit: 'px', size: w, sizes: [] },
    }),
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
        html: `<div class="f2e-image-svg" style="display:inline-flex;align-items:center;max-width:100%;${w ? `width:${w}px;` : ''}${h && !(w && w > 320) ? `height:${h}px;` : 'height:auto;'}line-height:0;">${scopedSvg}</div>`,
      },
      elements: [],
    };
  }

  const settings = {
    image: media,
    image_size: 'full',
  };
  if (node.link) {
    settings.link_to = 'custom';
    settings.link = { url: node.link, is_external: '', nofollow: '' };
  }
  if (w) {
    settings.width = { unit: 'px', size: w, sizes: [] };
    if (w > 320) {
      settings.width_mobile = { unit: '%', size: 100, sizes: [] };
    }
  }
  if (h) {
    settings.height = { unit: 'px', size: h, sizes: [] };
    if (w && w > 320) {
      settings.height_mobile = { unit: 'px', size: Math.max(180, Math.round(h * (360 / w))), sizes: [] };
    }
    settings.object_fit = 'cover';
  }
  const st = node.style || {};
  if (st.radius) {
    settings.image_border_radius = boxValue(st.radius);
  }
  if (st.borderWidth && st.borderColor) {
    settings.image_border_border = st.borderStyle || 'solid';
    settings.image_border_width = boxValue(st.borderWidth);
    settings.image_border_color = st.borderColor;
  }
  if (st.boxShadow) {
    settings.image_box_shadow_box_shadow_type = 'yes';
    settings.image_box_shadow_box_shadow = st.boxShadow;
    if (st.boxShadow.position === 'inset') {
      settings.image_box_shadow_box_shadow_position = 'inset';
    }
  }
  const pad = node.layout && node.layout.padding;
  if (pad && (pad.top || pad.right || pad.bottom || pad.left)) {
    settings._padding = boxValue(pad);
  }
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
      const iconSettings = {
        selected_icon: {
          value: { id: Number(media.id), url: media.url },
          library: 'svg',
        },
        size: { unit: 'px', size: w, sizes: [] },
      };
      if (node.text?.align && /^(left|center|right)$/i.test(node.text.align)) {
        iconSettings.align = node.text.align.toLowerCase();
      }
      return {
        id: elId,
        elType: 'widget',
        widgetType: 'icon',
        isInner: false,
        settings: iconSettings,
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
    settings: {
      selected_icon: {
        value: faFallback,
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
  const settings = {
    style: divStyle,
    weight: { unit: 'px', size: weight, sizes: [] },
    color,
    align: 'left',
  };
  if (w > 0 && w < 400) {
    settings.width = { unit: 'px', size: w, sizes: [] };
  }
  if (node.style && node.style.gradient) {
    const g = node.style.gradient;
    const gradCss = `linear-gradient(${g.angle ?? 90}deg, ${g.color1} ${g.stop1 ?? 0}%, ${g.color2} ${g.stop2 ?? 100}%)`;
    appendCustomCss(settings, `selector .elementor-divider-separator {\n  border-image: ${gradCss} 1 !important;\n}`);
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

  if (node.link) {
    settings.link = { url: node.link, is_external: '', nofollow: '' };
  }
  if (desc) {
    const titleGap = (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0)
      ? Math.min(24, Math.round(node.layout.gap))
      : 8;
    settings.title_bottom_space = { unit: 'px', size: titleGap, sizes: [] };
  }
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
    applyTextShadowAndEffects(settings, titleTypo, 'selector .elementor-icon-box-title, selector .elementor-image-box-title');
  }
  if (titleGrad) {
    appendCustomCss(settings, buildTextClipRule('selector .elementor-icon-box-title, selector .elementor-image-box-title', titleGrad));
  }

  const descGrad = getTextGradientCss(descTypo);
  const descColor = (descTypo && (descTypo.color || (descTypo.gradient && descTypo.gradient.color2))) || null;
  if (descColor) {
    settings.description_color = descColor;
    if (!descGrad) applyGlobalColor(settings, 'description_color', descColor);
  }
  if (descTypo) {
    applyTypographySettings(settings, 'description_typography', descTypo, node.responsive);
    applyTextShadowAndEffects(settings, descTypo, 'selector .elementor-icon-box-description, selector .elementor-image-box-description');
  }
  if (descGrad) {
    appendCustomCss(settings, buildTextClipRule('selector .elementor-icon-box-description, selector .elementor-image-box-description', descGrad));
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
    const imgs = collectSubtreeImages(node, nodes);
    if (media && media.url) {
      settings.image = { id: media.id || '', url: media.url };
    } else if (node.svg && node.svg.markup) {
      settings.image = { id: '', url: svgMarkupToDataUri(node.svg.markup) };
    } else {
      settings.image = imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' };
    }
    settings.thumbnail_size = 'full';
    const imgRadius = (imgs[0] && imgs[0].radius) || (node.image && node.image.radius) || (node.raster && node.raster.radius);
    if (imgRadius) {
      settings.image_border_radius = boxValue(imgRadius);
    }
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
  const iconSize = (node.content && node.content.iconSize && Number(node.content.iconSize) > 0) ? Math.round(Number(node.content.iconSize)) : 6;
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
  const gap = (node.layout && typeof node.layout.gap === 'number' && node.layout.gap >= 0) ? Math.round(node.layout.gap) : 16;
  const textColor = (firstTypo && (firstTypo.color || (firstTypo.gradient && firstTypo.gradient.color2))) || '#FFFFFF';
  const iconColor = (node.content && node.content.iconColor) || textColor;

  const settings = {
    icon_list: listData,
    view: isRow ? 'inline' : 'traditional',
    space_between: { unit: 'px', size: gap, sizes: [] },
    icon_size: { unit: 'px', size: iconSize, sizes: [] },
    text_indent: { unit: 'px', size: Math.max(6, Math.min(16, Math.round(iconSize * 0.5 + 4))), sizes: [] },
    icon_color: iconColor,
    text_color: textColor,
  };
  if (firstTypo && firstTypo.align && /^(left|center|right)$/i.test(firstTypo.align)) {
    settings.icon_align = firstTypo.align.toLowerCase();
  }

  if (textColor) {
    applyGlobalColor(settings, 'text_color', textColor);
  }
  if (iconColor) {
    applyGlobalColor(settings, 'icon_color', iconColor);
  }

  if (firstTypo) {
    applyTypographySettings(settings, 'icon_typography', firstTypo, node.responsive);
    applyTextShadowAndEffects(settings, firstTypo, 'selector .elementor-icon-list-text');
    if (firstTypo.fontSize) {
      settings.typography_font_size = { unit: 'px', size: firstTypo.fontSize, sizes: [] };
    }
    const listGrad = getTextGradientCss(firstTypo);
    if (listGrad) {
      appendCustomCss(settings, buildTextClipRule('selector .elementor-icon-list-text', listGrad));
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
    applyTextShadowAndEffects(settings, titleTypo, 'selector .elementor-title');
    const progGrad = getTextGradientCss(titleTypo);
    if (progGrad) appendCustomCss(settings, buildTextClipRule('selector .elementor-title', progGrad));
  }
  if (pctNode && pctNode.text) {
    if (pctNode.text.color) settings.bar_inline_color = pctNode.text.color;
    applyTypographySettings(settings, 'bar_inner_typography', pctNode.text, node.responsive);
  }
  if (node.style && node.style.background) {
    settings.bar_color = node.style.background;
  }
  if (node.style && node.style.borderColor) {
    settings.bar_bg_color = node.style.borderColor;
  }
  if (node.style && node.style.radius) {
    settings.border_radius = boxValue(node.style.radius);
  }
  if (node.layout && node.layout.height && Number(node.layout.height) <= 48) {
    settings.bar_height = { unit: 'px', size: Math.max(4, Math.round(Number(node.layout.height))), sizes: [] };
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
    applyTextShadowAndEffects(settings, titleTypo, 'selector .elementor-alert-title');
    const aTitleGrad = getTextGradientCss(titleTypo);
    if (aTitleGrad) appendCustomCss(settings, buildTextClipRule('selector .elementor-alert-title', aTitleGrad));
  }
  if (descTypo) {
    if (descTypo.color) settings.description_color = descTypo.color;
    applyTypographySettings(settings, 'typography_description', descTypo, node.responsive);
    applyTextShadowAndEffects(settings, descTypo, 'selector .elementor-alert-description');
  }
  if (node.style && node.style.background) {
    settings.background_color = node.style.background;
  }
  if (node.style && node.style.borderColor) {
    settings.border_color = node.style.borderColor;
  }
  if (node.style && node.style.borderWidth && Number(node.style.borderWidth.left) > 0) {
    settings.border_left_width = { unit: 'px', size: Math.round(Number(node.style.borderWidth.left)), sizes: [] };
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
  const cols = String(Math.max(1, Math.min(6, Number(node.layout && node.layout.columns) || Math.min(3, imgs.length || 3))));
  const settings = isCarousel
    ? { carousel: imgs, slides_to_show: cols, navigation: 'both' }
    : { wp_gallery: imgs, gallery_columns: cols, open_lightbox: 'yes' };
  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.image_spacing = 'custom';
    settings.image_spacing_custom = { unit: 'px', size: Math.round(node.layout.gap), sizes: [] };
  }
  if (node.style && node.style.radius) {
    settings.image_border_radius = boxValue(node.style.radius);
  }
  if (node.style && node.style.borderWidth && node.style.borderColor) {
    settings.image_border_border = node.style.borderStyle || 'solid';
    settings.image_border_width = boxValue(node.style.borderWidth);
    settings.image_border_color = node.style.borderColor;
  }
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
    if (contentNode.text.align) settings.testimonial_alignment = contentNode.text.align === 'justified' ? 'left' : contentNode.text.align;
    if (contentNode.text.color) settings.content_content_color = contentNode.text.color;
    applyTypographySettings(settings, 'content_typography', contentNode.text, node.responsive);
    applyTextShadowAndEffects(settings, contentNode.text, 'selector .elementor-testimonial-content');
  }
  if (nameNode && nameNode.text) {
    if (nameNode.text.color) settings.name_text_color = nameNode.text.color;
    applyTypographySettings(settings, 'name_typography', nameNode.text, node.responsive);
    applyTextShadowAndEffects(settings, nameNode.text, 'selector .elementor-testimonial-name');
  }
  if (jobNode && jobNode.text) {
    if (jobNode.text.color) settings.job_text_color = jobNode.text.color;
    applyTypographySettings(settings, 'job_typography', jobNode.text, node.responsive);
  }
  if (imgs[0] && imgs[0].width) {
    settings.image_size = { unit: 'px', size: Math.round(Number(imgs[0].width)), sizes: [] };
  }
  if (imgs[0] && imgs[0].radius) {
    settings.image_border_radius = boxValue(imgs[0].radius);
  }
  if (node.style && node.style.borderWidth && node.style.borderColor) {
    settings.image_border_border = node.style.borderStyle || 'solid';
    settings.image_border_width = boxValue(node.style.borderWidth);
    settings.image_border_color = node.style.borderColor;
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
  const starColor = (node.svg && node.svg.color) || (node.text && node.text.color) || (node.style && node.style.background) || '#F59E0B';
  const settings = {
    rating_scale: '5',
    rating: 5,
    star_style: 'star_fontawesome',
    stars_color: starColor,
  };
  if (node.layout && node.layout.height && Number(node.layout.height) > 0 && Number(node.layout.height) <= 64) {
    settings.star_size = { unit: 'px', size: Math.round(Number(node.layout.height)), sizes: [] };
  }
  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.star_space = { unit: 'px', size: Math.round(node.layout.gap), sizes: [] };
  }
  if (node.text && node.text.align) {
    settings.align = node.text.align;
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'star-rating',
    isInner: false,
    settings,
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
  if (node.layout && node.layout.justify) {
    const jMap = { CENTER: 'center', MAX: 'right', MIN: 'left' };
    if (jMap[node.layout.justify]) settings.align = jMap[node.layout.justify];
  }
  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.icon_spacing = { unit: 'px', size: node.layout.gap, sizes: [] };
  }
  const firstStyled = extractedSocials.find((s) => s.background || s.borderColor || s.radius || s.width) || null;
  if (firstStyled) {
    if (firstStyled.background) {
      settings.icon_color = 'custom';
      settings.icon_primary_color = firstStyled.background;
      settings.icon_secondary_color = '#FFFFFF';
    }
    if (firstStyled.width && Number(firstStyled.width) > 0) {
      settings.icon_size = { unit: 'px', size: Math.max(12, Math.round(Number(firstStyled.width) * 0.45)), sizes: [] };
    }
    if (firstStyled.radius) {
      settings.border_radius = boxValue(firstStyled.radius);
    }
    if (firstStyled.borderColor) {
      settings.image_border_border = 'solid';
      settings.image_border_width = boxValue({ top: 1, right: 1, bottom: 1, left: 1 }, true);
      settings.image_border_color = firstStyled.borderColor;
    }
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
  if (numTypo.align && /^(left|center|right)$/i.test(numTypo.align)) {
    const cAlign = numTypo.align.toLowerCase();
    settings.number_position = cAlign;
    settings.title_horizontal_align = cAlign;
  }
  applyTextShadowAndEffects(settings, numTypo, 'selector .elementor-counter-number-wrapper, selector .elementor-counter-number');

  if (labelNode && labelNode.text) {
    const lblTypo = labelNode.text;
    const lblColor = lblTypo.color || (lblTypo.gradient && (lblTypo.gradient.color2 || lblTypo.gradient.color1)) || null;
    if (lblColor) {
      settings.title_color = lblColor;
      applyGlobalColor(settings, 'title_color', lblColor);
    }
    applyTypographySettings(settings, 'typography_title', lblTypo, labelNode.responsive || node.responsive);
    applyTextShadowAndEffects(settings, lblTypo, 'selector .elementor-counter-title');
    const lblGrad = getTextGradientCss(lblTypo);
    if (lblGrad) {
      appendCustomCss(settings, buildTextClipRule('selector .elementor-counter-title', lblGrad));
    }
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

function buildAudio(node, allocId) {
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'audio',
    isInner: false,
    settings: {
      link: { url: node.link || 'https://soundcloud.com/shayne-m-1/sets/ambient' },
      visual: 'yes',
    },
    elements: [],
  };
}

function buildShortcode(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes);
  const raw = (node.text && node.text.characters) || (texts[0] && texts[0].text && texts[0].text.characters) || '';
  const sc = raw.trim().startsWith('[') ? raw.trim() : `[${(node.content && node.content.name) || 'shortcode'}]`;
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'shortcode',
    isInner: false,
    settings: { shortcode: sc },
    elements: [],
  };
}

function buildMenuAnchor(node, allocId) {
  const raw = String((node.content && node.content.name) || 'section')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'menu-anchor',
    isInner: false,
    settings: { anchor: raw },
    elements: [],
  };
}

function buildSidebar(node, allocId) {
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'sidebar',
    isInner: false,
    settings: { sidebar: 'sidebar-1' },
    elements: [],
  };
}

function buildReadMore(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes);
  const label = (node.text && node.text.characters) || (texts[0] && texts[0].text && texts[0].text.characters) || (node.content && node.content.name) || 'Read More';
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'read-more',
    isInner: false,
    settings: { link_text: label },
    elements: [],
  };
}

function buildTextPath(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes);
  const t = node.text || (texts[0] && texts[0].text) || {};
  const settings = {
    text: t.characters || (node.content && node.content.name) || 'Curved Text',
    path: 'wave',
    align: t.align || 'center',
  };
  if (t.color) settings.text_color_normal = t.color;
  applyTypographySettings(settings, 'text_typography', t, node.responsive);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'text-path',
    isInner: false,
    settings,
    elements: [],
  };
}

// ── Elementor Pro Widget Builders ──

