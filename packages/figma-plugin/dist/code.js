(() => {
  "use strict";

  // ── Module: src/utils/crypto.js ──
/**
 * Pure-JS Crypto, Hashing, and Encoding utilities for the Figma Plugin Sandbox.
 * The Figma main thread sandbox does not expose Web Crypto (`crypto.subtle`)
 * or `TextEncoder` / `btoa`, so all implementations here are dependency-free.
 */function uuid() {
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}-${Math.random().toString(16).slice(2, 10)}`;
}function shortId(seed = '') {
  const randomPart = Math.random().toString(16).slice(2, 9);
  if (!seed) return randomPart.padEnd(7, '0').slice(0, 7);
  let h = 2166136261;
  const str = `${seed}-${randomPart}`;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(7, '0').slice(0, 7);
}

/** UTF-8 encode a string to Uint8Array without TextEncoder */function utf8Bytes(text) {
  const str = String(text || '');
  const out = [];
  for (let i = 0; i < str.length; i += 1) {
    let code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const low = str.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return new Uint8Array(out);
}

/** Decode a Uint8Array of UTF-8 bytes back into a JS string (for SVG exports) */function utf8Decode(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let out = '';
  let i = 0;
  while (i < arr.length) {
    const c = arr[i++];
    if (c < 128) {
      out += String.fromCharCode(c);
    } else if (c > 191 && c < 224) {
      const c2 = arr[i++];
      out += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
    } else if (c > 223 && c < 240) {
      const c2 = arr[i++];
      const c3 = arr[i++];
      out += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
    } else {
      const c2 = arr[i++];
      const c3 = arr[i++];
      const c4 = arr[i++];
      const u = (((c & 7) << 18) | ((c2 & 63) << 12) | ((c3 & 63) << 6) | (c4 & 63)) - 0x10000;
      out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 1023));
    }
  }
  return out;
}

/** Pure-JS Base64 encoder for Uint8Array */function bytesToBase64(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const a = bytes[i++];
    const b = i < len ? bytes[i++] : 0;
    const c = i < len ? bytes[i++] : 0;
    const triplet = (a << 16) | (b << 8) | c;

    result += chars[(triplet >> 18) & 0x3f];
    result += chars[(triplet >> 12) & 0x3f];
    result += i - 2 < len ? chars[(triplet >> 6) & 0x3f] : '=';
    result += i - 1 < len ? chars[triplet & 0x3f] : '=';
  }
  const mod = len % 3;
  if (mod === 1) {
    result = `${result.slice(0, -2)}==`;
  } else if (mod === 2) {
    result = `${result.slice(0, -1)}=`;
  }
  return result;
}

/** Pure-JS SHA-256 (FIPS 180-4) over Uint8Array/ArrayBuffer */async function sha256(input) {
  const bytes = typeof input === 'string'
    ? utf8Bytes(input)
    : (input instanceof Uint8Array ? input : new Uint8Array(input));
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLen >>> 0);
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000));
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + k[i] + w[i]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
}


  // ── Module: src/tagging/widget-resolver.js ──
/**
 * 3-Layer Widget Resolver (Override -> Naming Convention -> Heuristics)
 * Covers the full Elementor Free + Elementor Pro widget catalog with official eicon names.
 */const WIDGET_PLUGIN_KEY = 'f2e-widget';const WIDGET_CATALOG = [
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
];const SUPPORTED_WIDGETS = WIDGET_CATALOG.map((w) => w.value);const CONTAINER_WIDGETS = new Set([
  'container',
  'container-grid',
  'inner-section',
  'unwrap',
  'nested-tabs',
  'nested-accordion',
  'nested-carousel',
  'off-canvas',
]);function isAtomicLeafWidget(widget) {
  if (!widget) return false;
  if (widget === 'skip') return true;
  if (widget === 'unwrap') return false;
  return !CONTAINER_WIDGETS.has(widget);
}function isContainerWidget(widget) {
  return CONTAINER_WIDGETS.has(widget);
}function isAtomicWidget(widget) {
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
]);function visibleChildren(node) {
  if (!node || !Array.isArray(node.children)) return [];
  return node.children.filter((child) => child && child.visible !== false);
}function hasImageFill(node) {
  return Array.isArray(node && node.fills) && node.fills.some((fill) => fill && fill.type === 'IMAGE' && fill.visible !== false);
}function hasSolidOrGradientFill(node) {
  return Array.isArray(node && node.fills) && node.fills.some((fill) => fill && (fill.type === 'SOLID' || String(fill.type || '').startsWith('GRADIENT_')) && fill.visible !== false);
}

/**
 * Checks if a node is a pure vector icon or a composite vector graphic (such as a multi-path SVG logo).
 * When true, the entire node is exported as a single composite SVG instead of splitting into 20 tiny containers!
 */function isVectorGraphic(node, depth = 0) {
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
}function collectTextDescendants(node, depth = 0) {
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
 */function resolveWidget(node) {
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
}function isDividerNode(node, kids = []) {
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

  // Case A: Every child is a compact horizontal bullet item containing (small dot/check/icon <= 24px + 1 short text)
  const isEveryChildBullet = kids.every((child) => {
    const childW = Number(child.width) || 0;
    const childH = Number(child.height) || 0;
    // A vertical card (icon stacked above text) or tall card (> 56px) is a feature column/card, NEVER a bullet list item!
    if (child.layoutMode === 'VERTICAL') return false;
    if (childH > 56 || (childW > 480 && nodeH > 80)) return false;

    const childKids = visibleChildren(child);
    if (childKids.length < 1 || childKids.length > 4) return false;
    const texts = collectTextDescendants(child);
    if (texts.length !== 1) return false;
    const textLen = String(texts[0].characters || '').trim().length;
    if (textLen < 2 || textLen > 60) return false;
    const shapes = childKids.filter((k) => k.type !== 'TEXT');
    if (shapes.length > 0) {
      return shapes.every((s) => (Number(s.width) || 0) <= 24 && (Number(s.height) || 0) <= 24);
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


  // ── Module: src/optimizer/auto-layout-fixer.js ──
/**
 * Auto-Layout Fixer & Optimizer (Works directly on Figma Canvas AND provides Virtual Auto-Layout inference)
 *
 * Two modes:
 * 1. Read-only Virtual Inference (`inferVirtualLayout(node)`):
 *    When a designer forgets to enable Auto Layout on a Frame or Group, this analyzes child bounding boxes
 *    to determine whether children form a Horizontal Row, a Vertical Column, or a 2D CSS Grid, and calculates
 *    inferred `padding`, `gap`, `justify`, and `align`.
 * 2. Canvas Fixer (`fixAndOptimizeCanvasSelection(selection)`):
 *    Like UIChemy's Layout Optimizer, converts non-auto-layout frames/groups on the Figma canvas into real
 *    Figma Auto-Layout frames and groups scattered vector paths into clean Icon Frames.
 */
/**
 * Infers Flexbox or Grid layout parameters from child coordinates (x, y, width, height)
 * when `node.layoutMode === 'NONE'` or `node.type === 'GROUP'`.
 */function inferVirtualLayout(node) {
  const nodeW = Math.round(Number(node.width) || 0);
  const nodeH = Math.round(Number(node.height) || 0);
  const kids = visibleChildren(node);

  if (kids.length === 0) {
    return {
      width: nodeW,
      height: nodeH,
      mode: 'flex',
      direction: 'column',
      gap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      justify: 'MIN',
      align: 'MIN',
      inferred: true,
    };
  }

  // In Figma Plugin API, a GROUP's children have coordinates relative to the group's parent,
  // whereas a FRAME's children have coordinates relative to the frame itself.
  const baseX = node.type === 'GROUP' ? (Number(node.x) || 0) : 0;
  const baseY = node.type === 'GROUP' ? (Number(node.y) || 0) : 0;

  const boxes = kids.map((child) => {
    const x = Math.round((Number(child.x) || 0) - baseX);
    const y = Math.round((Number(child.y) || 0) - baseY);
    const w = Math.round(Number(child.width) || 0);
    const h = Math.round(Number(child.height) || 0);
    return {
      id: child.id,
      node: child,
      x,
      y,
      w,
      h,
      right: x + w,
      bottom: y + h,
      cx: x + w / 2,
      cy: y + h / 2,
    };
  });

  // Compute outer bounding box of children to infer padding
  const minX = Math.max(0, Math.min(...boxes.map((b) => b.x)));
  const minY = Math.max(0, Math.min(...boxes.map((b) => b.y)));
  const maxRight = Math.max(...boxes.map((b) => b.right));
  const maxBottom = Math.max(...boxes.map((b) => b.bottom));

  const padding = {
    top: Math.max(0, Math.round(minY)),
    left: Math.max(0, Math.round(minX)),
    right: Math.max(0, Math.round(nodeW - maxRight)),
    bottom: Math.max(0, Math.round(nodeH - maxBottom)),
  };

  if (boxes.length === 1) {
    return {
      width: nodeW,
      height: nodeH,
      mode: 'flex',
      direction: 'column',
      gap: 0,
      padding,
      justify: 'MIN',
      align: Math.abs(padding.left - padding.right) <= 12 && padding.left > 16 ? 'CENTER' : 'MIN',
      inferred: true,
    };
  }

  // Group children into horizontal rows by vertical overlap
  const sortedByY = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const box of sortedByY) {
    const existingRow = rows.find((row) => {
      const overlapTop = Math.max(row.top, box.y);
      const overlapBottom = Math.min(row.bottom, box.bottom);
      const minH = Math.min(row.bottom - row.top, box.h);
      return minH > 0 && (overlapBottom - overlapTop) / minH >= 0.45;
    });
    if (existingRow) {
      existingRow.items.push(box);
      existingRow.top = Math.min(existingRow.top, box.y);
      existingRow.bottom = Math.max(existingRow.bottom, box.bottom);
    } else {
      rows.push({ top: box.y, bottom: box.bottom, items: [box] });
    }
  }

  // Case 1: All items sit on a single horizontal row
  if (rows.length === 1) {
    const sortedX = [...rows[0].items].sort((a, b) => a.x - b.x);
    const gaps = [];
    for (let i = 1; i < sortedX.length; i += 1) {
      gaps.push(Math.max(0, sortedX[i].x - sortedX[i - 1].right));
    }
    const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
    return {
      width: nodeW,
      height: nodeH,
      mode: 'flex',
      direction: 'row',
      gap: avgGap,
      padding,
      justify: inferJustify(sortedX, nodeW, padding.left, padding.right, avgGap),
      align: inferCrossAlign(sortedX, 'y', 'cy', 'h'),
      orderedIds: sortedX.map((b) => b.id),
      inferred: true,
    };
  }

  // Case 2: Multi-row grid (e.g., 2x2, 3x2 cards where rows have equal >1 column counts)
  const colCounts = rows.map((r) => r.items.length);
  const firstColCount = colCounts[0];
  if (rows.length >= 2 && firstColCount >= 2 && colCounts.every((c) => c === firstColCount)) {
    const row0 = [...rows[0].items].sort((a, b) => a.x - b.x);
    const colGap = row0.length > 1 ? Math.max(0, row0[1].x - row0[0].right) : 16;
    const rowGap = Math.max(0, rows[1].top - rows[0].bottom);
    const orderedIds = [];
    for (const r of rows) {
      const sortedRow = [...r.items].sort((a, b) => a.x - b.x);
      orderedIds.push(...sortedRow.map((b) => b.id));
    }
    return {
      width: nodeW,
      height: nodeH,
      mode: 'grid',
      direction: 'row',
      columns: firstColCount,
      rows: rows.length,
      gap: Math.round(colGap),
      rowGap: Math.round(rowGap),
      padding,
      justify: 'MIN',
      align: 'MIN',
      orderedIds,
      inferred: true,
    };
  }

  // Case 3: Vertical stack (column)
  const rowGaps = [];
  for (let i = 1; i < rows.length; i += 1) {
    rowGaps.push(Math.max(0, rows[i].top - rows[i - 1].bottom));
  }
  const avgRowGap = rowGaps.length ? Math.round(rowGaps.reduce((a, b) => a + b, 0) / rowGaps.length) : 0;
  const orderedIds = [];
  for (const r of rows) {
    const sortedRow = [...r.items].sort((a, b) => a.x - b.x);
    orderedIds.push(...sortedRow.map((b) => b.id));
  }

  return {
    width: nodeW,
    height: nodeH,
    mode: 'flex',
    direction: 'column',
    gap: avgRowGap,
    padding,
    justify: 'MIN',
    align: inferCrossAlign(sortedByY, 'x', 'cx', 'w'),
    orderedIds,
    inferred: true,
  };
}

function inferJustify(sortedItems, containerSize, padStart, padEnd, avgGap) {
  if (sortedItems.length >= 2 && avgGap > 48 && padStart < 40 && padEnd < 40) {
    return 'SPACE_BETWEEN';
  }
  if (Math.abs(padStart - padEnd) <= 12 && padStart > 20) {
    return 'CENTER';
  }
  return 'MIN';
}

function inferCrossAlign(items, posKey, centerKey, sizeKey) {
  if (items.length < 2) return 'MIN';
  const starts = items.map((i) => i[posKey]);
  const centers = items.map((i) => i[centerKey]);
  const startSpread = Math.max(...starts) - Math.min(...starts);
  const centerSpread = Math.max(...centers) - Math.min(...centers);
  if (centerSpread <= 8 && startSpread > 8) return 'CENTER';
  return 'MIN';
}

/**
 * Mutates the selected Figma nodes on the canvas to apply real Figma Auto Layout
 * where missing, without breaking visual appearance.
 */function fixAndOptimizeCanvasSelection(selection) {
  let convertedFrames = 0;
  let taggedIcons = 0;

  const processNode = (node) => {
    if (!node || node.visible === false) return;

    // 1. If node is a pure vector group/frame, mark it as an Icon so children aren't split
    if (isVectorGraphic(node)) {
      if (typeof node.setPluginData === 'function' && !node.getPluginData('f2e-widget')) {
        node.setPluginData('f2e-widget', 'icon');
        taggedIcons += 1;
      }
      return;
    }

    const kids = visibleChildren(node);
    for (const child of kids) {
      processNode(child);
    }

    // 2. Convert non-Auto-Layout Frame to Auto-Layout if it has 1+ children
    if (node.type === 'FRAME' && (!node.layoutMode || node.layoutMode === 'NONE') && kids.length > 0) {
      const inferred = inferVirtualLayout(node);
      try {
        node.layoutMode = inferred.direction === 'row' ? 'HORIZONTAL' : 'VERTICAL';
        node.primaryAxisSizingMode = 'FIXED';
        node.counterAxisSizingMode = 'FIXED';
        node.paddingTop = inferred.padding.top;
        node.paddingRight = inferred.padding.right;
        node.paddingBottom = inferred.padding.bottom;
        node.paddingLeft = inferred.padding.left;
        node.itemSpacing = inferred.gap;
        node.primaryAxisAlignItems = inferred.justify;
        node.counterAxisAlignItems = inferred.align;
        if (inferred.mode === 'grid') {
          node.layoutWrap = 'WRAP';
          node.counterAxisSpacing = inferred.rowGap || inferred.gap;
        }
        convertedFrames += 1;
      } catch (err) {
        // Locked or component instance nodes cannot have layoutMode changed
      }
    }
  };

  for (const root of selection) {
    processNode(root);
  }

  return { convertedFrames, taggedIcons };
}


  // ── Module: src/extraction/extractor.js ──
/**
 * Core Extraction Pipeline for Figma Plugin API
 * - Safely guards against Figma `Symbol(figma.mixed)` values on every property
 * - Extracts native Auto-Layout OR falls back to Virtual Auto-Layout Inference
 * - Extracts child positioning (`layoutPositioning === 'ABSOLUTE'`, `x`, `y`, `layoutSizingHorizontal`, `layoutSizingVertical`, `layoutGrow`, `layoutAlign`)
 * - Extracts solid & linear/radial gradient backgrounds, strokes (linked & per-side),
 *   corner radii (uniform & 4-corner), drop/inner shadows, opacity, clipContent
 * - Extracts full typography (font family, weight, size, line-height, letter-spacing, transform, color)
 * - Exports Vector/Icon/Logo groups as clean inline SVG strings + SHA-256 hash
 * - Exports Image nodes as PNG/JPG (1x/2x) + Base64 & SHA-256 hash
 */
const WEIGHT_MAP = {
  thin: '100',
  hairline: '100',
  extralight: '200',
  ultralight: '200',
  light: '300',
  regular: '400',
  normal: '400',
  book: '400',
  medium: '500',
  semibold: '600',
  demibold: '600',
  bold: '700',
  extrabold: '800',
  ultrabold: '800',
  black: '900',
  heavy: '900',
};

/** Safe number coercion that never throws on `Symbol(figma.mixed)` */function safeNum(val, fallback = 0) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** Safe string coercion that never throws on `Symbol(figma.mixed)` */function safeStr(val, fallback = '') {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return fallback;
}function fontWeightOf(styleName) {
  const key = safeStr(styleName, '').toLowerCase().replace(/[\s_-]|italic|oblique/g, '');
  return WEIGHT_MAP[key] || '400';
}function rgbToHex(color, alpha = 1) {
  if (!color || typeof color !== 'object') return '#000000';
  const r = Math.round(Math.max(0, Math.min(1, safeNum(color.r, 0))) * 255);
  const g = Math.round(Math.max(0, Math.min(1, safeNum(color.g, 0))) * 255);
  const b = Math.round(Math.max(0, Math.min(1, safeNum(color.b, 0))) * 255);
  const a = alpha !== undefined ? safeNum(alpha, 1) : (color.a !== undefined ? safeNum(color.a, 1) : 1);
  if (a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
  }
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}function extractSolidColor(paints) {
  if (!Array.isArray(paints)) return null;
  const paint = [...paints].reverse().find(
    (item) => item && item.type === 'SOLID' && item.visible !== false && safeNum(item.opacity, 1) > 0
  );
  if (!paint || !paint.color) return null;
  return rgbToHex(paint.color, safeNum(paint.opacity, 1));
}function extractGradient(paints) {
  if (!Array.isArray(paints)) return null;
  const paint = [...paints].reverse().find(
    (item) => item && safeStr(item.type).startsWith('GRADIENT_') && item.visible !== false && safeNum(item.opacity, 1) > 0
  );
  if (!paint || !Array.isArray(paint.gradientStops) || paint.gradientStops.length < 2) return null;

  const stop0 = paint.gradientStops[0];
  const stop1 = paint.gradientStops[paint.gradientStops.length - 1];
  let angle = 180;
  if (Array.isArray(paint.gradientHandlePositions) && paint.gradientHandlePositions.length >= 2) {
    const start = paint.gradientHandlePositions[0];
    const end = paint.gradientHandlePositions[1];
    const dx = safeNum(end && end.x) - safeNum(start && start.x);
    const dy = safeNum(end && end.y) - safeNum(start && start.y);
    angle = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI);
    if (angle < 0) angle += 360;
  }

  return {
    type: paint.type === 'GRADIENT_RADIAL' ? 'radial' : 'linear',
    color1: rgbToHex(stop0.color, stop0.color && stop0.color.a !== undefined ? stop0.color.a : 1),
    stop1: Math.round(safeNum(stop0.position, 0) * 100),
    color2: rgbToHex(stop1.color, stop1.color && stop1.color.a !== undefined ? stop1.color.a : 1),
    stop2: Math.round(safeNum(stop1.position, 1) * 100),
    angle,
  };
}function extractLayout(node, parentNode = null) {
  let width = Math.round(safeNum(node.width, 0));
  let height = Math.round(safeNum(node.height, 0));
  const strokeW = Math.max(1, Math.round(safeNum(node.strokeWeight, 1)));
  if (node.type === 'LINE') {
    const rot = Math.abs(safeNum(node.rotation, 0));
    const isVertLine = (rot >= 45 && rot <= 135) || (parentNode && parentNode.layoutMode === 'HORIZONTAL' && height === 0);
    if (isVertLine) {
      height = Math.max(width, height, 24);
      width = strokeW;
    } else if (height === 0) {
      height = strokeW;
    }
  } else if (width === 0 && height > 0) {
    width = strokeW;
  } else if (height === 0 && width > 0) {
    height = strokeW;
  }
  const x = Math.round(safeNum(node.x, 0));
  const y = Math.round(safeNum(node.y, 0));

  let layout;
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    layout = {
      width,
      height,
      x,
      y,
      mode: node.layoutMode === 'GRID' ? 'grid' : 'flex',
      direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
      gap: Math.max(0, Math.round(safeNum(node.itemSpacing, 0))),
      wrap: node.layoutWrap === 'WRAP',
      padding: {
        top: Math.round(safeNum(node.paddingTop, 0)),
        right: Math.round(safeNum(node.paddingRight, 0)),
        bottom: Math.round(safeNum(node.paddingBottom, 0)),
        left: Math.round(safeNum(node.paddingLeft, 0)),
      },
      justify: safeStr(node.primaryAxisAlignItems, 'MIN'),
      align: safeStr(node.counterAxisAlignItems, 'MIN'),
      primarySizing: safeStr(node.primaryAxisSizingMode, 'AUTO'),
      counterSizing: safeStr(node.counterAxisSizingMode, 'AUTO'),
      clipsContent: Boolean(node.clipsContent),
      minWidth: typeof node.minWidth === 'number' ? Math.round(node.minWidth) : null,
      maxWidth: typeof node.maxWidth === 'number' ? Math.round(node.maxWidth) : null,
      minHeight: typeof node.minHeight === 'number' ? Math.round(node.minHeight) : null,
      maxHeight: typeof node.maxHeight === 'number' ? Math.round(node.maxHeight) : null,
      inferred: false,
    };
    if (typeof node.counterAxisSpacing === 'number') {
      layout.rowGap = Math.max(0, Math.round(safeNum(node.counterAxisSpacing, 0)));
    }
    if (node.layoutMode === 'GRID') {
      layout.columns = Array.isArray(node.gridColumnSizes) ? node.gridColumnSizes.length : safeNum(node.gridColumnCount, 2);
      layout.rows = Array.isArray(node.gridRowSizes) ? node.gridRowSizes.length : safeNum(node.gridRowCount, 1);
    }
  } else {
    layout = inferVirtualLayout(node);
    layout.x = x;
    layout.y = y;
    layout.clipsContent = Boolean(node.clipsContent);
  }

  // Child sizing relative to parent Auto-Layout
  if (typeof node.layoutSizingHorizontal === 'string') {
    layout.sizingH = node.layoutSizingHorizontal; // 'FIXED' | 'HUG' | 'FILL'
  } else if (parentNode) {
    const parentIsRow = parentNode.layoutMode === 'HORIZONTAL';
    if (parentIsRow && safeNum(node.layoutGrow, 0) >= 1) layout.sizingH = 'FILL';
    else if (!parentIsRow && node.layoutAlign === 'STRETCH') layout.sizingH = 'FILL';
  }

  if (typeof node.layoutSizingVertical === 'string') {
    layout.sizingV = node.layoutSizingVertical; // 'FIXED' | 'HUG' | 'FILL'
  } else if (parentNode) {
    const parentIsRow = parentNode.layoutMode === 'HORIZONTAL';
    if (!parentIsRow && safeNum(node.layoutGrow, 0) >= 1) layout.sizingV = 'FILL';
    else if (parentIsRow && node.layoutAlign === 'STRETCH') layout.sizingV = 'FILL';
  }

  // Detect absolute positioning inside an Auto-Layout parent (or full-bleed background layers named "bg")
  const rawName = safeStr(node.name).trim().toLowerCase();
  const parentW = parentNode ? Math.round(safeNum(parentNode.width, 0)) : 0;
  const parentH = parentNode ? Math.round(safeNum(parentNode.height, 0)) : 0;
  if (node.layoutPositioning === 'ABSOLUTE') {
    layout.position = 'absolute';
  } else if (
    parentNode &&
    (rawName === 'bg' || rawName === 'background' || rawName === 'overlay') &&
    visibleChildren(node).length === 0 &&
    width >= parentW * 0.9 &&
    height >= parentH * 0.9
  ) {
    layout.position = 'absolute';
    layout.isBackgroundLayer = true;
  }

  return layout;
}function extractStyle(node) {
  const style = {};

  if (node.type !== 'TEXT') {
    const bg = extractSolidColor(node.fills);
    if (bg) style.background = bg;
    const gradient = extractGradient(node.fills);
    if (gradient) style.gradient = gradient;
  }

  // Corner radius (guards against `figma.mixed` symbol when corners differ)
  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    const r = Math.round(node.cornerRadius);
    style.radius = { top: r, right: r, bottom: r, left: r, isLinked: true };
  } else if (
    typeof node.topLeftRadius === 'number' ||
    typeof node.topRightRadius === 'number' ||
    typeof node.bottomRightRadius === 'number' ||
    typeof node.bottomLeftRadius === 'number'
  ) {
    const tl = Math.round(safeNum(node.topLeftRadius, 0));
    const tr = Math.round(safeNum(node.topRightRadius, 0));
    const br = Math.round(safeNum(node.bottomRightRadius, 0));
    const bl = Math.round(safeNum(node.bottomLeftRadius, 0));
    if (tl > 0 || tr > 0 || br > 0 || bl > 0) {
      style.radius = { top: tl, right: tr, bottom: br, left: bl, isLinked: tl === tr && tr === br && br === bl };
    }
  }

  // Borders / Strokes (guards against `figma.mixed` on strokeWeight)
  const strokeSolid = extractSolidColor(node.strokes);
  const strokeGrad = extractGradient(node.strokes);
  const borderColor = strokeSolid || (strokeGrad ? strokeGrad.color1 : null);

  if (borderColor) {
    const hasIndividualStrokes =
      typeof node.strokeTopWeight === 'number' ||
      typeof node.strokeRightWeight === 'number' ||
      typeof node.strokeBottomWeight === 'number' ||
      typeof node.strokeLeftWeight === 'number';

    if (hasIndividualStrokes && node.strokeWeight !== Number(node.strokeTopWeight)) {
      const bt = Math.round(safeNum(node.strokeTopWeight, 0));
      const br = Math.round(safeNum(node.strokeRightWeight, 0));
      const bb = Math.round(safeNum(node.strokeBottomWeight, 0));
      const bl = Math.round(safeNum(node.strokeLeftWeight, 0));
      if (bt > 0 || br > 0 || bb > 0 || bl > 0) {
        style.borderWidth = { top: bt, right: br, bottom: bb, left: bl, isLinked: bt === br && br === bb && bb === bl };
      }
    } else if (typeof node.strokeWeight === 'number' && node.strokeWeight > 0) {
      const w = Math.max(1, Math.round(node.strokeWeight));
      style.borderWidth = { top: w, right: w, bottom: w, left: w, isLinked: true };
    }

    if (style.borderWidth) {
      style.borderColor = borderColor;
      if (strokeGrad) {
        style.borderGradient = strokeGrad;
      }
    }
  }

  // Box Shadow
  if (Array.isArray(node.effects)) {
    const shadow = node.effects.find(
      (ef) => ef && ef.visible !== false && (ef.type === 'DROP_SHADOW' || ef.type === 'INNER_SHADOW')
    );
    if (shadow && shadow.color) {
      style.boxShadow = {
        horizontal: Math.round(safeNum(shadow.offset && shadow.offset.x, 0)),
        vertical: Math.round(safeNum(shadow.offset && shadow.offset.y, 0)),
        blur: Math.round(safeNum(shadow.radius, 0)),
        spread: Math.round(safeNum(shadow.spread, 0)),
        color: rgbToHex(shadow.color, shadow.color.a !== undefined ? shadow.color.a : 0.25),
        position: shadow.type === 'INNER_SHADOW' ? 'inset' : '',
      };
    }
  }

  if (typeof node.opacity === 'number' && node.opacity < 1) {
    style.opacity = Math.round(node.opacity * 100) / 100;
  }

  return style;
}function extractTypography(node) {
  if (!node) return null;
  const characters = safeStr(node.characters, '');

  // Handle `figma.mixed` on fontSize, fontName, lineHeight, letterSpacing, fills
  let fontSize = typeof node.fontSize === 'number' ? Math.round(node.fontSize) : null;
  let fontName = node.fontName && typeof node.fontName === 'object' && node.fontName.family ? node.fontName : null;
  let lineHeightObj = node.lineHeight && typeof node.lineHeight === 'object' && node.lineHeight.unit ? node.lineHeight : null;
  let letterSpacingObj = node.letterSpacing && typeof node.letterSpacing === 'object' ? node.letterSpacing : null;
  let fillsArr = Array.isArray(node.fills) ? node.fills : null;

  if (characters.length > 0) {
    if (fontSize === null && typeof node.getRangeFontSize === 'function') {
      try {
        const s = node.getRangeFontSize(0, 1);
        if (typeof s === 'number') fontSize = Math.round(s);
      } catch (e) { }
    }
    if (!fontName && typeof node.getRangeFontName === 'function') {
      try {
        const fn = node.getRangeFontName(0, 1);
        if (fn && typeof fn === 'object' && fn.family) fontName = fn;
      } catch (e) { }
    }
    if (!fillsArr && typeof node.getRangeFills === 'function') {
      try {
        const rf = node.getRangeFills(0, 1);
        if (Array.isArray(rf)) fillsArr = rf;
      } catch (e) { }
    }
  }

  const text = {
    characters,
    fontSize: fontSize || 16,
    fontFamily: fontName ? safeStr(fontName.family, 'Inter') : 'Inter',
    fontWeight: fontName ? fontWeightOf(fontName.style) : '400',
    align: safeStr(node.textAlignHorizontal, 'LEFT').toLowerCase(),
  };

  if (fontName && safeStr(fontName.style).toLowerCase().includes('italic')) {
    text.fontStyle = 'italic';
  }

  if (lineHeightObj && lineHeightObj.unit !== 'AUTO') {
    if (lineHeightObj.unit === 'PIXELS') {
      text.lineHeight = Math.round(safeNum(lineHeightObj.value, text.fontSize * 1.35));
      text.lineHeightUnit = 'px';
    } else if (lineHeightObj.unit === 'PERCENT') {
      text.lineHeight = Math.round(safeNum(lineHeightObj.value, 135) / 10) / 10;
      text.lineHeightUnit = 'em';
    }
  } else {
    // If AUTO, generate explicit line-height based on font size for 100% theme immunity
    text.lineHeight = Math.round(text.fontSize * (text.fontSize >= 32 ? 1.2 : 1.4));
    text.lineHeightUnit = 'px';
  }

  if (letterSpacingObj && safeNum(letterSpacingObj.value, 0) !== 0) {
    text.letterSpacing = Math.round(safeNum(letterSpacingObj.value, 0) * 10) / 10;
  }

  if (node.textCase === 'UPPER') text.transform = 'uppercase';
  else if (node.textCase === 'LOWER') text.transform = 'lowercase';
  else if (node.textCase === 'TITLE') text.transform = 'capitalize';

  if (node.textDecoration === 'UNDERLINE') text.decoration = 'underline';
  else if (node.textDecoration === 'STRIKETHROUGH') text.decoration = 'line-through';

  // Extract solid color considering both fill opacity and node opacity (e.g. 30% opacity on text)
  let color = extractSolidColor(fillsArr);
  const nodeOpacity = typeof node.opacity === 'number' ? node.opacity : 1;
  if (color && nodeOpacity < 1 && !color.startsWith('rgba')) {
    // Convert hex to rgba with node opacity
    const hex = color.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    color = `rgba(${r}, ${g}, ${b}, ${Math.round(nodeOpacity * 100) / 100})`;
  }
  if (color) text.color = color;

  return text;
}function extractLink(node) {
  const reactions = Array.isArray(node && node.reactions) ? node.reactions : [];
  for (const reaction of reactions) {
    const action = (reaction && reaction.action) || (Array.isArray(reaction && reaction.actions) ? reaction.actions[0] : null);
    if (action && action.type === 'URL' && action.url) {
      return safeStr(action.url);
    }
  }
  return null;
}function extractButtonIcon(node) {
  if (!node || !Array.isArray(node.children)) return null;
  const kids = node.children.filter((c) => c && c.visible !== false);
  const textChild = kids.find((c) => c.type === 'TEXT');
  const iconChild = kids.find((c) => c.type !== 'TEXT' && (c.type === 'VECTOR' || c.type === 'INSTANCE' || c.type === 'FRAME' || c.type === 'GROUP' || c.type === 'BOOLEAN_OPERATION' || c.type === 'LINE' || isVectorGraphic(c)));

  if (!iconChild) return null;

  const iconName = safeStr(iconChild.name).toLowerCase();
  let align = 'right';
  if (textChild && typeof iconChild.x === 'number' && typeof textChild.x === 'number') {
    align = iconChild.x < textChild.x ? 'left' : 'right';
  } else if (textChild && kids.indexOf(iconChild) < kids.indexOf(textChild)) {
    align = 'left';
  }

  let faIcon = 'fas fa-arrow-right';
  if (iconName.includes('left') || iconName.includes('prev') || iconName.includes('back')) {
    faIcon = 'fas fa-arrow-left';
  } else if (iconName.includes('up')) {
    faIcon = 'fas fa-arrow-up';
  } else if (iconName.includes('down')) {
    faIcon = 'fas fa-arrow-down';
  } else if (iconName.includes('chevron-right') || iconName.includes('chevron')) {
    faIcon = 'fas fa-chevron-right';
  } else if (iconName.includes('check')) {
    faIcon = 'fas fa-check';
  } else if (iconName.includes('plus')) {
    faIcon = 'fas fa-plus';
  } else if (iconName.includes('search')) {
    faIcon = 'fas fa-search';
  } else if (iconName.includes('phone') || iconName.includes('call')) {
    faIcon = 'fas fa-phone';
  } else if (iconName.includes('mail') || iconName.includes('envelope')) {
    faIcon = 'fas fa-envelope';
  } else if (iconName.includes('download')) {
    faIcon = 'fas fa-download';
  } else if (iconName.includes('external') || iconName.includes('link')) {
    faIcon = 'fas fa-external-link-alt';
  } else if (iconName.includes('cart') || iconName.includes('shop')) {
    faIcon = 'fas fa-shopping-cart';
  } else {
    // Default for CTA button vector graphics
    faIcon = 'fas fa-arrow-right';
  }

  return {
    value: faIcon,
    library: 'fa-solid',
    align,
  };
}function captureResponsiveTree(rootNode) {
  const walk = (node, path = [], parent = null) => {
    const kids = visibleChildren(node);
    const name = safeStr(node.name).trim();
    return {
      nodeId: node.id,
      name,
      normName: name.toLowerCase(),
      type: node.type,
      pathKey: path.join('/'),
      layout: extractLayout(node, parent),
      style: extractStyle(node),
      text: node.type === 'TEXT' ? extractTypography(node) : null,
      children: kids.map((child) => walk(child, [...path, safeStr(child.name).trim().toLowerCase()], node)),
    };
  };
  return walk(rootNode, [], null);
}function matchResponsiveOverride(capturedTree, pathNames, expectedType) {
  if (!capturedTree) return null;
  let current = capturedTree;
  for (const seg of pathNames) {
    if (!current || !Array.isArray(current.children)) return null;
    current = current.children.find((c) => c.normName === seg);
  }
  if (!current || current.type !== expectedType) return null;
  return {
    width: current.layout && current.layout.width,
    direction: current.layout && current.layout.direction,
    gap: current.layout && current.layout.gap,
    padding: current.layout && current.layout.padding,
    columns: current.layout && current.layout.columns,
    fontSize: current.text && current.text.fontSize,
    align: current.text && current.text.align,
  };
}

/**
 * Unwraps CSS variables generated by Figma Dev Mode (`var(--token-name, fallback)`)
 * and strips CSS comments (`/* 140% *\/`) so exact values are extracted deterministically.
 */function resolveCssVars(rawVal) {
  if (typeof rawVal !== 'string') return '';
  let s = rawVal.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  let prev = '';
  while (s.includes('var(') && s !== prev) {
    prev = s;
    s = s.replace(/var\(\s*--[^,)]+\s*,\s*([^()]+)\)/g, '$1').trim();
  }
  return s;
}

/**
 * Normalizes CSS color strings from Figma Dev Mode (e.g. `#FFF` -> `#FFFFFF`, `#000` -> `#000000`, `var(--c, #16A34A)` -> `#16A34A`).
 */function normalizeCssColor(rawColor) {
  const s = resolveCssVars(rawColor);
  if (!s) return null;
  const hex3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(s);
  if (hex3) {
    return `#${hex3[1]}${hex3[1]}${hex3[2]}${hex3[2]}${hex3[3]}${hex3[3]}`.toUpperCase();
  }
  const hex6 = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(s);
  if (hex6) {
    return s.toUpperCase();
  }
  if (/^rgba?\([^)]+\)$/i.test(s)) {
    return s;
  }
  const match = s.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/i);
  return match ? normalizeCssColor(match[0]) : null;
}

/**
 * Apply full Dev Mode CSS from Figma (node.getCSSAsync()) to an IR entry.
 * Treats Figma Dev Mode as the authoritative source of truth for borders, padding, flex layout, and typography.
 */function applyDevModeCSSToNode(entry, devModeCSS) {
  if (!entry || !devModeCSS || typeof devModeCSS !== 'object') return;
  entry.devModeCSS = devModeCSS;
  entry.devModeCSSString = Object.entries(devModeCSS)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  const style = entry.style || (entry.style = {});
  const layout = entry.layout || (entry.layout = {});
  const cssKeys = Object.keys(devModeCSS);
  if (cssKeys.length === 0) return;

  // 1. Authoritative Dev Mode Borders & Gradient Border
  const hasAnyDevBorder = Boolean(
    devModeCSS['border'] ||
    devModeCSS['border-top'] ||
    devModeCSS['border-right'] ||
    devModeCSS['border-bottom'] ||
    devModeCSS['border-left'] ||
    devModeCSS['border-width'] ||
    devModeCSS['border-image'] ||
    devModeCSS['border-image-source']
  );

  // If Dev Mode CSS returned layout/box properties for a non-TEXT node and has NO border properties at all,
  // remove any phantom stroke from `node.strokes` that is not actually rendered in Dev Mode!
  if (!hasAnyDevBorder && entry.type !== 'text' && (devModeCSS['display'] || devModeCSS['background'] || devModeCSS['background-color'] || devModeCSS['border-radius'] || devModeCSS['padding'])) {
    delete style.borderWidth;
    delete style.borderColor;
    delete style.borderGradient;
  }

  if (devModeCSS['border-image-source'] || devModeCSS['border-image']) {
    const bImg = resolveCssVars(devModeCSS['border-image-source'] || devModeCSS['border-image']);
    style.devModeBorderImage = bImg;
    if (bImg.includes('linear-gradient')) {
      const angleMatch = bImg.match(/([\d.]+)deg/);
      const angle = angleMatch ? parseInt(angleMatch[1], 10) : 180;
      const colors = (bImg.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g) || ['#64A14F', '#038132']).map((c) => normalizeCssColor(c) || c);
      style.borderGradient = {
        angle,
        color1: colors[0] || '#64A14F',
        stop1: 0,
        color2: colors[1] || colors[0] || '#038132',
        stop2: 100,
      };
      if (!style.borderColor) style.borderColor = colors[0] || '#64A14F';
    }
  }

  if (devModeCSS['border-radius']) {
    const rClean = resolveCssVars(devModeCSS['border-radius']);
    const parts = rClean.split(/\s+/).map((p) => parseFloat(p) || 0);
    if (parts.length === 1 && parts[0] > 0) {
      style.radius = { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0], isLinked: true };
    } else if (parts.length === 2) {
      style.radius = { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1], isLinked: false };
    } else if (parts.length === 3) {
      style.radius = { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1], isLinked: false };
    } else if (parts.length >= 4) {
      style.radius = { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3], isLinked: false };
    }
  }

  if (devModeCSS['border-top'] || devModeCSS['border-right'] || devModeCSS['border-bottom'] || devModeCSS['border-left']) {
    const parseSide = (val) => {
      const clean = resolveCssVars(val);
      if (!clean || clean === 'none' || clean === '0') return { w: 0, c: null };
      const wMatch = clean.match(/([\d.]+)px/);
      const c = normalizeCssColor(clean);
      return {
        w: wMatch ? Math.max(1, Math.round(parseFloat(wMatch[1]))) : 0,
        c,
      };
    };
    const st = parseSide(devModeCSS['border-top']);
    const sr = parseSide(devModeCSS['border-right']);
    const sb = parseSide(devModeCSS['border-bottom']);
    const sl = parseSide(devModeCSS['border-left']);
    if (st.w > 0 || sr.w > 0 || sb.w > 0 || sl.w > 0) {
      style.borderWidth = {
        top: st.w,
        right: sr.w,
        bottom: sb.w,
        left: sl.w,
        isLinked: st.w === sr.w && sr.w === sb.w && sb.w === sl.w,
      };
      const sideColor = st.c || sr.c || sb.c || sl.c;
      if (sideColor) {
        style.borderColor = sideColor;
      }
    }
  }

  if (devModeCSS['border-width'] || devModeCSS['border']) {
    const bClean = resolveCssVars(devModeCSS['border']);
    const bwClean = resolveCssVars(devModeCSS['border-width']);
    if (bClean === 'none' || bClean === '0' || bwClean === '0' || bwClean === '0px') {
      delete style.borderWidth;
      delete style.borderColor;
    } else {
      if (bwClean) {
        const bwParts = bwClean.split(/\s+/).map((p) => Math.round(parseFloat(p) || 0));
        if (bwParts.length === 1 && bwParts[0] > 0) {
          style.borderWidth = { top: bwParts[0], right: bwParts[0], bottom: bwParts[0], left: bwParts[0], isLinked: true };
        } else if (bwParts.length === 4) {
          style.borderWidth = { top: bwParts[0], right: bwParts[1], bottom: bwParts[2], left: bwParts[3], isLinked: false };
        }
      } else if (bClean) {
        const bwMatch = bClean.match(/([\d.]+)px/);
        if (bwMatch && !style.borderWidth) {
          const bw = Math.max(1, Math.round(parseFloat(bwMatch[1])));
          style.borderWidth = { top: bw, right: bw, bottom: bw, left: bw, isLinked: true };
        }
      }
      if (bClean) {
        const c = normalizeCssColor(bClean);
        if (c) style.borderColor = c;
      }
    }
  }

  if (devModeCSS['border-color']) {
    const c = normalizeCssColor(devModeCSS['border-color']);
    if (c) style.borderColor = c;
  }

  // 2. Authoritative Dev Mode Background & Gradient
  const devBg = resolveCssVars(devModeCSS['background'] || devModeCSS['background-color'] || '');
  if (devBg) {
    if (devBg.includes('linear-gradient')) {
      const angleMatch = devBg.match(/([\d.]+)deg/);
      const angle = angleMatch ? parseInt(angleMatch[1], 10) : 180;
      const colors = (devBg.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g) || []).map((c) => normalizeCssColor(c) || c);
      if (colors.length >= 2) {
        style.gradient = {
          type: 'linear',
          angle,
          color1: colors[0],
          stop1: 0,
          color2: colors[colors.length - 1],
          stop2: 100,
        };
      }
    } else {
      const solidBg = normalizeCssColor(devBg);
      if (solidBg) style.background = solidBg;
    }
  }

  // 3. Authoritative Dev Mode Flexbox, Padding, Gap & Box Sizing
  const disp = resolveCssVars(devModeCSS['display'] || '');
  if (disp === 'flex' || disp === 'inline-flex') {
    layout.mode = 'flex';
    const fDir = resolveCssVars(devModeCSS['flex-direction'] || '');
    layout.direction = fDir === 'column' ? 'column' : 'row';
    layout.inferred = false;
  } else if (disp === 'grid') {
    layout.mode = 'grid';
    layout.inferred = false;
  }

  if (devModeCSS['flex-wrap']) {
    const fw = resolveCssVars(devModeCSS['flex-wrap']);
    layout.wrap = fw === 'wrap';
  }

  if (devModeCSS['justify-content']) {
    const jc = resolveCssVars(devModeCSS['justify-content']);
    if (jc === 'space-between') layout.justify = 'SPACE_BETWEEN';
    else if (jc === 'center') layout.justify = 'CENTER';
    else if (jc === 'flex-end' || jc === 'end') layout.justify = 'MAX';
    else if (jc === 'flex-start' || jc === 'start') layout.justify = 'MIN';
  }

  if (devModeCSS['align-items']) {
    const ai = resolveCssVars(devModeCSS['align-items']);
    if (ai === 'center') layout.align = 'CENTER';
    else if (ai === 'flex-end' || ai === 'end') layout.align = 'MAX';
    else if (ai === 'baseline') layout.align = 'BASELINE';
    else if (ai === 'flex-start' || ai === 'start') layout.align = 'MIN';
  }

  // Child flex sizing from Dev Mode (`flex: 1 0 0` and `align-self: stretch`)
  if (devModeCSS['flex']) {
    const flexVal = resolveCssVars(devModeCSS['flex']);
    if (flexVal.startsWith('1 ') || flexVal === '1') {
      layout.flexGrow = 1;
      if (!layout.sizingH || layout.sizingH === 'HUG') {
        layout.sizingH = 'FILL';
      }
    }
  }
  if (devModeCSS['align-self'] && resolveCssVars(devModeCSS['align-self']) === 'stretch') {
    layout.alignSelf = 'stretch';
  }

  if (devModeCSS['padding']) {
    const pClean = resolveCssVars(devModeCSS['padding']);
    const pParts = pClean.split(/\s+/).map((p) => Math.round(parseFloat(p) || 0));
    if (pParts.length === 1) {
      layout.padding = { top: pParts[0], right: pParts[0], bottom: pParts[0], left: pParts[0], isLinked: true };
    } else if (pParts.length === 2) {
      layout.padding = { top: pParts[0], right: pParts[1], bottom: pParts[0], left: pParts[1], isLinked: false };
    } else if (pParts.length === 3) {
      layout.padding = { top: pParts[0], right: pParts[1], bottom: pParts[2], left: pParts[1], isLinked: false };
    } else if (pParts.length >= 4) {
      layout.padding = { top: pParts[0], right: pParts[1], bottom: pParts[2], left: pParts[3], isLinked: false };
    }
  }
  if (devModeCSS['padding-top'] || devModeCSS['padding-right'] || devModeCSS['padding-bottom'] || devModeCSS['padding-left']) {
    const curP = layout.padding || { top: 0, right: 0, bottom: 0, left: 0 };
    const pt = devModeCSS['padding-top'] ? Math.round(parseFloat(resolveCssVars(devModeCSS['padding-top'])) || 0) : curP.top;
    const pr = devModeCSS['padding-right'] ? Math.round(parseFloat(resolveCssVars(devModeCSS['padding-right'])) || 0) : curP.right;
    const pb = devModeCSS['padding-bottom'] ? Math.round(parseFloat(resolveCssVars(devModeCSS['padding-bottom'])) || 0) : curP.bottom;
    const pl = devModeCSS['padding-left'] ? Math.round(parseFloat(resolveCssVars(devModeCSS['padding-left'])) || 0) : curP.left;
    layout.padding = { top: pt, right: pr, bottom: pb, left: pl, isLinked: pt === pr && pr === pb && pb === pl };
  }

  if (devModeCSS['gap']) {
    const gClean = resolveCssVars(devModeCSS['gap']);
    const gParts = gClean.split(/\s+/).map((p) => Math.round(parseFloat(p) || 0));
    if (gParts.length === 1 && !isNaN(gParts[0])) {
      layout.gap = gParts[0];
    } else if (gParts.length >= 2) {
      layout.rowGap = gParts[0];
      layout.gap = gParts[1];
    }
  }
  if (devModeCSS['column-gap']) {
    const cg = Math.round(parseFloat(resolveCssVars(devModeCSS['column-gap'])) || 0);
    if (!isNaN(cg)) layout.gap = cg;
  }
  if (devModeCSS['row-gap']) {
    const rg = Math.round(parseFloat(resolveCssVars(devModeCSS['row-gap'])) || 0);
    if (!isNaN(rg)) layout.rowGap = rg;
  }

  if (devModeCSS['width'] && (!layout.width || layout.width === 0)) {
    const wVal = parseFloat(resolveCssVars(devModeCSS['width']));
    if (!isNaN(wVal)) layout.width = Math.round(wVal);
  }

  if (devModeCSS['height'] && (!layout.height || layout.height === 0)) {
    const hVal = parseFloat(resolveCssVars(devModeCSS['height']));
    if (!isNaN(hVal)) layout.height = Math.round(hVal);
  }

  // 4. Authoritative Dev Mode Typography
  if (entry.text) {
    const text = entry.text;
    if (devModeCSS['font-family']) {
      text.fontFamily = resolveCssVars(devModeCSS['font-family']).replace(/['"]/g, '').split(',')[0].trim();
    }
    if (devModeCSS['font-weight']) {
      text.fontWeight = String(resolveCssVars(devModeCSS['font-weight']));
    }
    if (devModeCSS['font-size']) {
      const fsMatch = resolveCssVars(devModeCSS['font-size']).match(/([\d.]+)px/);
      if (fsMatch) text.fontSize = Math.round(parseFloat(fsMatch[1]));
    }
    if (devModeCSS['line-height']) {
      const lhClean = resolveCssVars(devModeCSS['line-height']);
      const lhMatch = lhClean.match(/([\d.]+)px/);
      if (lhMatch) {
        text.lineHeight = Math.round(parseFloat(lhMatch[1]));
        text.lineHeightUnit = 'px';
      } else if (lhClean.includes('%')) {
        text.lineHeight = Math.round((parseFloat(lhClean) / 100) * 100) / 100;
        text.lineHeightUnit = 'em';
      }
    }
    if (devModeCSS['color']) {
      const normC = normalizeCssColor(devModeCSS['color']);
      if (normC) text.color = normC;
    }
    if (devModeCSS['letter-spacing']) {
      const lsMatch = resolveCssVars(devModeCSS['letter-spacing']).match(/([-\d.]+)px/);
      if (lsMatch) text.letterSpacing = parseFloat(lsMatch[1]);
    }
    if (devModeCSS['text-align']) {
      text.align = resolveCssVars(devModeCSS['text-align']).toLowerCase();
    }
    if (devModeCSS['text-transform']) {
      text.transform = resolveCssVars(devModeCSS['text-transform']);
    }
    if (devModeCSS['font-style']) {
      text.fontStyle = resolveCssVars(devModeCSS['font-style']);
    }
  }
}

/**
 * Full extraction of selected Figma nodes into the F2E Intermediate Representation (IR)
 */async function extractDesignSelection(selection, options = {}) {
  const {
    fileKey = 'local-figma',
    imageFormat = 'PNG',
    imageScale = 2,
    responsiveFrames = { tablet: null, mobile: null },
    designTokens = { colors: [], typography: [] },
    isRootSelection = true,
  } = options;

  const nodes = {};
  const assets = {};
  const assetPayloads = [];
  const warnings = [];
  const pendingExports = [];

  const visit = async (node, context = {}) => {
    const { insideAtomic = false, path = [], parentNode = null, isTopRoot = false } = context;
    if (!node || node.visible === false) return null;

    let choice = resolveWidget(node);
    // Guard: If top-level root artboard is heuristic-skip, fallback to container so export doesn't fail
    if (isTopRoot && choice.widget === 'skip' && choice.source !== 'override') {
      choice = { widget: 'container', source: 'root-fallback' };
    }
    if (choice.widget === 'skip') return null;
    if (insideAtomic) return null;

    const id = `f2e:${fileKey}:${node.id}`;
    let devModeCSS = null;
    if (typeof node.getCSSAsync === 'function') {
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

    const childrenIds = [];
    if (!isLeafWidget) {
      for (const child of rawKids) {
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

    const link = extractLink(node);
    if (link) entry.link = link;

    if (node.type === 'TEXT') {
      entry.text = extractTypography(node);
      entry.content.characters = entry.text.characters;
    }

    if (choice.widget === 'button') {
      const bIcon = extractButtonIcon(node);
      if (bIcon) entry.buttonIcon = bIcon;
      if (node.type === 'TEXT') {
        entry.text = extractTypography(node);
        entry.content.characters = entry.text.characters;
      } else {
        const textNodes = collectTextDescendants(node);
        if (textNodes.length > 0) {
          entry.text = extractTypography(textNodes[0]);
          entry.content.characters = entry.text.characters;
          if (typeof textNodes[0].getCSSAsync === 'function') {
            try {
              const btnTxtDevCSS = await textNodes[0].getCSSAsync();
              if (btnTxtDevCSS) applyDevModeCSSToNode({ text: entry.text }, btnTxtDevCSS);
            } catch (e) { }
          }
        } else {
          entry.content.characters = entry.content.name || 'Button';
        }
      }
    }

    if (devModeCSS) {
      applyDevModeCSSToNode(entry, devModeCSS);
    }

    if (choice.widget === 'nav-menu' || choice.widget === 'mega-menu') {
      const textNodes = collectTextDescendants(node);
      const menuItems = textNodes
        .map((tn) => ({
          name: safeStr(tn.characters || tn.name).trim(),
          link: extractLink(tn) || '#',
        }))
        .filter((item) => item.name.length > 0);

      entry.content.menuItems = menuItems;
      if (textNodes.length > 0) {
        entry.text = extractTypography(textNodes[0]);
      }
    }

    if (choice.widget === 'icon-list') {
      const textNodes = collectTextDescendants(node);
      const listItems = textNodes
        .map((tn, idx) => {
          let text = safeStr(tn.characters || tn.name).trim();
          text = text.replace(/^[\u2713\u2714\u2022\u00b7\u25cf\u25cb\u2013\u2014\-*]\s*/, '');
          return {
            id: `item_${idx + 1}`,
            text,
            link: extractLink(tn) || '',
          };
        })
        .filter((item) => item.text.length > 0);

      entry.content.iconList = listItems;
      if (textNodes.length > 0) {
        entry.text = extractTypography(textNodes[0]);
      }
    }

    if (choice.widget === 'icon-box' || choice.widget === 'image-box') {
      const textNodes = collectTextDescendants(node);
      if (textNodes.length > 0) {
        entry.content.title_text = safeStr(textNodes[0].characters || textNodes[0].name).trim();
        entry.text = extractTypography(textNodes[0]);
      }
      if (textNodes.length > 1) {
        entry.content.description_text = textNodes
          .slice(1)
          .map((tn) => safeStr(tn.characters || tn.name).trim())
          .filter(Boolean)
          .join('\n');
      }
      entry.content.position = (layout.direction === 'row') ? 'left' : 'top';

      const visualNode = findFirstVisualDescendant(node);
      if (visualNode && typeof visualNode.exportAsync === 'function') {
        if (hasImageFill(visualNode)) {
          pendingExports.push({ kind: 'raster', node: visualNode, id });
        } else {
          pendingExports.push({ kind: 'svg', node: visualNode, id });
        }
      }
    }

    if (choice.widget === 'counter') {
      const textNodes = collectTextDescendants(node);
      for (const tn of textNodes) {
        const str = safeStr(tn.characters || '').trim();
        if (/\d/.test(str)) {
          entry.content.counterNumber = str;
        } else if (!entry.content.counterTitle) {
          entry.content.counterTitle = str;
        }
      }
    }

    if (choice.widget === 'form' || choice.widget === 'login' || choice.widget === 'search-form') {
      const formFields = [];
      let submitLabel = 'Send Message';
      for (const child of rawKids) {
        const lower = safeStr(child.name).toLowerCase();
        if (lower.includes('btn') || lower.includes('button') || lower.includes('submit')) {
          const btnTexts = collectTextDescendants(child);
          if (btnTexts.length > 0) {
            submitLabel = safeStr(btnTexts[0].characters || btnTexts[0].name).trim();
          }
          continue;
        }
        let fieldType = 'text';
        if (lower.includes('email') || lower.includes('mail')) fieldType = 'email';
        else if (lower.includes('phone') || lower.includes('tel') || lower.includes('số điện thoại')) fieldType = 'tel';
        else if (lower.includes('message') || lower.includes('comment') || lower.includes('nội dung') || (Number(child.height) || 0) >= 90) fieldType = 'textarea';

        const texts = collectTextDescendants(child).map((t) => safeStr(t.characters || t.name).trim()).filter(Boolean);
        const label = texts[0] || safeStr(child.name, `Field ${formFields.length + 1}`);
        formFields.push({
          id: `field_${formFields.length + 1}`,
          type: fieldType,
          label,
          placeholder: texts[1] || label,
          required: fieldType === 'email' ? 'true' : '',
        });
      }
      entry.content.formFields = formFields;
      entry.content.submitLabel = submitLabel;
    }

    const isVisualAssetWidget = [
      'icon',
      'image',
      'theme-site-logo',
      'site-logo',
      'theme-post-featured-image',
      'html',
    ].includes(choice.widget);

    if (isVisualAssetWidget && typeof node.exportAsync === 'function') {
      if (hasImageFill(node)) {
        pendingExports.push({ kind: 'raster', node, id });
      } else {
        // Multi-color SVG icon, logo frame, vector graphic, or illustrated shape
        pendingExports.push({ kind: 'svg', node, id });
      }
    } else if (hasImageFill(node) && typeof node.exportAsync === 'function') {
      pendingExports.push({ kind: 'raster', node, id });
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

  for (const item of pendingExports) {
    try {
      if (item.kind === 'svg') {
        const svgBytes = await item.node.exportAsync({ format: 'SVG' });
        const svgString = utf8Decode(svgBytes);
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
      } else {
        const imgBytes = await item.node.exportAsync({
          format: fmt,
          constraint: { type: 'SCALE', value: scale },
        });
        const hash = await sha256(imgBytes);
        const b64 = bytesToBase64(imgBytes);
        const dataUri = `data:${mime};base64,${b64}`;

        nodes[item.id].raster = { sha256: hash, mime, dataUri };
        if (nodes[item.id].widget === 'image') {
          nodes[item.id].image = { sha256: hash, mime, dataUri };
        } else {
          nodes[item.id].style.backgroundImage = hash;
          nodes[item.id].style.backgroundImageDataUri = dataUri;
        }

        if (!seenHashes.has(hash)) {
          const asset = {
            assetId: `img-${item.node.id}`,
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
      }
    } catch (err) {
      warnings.push({
        code: 'asset-export-failed',
        nodeId: item.node.id,
        message: `Could not export asset for "${safeStr(item.node.name)}": ${err && err.message ? err.message : err}`,
      });
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
}function detectColorRole(name) {
  const lower = safeStr(name).toLowerCase();
  if (/(^|[-_/ ])(primary|brand|main)([-_/ ]|$)/i.test(lower)) return 'primary';
  if (/(^|[-_/ ])(secondary)([-_/ ]|$)/i.test(lower)) return 'secondary';
  if (/(^|[-_/ ])(text|body|content|foreground)([-_/ ]|$)/i.test(lower)) return 'text';
  if (/(^|[-_/ ])(accent|highlight)([-_/ ]|$)/i.test(lower)) return 'accent';
  return 'custom';
}function detectTypographyRole(name) {
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
}async function extractLocalDesignSystem(figmaApi, activeSelection = null) {
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
        const val = v.valuesByMode ? v.valuesByMode[defaultModes[v.variableCollectionId]] : null;
        if (val && typeof val === 'object' && val.type !== 'VARIABLE_ALIAS' && typeof val.r === 'number') {
          const hex = rgbToHex(val, val.a !== undefined ? val.a : 1);
          const name = safeStr(v.name, 'Color');
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
        if (ts.letterSpacing && typeof ts.letterSpacing === 'object' && ts.letterSpacing.unit === 'PIXELS') {
          entry.letterSpacing = Math.round(safeNum(ts.letterSpacing.value, 0) * 10) / 10;
        }
        typography.push(entry);
      }
    }
  } catch (e) { }

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
}function findFirstVisualDescendant(node, depth = 0) {
  if (!node || depth > 4) return null;
  const kids = visibleChildren(node);
  for (const child of kids) {
    if (child.type === 'TEXT') continue;
    if (hasImageFill(child)) return child;
    if (isVectorGraphic(child)) return child;
    const t = child.type;
    if (t === 'VECTOR' || t === 'LINE' || t === 'ELLIPSE' || t === 'POLYGON' || t === 'STAR' || t === 'BOOLEAN_OPERATION') {
      return child;
    }
    const lower = safeStr(child.name).toLowerCase();
    if (['icon', 'ic', 'svg', 'logo', 'img', 'image', 'pic'].some((kw) => lower.includes(kw))) {
      return child;
    }
    const found = findFirstVisualDescendant(child, depth + 1);
    if (found) return found;
  }
  return null;
}


  // ── Module: src/exporters/fidelity-verifier.js ──
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
function verifyAndHealElementorJson(elements, doc = null, options = {}) {
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


  // ── Module: src/exporters/elementor-compiler.js ──
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
const FLEX_ALIGN_MAP = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  SPACE_BETWEEN: 'space-between',
  BASELINE: 'baseline',
};function compileElementorV3(doc, options = {}) {
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
}function compileElementorClipboard(doc, options = {}) {
  const v3 = compileElementorV3(doc, options);
  return {
    type: 'elementor',
    siteurl: options.siteUrl || 'https://localhost/wp-json/',
    elements: v3.content,
    fidelityReport: v3.fidelityReport,
  };
}function compileElementorV4(doc) {
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
  for (const cid of node.children || []) {
    const child = nodes[cid];
    if (!child) continue;
    const texts = collectSubtreeTexts(child, nodes);
    const title = (texts[0] && texts[0].text && texts[0].text.characters) || (child.content && child.content.name) || 'Accordion Item';
    items.push({ _id: shortId(cid), item_title: title });
    const panel = buildElement(cid, false, node);
    if (panel) {
      panel.elType = 'container';
      panel.isInner = true;
      panels.push(panel);
    }
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'nested-accordion',
    isInner: false,
    settings: { items },
    elements: panels,
  };
}

function buildNestedTabs(node, nodes, allocId, buildElement) {
  const tabs = [];
  const panels = [];
  for (const cid of node.children || []) {
    const child = nodes[cid];
    if (!child) continue;
    const title = (child.content && child.content.name) || 'Tab';
    tabs.push({ _id: shortId(cid), tab_title: title });
    const panel = buildElement(cid, false, node);
    if (panel) {
      panel.elType = 'container';
      panel.isInner = true;
      panels.push(panel);
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


  // ── Module: src/code.js ──
/**
 * F2E Bridge — Figma Plugin Main Thread (Sandbox)
 * Runs inside Figma Desktop (100% Free, Zero REST API limits).
 */
const STORAGE_SITES_KEY = 'f2e.sites.v1';
const STORAGE_PREFS_KEY = 'f2e.prefs.v1';
const STORAGE_AI_KEY = 'f2e.ai.config.v1';

const responsiveState = {
  desktop: null,
  tablet: null,
  mobile: null,
};

figma.showUI(__html__, { width: 480, height: 680 });

function postStatus(message, extra = {}) {
  figma.ui.postMessage({ type: 'status', message, ...extra });
}

function announce(message, isError = false) {
  postStatus(message, { done: true, error: isError });
  try {
    figma.notify(message, { error: isError, timeout: isError ? 5500 : 3500 });
  } catch (e) { }
}

function normalizeSiteUrl(rawUrl) {
  const cleaned = String(rawUrl || '').trim().replace(/\/+$/, '');
  const match = /^(https?:)\/\/([^/?#]+)(\/[^?#]*)?$/i.exec(cleaned);
  if (!match) {
    throw new Error('Vui lòng nhập URL WordPress hợp lệ (ví dụ: https://example.com hoặc http://localhost:10040).');
  }
  return `${match[1].toLowerCase()}//${match[2]}${(match[3] || '').replace(/\/+$/, '')}`;
}

async function wpRequest(siteUrl, token, endpoint, init = {}) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  const url = `${baseUrl}/index.php?rest_route=/f2e-bridge/v1${endpoint}`;

  const fetchOptions = {
    method: init.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  };
  if (init.body !== undefined) {
    fetchOptions.body = init.body;
  }

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (err) {
    const detail = err && err.message ? `: ${err.message}` : '';
    const isHttpCustomLocal = /^http:\/\/(?!localhost|127\.0\.0\.1|\[::1\])/i.test(baseUrl);
    const localHint = isHttpCustomLocal
      ? ' (Lưu ý: Figma chặn HTTP thường với tên miền .local do Mixed Content — hãy dùng http://localhost:PORT của LocalWP, ví dụ http://localhost:10040, hoặc bật Trust SSL trong LocalWP để dùng https://)'
      : '';
    throw new Error(`Không thể kết nối tới WordPress${detail}${localHint}.`);
  }

  let body;
  try {
    if (typeof response.json === 'function') {
      body = await response.json();
    } else if (typeof response.text === 'function') {
      const txt = await response.text();
      body = JSON.parse(txt);
    } else {
      throw new Error('Response object has neither json() nor text()');
    }
  } catch (e) {
    throw new Error(`WordPress trả về dữ liệu không phải JSON (HTTP ${response.status}): ${e && e.message ? e.message : e}`);
  }

  if (!response.ok || !body || body.success === false) {
    const errMsg = (body && (body.message || (body.data && body.data.message))) || `WordPress trả về lỗi HTTP ${response.status}.`;
    throw new Error(errMsg);
  }
  return body.data !== undefined ? body.data : body;
}

/** Build flat indented outline of current selection for the Widget Tagging UI */
function buildSelectionOutline(selection) {
  const items = [];
  const walk = (node, depth, isTopRoot = false) => {
    if (!node || node.visible === false || items.length >= 250) return;
    const resolved = resolveWidget(node);
    const hasAutoLayout = Boolean(node.layoutMode && node.layoutMode !== 'NONE');
    items.push({
      nodeId: node.id,
      name: String(node.name || 'Unnamed').slice(0, 64),
      type: node.type,
      depth,
      widget: resolved.widget,
      source: resolved.source,
      hasAutoLayout,
      childCount: visibleChildren(node).length,
    });
    // Do not expand internal layers/vectors of atomic leaf widgets (icons, logos, buttons, images, etc.)
    // or layers marked "skip", so the outline matches Elementor's actual widget hierarchy!
    if (isAtomicLeafWidget(resolved.widget)) {
      return;
    }
    for (const child of visibleChildren(node)) {
      walk(child, depth + 1, false);
    }
  };
  for (const root of selection) {
    walk(root, 0, true);
  }
  return items;
}

function sendOutlineToUi() {
  const selection = figma.currentPage.selection || [];
  figma.ui.postMessage({
    type: 'outline',
    selectionNames: selection.map((n) => n.name),
    selectionCount: selection.length,
    items: selection.length ? buildSelectionOutline(selection) : [],
    widgetCatalog: WIDGET_CATALOG,
    responsiveStatus: {
      desktop: responsiveState.desktop ? responsiveState.desktop.name : null,
      tablet: responsiveState.tablet ? responsiveState.tablet.name : null,
      mobile: responsiveState.mobile ? responsiveState.mobile.name : null,
    },
  });
}

async function setLayerWidgetOverride(nodeId, widget) {
  const node = figma.getNodeByIdAsync ? await figma.getNodeByIdAsync(nodeId) : null;
  if (!node || typeof node.setPluginData !== 'function') {
    throw new Error('Không tìm thấy layer này trên canvas.');
  }
  if (widget && !SUPPORTED_WIDGETS.includes(widget)) {
    throw new Error(`Loại widget không hợp lệ: ${widget}`);
  }
  node.setPluginData(WIDGET_PLUGIN_KEY, widget || '');
  sendOutlineToUi();
}

async function handleResetAllWidgetOverrides() {
  const selection = figma.currentPage.selection || [];
  let cleared = 0;
  const walk = (node) => {
    if (!node) return;
    if (typeof node.setPluginData === 'function' && node.getPluginData(WIDGET_PLUGIN_KEY)) {
      node.setPluginData(WIDGET_PLUGIN_KEY, '');
      cleared += 1;
    }
    for (const child of node.children || []) walk(child);
  };
  for (const root of selection) walk(root);
  sendOutlineToUi();
  announce(`Đã đặt lại ${cleared} thẻ Widget về chế độ Tự động (Auto).`);
}

function handleCaptureResponsive(viewport) {
  if (!['desktop', 'tablet', 'mobile'].includes(viewport)) {
    throw new Error('Viewport không hợp lệ.');
  }
  const selection = figma.currentPage.selection || [];
  if (selection.length !== 1) {
    throw new Error(`Hãy chọn đúng 1 Frame trên Figma cho giao diện ${viewport.toUpperCase()}.`);
  }
  responsiveState[viewport] = captureResponsiveTree(selection[0]);
  sendOutlineToUi();
  announce(`Đã ghi nhận Frame "${selection[0].name}" cho giao diện ${viewport.toUpperCase()}.`);
}

function handleClearResponsive() {
  responsiveState.desktop = null;
  responsiveState.tablet = null;
  responsiveState.mobile = null;
  sendOutlineToUi();
  announce('Đã xóa cấu hình ghép 3 Frame Responsive.');
}

function handleFixAutoLayout() {
  const selection = figma.currentPage.selection || [];
  if (selection.length === 0) {
    throw new Error('Hãy chọn ít nhất 1 Frame hoặc Group trên Figma trước khi tối ưu Auto-Layout.');
  }
  const result = fixAndOptimizeCanvasSelection(selection);
  sendOutlineToUi();
  announce(
    `Đã tối ưu xong! Chuyển đổi ${result.convertedFrames} Frame sang Auto-Layout và gom ${result.taggedIcons} nhóm Vector thành Icon.`
  );
}

async function getActiveSelectionForExtraction() {
  if (responsiveState.desktop && responsiveState.desktop.nodeId && typeof figma.getNodeByIdAsync === 'function') {
    const desktopNode = await figma.getNodeByIdAsync(responsiveState.desktop.nodeId);
    if (desktopNode && !desktopNode.removed) {
      return [desktopNode];
    }
  }
  const selection = figma.currentPage.selection || [];
  if (selection.length === 0) {
    throw new Error('Vui lòng chọn ít nhất 1 Frame hoặc Component trên Figma!');
  }
  return selection;
}

async function handleCompileForClipboardOrDownload(payload = {}) {
  const {
    action = 'clipboard',
    imageFormat = 'PNG',
    imageScale = 2,
    siteUrl = '',
  } = payload;

  const selection = await getActiveSelectionForExtraction();
  postStatus('Đang trích xuất cây thiết kế & hình ảnh/SVG từ Figma…');
  const designTokens = await extractLocalDesignSystem(figma);
  const { document, assetPayloads } = await extractDesignSelection(selection, {
    fileKey: figma.fileKey || 'local-file',
    imageFormat,
    imageScale,
    responsiveFrames: {
      tablet: responsiveState.tablet,
      mobile: responsiveState.mobile,
    },
    designTokens,
  });

  if (action === 'clipboard') {
    const clipboardData = compileElementorClipboard(document, { siteUrl });
    const rep = clipboardData.fidelityReport || {};
    const healNote = rep.healedCount ? ` [Auto-Healed ${rep.healedCount} điểm lệch]` : ' [Khớp 100%]';
    figma.ui.postMessage({
      type: 'clipboard-ready',
      json: JSON.stringify(clipboardData),
      title: document.title,
      warnings: document.warnings,
      fidelityReport: rep,
    });
    announce(`Đã copy "${document.title}" (${clipboardData.elements.length} sections)${healNote}! Mở Elementor Editor và bấm Ctrl+V.`);
    return;
  }

  if (action === 'download-elementor-v3') {
    const v3Json = compileElementorV3(document, { siteUrl });
    figma.ui.postMessage({
      type: 'download-ready',
      filename: `${slugify(document.title)}-elementor-v3.json`,
      json: JSON.stringify(v3Json, null, 2),
      warnings: document.warnings,
      fidelityReport: v3Json.fidelityReport,
    });
    announce('Đã xuất & kiểm tra khớp thiết kế file Elementor v3 Template (.json) thành công!');
    return;
  }

  if (action === 'download-elementor-v4') {
    const v4Json = compileElementorV4(document);
    figma.ui.postMessage({
      type: 'download-ready',
      filename: `${slugify(document.title)}-elementor-v4-atomic.json`,
      json: JSON.stringify(v4Json, null, 2),
      warnings: document.warnings,
    });
    announce('Đã xuất file Elementor v4 Atomic (.json) thành công!');
    return;
  }

  const v3Compiled = compileElementorV3(document, { siteUrl });
  const bundle = {
    kind: 'f2e.bundle',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    document,
    assets: assetPayloads,
    elementorV3: v3Compiled,
    elementorV4: compileElementorV4(document),
  };
  figma.ui.postMessage({
    type: 'download-ready',
    filename: `${slugify(document.title)}-bundle.f2e.json`,
    json: JSON.stringify(bundle, null, 2),
    warnings: document.warnings,
    fidelityReport: v3Compiled.fidelityReport,
  });
  announce('Đã xuất gói F2E Bundle đầy đủ (kèm ảnh & SVG) để upload vào WordPress!');
}

async function handleVerifyAndSaveSite(siteConfig) {
  const siteUrl = normalizeSiteUrl(siteConfig.siteUrl);
  const token = String(siteConfig.token || '').trim();
  const label = String(siteConfig.label || siteUrl).trim();
  if (!token) {
    throw new Error('Vui lòng nhập Connection Token từ trang quản trị WordPress (F2E Bridge).');
  }

  postStatus(`Đang kiểm tra kết nối tới ${siteUrl}…`);
  const statusData = await wpRequest(siteUrl, token, '/status');

  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const filtered = Array.isArray(stored) ? stored.filter((s) => s.siteUrl !== siteUrl) : [];
  const entry = {
    siteUrl,
    token,
    label: statusData.siteName || label,
    elementorVersion: statusData.elementorVersion || '3.x',
    hasPro: Boolean(statusData.hasPro),
    lastConnectedAt: new Date().toISOString(),
  };
  const updated = [entry, ...filtered];
  await figma.clientStorage.setAsync(STORAGE_SITES_KEY, updated);

  figma.ui.postMessage({
    type: 'sites-loaded',
    sites: updated,
    activeSiteUrl: siteUrl,
    pages: statusData.pages || [],
    templates: statusData.templates || [],
  });
  announce(`Kết nối thành công tới "${entry.label}"!`);
}

async function handleDeleteSite(siteUrl) {
  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const updated = Array.isArray(stored) ? stored.filter((s) => s.siteUrl !== siteUrl) : [];
  await figma.clientStorage.setAsync(STORAGE_SITES_KEY, updated);
  figma.ui.postMessage({
    type: 'sites-loaded',
    sites: updated,
    activeSiteUrl: (updated[0] && updated[0].siteUrl) || '',
    pages: [],
    templates: [],
  });
  announce('Đã xóa website khỏi danh sách lưu trữ.');
}

async function handleLoadSiteTargets(siteUrl) {
  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const site = Array.isArray(stored) ? stored.find((s) => s.siteUrl === siteUrl) : null;
  if (!site) return;
  const statusData = await wpRequest(site.siteUrl, site.token, '/status');
  figma.ui.postMessage({
    type: 'site-targets',
    siteUrl: site.siteUrl,
    pages: statusData.pages || [],
    templates: statusData.templates || [],
    hasPro: Boolean(statusData.hasPro),
  });
}

async function handleLivePushToWordPress(payload) {
  const {
    siteUrl,
    targetType = 'page',
    templateType = 'page',
    targetPostId = 0,
    postTitle = '',
    postStatus = 'draft',
    importMode = 'resync',
    elementorVersion = 'v3',
    syncGlobalStyles = true,
    imageFormat = 'PNG',
    imageScale = 2,
  } = payload;

  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const site = Array.isArray(stored) ? stored.find((s) => s.siteUrl === siteUrl) : null;
  if (!site) {
    throw new Error('Vui lòng chọn hoặc kết nối một website WordPress trước khi Push.');
  }

  const selection = await getActiveSelectionForExtraction();
  postStatus('1/4: Đang trích xuất thiết kế & tài nguyên từ Figma…');
  let designTokens = { colors: [], typography: [] };
  if (syncGlobalStyles) {
    try {
      designTokens = await extractLocalDesignSystem(figma);
    } catch (tokenErr) {
      throw new Error(`Lỗi ở bước 1A (Design System): ${tokenErr && tokenErr.message ? tokenErr.message : tokenErr}`);
    }
  }
  let document;
  let assetPayloads;
  try {
    const extracted = await extractDesignSelection(selection, {
      fileKey: figma.fileKey || 'local-file',
      imageFormat,
      imageScale,
      responsiveFrames: {
        tablet: responsiveState.tablet,
        mobile: responsiveState.mobile,
      },
      designTokens,
    });
    document = extracted.document;
    assetPayloads = extracted.assetPayloads;
  } catch (extErr) {
    throw new Error(`Lỗi ở bước 1B (Extract Node): ${extErr && extErr.message ? extErr.message : extErr}`);
  }

  // Step 2: Upload deduplicated assets (SHA-256)
  const attachmentMap = {};
  try {
    if (assetPayloads.length > 0) {
      for (let i = 0; i < assetPayloads.length; i += 1) {
        const asset = assetPayloads[i];
        postStatus(`2/4: Đang đồng bộ tài nguyên ${i + 1}/${assetPayloads.length} (SHA-256: ${asset.sha256.slice(0, 8)})…`);
        const uploaded = await wpRequest(site.siteUrl, site.token, '/assets', {
          method: 'POST',
          body: JSON.stringify({
            sha256: asset.sha256,
            mime: asset.mime,
            kind: asset.kind,
            base64: asset.base64,
            name: document.title,
          }),
        });
        if (uploaded && uploaded.id) {
          attachmentMap[asset.sha256] = { id: uploaded.id, url: uploaded.url };
        }
      }
    }
  } catch (assetErr) {
    throw new Error(`Lỗi ở bước 2 (Upload Asset): ${assetErr && assetErr.message ? assetErr.message : assetErr}`);
  }

  // Step 3: Optionally sync Global Design System (Colors & Typography)
  try {
    if (syncGlobalStyles && (designTokens.colors.length > 0 || designTokens.typography.length > 0)) {
      postStatus('3/4: Đang đồng bộ Global Colors & Fonts vào Elementor Site Settings…');
      await wpRequest(site.siteUrl, site.token, '/design-system', {
        method: 'POST',
        body: JSON.stringify(designTokens),
      });
    }
  } catch (dsErr) {
    throw new Error(`Lỗi ở bước 3 (Sync Globals): ${dsErr && dsErr.message ? dsErr.message : dsErr}`);
  }

  // Step 4: Compile on client with resolved attachmentMap AND send both IR + compiled elements to WordPress
  let result;
  let fidelityReport = null;
  try {
    postStatus('4/4: Đang kiểm tra độ khớp thiết kế & cập nhật cấu trúc Elementor trên WordPress…');
    let compiledElements;
    if (elementorVersion === 'v4') {
      compiledElements = compileElementorV4(document).content;
    } else {
      const v3Out = compileElementorV3(document, { siteUrl: site.siteUrl, attachmentMap });
      compiledElements = v3Out.content;
      fidelityReport = v3Out.fidelityReport;
    }

    result = await wpRequest(site.siteUrl, site.token, '/import', {
      method: 'POST',
      body: JSON.stringify({
        title: postTitle || document.title,
        targetType,
        templateType,
        targetPostId: Number(targetPostId) || 0,
        postStatus,
        importMode,
        elementorVersion,
        attachmentMap,
        content: compiledElements,
        document,
      }),
    });
  } catch (impErr) {
    throw new Error(`Lỗi ở bước 4 (Import WP): ${impErr && impErr.message ? impErr.message : impErr}`);
  }

  figma.ui.postMessage({
    type: 'push-complete',
    result,
    fidelityReport,
  });
  announce(`Đã đẩy thành công lên WordPress! (${result.actionLabel || 'Saved'} — Post #${result.postId})`);
  await handleLoadSiteTargets(site.siteUrl);
}

async function handleScanDesignSystemPreview() {
  postStatus('Đang quét Color Variables, Text Styles & Theme Styles từ Figma…');
  const tokens = await extractLocalDesignSystem(figma, figma.currentPage.selection);
  figma.ui.postMessage({
    type: 'design-system-preview',
    tokens,
  });
  postStatus(`Đã tìm thấy ${tokens.colors.length} màu, ${tokens.typography.length} font`, { done: true });
}

async function handleSyncDesignSystemOnly(siteUrl, options = {}) {
  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const site = Array.isArray(stored) ? stored.find((s) => s.siteUrl === siteUrl) : null;
  if (!site) {
    throw new Error('Vui lòng kết nối website WordPress trước.');
  }
  postStatus('Đang trích xuất Design System & Theme Styles từ Figma…');
  const tokens = await extractLocalDesignSystem(figma, figma.currentPage.selection);
  if (tokens.colors.length === 0 && tokens.typography.length === 0 && !tokens.themeStyles?.buttons && !tokens.settings?.layout?.containerWidth) {
    throw new Error('File Figma này chưa khai báo Local Color Variables hoặc Text Styles.');
  }

  const payload = {
    colors: options.syncColors !== false ? tokens.colors : [],
    typography: options.syncTypography !== false ? tokens.typography : [],
    themeStyles: options.syncThemeStyles !== false ? tokens.themeStyles : {},
    settings: options.syncLayout !== false ? tokens.settings : {},
  };

  const colorCount = payload.colors.length;
  const typoCount = payload.typography.length;
  const themeItems = Object.keys(payload.themeStyles.typography || {}).length + (payload.themeStyles.buttons ? 1 : 0);

  postStatus(`Đang đẩy ${colorCount} màu, ${typoCount} font, ${themeItems} theme styles vào Site Settings Kit…`);
  const res = await wpRequest(site.siteUrl, site.token, '/design-system', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const rep = (res && res.data) || res || {};
  const newColors = (rep.colors && rep.colors.created && rep.colors.created.length) || 0;
  const newFonts = (rep.typography && rep.typography.created && rep.typography.created.length) || 0;
  const updatedStyles = (rep.themeStyles && rep.themeStyles.updated && rep.themeStyles.updated.join(', ')) || '';
  const updatedSettings = (rep.settings && rep.settings.updated && rep.settings.updated.join(', ')) || '';

  const details = [];
  if (colorCount) details.push(`${colorCount} màu (${newColors} mới)`);
  if (typoCount) details.push(`${typoCount} font (${newFonts} mới)`);
  if (updatedStyles) details.push(`Theme: ${updatedStyles}`);
  if (updatedSettings) details.push(updatedSettings);

  announce(`Đã đồng bộ toàn bộ Site Settings thành công! [${details.join(' | ')}]`);

  figma.ui.postMessage({
    type: 'design-system-preview',
    tokens,
  });
}

function slugify(text) {
  return String(text || 'figma-design')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'figma-design';
}

figma.on('selectionchange', sendOutlineToUi);
sendOutlineToUi();

async function handleRequestAiScanPayload() {
  const selection = figma.currentPage.selection || [];
  if (selection.length === 0) {
    throw new Error('Vui lòng chọn ít nhất 1 Frame trên Figma trước khi quét bằng AI!');
  }
  const root = selection[0];
  postStatus(`Đang chụp ảnh "${root.name}" và trích xuất cấu trúc layer...`);

  let imageBase64 = '';
  if (typeof root.exportAsync === 'function') {
    const maxDim = Math.max(Number(root.width) || 1, Number(root.height) || 1);
    const scale = maxDim > 1600 ? (1200 / maxDim) : 1;
    const pngBytes = await root.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: Math.max(0.4, Math.min(2, scale)) },
    });
    imageBase64 = bytesToBase64(pngBytes);
  }

  function buildAiLayerTree(node, depth = 0) {
    if (!node || depth > 5 || node.visible === false) return null;
    const item = {
      id: node.id,
      name: String(node.name || 'Layer').slice(0, 80),
      type: node.type,
      w: Math.round(Number(node.width) || 0),
      h: Math.round(Number(node.height) || 0),
    };
    if (node.type === 'TEXT') {
      item.text = String(node.characters || '').slice(0, 120);
      if (typeof node.fontSize === 'number') item.fontSize = Math.round(node.fontSize);
    }
    const kids = (node.children || []).filter((c) => c.visible !== false);
    if (kids.length > 0) {
      item.children = kids.map((k) => buildAiLayerTree(k, depth + 1)).filter(Boolean);
    }
    return item;
  }

  const tree = buildAiLayerTree(root);
  figma.ui.postMessage({
    type: 'ai-scan-payload-ready',
    rootId: root.id,
    rootName: root.name,
    imageBase64,
    tree,
  });
}

async function handleApplyAiTags(tags = []) {
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error('AI không tìm thấy nhãn widget nào phù hợp.');
  }
  let applied = 0;
  for (const item of tags) {
    const id = item.id || item.nodeId;
    const widget = item.widget;
    if (!id || !widget || !SUPPORTED_WIDGETS.includes(widget)) continue;
    const node = figma.getNodeByIdAsync ? await figma.getNodeByIdAsync(id) : null;
    if (node && typeof node.setPluginData === 'function') {
      node.setPluginData(WIDGET_PLUGIN_KEY, widget);
      applied += 1;
    }
  }
  sendOutlineToUi();
  figma.ui.postMessage({
    type: 'ai-tags-applied',
    appliedCount: applied,
    totalCount: tags.length,
  });
  announce(`✨ Gemini Flash AI đã tự động gán thẻ thành công ${applied} widget!`);
}

Promise.all([
  figma.clientStorage.getAsync(STORAGE_SITES_KEY),
  figma.clientStorage.getAsync(STORAGE_PREFS_KEY),
  figma.clientStorage.getAsync(STORAGE_AI_KEY),
]).then(([sites, prefs, aiConfig]) => {
  const list = Array.isArray(sites) ? sites : [];
  const activeUrl = (list[0] && list[0].siteUrl) || '';
  figma.ui.postMessage({
    type: 'init-state',
    sites: list,
    activeSiteUrl: activeUrl,
    widgetCatalog: WIDGET_CATALOG,
    prefs: prefs || {},
    aiConfig: aiConfig || { apiKey: '', model: 'gemini-3.8-flash' },
  });
  if (activeUrl) {
    handleLoadSiteTargets(activeUrl).catch(() => { });
  }
});

figma.ui.onmessage = async (msg) => {
  if (!msg || !msg.type) return;
  const busyTypes = [
    'verify-site',
    'live-push',
    'sync-design-system',
    'scan-design-system',
    'export-action',
    'fix-auto-layout',
    'request-ai-scan-payload',
    'apply-ai-tags',
  ];
  const isBusy = busyTypes.includes(msg.type);
  if (isBusy) figma.ui.postMessage({ type: 'busy', busy: true });

  try {
    switch (msg.type) {
      case 'get-outline':
        sendOutlineToUi();
        break;
      case 'set-widget':
        await setLayerWidgetOverride(msg.nodeId, msg.widget);
        break;
      case 'reset-all-widgets':
        await handleResetAllWidgetOverrides();
        break;
      case 'fix-auto-layout':
        handleFixAutoLayout();
        break;
      case 'request-ai-scan-payload':
        await handleRequestAiScanPayload();
        break;
      case 'apply-ai-tags':
        await handleApplyAiTags(msg.tags);
        break;
      case 'save-ai-config':
        await figma.clientStorage.setAsync(STORAGE_AI_KEY, msg.config);
        announce('Đã lưu cấu hình Gemini API Key thành công!');
        break;
      case 'capture-responsive':
        handleCaptureResponsive(msg.viewport);
        break;
      case 'clear-responsive':
        handleClearResponsive();
        break;
      case 'verify-site':
        await handleVerifyAndSaveSite(msg.config);
        break;
      case 'delete-site':
        await handleDeleteSite(msg.siteUrl);
        break;
      case 'load-site-targets':
        await handleLoadSiteTargets(msg.siteUrl);
        break;
      case 'live-push':
        await handleLivePushToWordPress(msg.payload);
        break;
      case 'sync-design-system':
        await handleSyncDesignSystemOnly(msg.siteUrl, msg.options || {});
        break;
      case 'scan-design-system':
        await handleScanDesignSystemPreview();
        break;
      case 'export-action':
        await handleCompileForClipboardOrDownload(msg.payload);
        break;
      default:
        break;
    }
  } catch (err) {
    const rawMsg = (err && (err.message || (typeof err.toString === 'function' ? err.toString() : ''))) || String(err) || 'Đã xảy ra lỗi.';
    const fullStack = err && err.stack ? ` [${String(err.stack).replace(/\s+/g, ' ').slice(0, 320)}]` : '';
    const text = `${rawMsg}${fullStack}`;
    announce(text.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'), true);
  } finally {
    if (isBusy) figma.ui.postMessage({ type: 'busy', busy: false });
  }
};


})();
