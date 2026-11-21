/**
 * 3-Layer Widget Resolver (Override -> Naming Convention -> Heuristics)
 * Covers the full Elementor Free + Elementor Pro widget catalog with official eicon names.
 */

export const WIDGET_PLUGIN_KEY = 'f2e-widget';

export const WIDGET_CATALOG = [
  // ── Layout & Containers ──
  { value: 'container', label: 'Flexbox Container', category: 'Layout', icon: 'container', pro: false },
  { value: 'container-grid', label: 'Grid Container (CSS Grid)', category: 'Layout', icon: 'container-grid', pro: false },
  { value: 'inner-section', label: 'Inner Section / Columns', category: 'Layout', icon: 'columns', pro: false },
  { value: 'unwrap', label: 'Bỏ qua Container (Unwrap - Giữ con)', category: 'Layout', icon: 'unwrap', pro: false },

  // ── Basic (Elementor Free) ──
  { value: 'heading', label: 'Heading (H1–H6)', category: 'Basic (Free)', icon: 't-letter', pro: false },
  { value: 'text-editor', label: 'Text Editor (Paragraph)', category: 'Basic (Free)', icon: 'text', pro: false },
  { value: 'button', label: 'Button', category: 'Basic (Free)', icon: 'button', pro: false },
  { value: 'image', label: 'Image', category: 'Basic (Free)', icon: 'image', pro: false },
  { value: 'icon', label: 'Icon / Inline SVG', category: 'Basic (Free)', icon: 'favorite', pro: false },
  { value: 'video', label: 'Video (YouTube/MP4)', category: 'Basic (Free)', icon: 'youtube', pro: false },
  { value: 'divider', label: 'Divider', category: 'Basic (Free)', icon: 'divider', pro: false },
  { value: 'spacer', label: 'Spacer', category: 'Basic (Free)', icon: 'spacer', pro: false },
  { value: 'google_maps', label: 'Google Maps', category: 'Basic (Free)', icon: 'google-maps', pro: false },
  { value: 'html', label: 'Custom HTML / Inline SVG', category: 'Basic (Free)', icon: 'code', pro: false },

  // ── General & Interactive (Elementor Free) ──
  { value: 'icon-box', label: 'Icon Box', category: 'General (Free)', icon: 'icon-box', pro: false },
  { value: 'image-box', label: 'Image Box', category: 'General (Free)', icon: 'image-box', pro: false },
  { value: 'icon-list', label: 'Icon List', category: 'General (Free)', icon: 'bullet-list', pro: false },
  { value: 'counter', label: 'Counter / Stats', category: 'General (Free)', icon: 'counter', pro: false },
  { value: 'progress', label: 'Progress Bar', category: 'General (Free)', icon: 'skill-bar', pro: false },
  { value: 'testimonial', label: 'Testimonial', category: 'General (Free)', icon: 'testimonial', pro: false },
  { value: 'nested-tabs', label: 'Nested Tabs', category: 'General (Free)', icon: 'tabs', pro: false },
  { value: 'tabs', label: 'Tabs (Classic)', category: 'General (Free)', icon: 'tabs', pro: false },
  { value: 'nested-accordion', label: 'Nested Accordion / FAQ', category: 'General (Free)', icon: 'accordion', pro: false },
  { value: 'accordion', label: 'Accordion (Classic)', category: 'General (Free)', icon: 'accordion', pro: false },
  { value: 'toggle', label: 'Toggle', category: 'General (Free)', icon: 'toggle', pro: false },
  { value: 'social-icons', label: 'Social Icons', category: 'General (Free)', icon: 'social-icons', pro: false },
  { value: 'alert', label: 'Alert Notice', category: 'General (Free)', icon: 'alert', pro: false },
  { value: 'audio', label: 'SoundCloud / Audio', category: 'General (Free)', icon: 'headphones', pro: false },
  { value: 'shortcode', label: 'Shortcode', category: 'General (Free)', icon: 'shortcode', pro: false },
  { value: 'menu-anchor', label: 'Menu Anchor', category: 'General (Free)', icon: 'anchor', pro: false },
  { value: 'sidebar', label: 'Sidebar', category: 'General (Free)', icon: 'sidebar', pro: false },
  { value: 'read-more', label: 'Read More', category: 'General (Free)', icon: 'post-excerpt', pro: false },
  { value: 'star-rating', label: 'Star Rating', category: 'General (Free)', icon: 'rating', pro: false },
  { value: 'image-carousel', label: 'Image Carousel', category: 'General (Free)', icon: 'slider-push', pro: false },
  { value: 'image-gallery', label: 'Basic Gallery', category: 'General (Free)', icon: 'gallery-grid', pro: false },
  { value: 'text-path', label: 'Text Path', category: 'General (Free)', icon: 'wordart', pro: false },

  // ── Elementor Pro (Marketing, Forms, Menus, Sliders, Dynamic) ──
  { value: 'form', label: 'Form (Contact / Lead)', category: 'Elementor Pro', icon: 'form-horizontal', pro: true },
  { value: 'nav-menu', label: 'Nav Menu', category: 'Elementor Pro', icon: 'nav-menu', pro: true },
  { value: 'mega-menu', label: 'Mega Menu', category: 'Elementor Pro', icon: 'mega-menu', pro: true },
  { value: 'call-to-action', label: 'Call to Action (CTA)', category: 'Elementor Pro', icon: 'image-rollover', pro: true },
  { value: 'price-table', label: 'Price Table', category: 'Elementor Pro', icon: 'price-table', pro: true },
  { value: 'price-list', label: 'Price List / Catalog', category: 'Elementor Pro', icon: 'price-list', pro: true },
  { value: 'flip-box', label: 'Flip Box', category: 'Elementor Pro', icon: 'flip-box', pro: true },
  { value: 'slides', label: 'Slides (Hero Slider)', category: 'Elementor Pro', icon: 'slides', pro: true },
  { value: 'nested-carousel', label: 'Nested Carousel', category: 'Elementor Pro', icon: 'slider-push', pro: true },
  { value: 'media-carousel', label: 'Media Carousel', category: 'Elementor Pro', icon: 'media-carousel', pro: true },
  { value: 'testimonial-carousel', label: 'Testimonial Carousel', category: 'Elementor Pro', icon: 'testimonial-carousel', pro: true },
  { value: 'reviews', label: 'Reviews', category: 'Elementor Pro', icon: 'review', pro: true },
  { value: 'loop-grid', label: 'Loop Grid (Posts/Products)', category: 'Elementor Pro', icon: 'loop-builder', pro: true },
  { value: 'loop-carousel', label: 'Loop Carousel', category: 'Elementor Pro', icon: 'carousel-loop', pro: true },
  { value: 'posts', label: 'Posts Grid', category: 'Elementor Pro', icon: 'post-list', pro: true },
  { value: 'portfolio', label: 'Portfolio', category: 'Elementor Pro', icon: 'gallery-grid', pro: true },
  { value: 'gallery', label: 'Pro Gallery (Justified/Masonry)', category: 'Elementor Pro', icon: 'gallery-justified', pro: true },
  { value: 'animated-headline', label: 'Animated Headline', category: 'Elementor Pro', icon: 'animated-headline', pro: true },
  { value: 'blockquote', label: 'Blockquote', category: 'Elementor Pro', icon: 'blockquote', pro: true },
  { value: 'countdown', label: 'Countdown Timer', category: 'Elementor Pro', icon: 'countdown', pro: true },
  { value: 'share-buttons', label: 'Share Buttons', category: 'Elementor Pro', icon: 'share', pro: true },
  { value: 'table-of-contents', label: 'Table of Contents', category: 'Elementor Pro', icon: 'table-of-contents', pro: true },
  { value: 'login', label: 'Login Form', category: 'Elementor Pro', icon: 'lock-user', pro: true },
  { value: 'search-form', label: 'Search Form', category: 'Elementor Pro', icon: 'site-search', pro: true },
  { value: 'lottie', label: 'Lottie Animation', category: 'Elementor Pro', icon: 'lottie', pro: true },
  { value: 'hotspot', label: 'Image Hotspot', category: 'Elementor Pro', icon: 'image-hotspot', pro: true },
  { value: 'video-playlist', label: 'Video Playlist', category: 'Elementor Pro', icon: 'video-playlist', pro: true },
  { value: 'off-canvas', label: 'Off-Canvas Panel', category: 'Elementor Pro', icon: 'off-canvas', pro: true },
  { value: 'paypal-button', label: 'PayPal Button', category: 'Elementor Pro', icon: 'paypal-button', pro: true },
  { value: 'stripe-button', label: 'Stripe Button', category: 'Elementor Pro', icon: 'stripe-button', pro: true },
  { value: 'progress-tracker', label: 'Progress Tracker', category: 'Elementor Pro', icon: 'progress-tracker', pro: true },
  { value: 'taxonomy-filter', label: 'Taxonomy Filter', category: 'Elementor Pro', icon: 'taxonomy-filter', pro: true },

  // ── Theme Builder & WooCommerce (Elementor Pro) ──
  { value: 'theme-site-logo', label: 'Site Logo', category: 'Theme Builder (Pro)', icon: 'site-logo', pro: true },
  { value: 'theme-site-title', label: 'Site Title', category: 'Theme Builder (Pro)', icon: 'site-title', pro: true },
  { value: 'theme-post-title', label: 'Post / Page Title', category: 'Theme Builder (Pro)', icon: 'post-title', pro: true },
  { value: 'theme-post-excerpt', label: 'Post Excerpt', category: 'Theme Builder (Pro)', icon: 'post-excerpt', pro: true },
  { value: 'theme-post-content', label: 'Post Content', category: 'Theme Builder (Pro)', icon: 'post-content', pro: true },
  { value: 'theme-post-featured-image', label: 'Featured Image', category: 'Theme Builder (Pro)', icon: 'featured-image', pro: true },
  { value: 'author-box', label: 'Author Box', category: 'Theme Builder (Pro)', icon: 'person', pro: true },
  { value: 'post-comments', label: 'Post Comments', category: 'Theme Builder (Pro)', icon: 'comments', pro: true },
  { value: 'post-navigation', label: 'Post Navigation', category: 'Theme Builder (Pro)', icon: 'post-navigation', pro: true },
  { value: 'post-info', label: 'Post Info / Meta', category: 'Theme Builder (Pro)', icon: 'post-info', pro: true },
  { value: 'breadcrumbs', label: 'Breadcrumbs', category: 'Theme Builder (Pro)', icon: 'yoast', pro: true },
  { value: 'sitemap', label: 'Sitemap', category: 'Theme Builder (Pro)', icon: 'sitemap', pro: true },
  { value: 'woocommerce-products', label: 'WooCommerce Products', category: 'WooCommerce (Pro)', icon: 'products', pro: true },
  { value: 'woocommerce-product-add-to-cart', label: 'Woo Add To Cart', category: 'WooCommerce (Pro)', icon: 'product-add-to-cart', pro: true },
  { value: 'woocommerce-menu-cart', label: 'Woo Menu Cart', category: 'WooCommerce (Pro)', icon: 'cart', pro: true },
  { value: 'woocommerce-cart', label: 'Woo Cart Page', category: 'WooCommerce (Pro)', icon: 'woo-cart', pro: true },
  { value: 'woocommerce-checkout-page', label: 'Woo Checkout Page', category: 'WooCommerce (Pro)', icon: 'checkout', pro: true },
  { value: 'woocommerce-my-account', label: 'Woo My Account', category: 'WooCommerce (Pro)', icon: 'my-account', pro: true },

  // ── Skip ──
  { value: 'skip', label: 'Bỏ qua Layer (Skip)', category: 'System', icon: 'ban', pro: false },
];

export const SUPPORTED_WIDGETS = WIDGET_CATALOG.map((w) => w.value);

export const CONTAINER_WIDGETS = new Set([
  'container',
  'container-grid',
  'inner-section',
  'unwrap',
  'nested-tabs',
  'nested-accordion',
  'nested-carousel',
  'off-canvas',
]);

export function isAtomicLeafWidget(widget) {
  if (!widget) return false;
  if (widget === 'skip') return true;
  if (widget === 'unwrap') return false;
  return !CONTAINER_WIDGETS.has(widget);
}

export function isContainerWidget(widget) {
  return CONTAINER_WIDGETS.has(widget);
}

export function isAtomicWidget(widget) {
  return !CONTAINER_WIDGETS.has(widget);
}

const NAMING_ALIASES = {
  // Basic
  btn: 'button',
  button: 'button',
  cta_btn: 'button',
  'button-primary': 'button',
  'button-secondary': 'button',
  heading: 'heading',
  title: 'heading',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  text: 'text-editor',
  paragraph: 'text-editor',
  desc: 'text-editor',
  description: 'text-editor',
  'hero-desc': 'text-editor',
  img: 'image',
  image: 'image',
  picture: 'image',
  photo: 'image',
  icon: 'icon',
  svg: 'icon',
  logo: 'theme-site-logo',
  sitelogo: 'theme-site-logo',
  'site-logo': 'theme-site-logo',
  'theme-site-logo': 'theme-site-logo',
  divider: 'divider',
  line: 'divider',
  hr: 'divider',
  spacer: 'spacer',
  video: 'video',
  map: 'google_maps',
  maps: 'google_maps',
  'google-maps': 'google_maps',
  html: 'html',

  // General & Interactive
  'icon-box': 'icon-box',
  iconbox: 'icon-box',
  'image-box': 'image-box',
  imagebox: 'image-box',
  'icon-list': 'icon-list',
  iconlist: 'icon-list',
  checklist: 'icon-list',
  accordion: 'nested-accordion',
  faq: 'nested-accordion',
  toggle: 'toggle',
  tabs: 'nested-tabs',
  tab: 'nested-tabs',
  carousel: 'image-carousel',
  slider: 'image-carousel',
  gallery: 'image-gallery',
  testimonial: 'testimonial',
  review: 'reviews',
  reviews: 'reviews',
  rating: 'star-rating',
  stars: 'star-rating',
  social: 'social-icons',
  'social-icons': 'social-icons',
  counter: 'counter',
  progress: 'progress',
  alert: 'alert',
  shortcode: 'shortcode',
  anchor: 'menu-anchor',

  // Elementor Pro
  form: 'form',
  'contact-form': 'form',
  newsletter: 'form',
  nav: 'nav-menu',
  navbar: 'nav-menu',
  menu: 'nav-menu',
  'nav-menu': 'nav-menu',
  'mega-menu': 'mega-menu',
  cta: 'call-to-action',
  'call-to-action': 'call-to-action',
  pricing: 'price-table',
  'price-table': 'price-table',
  pricetable: 'price-table',
  'price-list': 'price-list',
  flipbox: 'flip-box',
  'flip-box': 'flip-box',
  slides: 'slides',
  'hero-slides': 'slides',
  loop: 'loop-grid',
  'loop-grid': 'loop-grid',
  'loop-carousel': 'loop-carousel',
  posts: 'posts',
  portfolio: 'portfolio',
  blockquote: 'blockquote',
  quote: 'blockquote',
  countdown: 'countdown',
  share: 'share-buttons',
  'share-buttons': 'share-buttons',
  toc: 'table-of-contents',
  'table-of-contents': 'table-of-contents',
  login: 'login',
  search: 'search-form',
  'search-form': 'search-form',
  lottie: 'lottie',
  hotspot: 'hotspot',
  'site-logo': 'theme-site-logo',
  'site-title': 'theme-site-title',
  'post-title': 'theme-post-title',
  'post-content': 'theme-post-content',
  'featured-image': 'theme-post-featured-image',
  'author-box': 'author-box',
  breadcrumbs: 'breadcrumbs',
  sitemap: 'sitemap',
  products: 'woocommerce-products',
  'add-to-cart': 'woocommerce-product-add-to-cart',
  'menu-cart': 'woocommerce-menu-cart',
  skip: 'skip',
  ignore: 'skip',
  unwrap: 'unwrap',
  'unwrap-container': 'unwrap',
  flatten: 'unwrap',
};

const VECTOR_TYPES = new Set([
  'VECTOR',
  'BOOLEAN_OPERATION',
  'STAR',
  'POLYGON',
]);

export function visibleChildren(node) {
  if (!node || !Array.isArray(node.children)) return [];
  return node.children.filter((child) => child && child.visible !== false);
}

export function hasImageFill(node) {
  return Array.isArray(node && node.fills) && node.fills.some((fill) => fill && fill.type === 'IMAGE' && fill.visible !== false);
}

export function hasSolidOrGradientFill(node) {
  return Array.isArray(node && node.fills) && node.fills.some((fill) => fill && (fill.type === 'SOLID' || String(fill.type || '').startsWith('GRADIENT_')) && fill.visible !== false);
}

/**
 * Checks if a node is a pure vector icon or a composite vector graphic (such as a multi-path SVG logo).
 * When true, the entire node is exported as a single composite SVG instead of splitting into 20 tiny containers!
 */
export function isVectorGraphic(node, depth = 0) {
  if (!node) return false;
  if (VECTOR_TYPES.has(node.type)) return true;
  if (depth > 6) return false;

  const kids = visibleChildren(node);
  if (kids.length === 0) return false;
  if (hasImageFill(node)) return false;

  // A vector graphic / illustration / SVG icon NEVER contains any TEXT descendants!
  const texts = collectTextDescendants(node);
  if (texts.length > 0) return false;

  let hasAtLeastOneVector = false;
  const allVectorCompatible = kids.every((child) => {
    if (!child || child.type === 'TEXT' || hasImageFill(child)) return false;
    if (VECTOR_TYPES.has(child.type)) {
      hasAtLeastOneVector = true;
      return true;
    }
    if (child.type === 'LINE' || child.type === 'ELLIPSE' || child.type === 'RECTANGLE') {
      return true;
    }
    if (isVectorGraphic(child, depth + 1)) {
      hasAtLeastOneVector = true;
      return true;
    }
    return false;
  });

  return allVectorCompatible && hasAtLeastOneVector;
}

export function collectTextDescendants(node, depth = 0) {
  if (!node || depth > 4) return [];
  const found = [];
  for (const child of visibleChildren(node)) {
    if (child.type === 'TEXT' && String(child.characters || '').trim() !== '') {
      found.push(child);
    } else {
      found.push(...collectTextDescendants(child, depth + 1));
    }
  }
  return found;
}

/**
 * Layer 1: Explicit plugin override (`node.getPluginData('f2e-widget')`)
 * Layer 2: Bracket tag `[btn]`, `[form]` or token naming convention
 * Layer 3: Structural Heuristics
 */
export function resolveWidget(node) {
  if (!node) return { widget: 'container', source: 'heuristic' };

  // 1. Explicit Override via UI Tagging
  const explicit = typeof node.getPluginData === 'function' ? node.getPluginData(WIDGET_PLUGIN_KEY) : '';
  if (explicit && SUPPORTED_WIDGETS.includes(explicit)) {
    const kids = visibleChildren(node);
    // Auto-heal 1: Never allow AI/override 'skip' to delete a structural divider line (LINE / 1px vector divider)
    if (explicit === 'skip' && isDividerNode(node, kids)) {
      return { widget: 'divider', source: 'auto-heal' };
    }
    // Auto-heal 2: An icon-box requires BOTH a title AND a description (2+ texts).
    // If a frame only has 1 text block + an icon (like a Situation card), keep it as a Container
    // so the inline SVG icon, gap, alignment, and borders render with 100% visual accuracy!
    if (explicit === 'icon-box') {
      const texts = collectTextDescendants(node);
      if (texts.length <= 1) {
        return { widget: 'container', source: 'auto-heal' };
      }
    }
    return { widget: explicit, source: 'override' };
  }

  const rawName = String(node.name || '').trim();
  const lowerName = rawName.toLowerCase();

  // 2A. Explicit bracket tag in layer name: e.g. "[form] Contact", "[price-table] Pro Plan", "[btn] Submit"
  const bracketMatch = /\[([a-z0-9_-]+)\]/i.exec(lowerName);
  if (bracketMatch) {
    const tag = bracketMatch[1].toLowerCase();
    const mapped = NAMING_ALIASES[tag] || (SUPPORTED_WIDGETS.includes(tag) ? tag : null);
    if (mapped) {
      return { widget: mapped, source: 'name-tag' };
    }
  }

  // 2A-Divider. Check if node is a horizontal or vertical divider line BEFORE generic vector graphic check
  // so 1px VECTOR lines become 'divider' instead of 'icon'!
  if (node.type !== 'TEXT' && isDividerNode(node, visibleChildren(node))) {
    return { widget: 'divider', source: 'heuristic' };
  }

  // 2B. If the entire node is a pure vector graphic (icons, SVG logos, illustrations, watermarks),
  // classify it as a single SVG leaf widget (icon if <= 128px, image/SVG illustration if > 128px)
  if (node.type !== 'TEXT' && isVectorGraphic(node)) {
    const w = Number(node.width) || 0;
    const h = Number(node.height) || 0;
    return { widget: (w <= 128 && h <= 128) ? 'icon' : 'image', source: 'heuristic' };
  }

  // 2C. Full-name alias match first (e.g. "button-primary", "hero-desc", "nav-menu")
  if (NAMING_ALIASES[lowerName] && candidateFitsNode(node, NAMING_ALIASES[lowerName])) {
    return { widget: NAMING_ALIASES[lowerName], source: 'name' };
  }

  // 2D. Token-based naming convention
  const tokens = lowerName.split(/[\/:\-_\s]+/).filter(Boolean);
  for (const token of tokens) {
    // Do not let generic container names like "cta", "text", "title", "card", "stat" turn a multi-element wrapper into a leaf widget!
    if (node.type !== 'TEXT' && ['text', 'title', 'desc', 'description', 'cta', 'link', 'stat', 'stats', 'card', 'box', 'item', 'row', 'col', 'column', 'wrapper', 'container', 'group', 'section', 'header', 'footer'].includes(token)) {
      continue;
    }
    if (node.type === 'TEXT' && token === 'text') continue;
    const candidate = NAMING_ALIASES[token] || (SUPPORTED_WIDGETS.includes(token) ? token : null);
    if (candidate && candidateFitsNode(node, candidate)) {
      return { widget: candidate, source: 'name' };
    }
  }

  // 3. Structural Heuristics
  return classifyByHeuristics(node);
}

function candidateFitsNode(node, widget) {
  const kids = visibleChildren(node);
  if (widget === 'heading' || widget === 'text-editor') {
    return node.type === 'TEXT';
  }
  if (widget === 'image') {
    return hasImageFill(node) || (kids.length === 0 && node.type === 'RECTANGLE');
  }
  if (widget === 'icon') {
    return isVectorGraphic(node);
  }
  if (widget === 'button') {
    if (node.type === 'TEXT') return true;
    const texts = collectTextDescendants(node);
    // A button has 1 text label (not 2+ sibling buttons like a "cta" wrapper)
    return texts.length === 1 && (Number(node.height) || 0) <= 96 && (Number(node.width) || 0) <= 420;
  }
  if (widget === 'counter') {
    // A counter widget is an atomic widget that displays a single number + optional title.
    // It is NEVER a container/card with multiple children (like stat card with icons, dividers, buttons)!
    if (kids.length >= 2) return false;
    const lower = String(node.name || '').toLowerCase();
    if (lower.includes('card') || lower.includes('row') || lower.includes('box') || lower.includes('container') || lower.includes('section')) {
      return false;
    }
  }
  if (widget === 'nav-menu') {
    // A nav-menu is a compact list of text links, not an entire header containing logo + nav + CTA button
    const texts = collectTextDescendants(node);
    return kids.length >= 2 && kids.length <= 10 && texts.length === kids.length;
  }
  if (['nested-accordion', 'nested-tabs', 'accordion', 'tabs', 'toggle', 'image-carousel', 'image-gallery', 'form', 'loop-grid', 'social-icons', 'slides'].includes(widget)) {
    return kids.length >= 1;
  }
  if (['icon-box', 'image-box'].includes(widget)) {
    return kids.length >= 2 && collectTextDescendants(node).length >= 2;
  }
  if (['call-to-action', 'price-table', 'flip-box', 'testimonial'].includes(widget)) {
    return kids.length >= 2;
  }
  return true;
}

function classifyByHeuristics(node) {
  const kids = visibleChildren(node);

  // TEXT node -> Heading or Text Editor
  if (node.type === 'TEXT') {
    const text = String(node.characters || '').trim();
    if (text === '') return { widget: 'skip', source: 'heuristic' };
    const size = typeof node.fontSize === 'number' ? node.fontSize : 16;
    const styleName = String((node.fontName && node.fontName.style) || '').toLowerCase();
    const isBold = styleName.includes('bold') || styleName.includes('black') || styleName.includes('heavy') || styleName.includes('semibold');
    const isNumberStat = /^[\d$€£₫¥%+\s.-]{1,8}$/.test(text);

    if (text.length > 120 || text.includes('\n\n')) {
      return { widget: 'text-editor', source: 'heuristic' };
    }
    if (size >= 20 || (size >= 16 && isBold && text.length <= 60 && !text.includes('\n')) || isNumberStat) {
      return { widget: 'heading', source: 'heuristic' };
    }
    return { widget: 'text-editor', source: 'heuristic' };
  }

  // Divider (LINE or very thin rectangle/vector, including 0px width/height straight vector paths)
  if (isDividerNode(node, kids)) {
    return { widget: 'divider', source: 'heuristic' };
  }

  // Vector graphic, illustration, background watermark, or pure vector group -> Icon or Image (SVG)
  if (isVectorGraphic(node)) {
    const w = Number(node.width) || 0;
    const h = Number(node.height) || 0;
    return { widget: (w <= 128 && h <= 128) ? 'icon' : 'image', source: 'heuristic' };
  }

  // Leaf with Image fill -> Image widget
  if (hasImageFill(node) && kids.length === 0) {
    return { widget: 'image', source: 'heuristic' };
  }

  // Button heuristic (compact container with 1 text label and optional 1 icon)
  if (isButtonNode(node, kids)) {
    return { widget: 'button', source: 'heuristic' };
  }

  // Gallery heuristic (2+ sibling images with no text)
  if (kids.length >= 2 && kids.every((child) => hasImageFill(child) && visibleChildren(child).length === 0)) {
    return { widget: 'image-gallery', source: 'heuristic' };
  }

  // Icon List heuristic (horizontal ticker strip or vertical bullet list: dot/check + text)
  if (isIconListNode(node, kids)) {
    return { widget: 'icon-list', source: 'heuristic' };
  }

  // Spacer heuristic (empty transparent box)
  if (kids.length === 0 && !hasSolidOrGradientFill(node) && !hasImageFill(node) && node.type !== 'TEXT') {
    return { widget: 'spacer', source: 'heuristic' };
  }

  return { widget: 'container', source: 'heuristic' };
}

export function isDividerNode(node, kids = []) {
  if (!node || kids.length > 0) return false;
  if (node.type === 'LINE') return true;
  // A divider / accent line can be a RECTANGLE, FRAME, or VECTOR with very small height (<= 6px, including 0px on straight horizontal vectors)
  // or very small width (<= 6px, including 0px on straight vertical vectors)
  const w = Number(node.width) || 0;
  const h = Number(node.height) || 0;
  if (w <= 0 && h <= 0) return false;
  return (h >= 0 && h <= 6 && w >= 16) || (w >= 0 && w <= 6 && h >= 16);
}

function isButtonNode(node, kids) {
  if (kids.length === 0 || kids.length > 2) return false;
  const texts = collectTextDescendants(node);
  if (texts.length !== 1) return false;
  const label = String(texts[0].characters || '').trim();
  if (label.length < 2 || label.length > 36 || label.includes('\n')) return false;

  const w = Number(node.width) || 0;
  const h = Number(node.height) || 0;
  if (h < 28 || h > 72 || w < 64 || w > 360) return false;

  const lower = String(node.name || '').toLowerCase();
  // Do not turn small chips/tags/badges into full Elementor buttons unless named like a button/cta/link
  if (lower.includes('chip') || lower.includes('badge') || lower.includes('tag') || lower.includes('check')) {
    return false;
  }
  const hasStroke = Array.isArray(node.strokes) && node.strokes.some((s) => s && s.visible !== false);
  const hasRadius = typeof node.cornerRadius === 'number' && node.cornerRadius >= 4;
  return (hasSolidOrGradientFill(node) || hasStroke || hasRadius) && w >= h * 1.4;
}

function isIconListNode(node, kids) {
  if (kids.length < 2 || kids.length > 20) return false;
  const nodeH = Number(node.height) || 0;
  // A large section (> 400px tall) is never a single icon list
  if (nodeH > 400) return false;

  // Case A: Every child is an item containing (icon/shape/dot + 1 text)
  const isEveryChildBullet = kids.every((child) => {
    const childW = Number(child.width) || 0;
    const childH = Number(child.height) || 0;
    // An individual bullet item is never a massive column or multi-element card
    if (childH > 96 || (childW > 480 && nodeH > 80)) return false;

    const childKids = visibleChildren(child);
    if (childKids.length < 1 || childKids.length > 4) return false;
    const texts = collectTextDescendants(child);
    if (texts.length !== 1) return false;
    const textLen = String(texts[0].characters || '').trim().length;
    if (textLen < 2 || textLen > 100) return false;
    const shapes = childKids.filter((k) => k.type !== 'TEXT');
    if (shapes.length > 0) {
      return shapes.every((s) => (Number(s.width) || 0) <= 40 && (Number(s.height) || 0) <= 40);
    }
    return true;
  });
  if (isEveryChildBullet) return true;

  // Case B: Children are text nodes that start with bullet characters: ✓, ✔, •, ·, -, *
  if (kids.every((child) => child.type === 'TEXT')) {
    const bulletRegex = /^[\u2713\u2714\u2022\u00b7\u25cf\u25cb\u2013\u2014\-*]/;
    const bulletCount = kids.filter((child) => bulletRegex.test(String(child.characters || '').trim())).length;
    if (bulletCount >= 2 && bulletCount >= kids.length * 0.7) {
      return true;
    }
  }

  // Case C: Name hints like "strip", "features", "checklist", "icon-list", "bullet-list"
  const lower = String(node.name || '').toLowerCase();
  if (['strip', 'features', 'checklist', 'bullets', 'icon-list', 'bullet-list'].some((kw) => lower.includes(kw))) {
    const texts = collectTextDescendants(node);
    if (texts.length >= 2 && texts.length <= 16) return true;
  }

  return false;
}
