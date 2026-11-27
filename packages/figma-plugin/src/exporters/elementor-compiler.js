/** High-Fidelity Elementor v3 Compiler (Figma Plugin & Node tests). */

import { shortId } from '../utils/crypto.js';
import { verifyAndHealElementorJson } from './fidelity-verifier.js';

import { boxValue, scaleBox, flexGapValue, applyGlobalColor, appendCustomCss, applyDevModeResidualCss, applyCommonBoxStyle } from './compiler-helpers.js';
import { compileElementorV4 } from './elementor-v4.js';
import { buildHeading, buildTextEditor, buildButton, buildSiteLogo, buildImage, buildIconOrInlineSvg, buildCustomHtml, buildVideo, buildGoogleMaps, buildDivider, buildSpacer, buildAudio, buildShortcode, buildMenuAnchor, buildSidebar, buildReadMore, buildTextPath } from './basic-widgets.js';
import { buildBoxWidget, buildIconList, buildProgress, buildAlert, buildGalleryOrCarousel, buildTestimonial, buildStarRating, buildSocialIcons, buildCounter } from './general-widgets.js';
import { buildNestedAccordion, buildNestedTabs } from './nested-widgets.js';
import {
  buildProForm,
  buildProSearchForm,
  buildProLogin,
  buildProNavMenu,
  buildProMegaMenu,
  buildProCta,
  buildProPriceTable,
  buildProPriceList,
  buildProFlipBox,
  buildProSlides,
  buildProTestimonialCarousel,
  buildProReviews,
  buildProNestedCarousel,
  buildProMediaCarousel,
  buildProGallery,
  buildProHotspot,
  buildProLoopGrid,
  buildGenericProWidget,
  buildProPaymentButton,
  buildProProgressTracker,
  buildProVideoPlaylist,
  buildProOffCanvas,
  buildProCountdown,
  buildProShareButtons,
} from './pro-widgets.js';

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
        el = buildVideo(node, allocId, resolveMedia);
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
        el = buildGalleryOrCarousel(node, nodes, wType, allocId, resolveMedia);
        break;
      case 'gallery':
        el = buildProGallery(node, nodes, allocId, resolveMedia);
        break;
      case 'media-carousel':
        el = buildProMediaCarousel(node, nodes, allocId, resolveMedia);
        break;
      case 'nested-carousel':
        el = buildProNestedCarousel(node, nodes, allocId, buildElement);
        break;
      case 'testimonial':
        el = buildTestimonial(node, nodes, allocId, resolveMedia);
        break;
      case 'testimonial-carousel':
        el = buildProTestimonialCarousel(node, nodes, allocId, resolveMedia);
        break;
      case 'reviews':
        el = buildProReviews(node, nodes, allocId, resolveMedia);
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
        el = buildProForm(node, nodes, allocId);
        break;
      case 'search-form':
        el = buildProSearchForm(node, nodes, allocId);
        break;
      case 'login':
        el = buildProLogin(node, nodes, allocId);
        break;
      case 'nav-menu':
        el = buildProNavMenu(node, nodes, allocId);
        break;
      case 'mega-menu':
        el = buildProMegaMenu(node, nodes, allocId);
        break;
      case 'hotspot':
        el = buildProHotspot(node, nodes, allocId, resolveMedia);
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
        el = buildProLoopGrid(node, nodes, allocId, wType, buildElement);
        break;
      case 'theme-site-logo':
      case 'site-logo':
        el = buildSiteLogo(node, allocId, resolveMedia);
        break;
      case 'blockquote':
      case 'animated-headline':
      case 'table-of-contents':
      case 'lottie':
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
  if (node.hoverStyle) {
    if (node.hoverStyle.background) {
      settings.background_hover_background = 'classic';
      settings.background_hover_color = node.hoverStyle.background;
    }
    if (node.hoverStyle.borderColor) {
      settings.border_hover_border = 'solid';
      settings.border_hover_color = node.hoverStyle.borderColor;
    }
  }

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
