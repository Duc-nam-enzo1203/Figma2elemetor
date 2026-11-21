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

const FLEX_ALIGN_MAP = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  SPACE_BETWEEN: 'space-between',
  BASELINE: 'baseline',
};

export function compileElementorV3(doc, options = {}) {
  const { attachmentMap = {} } = options;
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
        el = buildButton(node, allocId);
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
        el = buildProFlipBox(node, nodes, allocId);
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
        el = buildContainer(node, nodes, isRoot, parentNode, allocId, buildElement, resolveMedia);
        break;
    }

    if (el && el.settings) {
      applyChildFlexAndPositionSettings(el, node, parentNode, isRoot);
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
  const parentWidth = Number(parentLayout.width) || 1240;

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
        // Crucial: In 2-column or multi-column rows, Elementor requires width even when sizing is FILL
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
        }
      } else if (nodeW > 0) {
        // Calculate percentage width if it's a major column (>= 20% of parent), or exact px for small chips/badges
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
  } else {
    // Widget inside a Row or Column Container
    if (parentIsRow) {
      if (sizingH === 'FILL') {
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

export function compileElementorClipboard(doc, options = {}) {
  const v3 = compileElementorV3(doc, options);
  return {
    type: 'elementor',
    siteurl: options.siteUrl || 'https://localhost/wp-json/',
    elements: v3.content,
    fidelityReport: v3.fidelityReport,
  };
}

export function compileElementorV4(doc) {
  const nodes = doc.nodes || {};

  const buildV4Node = (nodeId) => {
    const node = nodes[nodeId];
    if (!node) return null;

    const cleanId = String(node.sourceNodeId || nodeId).replace(/[^a-zA-Z0-9_-]/g, '-');
    const classId = `e-${cleanId}-${shortId(cleanId)}`;
    const wType = mapToV4WidgetType(node.widget);

    const settings = {
      classes: {
        $$type: 'classes',
        value: [classId],
      },
      _f2e_node_id: node.sourceNodeId || node.id,
    };

    if (wType === 'e-heading') {
      settings.title = { $$type: 'string', value: (node.content && (node.content.characters || node.content.name)) || 'Heading' };
      settings.tag = { $$type: 'string', value: inferHeadingTag(node) };
    } else if (wType === 'e-paragraph') {
      settings.paragraph = { $$type: 'string', value: (node.content && node.content.characters) || '' };
    } else if (wType === 'e-button') {
      settings.text = { $$type: 'string', value: (node.content && (node.content.characters || node.content.name)) || 'Button' };
      settings.link = { $$type: 'link', value: { url: node.link || '#', target: '_self' } };
    } else if (wType === 'e-image') {
      settings.image = { $$type: 'image', value: { url: (node.image && node.image.dataUri) || '', id: 0 } };
    }

    const variants = [buildV4Variant('desktop', node.layout, node.style, node.text)];
    if (node.responsive && node.responsive.tablet) {
      variants.push(buildV4Variant('tablet', node.responsive.tablet, {}, node.responsive.tablet));
    }
    if (node.responsive && node.responsive.mobile) {
      variants.push(buildV4Variant('mobile', node.responsive.mobile, {}, node.responsive.mobile));
    }

    const children = [];
    for (const cid of node.children || []) {
      const builtChild = buildV4Node(cid);
      if (builtChild) children.push(builtChild);
    }

    return {
      id: shortId(node.id),
      elType: wType === 'e-flexbox' ? 'e-flexbox' : 'widget',
      widgetType: wType,
      isInner: false,
      settings,
      elements: children,
      styles: {
        [classId]: {
          id: classId,
          label: 'local',
          type: 'class',
          variants,
        },
      },
      editor_settings: [],
      version: '0.0',
    };
  };

  const content = (doc.roots || []).map((rid) => buildV4Node(rid)).filter(Boolean);
  return {
    title: doc.title || 'Figma Design (Elementor v4)',
    type: 'e-flexbox',
    version: '0.4',
    page_settings: [],
    content,
  };
}

function mapToV4WidgetType(widget) {
  switch (widget) {
    case 'heading': return 'e-heading';
    case 'text-editor': return 'e-paragraph';
    case 'button': return 'e-button';
    case 'image': return 'e-image';
    case 'icon': return 'e-svg';
    default: return 'e-flexbox';
  }
}

function buildV4Variant(breakpoint, layout = {}, style = {}, text = {}) {
  const props = {};
  if (layout.direction) {
    props['flex-direction'] = { $$type: 'string', value: layout.direction };
  }
  if (typeof layout.gap === 'number') {
    props.gap = { $$type: 'size', value: { size: layout.gap, unit: 'px', isLinked: true } };
  }
  if (layout.padding) {
    props.padding = {
      $$type: 'size',
      value: {
        top: { size: layout.padding.top || 0, unit: 'px' },
        right: { size: layout.padding.right || 0, unit: 'px' },
        bottom: { size: layout.padding.bottom || 0, unit: 'px' },
        left: { size: layout.padding.left || 0, unit: 'px' },
      },
    };
  }
  if (style.background) {
    props.backgroundColor = { $$type: 'color', value: style.background };
  }
  if (text && text.color) {
    props.color = { $$type: 'color', value: text.color };
  }
  if (text && text.fontSize) {
    props.fontSize = { $$type: 'size', value: { size: text.fontSize, unit: 'px' } };
  }
  if (text && text.fontFamily) {
    props.fontFamily = { $$type: 'string', value: text.fontFamily };
  }
  return {
    meta: { breakpoint, state: null },
    props,
  };
}

// ── Elementor v3 Builders ──

function boxValue(box, isLinked = false) {
  const t = Math.round(Number(box && box.top) || 0);
  const r = Math.round(Number(box && box.right) || 0);
  const b = Math.round(Number(box && box.bottom) || 0);
  const l = Math.round(Number(box && box.left) || 0);
  return {
    unit: 'px',
    top: String(t),
    right: String(r),
    bottom: String(b),
    left: String(l),
    isLinked: Boolean(box && box.isLinked !== undefined ? box.isLinked : (isLinked || (t === r && r === b && b === l))),
  };
}

function scaleBox(box, factor, cap) {
  return {
    top: Math.min(cap, Math.round((Number(box && box.top) || 0) * factor)),
    right: Math.min(cap, Math.round((Number(box && box.right) || 0) * factor)),
    bottom: Math.min(cap, Math.round((Number(box && box.bottom) || 0) * factor)),
    left: Math.min(cap, Math.round((Number(box && box.left) || 0) * factor)),
    isLinked: false,
  };
}

function flexGapValue(layout) {
  const main = Math.round(Number(layout && layout.gap) || 0);
  // If Figma gap is massive (>160px) because designer used fixed itemSpacing instead of SPACE_BETWEEN,
  // clamp gap to 24px and let justify: space-between handle distribution!
  const effectiveMain = main > 160 ? 24 : main;
  const cross = layout && layout.wrap && typeof layout.rowGap === 'number' ? Math.round(layout.rowGap) : effectiveMain;
  const isRow = ((layout && layout.direction) || 'column') === 'row';
  const col = isRow ? effectiveMain : cross;
  const row = isRow ? cross : effectiveMain;
  return {
    unit: 'px',
    size: row,
    column: String(col),
    row: String(row),
    isLinked: col === row,
  };
}

function applyGlobalColor(settings, key, colorHex) {
  if (!colorHex || typeof colorHex !== 'string') return;
  const hex = colorHex.trim().toUpperCase();
  let gId = null;
  if (['#64A14F', '#15803D', '#16A34A', '#2563EB', '#3B82F6'].includes(hex)) {
    gId = 'globals/colors?id=primary';
  } else if (['#038132', '#14532D', '#1E40AF', '#1D4ED8'].includes(hex)) {
    gId = 'globals/colors?id=secondary';
  } else if (['#FFCC00', '#F59E0B', '#FBBF24', '#EC4899', '#DB2777'].includes(hex)) {
    gId = 'globals/colors?id=accent';
  } else if (['#FFFFFF', '#F8FAFC'].includes(hex)) {
    gId = 'globals/colors?id=848461d';
  } else if (['#E2E8F0', '#CBD5E1', '#E5E7EB', '#334155'].includes(hex)) {
    gId = 'globals/colors?id=31b945e';
  } else if (['#0F172A', '#1E293B', '#111827', '#000000'].includes(hex)) {
    gId = 'globals/colors?id=text';
  }

  if (gId) {
    if (!settings.__globals__) settings.__globals__ = {};
    settings.__globals__[key] = gId;
  }
}

function applyCommonBoxStyle(settings, style = {}, resolveMedia) {
  if (style.gradient) {
    settings.background_background = 'gradient';
    settings.background_gradient_type = style.gradient.type;
    settings.background_color = style.gradient.color1;
    settings.background_color_stop = { unit: '%', size: style.gradient.stop1, sizes: [] };
    settings.background_color_b = style.gradient.color2;
    settings.background_color_b_stop = { unit: '%', size: style.gradient.stop2, sizes: [] };
    settings.background_gradient_angle = { unit: 'deg', size: style.gradient.angle, sizes: [] };
  } else if (style.background) {
    settings.background_background = 'classic';
    settings.background_color = style.background;
    applyGlobalColor(settings, 'background_color', style.background);
  }

  if (style.backgroundImage && resolveMedia) {
    const media = resolveMedia(style.backgroundImage, style.backgroundImageDataUri);
    if (media.url) {
      settings.background_background = 'classic';
      settings.background_image = media;
      settings.background_size = 'cover';
      settings.background_position = 'center center';
      settings.background_repeat = 'no-repeat';
    }
  }

  if (style.radius) {
    settings.border_radius = boxValue(style.radius);
  }

  if (style.borderWidth && style.borderColor) {
    settings.border_border = 'solid';
    settings.border_width = boxValue(style.borderWidth);
    settings.border_color = style.borderColor;
    applyGlobalColor(settings, 'border_color', style.borderColor);
  }

  // Linear Gradient Border Solution:
  // Elementor does not natively support linear-gradient on border-color.
  // We automatically inject custom_css for pixel-perfect gradient borders,
  // while keeping settings.border_color as a close fallback for Elementor Free!
  if (style.borderGradient && style.borderWidth) {
    const bw = Math.max(1, Number(style.borderWidth.top) || 1);
    const g = style.borderGradient;
    const gradCss = style.devModeBorderImage && style.devModeBorderImage.startsWith('linear-gradient')
      ? style.devModeBorderImage
      : `linear-gradient(${g.angle}deg, ${g.color1} ${g.stop1}%, ${g.color2} ${g.stop2}%)`;
    const bgSolid = style.background || '#ffffff';
    // For CSS background dual-clipping to be valid according to W3C CSS spec,
    // the first layer CANNOT be a bare color (#ffffff) — it must be a gradient image!
    const bgLayer = style.gradient
      ? `linear-gradient(${style.gradient.angle}deg, ${style.gradient.color1} ${style.gradient.stop1}%, ${style.gradient.color2} ${style.gradient.stop2}%)`
      : `linear-gradient(${bgSolid}, ${bgSolid})`;

    let borderSnippet = '';
    if (style.radius) {
      // Valid dual-background clipping with background-origin and background-clip
      borderSnippet = `selector {\n  border: ${bw}px solid transparent !important;\n  background-image: ${bgLayer}, ${gradCss} !important;\n  background-origin: border-box !important;\n  background-clip: padding-box, border-box !important;\n}`;
    } else {
      borderSnippet = `selector {\n  border: ${bw}px solid !important;\n  border-image: ${gradCss} 1 !important;\n}`;
    }
    settings.custom_css = (settings.custom_css ? settings.custom_css + '\n' : '') + borderSnippet;
  }

  if (style.boxShadow) {
    settings.box_shadow_box_shadow_type = 'yes';
    settings.box_shadow_box_shadow = style.boxShadow;
    if (style.boxShadow.position === 'inset') {
      settings.box_shadow_box_shadow_position = 'inset';
    }
  }
}

function applyTypographySettings(settings, prefix, text = {}, responsive = {}) {
  if (!text) return;
  settings[`${prefix}_typography`] = 'custom';
  if (text.fontFamily) settings[`${prefix}_font_family`] = text.fontFamily;
  if (text.fontWeight) settings[`${prefix}_font_weight`] = String(text.fontWeight);
  if (text.fontStyle) settings[`${prefix}_font_style`] = text.fontStyle;
  if (text.transform) settings[`${prefix}_text_transform`] = text.transform;
  if (text.decoration) settings[`${prefix}_text_decoration`] = text.decoration;

  const size = Number(text.fontSize) || 16;
  settings[`${prefix}_font_size`] = { unit: 'px', size, sizes: [] };

  // Rule-based responsive typography scaling matching professional Elementor dev standards
  let tabletSize;
  let mobileSize;
  if (responsive && responsive.tablet && responsive.tablet.fontSize) {
    tabletSize = responsive.tablet.fontSize;
  } else if (size >= 40) {
    tabletSize = Math.round(size * 0.78);
  } else if (size >= 28) {
    tabletSize = Math.round(size * 0.82);
  } else if (size >= 20) {
    tabletSize = Math.round(size * 0.88);
  } else if (size >= 15) {
    tabletSize = Math.max(14, size - 1);
  } else {
    tabletSize = size;
  }

  if (responsive && responsive.mobile && responsive.mobile.fontSize) {
    mobileSize = responsive.mobile.fontSize;
  } else if (size >= 40) {
    mobileSize = Math.max(22, Math.round(size * 0.60));
  } else if (size >= 28) {
    mobileSize = Math.max(18, Math.round(size * 0.70));
  } else if (size >= 20) {
    mobileSize = Math.max(16, Math.round(size * 0.80));
  } else if (size >= 15) {
    mobileSize = Math.max(13, size - 1);
  } else {
    mobileSize = size;
  }

  settings[`${prefix}_font_size_tablet`] = { unit: 'px', size: Number(tabletSize), sizes: [] };
  settings[`${prefix}_font_size_mobile`] = { unit: 'px', size: Number(mobileSize), sizes: [] };

  if (text.lineHeight) {
    settings[`${prefix}_line_height`] = {
      unit: text.lineHeightUnit || 'px',
      size: Number(text.lineHeight),
      sizes: [],
    };
  }
  if (text.letterSpacing) {
    settings[`${prefix}_letter_spacing`] = {
      unit: 'px',
      size: Number(text.letterSpacing),
      sizes: [],
    };
  }

  // Global Typography Token binding (only bind when explicitly matches standard typographic scales)
  // If the designer used custom display sizes (e.g. 40px stats, decorative numbers, custom weights),
  // preserve custom typography so Elementor does not override it with theme defaults!
  let gId = null;
  const isDisplayOrCustom = size > 36 || (text.fontWeight && text.fontWeight !== '400' && text.fontWeight !== '600' && text.fontWeight !== '700');
  if (!isDisplayOrCustom) {
    if (size >= 30) {
      gId = 'globals/typography?id=primary';
    } else if (size >= 20) {
      gId = 'globals/typography?id=secondary';
    } else if (size >= 14 && size <= 18) {
      gId = 'globals/typography?id=text';
    } else if (size < 14) {
      gId = 'globals/typography?id=accent';
    }
  }
  if (gId) {
    if (!settings.__globals__) settings.__globals__ = {};
    settings.__globals__[`${prefix}_typography`] = gId;
  }
}

function buildContainer(node, nodes, isRoot, parentNode, allocId, buildElement, resolveMedia) {
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

  if (layout.clipsContent) {
    settings.overflow = 'hidden';
  }

  // Important: Top-level root sections get boxed widths and responsive padding matching Dev standards
  if (isRoot) {
    const padL = Number(layout.padding && layout.padding.left) || 0;
    const padR = Number(layout.padding && layout.padding.right) || 0;
    if (padL >= 40 && padR >= 40 && (Number(layout.width) || 0) >= 1100) {
      const innerContentW = Math.max(960, Math.min(1320, (Number(layout.width) || 1440) - padL - padR));
      settings.content_width = 'boxed';
      settings.boxed_width = { unit: 'px', size: innerContentW, sizes: [] };
      settings.boxed_width_tablet = { unit: 'px', size: 768, sizes: [] };
      settings.boxed_width_mobile = { unit: 'px', size: 360, sizes: [] };
      settings.padding = boxValue({
        top: (layout.padding && layout.padding.top) || 64,
        right: 24,
        bottom: (layout.padding && layout.padding.bottom) || 64,
        left: 24,
      });
      settings.padding_tablet = boxValue({ top: 50, right: 24, bottom: 50, left: 24 });
      settings.padding_mobile = boxValue({ top: 30, right: 16, bottom: 30, left: 16 });
      settings.margin = boxValue({ top: 0, right: 0, bottom: 0, left: 0 });
    } else {
      settings.content_width = 'full';
      settings.padding = boxValue(layout.padding || { top: 60, right: 24, bottom: 60, left: 24 });
      settings.padding_tablet = boxValue({ top: 40, right: 20, bottom: 40, left: 20 });
      settings.padding_mobile = boxValue({ top: 24, right: 16, bottom: 24, left: 16 });
      settings.margin = boxValue({ top: 0, right: 0, bottom: 0, left: 0 });
    }
  } else {
    settings.content_width = 'full';
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

  applyCommonBoxStyle(settings, style, resolveMedia);

  // Absorb decorative background child (e.g. child named 'bg', 'background', 'overlay' or pure border frame)
  const childIds = [...(node.children || [])];
  const remainingChildIds = [];
  for (const cid of childIds) {
    const child = nodes[cid];
    if (child && child.layout?.position === 'absolute') {
      const cName = String(child.content?.name || '').toLowerCase();
      const isBgName = /^(bg|background|overlay|border|shadow|glow)$/i.test(cName);
      const hasNoText = !child.text && (!child.children || child.children.length === 0);
      if (isBgName && hasNoText) {
        if (!settings.background_background) {
          if (child.style?.gradient) {
            settings.background_background = 'gradient';
            settings.background_gradient_type = child.style.gradient.type || 'linear';
            settings.background_color = child.style.gradient.color1;
            settings.background_color_stop = { unit: '%', size: child.style.gradient.stop1, sizes: [] };
            settings.background_color_b = child.style.gradient.color2;
            settings.background_color_b_stop = { unit: '%', size: child.style.gradient.stop2, sizes: [] };
            settings.background_gradient_angle = { unit: 'deg', size: child.style.gradient.angle || 180, sizes: [] };
          } else if (child.style?.background) {
            settings.background_background = 'classic';
            settings.background_color = child.style.background;
            applyGlobalColor(settings, 'background_color', child.style.background);
          } else if (child.style?.backgroundImage && resolveMedia) {
            const media = resolveMedia(child.style.backgroundImage, child.style.backgroundImageDataUri);
            if (media.url) {
              settings.background_background = 'classic';
              settings.background_image = media;
              settings.background_size = 'cover';
              settings.background_position = 'center center';
              settings.background_repeat = 'no-repeat';
            }
          }
        }
        if (!settings.border_radius && child.style?.radius) {
          settings.border_radius = boxValue(child.style.radius);
        }
        if (!settings.border_border && child.style?.borderColor && child.style?.borderWidth) {
          settings.border_border = 'solid';
          settings.border_width = boxValue(child.style.borderWidth);
          settings.border_color = child.style.borderColor;
          applyGlobalColor(settings, 'border_color', child.style.borderColor);
        }
        if (child.style?.borderGradient && child.style?.borderWidth) {
          style.borderGradient = child.style.borderGradient;
          style.borderWidth = child.style.borderWidth;
          if (child.style.devModeBorderImage) style.devModeBorderImage = child.style.devModeBorderImage;
        }
        continue;
      }
    }
    remainingChildIds.push(cid);
  }

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
  while (activeChildIds.length === 1) {
    const singleChildId = activeChildIds[0];
    const singleChildNode = nodes[singleChildId];
    if (!singleChildNode) break;

    const childWType = singleChildNode.widgetType || singleChildNode.widget || 'container';
    const isChildContainer = (!childWType || childWType === 'container' || childWType === 'flexbox' || childWType === 'unwrap');
    if (!isChildContainer) break;
    if (!singleChildNode.children || singleChildNode.children.length === 0) break;

    // Do not unwrap if child has distinct background and parent already has a different background (unless forced unwrap)
    const parentHasBg = Boolean(settings.background_background || settings.background_color);
    const childHasBg = Boolean(singleChildNode.style && singleChildNode.style.background);
    if (parentHasBg && childHasBg && settings.background_color !== singleChildNode.style.background && childWType !== 'unwrap') {
      break;
    }
    const parentHasBorder = Boolean(settings.border_border || settings.border_width);
    const childHasBorder = Boolean(singleChildNode.style && (singleChildNode.style.borderColor || singleChildNode.style.borderWidth));
    if (parentHasBorder && childHasBorder && childWType !== 'unwrap') {
      break;
    }

    // Inherit boxed width from the inner container
    const childLayout = singleChildNode.layout || {};
    const childWidth = Number(childLayout.width) || 0;
    if (childWidth > 0 && childWidth <= 1360) {
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

  const elements = [];
  for (const cid of activeChildIds) {
    const childEl = buildElement(cid, false, node);
    if (childEl) {
      if (childEl.elType === 'container') childEl.isInner = true;
      elements.push(childEl);
    }
  }

  return {
    id: allocId(node.id),
    elType: 'container',
    isInner: !isRoot,
    settings,
    elements,
  };
}

function inferHeadingTag(node) {
  const name = String((node.content && (node.content.rawName || node.content.name)) || '').toLowerCase();
  const match = /\bh([1-6])\b/.exec(name);
  if (match) return `h${match[1]}`;
  const size = Number(node.text && node.text.fontSize) || 24;
  if (size >= 44) return 'h1';
  if (size >= 32) return 'h2';
  if (size >= 24) return 'h3';
  if (size >= 20) return 'h4';
  return 'h5';
}

function buildHeading(node, allocId) {
  const text = node.text || {};
  const settings = {
    title: text.characters || (node.content && node.content.name) || 'Heading',
    header_size: inferHeadingTag(node),
    align: text.align === 'justified' ? 'justify' : (text.align || 'left'),
  };
  if (text.color) {
    settings.title_color = text.color;
    applyGlobalColor(settings, 'title_color', text.color);
  }
  applyTypographySettings(settings, 'typography', text, node.responsive);
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
  const raw = String(text.characters || '').trim();
  const paragraphs = raw.split(/\n+/).map((line) => `<p style="margin:0;">${escapeHtml(line)}</p>`).join('');
  const settings = {
    editor: paragraphs || '<p style="margin:0;"></p>',
    align: text.align === 'justified' ? 'justify' : (text.align || 'left'),
  };
  if (text.color) {
    settings.text_color = text.color;
    applyGlobalColor(settings, 'text_color', text.color);
  }
  applyTypographySettings(settings, 'typography', text, node.responsive);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'text-editor',
    isInner: false,
    settings,
    elements: [],
  };
}

function buildButton(node, allocId) {
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
  if (text.color) {
    settings.button_text_color = text.color;
    applyGlobalColor(settings, 'button_text_color', text.color);
  }
  applyTypographySettings(settings, 'typography', text, node.responsive);
  if (style.radius) settings.border_radius = boxValue(style.radius);
  if (style.borderWidth && style.borderColor) {
    settings.border_border = 'solid';
    settings.border_width = boxValue(style.borderWidth);
    settings.border_color = style.borderColor;
    applyGlobalColor(settings, 'border_color', style.borderColor);
  }
  if (layout.padding && (layout.padding.top || layout.padding.left)) {
    settings.text_padding = boxValue(layout.padding);
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
  const sha = (node.image && node.image.sha256) || (node.svg && node.svg.sha256) || '';
  const media = resolveMedia ? resolveMedia(sha, (node.image && node.image.dataUri) || '') : { id: 0, url: '' };
  const w = Math.max(20, Math.round(Number(node.layout && node.layout.width) || 120));

  // If live push uploaded to WordPress media library
  if (media && Number(media.id) > 0 && media.url) {
    return {
      id: allocId(node.id),
      elType: 'widget',
      widgetType: 'theme-site-logo',
      isInner: false,
      settings: {
        custom_image: { id: Number(media.id), url: media.url },
        use_custom_image: 'yes',
        width: { unit: 'px', size: w, sizes: [] },
      },
      elements: [],
    };
  }

  // If we have SVG markup (Clipboard Ctrl+V paste or direct SVG)
  if (node.svg && node.svg.markup) {
    return {
      id: allocId(node.id),
      elType: 'widget',
      widgetType: 'theme-site-logo',
      isInner: false,
      settings: {
        custom_image: {
          url: `data:image/svg+xml;utf8,${encodeURIComponent(node.svg.markup)}`,
          id: '',
        },
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
      custom_image: media,
      use_custom_image: 'yes',
      width: { unit: 'px', size: w, sizes: [] },
    },
    elements: [],
  };
}

function buildImage(node, allocId, resolveMedia) {
  const sha = (node.image && node.image.sha256) || (node.svg && node.svg.sha256) || '';
  const media = resolveMedia ? resolveMedia(sha, (node.image && node.image.dataUri) || '') : { id: 0, url: '' };
  const w = node.layout && node.layout.width ? Number(node.layout.width) : null;
  const h = node.layout && node.layout.height ? Number(node.layout.height) : null;

  // If this image is an SVG graphic and not uploaded to WP media (e.g. direct Clipboard Ctrl+V):
  if (node.svg && node.svg.markup && (!media || !media.url)) {
    return {
      id: allocId(node.id),
      elType: 'widget',
      widgetType: 'html',
      isInner: false,
      settings: {
        html: `<div class="f2e-image-svg" style="display:inline-flex;align-items:center;${w ? `width:${w}px;` : ''}${h ? `height:${h}px;` : ''}line-height:0;">${node.svg.markup}</div>`,
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
    id: allocId(node.id),
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
  const sha = node.svg && node.svg.sha256 ? node.svg.sha256 : '';
  const media = sha && resolveMedia ? resolveMedia(sha, '') : { id: 0, url: '' };
  const w = Math.max(12, Math.round(Number(node.layout && node.layout.width) || 24));
  const h = Math.max(12, Math.round(Number(node.layout && node.layout.height) || 24));

  if (node.svg && node.svg.markup) {
    if (media && Number(media.id) > 0 && media.url && w <= 64 && h <= 64) {
      return {
        id: allocId(node.id),
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
    return {
      id: allocId(node.id),
      elType: 'widget',
      widgetType: 'html',
      isInner: false,
      settings: {
        html: `<div class="f2e-inline-svg" style="display:inline-flex;align-items:center;justify-content:center;width:${w}px;height:${h}px;line-height:0;">${node.svg.markup}</div>`,
      },
      elements: [],
    };
  }

  const color = (node.svg && node.svg.color) || (node.style && node.style.background) || '#1E293B';
  return {
    id: allocId(node.id),
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
  const html = (node.svg && node.svg.markup) || (node.text && node.text.characters) || '';
  return {
    id: allocId(node.id),
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

function collectSubtreeTexts(node, nodes) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.text && n.text.characters) out.push(n);
    for (const cid of n.children || []) walk(nodes[cid]);
  };
  walk(node);
  return out;
}

function collectSubtreeImages(node, nodes) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.image) out.push(n.image);
    for (const cid of n.children || []) walk(nodes[cid]);
  };
  walk(node);
  return out;
}

function buildBoxWidget(node, nodes, wType, allocId, resolveMedia) {
  const content = node.content || {};
  let title = content.title_text || '';
  let desc = content.description_text || '';
  const texts = collectSubtreeTexts(node, nodes);
  const titleNode = texts[0];
  const descNode = texts[1];

  if (!title) {
    title = (titleNode && titleNode.text && titleNode.text.characters) || content.name || 'Feature Title';
    desc = (descNode && descNode.text && descNode.text.characters) || '';
  }

  const pos = content.position || ((node.layout && node.layout.direction === 'row') ? 'left' : 'top');
  const settings = {
    title_text: title,
    description_text: desc,
    position: pos,
  };
  if (titleNode && titleNode.text && titleNode.text.color) {
    settings.title_color = titleNode.text.color;
    applyGlobalColor(settings, 'title_color', titleNode.text.color);
  }
  if (titleNode && titleNode.text) {
    applyTypographySettings(settings, 'title_typography', titleNode.text, node.responsive);
  }
  if (descNode && descNode.text && descNode.text.color) {
    settings.description_color = descNode.text.color;
    applyGlobalColor(settings, 'description_color', descNode.text.color);
  }
  if (descNode && descNode.text) {
    applyTypographySettings(settings, 'description_typography', descNode.text, node.responsive);
  }

  const sha = (node.raster && node.raster.sha256) || (node.image && node.image.sha256) || (node.svg && node.svg.sha256) || '';
  const fallback = (node.raster && node.raster.dataUri) || (node.image && node.image.dataUri) || '';
  const media = resolveMedia ? resolveMedia(sha, fallback) : { id: 0, url: '' };

  if (wType === 'image-box') {
    if (!media.url) {
      const imgs = collectSubtreeImages(node, nodes);
      settings.image = imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: 0, url: '' };
    } else {
      settings.image = media;
    }
  } else {
    if (media && media.url) {
      settings.selected_icon = { value: media.url, library: 'svg' };
    } else if (node.svg && node.svg.markup) {
      settings.selected_icon = { value: node.svg.markup, library: 'svg' };
    } else {
      settings.selected_icon = { value: 'fas fa-bolt', library: 'fa-solid' };
    }
    settings.primary_color = '#2563EB';
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: wType,
    isInner: false,
    settings,
    elements: [],
  };
}

function buildIconList(node, nodes, allocId) {
  const items = (node.content && node.content.iconList) || [];
  let listData = [];
  if (items.length > 0) {
    listData = items.map((it, idx) => ({
      _id: shortId(`il-${idx}`),
      text: it.text,
      selected_icon: { value: 'fas fa-circle', library: 'fa-solid' },
      link: it.link ? { url: it.link } : undefined,
    }));
  } else {
    const texts = collectSubtreeTexts(node, nodes).filter((t) => t.text.characters.trim().length > 1);
    listData = texts.map((t, idx) => ({
      _id: shortId(`il-${idx}`),
      text: t.text.characters.replace(/^[\u2713\u2714\u2022\u00b7\u25cf\u25cb\u2013\u2014\-*]\s*/, ''),
      selected_icon: { value: 'fas fa-circle', library: 'fa-solid' },
    }));
  }

  const isRow = (node.layout && node.layout.direction === 'row') || (Number(node.layout && node.layout.width) || 0) > 600;
  const gap = Math.max(12, Number(node.layout && node.layout.gap) || 24);
  const color = (node.text && node.text.color) || '#FFFFFF';

  const settings = {
    icon_list: listData,
    view: isRow ? 'inline' : 'traditional',
    space_between: { unit: 'px', size: gap, sizes: [] },
    icon_size: { unit: 'px', size: 6, sizes: [] },
    icon_color: color,
    text_color: color,
  };

  if (color) {
    applyGlobalColor(settings, 'text_color', color);
    applyGlobalColor(settings, 'icon_color', color);
  }

  if (node.text) {
    applyTypographySettings(settings, 'icon_typography', node.text, node.responsive);
    // Fallback for older elementor skins that use generic typography prefix
    if (node.text.fontSize) {
      settings.typography_font_size = { unit: 'px', size: node.text.fontSize, sizes: [] };
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
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'progress',
    isInner: false,
    settings: {
      title: (texts[0] && texts[0].text.characters) || (node.content && node.content.name) || 'Skill',
      percent: { unit: '%', size: 85, sizes: [] },
    },
    elements: [],
  };
}

function buildAlert(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'alert',
    isInner: false,
    settings: {
      alert_title: (texts[0] && texts[0].text.characters) || (node.content && node.content.name) || 'Notice',
      alert_description: (texts[1] && texts[1].text.characters) || '',
    },
    elements: [],
  };
}

function buildNestedAccordion(node, nodes, allocId, buildElement) {
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
        // Skip small right-hand expand/collapse plus/minus icon (<= 28px or named plus/minus/arrow/chevron)
        if ((w <= 26 && h <= 26 && (nm.includes('plus') || nm.includes('minus') || nm.includes('chevron') || nm.includes('arrow'))) || nm === 'icon/plus' || nm === 'icon/minus') {
          continue;
        }
        return { markup: cn.svg.markup, width: w, height: h };
      }
      if (Array.isArray(cn.children)) queue.push(...cn.children);
    }
    return null;
  };

  const count = Math.max(childIds.length, extractedItems.length);
  for (let i = 0; i < count; i += 1) {
    const cid = childIds[i];
    const child = cid ? nodes[cid] : null;
    const ext = extractedItems[i] || null;
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
      if (i === 0 && titleNodeTypo.color && !activeTitleColor) {
        activeTitleColor = titleNodeTypo.color;
      } else if (i > 0 && titleNodeTypo.color && !normalTitleColor) {
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

    const iconInfo = findLeadingIconSvg(child);
    leadingIcons.push(iconInfo);

    const itemId = shortId(cid || `${node.id}-item-${i}`);
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

    const textEditorSettings = {
      editor: `<p style="margin:0;">${effectiveBody}</p>`,
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
      id: allocId(`${cid || node.id}-body-wrap-${i}`),
      elType: 'container',
      isInner: true,
      settings: {
        container_type: 'flex',
        flex_direction: 'column',
        margin: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: false },
        padding: {
          unit: 'px',
          top: '0',
          right: '0',
          bottom: String((rowPadding && rowPadding.bottom) || 20),
          left: String(leftIndent),
          isLinked: false,
        },
      },
      elements: [
        {
          id: allocId(`${cid || node.id}-body-txt-${i}`),
          elType: 'widget',
          widgetType: 'text-editor',
          isInner: false,
          settings: textEditorSettings,
          elements: [],
        },
      ],
    };

    panels.push({
      id: allocId(`${cid || node.id}-panel-${i}`),
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

  const settings = {
    items,
    accordion_item_title_position_horizontal: 'stretch',
    accordion_item_title_icon_position: 'end',
    faq_schema: '',
    content_border_border: 'none',
    _margin: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: false },
    _padding: { unit: 'px', top: '0', right: '0', bottom: '0', left: '0', isLinked: false },
  };

  if (rowPadding) {
    settings.accordion_padding = {
      unit: 'px',
      top: String(rowPadding.top || 20),
      right: String(rowPadding.right || 0),
      bottom: String(rowPadding.bottom || 20),
      left: String(rowPadding.left || 0),
      isLinked: false,
    };
  } else {
    settings.accordion_padding = { unit: 'px', top: '20', right: '0', bottom: '20', left: '0', isLinked: false };
  }

  if (rowBorderWidth && rowBorderColor) {
    settings.accordion_border_normal_border = 'solid';
    settings.accordion_border_normal_width = {
      unit: 'px',
      top: String(rowBorderWidth.top || 0),
      right: String(rowBorderWidth.right || 0),
      bottom: String(rowBorderWidth.bottom || 1),
      left: String(rowBorderWidth.left || 0),
      isLinked: false,
    };
    settings.accordion_border_normal_color = rowBorderColor;
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

  if (normalTitleColor || activeTitleColor) {
    settings.normal_title_color = normalTitleColor || activeTitleColor || '#000000';
    settings.active_title_color = activeTitleColor || normalTitleColor || '#16A34A';
    settings.normal_icon_color = normalTitleColor || '#475569';
    settings.active_icon_color = activeTitleColor || '#16A34A';
  }

  if (leadingIcons.some(Boolean)) {
    const iconW = (leadingIcons.find(Boolean) && leadingIcons.find(Boolean).width) || 40;
    const iconH = (leadingIcons.find(Boolean) && leadingIcons.find(Boolean).height) || 40;
    const padLeft = iconW + 16;
    const cssRules = [
      `selector .e-n-accordion-item-title-text { position: relative; padding-left: ${padLeft}px; display: inline-flex; align-items: center; min-height: ${iconH}px; }`,
      `selector .e-n-accordion-item-title-text:before { content: ''; position: absolute; width: ${iconW}px; height: ${iconH}px; left: 0; top: 50%; transform: translateY(-50%); background-repeat: no-repeat; background-position: center; background-size: contain; }`,
    ];
    leadingIcons.forEach((ic, idx) => {
      if (ic && ic.markup) {
        const encoded = encodeURIComponent(ic.markup.trim().replace(/\s+/g, ' '));
        cssRules.push(`selector .e-n-accordion-item:nth-child(${idx + 1}) .e-n-accordion-item-title-text:before { background-image: url("data:image/svg+xml;utf8,${encoded}"); }`);
      }
    });
    cssRules.push('selector [aria-expanded="true"] { border: none !important; }');
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

function buildNestedTabs(node, nodes, allocId, buildElement) {
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

function buildGalleryOrCarousel(node, nodes, wType, allocId, resolveMedia) {
  const imgs = collectSubtreeImages(node, nodes).map((img) => resolveMedia(img.sha256, img.dataUri));
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
  const texts = collectSubtreeTexts(node, nodes).map((t) => t.text.characters);
  const imgs = collectSubtreeImages(node, nodes);
  const sorted = [...texts].sort((a, b) => b.length - a.length);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'testimonial',
    isInner: false,
    settings: {
      testimonial_content: sorted[0] || 'Great experience working with this team.',
      testimonial_name: sorted[1] || (node.content && node.content.name) || 'Client Name',
      testimonial_job: sorted[2] || 'Customer',
      testimonial_image: imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' },
    },
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
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'social-icons',
    isInner: false,
    settings: { social_icon_list: list },
    elements: [],
  };
}

function buildCounter(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes).map((t) => t.text.characters);
  const numText = texts.find((t) => /\d/.test(t)) || '100';
  const labelText = texts.find((t) => t !== numText) || (node.content && node.content.name) || 'Stats';
  const numMatch = /([0-9.,]+)(.*)/.exec(numText.trim());
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'counter',
    isInner: false,
    settings: {
      starting_number: 0,
      ending_number: Number(((numMatch && numMatch[1]) || '100').replace(/,/g, '')) || 100,
      suffix: (numMatch && numMatch[2]) || '',
      title: labelText,
    },
    elements: [],
  };
}

// ── Elementor Pro Widget Builders ──

function buildProForm(node, nodes, allocId) {
  const formFields = [];
  let submitLabel = (node.content && node.content.submitLabel) || 'Send Message';

  if (node.content && Array.isArray(node.content.formFields) && node.content.formFields.length > 0) {
    for (const [idx, f] of node.content.formFields.entries()) {
      formFields.push({
        _id: shortId(`${node.id}-fld-${idx}`),
        custom_id: `field_${idx + 1}`,
        field_type: f.type || 'text',
        field_label: f.label,
        placeholder: f.placeholder || f.label,
        required: f.required ? 'true' : '',
        width: '100',
      });
    }
  } else {
    let idx = 1;
    for (const cid of node.children || []) {
      const child = nodes[cid];
      if (!child) continue;
      if (child.widget === 'button') {
        submitLabel = (child.content && (child.content.characters || child.content.name)) || submitLabel;
        continue;
      }
      const texts = collectSubtreeTexts(child, nodes).map((t) => t.text.characters);
      const label = texts[0] || (child.content && child.content.name) || `Field ${idx}`;
      const lower = label.toLowerCase();
      let fieldType = 'text';
      if (lower.includes('email') || lower.includes('mail')) fieldType = 'email';
      else if (lower.includes('phone') || lower.includes('tel') || lower.includes('số điện thoại')) fieldType = 'tel';
      else if (lower.includes('message') || lower.includes('comment') || lower.includes('nội dung') || (Number(child.layout && child.layout.height) || 0) >= 90) fieldType = 'textarea';

      formFields.push({
        _id: shortId(cid),
        custom_id: `field_${idx}`,
        field_type: fieldType,
        field_label: label,
        placeholder: texts[1] || label,
        required: lower.includes('email') || lower.includes('name') ? 'true' : '',
        width: '100',
      });
      idx += 1;
    }
  }

  if (formFields.length === 0) {
    formFields.push(
      { _id: shortId('f1'), custom_id: 'name', field_type: 'text', field_label: 'Name', placeholder: 'Your Name', width: '100' },
      { _id: shortId('f2'), custom_id: 'email', field_type: 'email', field_label: 'Email', placeholder: 'your@email.com', required: 'true', width: '100' }
    );
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'form',
    isInner: false,
    settings: {
      form_name: (node.content && node.content.name) || 'Figma Form',
      form_fields: formFields,
      button_text: submitLabel,
      button_size: 'md',
    },
    elements: [],
  };
}

function buildProNavMenu(node, nodes, allocId) {
  const menuItems = (node.content && node.content.menuItems) || [];
  let items = menuItems.map((m) => (typeof m === 'string' ? m : m.name));
  if (items.length === 0) {
    items = collectSubtreeTexts(node, nodes).map((t) => t.text.characters);
  }
  if (items.length === 0) {
    items = ['Trang chủ', 'Dịch vụ', 'Giới thiệu', 'Liên hệ'];
  }

  const settings = {
    layout: (node.layout && node.layout.direction === 'column') ? 'vertical' : 'horizontal',
    align_items: 'center',
    pointer: 'underline',
    _f2e_menu_items: items,
  };

  if (node.text) {
    if (node.text.fontSize) {
      settings.typography_font_size = { unit: 'px', size: node.text.fontSize, sizes: [] };
    }
    if (node.text.fontFamily) {
      settings.typography_font_family = node.text.fontFamily;
    }
    if (node.text.fontWeight) {
      settings.typography_font_weight = node.text.fontWeight;
    }
    if (node.text.color) {
      settings.color_menu_item = node.text.color;
    }
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'nav-menu',
    isInner: false,
    settings,
    elements: [],
  };
}

function buildProCta(node, nodes, allocId, resolveMedia) {
  const texts = collectSubtreeTexts(node, nodes).map((t) => t.text.characters);
  const imgs = collectSubtreeImages(node, nodes);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'call-to-action',
    isInner: false,
    settings: {
      skin: 'classic',
      title: texts[0] || (node.content && node.content.name) || 'Call to Action',
      description: texts[1] || '',
      button: texts[2] || 'Learn More',
      bg_image: imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' },
    },
    elements: [],
  };
}

function buildProPriceTable(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes).map((t) => t.text.characters);
  const priceText = texts.find((t) => /[$€£₫¥]|\d+\s*\/\s*(mo|yr|tháng|năm)/i.test(t) || /^\$?\d+$/.test(t.trim())) || '49';
  const numericPrice = priceText.replace(/[^0-9.]/g, '') || '49';
  const heading = texts[0] || (node.content && node.content.name) || 'Pro Plan';
  const features = texts.slice(2).map((ft, idx) => ({
    _id: shortId(`feat-${idx}`),
    item_text: ft,
    selected_icon: { value: 'fas fa-check', library: 'fa-solid' },
  }));

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'price-table',
    isInner: false,
    settings: {
      heading,
      sub_heading: texts[1] && texts[1] !== priceText ? texts[1] : 'Monthly Plan',
      price: numericPrice,
      currency_symbol: 'dollar',
      period: 'Monthly',
      features_list: features,
      button_text: texts[texts.length - 1] || 'Get Started',
    },
    elements: [],
  };
}

function buildProFlipBox(node, nodes, allocId) {
  const texts = collectSubtreeTexts(node, nodes).map((t) => t.text.characters);
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'flip-box',
    isInner: false,
    settings: {
      title_text_a: texts[0] || (node.content && node.content.name) || 'Front Title',
      description_text_a: texts[1] || '',
      title_text_b: texts[2] || texts[0] || 'Back Title',
      description_text_b: texts[3] || texts[1] || '',
      button_text: texts[4] || 'Read More',
    },
    elements: [],
  };
}

function buildProSlides(node, nodes, allocId, resolveMedia) {
  const slides = [];
  for (const cid of node.children || []) {
    const child = nodes[cid];
    if (!child) continue;
    const texts = collectSubtreeTexts(child, nodes).map((t) => t.text.characters);
    const imgs = collectSubtreeImages(child, nodes);
    const media = imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' };
    slides.push({
      _id: shortId(cid),
      heading: texts[0] || (child.content && child.content.name) || 'Slide Heading',
      description: texts[1] || '',
      button_text: texts[2] || 'Click Here',
      background_color: (child.style && child.style.background) || '#1E293B',
      background_image: media,
    });
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'slides',
    isInner: false,
    settings: {
      slides,
      slides_height: { unit: 'px', size: Math.max(360, Number(node.layout && node.layout.height) || 500), sizes: [] },
    },
    elements: [],
  };
}

function buildProLoopGrid(node, allocId, wType = 'loop-grid') {
  const cols = Number(node.layout && node.layout.columns) || 3;
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: wType,
    isInner: false,
    settings: {
      template_id: '',
      posts_per_page: 6,
      columns: String(cols),
      row_gap: { unit: 'px', size: Number(node.layout && node.layout.gap) || 24, sizes: [] },
    },
    elements: [],
  };
}

function buildGenericProWidget(node, nodes, wType, allocId) {
  const texts = collectSubtreeTexts(node, nodes).map((t) => t.text.characters);
  const settings = {};
  if (wType === 'blockquote') {
    settings.blockquote_content = texts[0] || (node.content && node.content.name) || '';
    settings.tweet_button_Label = 'Tweet';
  } else if (wType === 'animated-headline') {
    settings.before_text = texts[0] || '';
    settings.highlighted_text = texts[1] || (node.content && node.content.name) || '';
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: wType,
    isInner: false,
    settings,
    elements: [],
  };
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
