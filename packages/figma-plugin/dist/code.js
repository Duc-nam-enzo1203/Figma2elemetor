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

/** Pure-JS Base64 decoder to Uint8Array (for Figma sandbox without atob) */function base64ToBytes(b64) {
  const clean = String(b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(128);
  for (let i = 0; i < chars.length; i += 1) lookup[chars.charCodeAt(i)] = i;
  const len = clean.length;
  const pad = clean.endsWith('==') ? 2 : (clean.endsWith('=') ? 1 : 0);
  const out = new Uint8Array(Math.max(0, ((len * 3) >> 2) - pad));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c1 = lookup[clean.charCodeAt(i)] || 0;
    const c2 = lookup[clean.charCodeAt(i + 1)] || 0;
    const c3 = lookup[clean.charCodeAt(i + 2)] || 0;
    const c4 = lookup[clean.charCodeAt(i + 3)] || 0;
    const triplet = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;
    if (p < out.length) out[p++] = (triplet >> 16) & 0xff;
    if (p < out.length) out[p++] = (triplet >> 8) & 0xff;
    if (p < out.length) out[p++] = triplet & 0xff;
  }
  return out;
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
  { value: 'background', label: 'Background (Gộp vào ảnh nền)', category: 'Layout', icon: 'image', pro: false },

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
  'tabs',
  'nested-accordion',
  'accordion',
  'toggle',
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
  bg: 'background',
  background: 'background',
  backdrop: 'background',
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
}function hasDescendantImageFill(node, depth = 0) {
  if (!node || depth > 5) return false;
  if (hasImageFill(node)) return true;
  return visibleChildren(node).some((child) => hasDescendantImageFill(child, depth + 1));
}function countImageFills(node, depth = 0) {
  if (!node || depth > 5) return 0;
  let count = hasImageFill(node) ? 1 : 0;
  for (const child of visibleChildren(node)) {
    count += countImageFills(child, depth + 1);
  }
  return count;
}function isSingleMaskedRasterWrapper(node) {
  if (!node || hasImageFill(node)) return false;
  const kids = visibleChildren(node);
  if (kids.length === 0) return false;
  if (collectTextDescendants(node).length > 0) return false;
  if (isVectorGraphic(node)) return false;
  const hasMaskChild = kids.some((k) => Boolean(k && k.isMask));
  if (hasMaskChild && hasDescendantImageFill(node)) return true;
  return countImageFills(node) === 1 && kids.every((k) => k && k.type !== 'TEXT');
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
    return hasImageFill(node) || isSingleMaskedRasterWrapper(node) || (kids.length === 0 && node.type === 'RECTANGLE');
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

  // Leaf with Image fill or single masked/wrapped raster frame -> Image widget
  if ((hasImageFill(node) && kids.length === 0) || isSingleMaskedRasterWrapper(node)) {
    return { widget: 'image', source: 'heuristic' };
  }

  // Button heuristic (compact container with 1 text label and optional 1 icon)
  if (isButtonNode(node, kids)) {
    return { widget: 'button', source: 'heuristic' };
  }

  // Gallery heuristic (3+ sibling images with no text; 2-photo rows stay as containers)
  if (
    kids.length >= 3 &&
    kids.every(
      (child) =>
        collectTextDescendants(child).length === 0 &&
        ((hasImageFill(child) && visibleChildren(child).length === 0) || isSingleMaskedRasterWrapper(child))
    )
  ) {
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

const STRICT_BG_TOKENS = new Set([
  'bg', 'background', 'backdrop', 'overlay', 'hero-bg', 'decor', 'watermark', 'vignette', 'scrim',
]);

const EXACT_SHAPE_BG_NAMES = new Set([
  'line', 'main', 'mask', 'shape', 'shadow', 'glow', 'gradient', 'tint', 'blur', 'pattern', 'wave', 'curve', 'rectangle', 'ellipse',
]);

function hasOverlayOpacityOrBlend(ch) {
  if (!ch) return false;
  if (typeof ch.opacity === 'number' && ch.opacity < 0.95) return true;
  if (ch.blendMode && ch.blendMode !== 'PASS_THROUGH' && ch.blendMode !== 'NORMAL') return true;
  if (Array.isArray(ch.fills)) {
    return ch.fills.some((f) => {
      if (!f || f.visible === false) return false;
      if (typeof f.opacity === 'number' && f.opacity < 0.95) return true;
      if (String(f.type || '').startsWith('GRADIENT_') && Array.isArray(f.gradientStops)) {
        return f.gradientStops.some((st) => st && st.color && typeof st.color.a === 'number' && st.color.a < 0.95);
      }
      return false;
    });
  }
  return false;
}

function boxesOverlap(a, b) {
  const ax1 = Number(a && a.x) || 0;
  const ay1 = Number(a && a.y) || 0;
  const ax2 = ax1 + (Number(a && a.width) || 0);
  const ay2 = ay1 + (Number(a && a.height) || 0);
  const bx1 = Number(b && b.x) || 0;
  const by1 = Number(b && b.y) || 0;
  const bx2 = bx1 + (Number(b && b.width) || 0);
  const by2 = by1 + (Number(b && b.height) || 0);
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

/**
 * Identifies composite background layers inside a container frame (such as multi-layer
 * Hero backgrounds: BG + Mask + Line + Main + Overlay stacked behind Menu/Text/Group).
 *
 * Respects explicit `background` tags (via pluginData or `[bg]` prefix) on any frame,
 * and auto-detects non-text visual layers stacked strictly behind foreground content
 * (plus full-frame translucent overlays above foreground content) inside freeform
 * (non-Auto-Layout) frames without mutating the Figma canvas.
 */function detectCompositeBackgroundChildren(containerNode) {
  const kids = visibleChildren(containerNode);
  if (kids.length < 2) {
    return { bgChildren: [], fgChildren: kids, bgIds: new Set() };
  }

  const bgIds = new Set();

  // 1. Explicit `background` tag (pluginData override or `[bg]` / `[background]` bracket tag)
  for (const child of kids) {
    const resolved = resolveWidget(child);
    if (resolved.widget === 'background') {
      bgIds.add(child.id);
    }
  }

  // 2. Smart Auto-Detection for freeform (non-Auto-Layout) frames with mixed background + foreground content
  const isFreeform = !containerNode.layoutMode || containerNode.layoutMode === 'NONE';
  if (isFreeform) {
    // In Figma API, `children[0]` is bottom-most (lowest z-index), `children[n-1]` is top-most.
    const isForegroundContent = (child) => {
      if (bgIds.has(child.id)) return false;
      const resolved = resolveWidget(child);
      if (resolved.source === 'override' && resolved.widget !== 'background') return true;
      if (collectTextDescendants(child).length > 0) return true;
      return ['nav-menu', 'button', 'form', 'heading', 'text-editor', 'icon-list'].includes(resolved.widget);
    };

    const firstFgIdx = kids.findIndex((c) => isForegroundContent(c));
    if (firstFgIdx >= 0) {
      const fgCandidates = kids.slice(firstFgIdx).filter((c) => isForegroundContent(c));
      const parentArea = Math.max(1, (Number(containerNode.width) || 0) * (Number(containerNode.height) || 0));

      // All non-text layers strictly below the first foreground content layer (`i < firstFgIdx`)
      for (let i = 0; i < firstFgIdx; i += 1) {
        const child = kids[i];
        if (bgIds.has(child.id)) continue;
        if (isForegroundContent(child)) continue;
        const resolved = resolveWidget(child);
        if (resolved.source === 'override' && resolved.widget !== 'background') continue;
        if (collectTextDescendants(child).length > 0) continue;

        const lower = String(child.name || '').trim().toLowerCase();
        const tokens = lower.split(/[^a-z0-9-]+/).filter(Boolean);
        const matchesStrictBg = lower === 'hero bg' || tokens.some((t) => STRICT_BG_TOKENS.has(t));
        const matchesShapeBg = tokens.some((t) => EXACT_SHAPE_BG_NAMES.has(t));
        const cw = Number(child.width) || 0;
        const ch = Number(child.height) || 0;
        const childArea = cw * ch;
        const coversLargeArea = parentArea > 1 && childArea / parentArea >= 0.30;
        const overlapsFg = fgCandidates.some((fg) => boxesOverlap(child, fg));
        const isSmallIcon = isVectorGraphic(child) && cw > 0 && ch > 0 && cw <= 72 && ch <= 72 && !overlapsFg && !coversLargeArea;

        if (matchesStrictBg || (matchesShapeBg && !isSmallIcon) || coversLargeArea || overlapsFg) {
          bgIds.add(child.id);
        }
      }

      // Post-foreground translucent/blend overlays (`i > firstFgIdx`) covering >= 50% of container
      for (let i = firstFgIdx + 1; i < kids.length; i += 1) {
        const child = kids[i];
        if (bgIds.has(child.id)) continue;
        if (isForegroundContent(child)) continue;
        const resolved = resolveWidget(child);
        if (resolved.source === 'override' && resolved.widget !== 'background') continue;
        if (collectTextDescendants(child).length > 0) continue;

        const lower = String(child.name || '').trim().toLowerCase();
        const tokens = lower.split(/[^a-z0-9-]+/).filter(Boolean);
        const matchesStrictBg = lower === 'hero bg' || tokens.some((t) => STRICT_BG_TOKENS.has(t));
        const cw = Number(child.width) || 0;
        const ch = Number(child.height) || 0;
        const childArea = cw * ch;
        const areaRatio = parentArea > 1 ? childArea / parentArea : 0;

        if (areaRatio >= 0.50 && (matchesStrictBg || hasOverlayOpacityOrBlend(child))) {
          bgIds.add(child.id);
        }
      }
    }
  }

  const bgChildren = kids.filter((c) => bgIds.has(c.id));
  const fgChildren = kids.filter((c) => !bgIds.has(c.id));

  // Safety: never bake ALL children into background (must leave at least 1 foreground element)
  if (bgChildren.length === 0 || fgChildren.length === 0) {
    return { bgChildren: [], fgChildren: kids, bgIds: new Set() };
  }

  return { bgChildren, fgChildren, bgIds };
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
 */function inferVirtualLayout(node, overrideChildren = null) {
  const nodeW = Math.round(Number(node.width) || 0);
  const nodeH = Math.round(Number(node.height) || 0);
  const kids = Array.isArray(overrideChildren) ? overrideChildren : visibleChildren(node);

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
 * NON-DESTRUCTIVE Smart Layout & Background Analyzer (ZERO visual mutations on Figma canvas!).
 *
 * Unlike destructive Auto-Layout conversion that shifts overlapping/freeform designs on Figma,
 * this function ONLY writes lightweight `f2e-widget` pluginData tags:
 * 1. Tags composite background layers (e.g. BG + Mask + Line + Main + Overlay behind text/menu)
 *    as `background` so they bake cleanly into 1 WebP Container background image at export time.
 * 2. Tags pure vector groups/frames as `icon` so they export as a single SVG instead of scattered paths.
 * 3. Counts freeform frames that will safely use read-only Virtual Auto-Layout in memory during export.
 */function fixAndOptimizeCanvasSelection(selection) {
  let virtualLayoutFrames = 0;
  let taggedIcons = 0;
  let taggedBackgrounds = 0;

  const processNode = (node) => {
    if (!node || node.visible === false) return;

    const kids = visibleChildren(node);

    // 0. Never tag 1px divider lines as SVG icons
    if (node.type !== 'TEXT' && isDividerNode(node, kids)) {
      return;
    }

    // 1. If node is a pure vector group/frame <= 128x128, mark it as an Icon so children aren't split
    if (isVectorGraphic(node)) {
      const w = Number(node.width) || 0;
      const h = Number(node.height) || 0;
      if (w <= 128 && h <= 128 && typeof node.setPluginData === 'function' && !node.getPluginData('f2e-widget')) {
        node.setPluginData('f2e-widget', 'icon');
        taggedIcons += 1;
      }
      return;
    }

    if (kids.length === 0) return;

    // 2. Detect composite background layers behind foreground content (non-destructive tagging)
    const { bgChildren, fgChildren } = detectCompositeBackgroundChildren(node);
    for (const bgNode of bgChildren) {
      if (typeof bgNode.setPluginData === 'function' && !bgNode.getPluginData('f2e-widget')) {
        bgNode.setPluginData('f2e-widget', 'background');
        taggedBackgrounds += 1;
      }
    }

    // 3. Track freeform frames that will safely use read-only Virtual Auto-Layout at export time
    if ((node.type === 'FRAME' || node.type === 'GROUP') && (!node.layoutMode || node.layoutMode === 'NONE')) {
      virtualLayoutFrames += 1;
    }

    // Recurse only into foreground children (background layers will be baked into 1 composite image)
    for (const child of fgChildren) {
      processNode(child);
    }
  };

  for (const root of selection) {
    processNode(root);
  }

  return { convertedFrames: 0, virtualLayoutFrames, taggedIcons, taggedBackgrounds };
}


  // ── Module: src/extraction/primitives.js ──
/**
 * Low-level Figma node primitive extractors (layout, style, typography, responsive).
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

/** Safe number coercion that never throws on `Symbol(figma.mixed)` */
function safeNum(val, fallback = 0) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

/** Safe string coercion that never throws on `Symbol(figma.mixed)` */
function safeStr(val, fallback = '') {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return fallback;
}
function fontWeightOf(styleName) {
  const key = safeStr(styleName, '').toLowerCase().replace(/[\s_-]|italic|oblique/g, '');
  return WEIGHT_MAP[key] || '400';
}
function rgbToHex(color, alpha = 1) {
  if (!color || typeof color !== 'object') return '#000000';
  const r = Math.round(Math.max(0, Math.min(1, safeNum(color.r, 0))) * 255);
  const g = Math.round(Math.max(0, Math.min(1, safeNum(color.g, 0))) * 255);
  const b = Math.round(Math.max(0, Math.min(1, safeNum(color.b, 0))) * 255);
  const a = alpha !== undefined ? safeNum(alpha, 1) : (color.a !== undefined ? safeNum(color.a, 1) : 1);
  if (a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`;
  }
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
function extractSolidColor(paints) {
  if (!Array.isArray(paints)) return null;
  const paint = [...paints].reverse().find(
    (item) => item && item.type === 'SOLID' && item.visible !== false && safeNum(item.opacity, 1) > 0
  );
  if (!paint || !paint.color) return null;
  return rgbToHex(paint.color, safeNum(paint.opacity, 1));
}
function extractGradient(paints) {
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
}
function extractLayout(node, parentNode = null) {
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
  const rawX = safeNum(node.x, 0);
  const rawY = safeNum(node.y, 0);
  const x = parentNode && parentNode.type === 'GROUP'
    ? Math.round(rawX - safeNum(parentNode.x, 0))
    : Math.round(rawX);
  const y = parentNode && parentNode.type === 'GROUP'
    ? Math.round(rawY - safeNum(parentNode.y, 0))
    : Math.round(rawY);

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

  layout.minWidth = typeof node.minWidth === 'number' ? Math.round(node.minWidth) : (layout.minWidth ?? null);
  layout.maxWidth = typeof node.maxWidth === 'number' ? Math.round(node.maxWidth) : (layout.maxWidth ?? null);
  layout.minHeight = typeof node.minHeight === 'number' ? Math.round(node.minHeight) : (layout.minHeight ?? null);
  layout.maxHeight = typeof node.maxHeight === 'number' ? Math.round(node.maxHeight) : (layout.maxHeight ?? null);

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
}
function extractStyle(node) {
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

    const roundStroke = (v) => {
      const n = safeNum(v, 0);
      return n > 0 ? Math.max(1, Math.round(n)) : 0;
    };

    if (hasIndividualStrokes) {
      const bt = roundStroke(node.strokeTopWeight);
      const br = roundStroke(node.strokeRightWeight);
      const bb = roundStroke(node.strokeBottomWeight);
      const bl = roundStroke(node.strokeLeftWeight);
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
}
function extractTypography(node) {
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
    if (!lineHeightObj && typeof node.getRangeLineHeight === 'function') {
      try {
        const lh = node.getRangeLineHeight(0, 1);
        if (lh && typeof lh === 'object' && lh.unit) lineHeightObj = lh;
      } catch (e) { }
    }
    if (!letterSpacingObj && typeof node.getRangeLetterSpacing === 'function') {
      try {
        const ls = node.getRangeLetterSpacing(0, 1);
        if (ls && typeof ls === 'object') letterSpacingObj = ls;
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
  } else {
    text.fontStyle = 'normal';
  }

  if (lineHeightObj && lineHeightObj.unit !== 'AUTO') {
    if (lineHeightObj.unit === 'PIXELS') {
      text.lineHeight = Math.round(safeNum(lineHeightObj.value, text.fontSize * 1.35));
      text.lineHeightUnit = 'px';
    } else if (lineHeightObj.unit === 'PERCENT') {
      text.lineHeight = Math.round(safeNum(lineHeightObj.value, 135)) / 100;
      text.lineHeightUnit = 'em';
    }
  } else {
    // If AUTO, generate explicit line-height based on font size for 100% theme immunity
    text.lineHeight = Math.round(text.fontSize * (text.fontSize >= 32 ? 1.2 : 1.4));
    text.lineHeightUnit = 'px';
  }

  if (letterSpacingObj && safeNum(letterSpacingObj.value, 0) !== 0) {
    const rawLs = safeNum(letterSpacingObj.value, 0);
    if (letterSpacingObj.unit === 'PERCENT') {
      text.letterSpacing = Math.round((rawLs / 100) * 1000) / 1000;
      text.letterSpacingUnit = 'em';
    } else {
      text.letterSpacing = Math.round(rawLs * 10) / 10;
      text.letterSpacingUnit = 'px';
    }
  }

  if (node.textCase === 'UPPER') text.transform = 'uppercase';
  else if (node.textCase === 'LOWER') text.transform = 'lowercase';
  else if (node.textCase === 'TITLE') text.transform = 'capitalize';

  if (node.textDecoration === 'UNDERLINE') text.decoration = 'underline';
  else if (node.textDecoration === 'STRIKETHROUGH') text.decoration = 'line-through';

  // Extract solid color OR gradient fill on TEXT nodes (e.g. background-clip: text)
  let color = extractSolidColor(fillsArr);
  const textGradient = extractGradient(fillsArr);
  if (textGradient) {
    text.gradient = textGradient;
    text.gradientCss = `linear-gradient(${textGradient.angle}deg, ${textGradient.color1} ${textGradient.stop1}%, ${textGradient.color2} ${textGradient.stop2}%)`;
    text.backgroundClipText = true;
    if (!color) {
      color = textGradient.color2 || textGradient.color1;
    }
  }
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
}
function extractLink(node) {
  const reactions = Array.isArray(node && node.reactions) ? node.reactions : [];
  for (const reaction of reactions) {
    const action = (reaction && reaction.action) || (Array.isArray(reaction && reaction.actions) ? reaction.actions[0] : null);
    if (action && action.type === 'URL' && action.url) {
      return safeStr(action.url);
    }
  }
  return null;
}
function extractButtonIcon(node) {
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
}
function captureResponsiveTree(rootNode) {
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
}
function matchResponsiveOverride(capturedTree, pathNames, expectedType) {
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


  // ── Module: src/extraction/devmode-css.js ──
/**
 * Figma Dev Mode CSS (`node.getCSSAsync()`) parser, normalizer & live inspector.
 */


/**
 * Unwraps CSS variables generated by Figma Dev Mode (`var(--token-name, fallback)`)
 * and strips CSS comments (`/* 140% *\/`) so exact values are extracted deterministically.
 */
function resolveCssVars(rawVal) {
  if (typeof rawVal !== 'string') return '';
  let s = rawVal.replace(/\/\*[\s\S]*?\*\//g, '').trim();
  for (let pass = 0; pass < 64; pass += 1) {
    const lower = s.toLowerCase();
    let searchPos = 0;
    let replaced = false;
    while (searchPos < s.length) {
      const idx = lower.indexOf('var(', searchPos);
      if (idx === -1) break;
      let depth = 0;
      let commaIdx = -1;
      let endIdx = -1;
      for (let i = idx + 3; i < s.length; i += 1) {
        const ch = s[i];
        if (ch === '(') depth += 1;
        else if (ch === ')') {
          depth -= 1;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        } else if (ch === ',' && depth === 1 && commaIdx === -1) {
          commaIdx = i;
        }
      }
      if (endIdx === -1) break;
      if (commaIdx !== -1) {
        const varName = s.slice(idx + 4, commaIdx).trim();
        if (varName.startsWith('--')) {
          const fallback = s.slice(commaIdx + 1, endIdx).trim();
          s = `${s.slice(0, idx)}${fallback}${s.slice(endIdx + 1)}`.trim();
          replaced = true;
          break;
        }
      }
      searchPos = idx + 4;
    }
    if (!replaced) break;
  }
  return s;
}

function splitTopLevelCssLayers(str) {
  const layers = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i += 1) {
    if (str[i] === '(') depth += 1;
    else if (str[i] === ')') depth = Math.max(0, depth - 1);
    else if (str[i] === ',' && depth === 0) {
      const part = str.slice(start, i).trim();
      if (part) layers.push(part);
      start = i + 1;
    }
  }
  const tail = str.slice(start).trim();
  if (tail) layers.push(tail);
  return layers;
}
function sanitizeDevModeBackgroundCss(devBg) {
  if (!devBg || typeof devBg !== 'string') return '';
  const layers = splitTopLevelCssLayers(devBg);
  const cleanLayers = layers.filter((layer) => !/url\(\s*<[^>]*>\s*\)/i.test(layer));
  return cleanLayers.join(', ').trim();
}

/**
 * Normalizes CSS color strings from Figma Dev Mode (e.g. `#FFF` -> `#FFFFFF`, `#000` -> `#000000`, `var(--c, #16A34A)` -> `#16A34A`).
 */
function normalizeCssColor(rawColor) {
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
 */
function applyDevModeCSSToNode(entry, devModeCSS) {
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
    const rClean = resolveCssVars(devModeCSS['border-radius']).split('/')[0].trim();
    const rawTokens = rClean.split(/\s+/).filter(Boolean);
    const hasPct = rawTokens.some((tok) => tok.includes('%') && parseFloat(tok) !== 0);
    const unit = hasPct ? '%' : 'px';
    const parts = rawTokens.map((p) => parseFloat(p) || 0);
    if (parts.length === 1 && parts[0] > 0) {
      style.radius = { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0], isLinked: true, unit };
    } else if (parts.length === 2) {
      style.radius = { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1], isLinked: false, unit };
    } else if (parts.length === 3) {
      style.radius = { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1], isLinked: false, unit };
    } else if (parts.length >= 4) {
      style.radius = { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3], isLinked: false, unit };
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
        const bsMatch = bClean.match(/\b(solid|dashed|dotted|double)\b/i);
        if (bsMatch) style.borderStyle = bsMatch[1].toLowerCase();
      }
    }
  }

  if (devModeCSS['border-style']) {
    const bsClean = resolveCssVars(devModeCSS['border-style']).toLowerCase();
    if (/^(solid|dashed|dotted|double)$/.test(bsClean)) {
      style.borderStyle = bsClean;
    }
  }

  if (devModeCSS['border-color']) {
    const c = normalizeCssColor(devModeCSS['border-color']);
    if (c) style.borderColor = c;
  }

  // 2. Authoritative Dev Mode Background & Gradient (including multi-stop gradients & background-clip: text on TEXT layers)
  const rawDevBg = resolveCssVars(devModeCSS['background'] || devModeCSS['background-color'] || '');
  const devBg = sanitizeDevModeBackgroundCss(rawDevBg);
  const hadImagePlaceholder = rawDevBg !== devBg;
  const isTextClip = Boolean(
    entry.type === 'text' ||
    (devModeCSS['background-clip'] && String(devModeCSS['background-clip']).includes('text')) ||
    (devModeCSS['-webkit-background-clip'] && String(devModeCSS['-webkit-background-clip']).includes('text')) ||
    (devModeCSS['-webkit-text-fill-color'] && String(devModeCSS['-webkit-text-fill-color']).includes('transparent'))
  );

  if (devBg) {
    if (devBg.includes('gradient')) {
      const angleMatch = devBg.match(/([\d.]+)deg/);
      const angle = angleMatch ? parseInt(angleMatch[1], 10) : 180;
      const colors = (devBg.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g) || []).map((c) => normalizeCssColor(c) || c);
      const parsedGrad = colors.length >= 2
        ? {
            type: devBg.includes('radial-gradient') ? 'radial' : 'linear',
            angle,
            color1: colors[0],
            stop1: 0,
            color2: colors[colors.length - 1],
            stop2: 100,
          }
        : null;

      if (isTextClip) {
        const text = entry.text || (entry.text = {});
        text.gradientCss = devBg;
        text.backgroundClipText = true;
        if (parsedGrad) {
          text.gradient = parsedGrad;
          if (!text.color) {
            text.color = parsedGrad.color2 || parsedGrad.color1;
          }
        }
        if (entry.type === 'text') {
          delete style.gradient;
          delete style.background;
        }
      } else if (parsedGrad && !(entry.widget === 'image' && hadImagePlaceholder)) {
        style.gradient = parsedGrad;
        // Preserve full CSS gradient string when Figma Dev Mode has 3+ color stops or stacked gradients
        if (colors.length >= 3 || (devBg.match(/gradient\(/g) || []).length > 1) {
          style.devModeBackgroundCss = devBg;
        }
      }
    } else if (!(entry.widget === 'image' && hadImagePlaceholder)) {
      const solidBg = normalizeCssColor(devBg);
      if (solidBg) {
        if (entry.type === 'text') {
          const text = entry.text || (entry.text = {});
          if (!text.color) text.color = solidBg;
        } else {
          style.background = solidBg;
        }
      }
    }
  }

  if (devModeCSS['background-size']) {
    style.backgroundSize = resolveCssVars(devModeCSS['background-size']);
  }
  if (devModeCSS['background-position']) {
    style.backgroundPosition = resolveCssVars(devModeCSS['background-position']);
  }
  if (devModeCSS['background-repeat']) {
    style.backgroundRepeat = resolveCssVars(devModeCSS['background-repeat']);
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
  if (devModeCSS['align-self']) {
    const asVal = resolveCssVars(devModeCSS['align-self']).toLowerCase();
    if (/^(flex-start|start|center|flex-end|end|stretch)$/.test(asVal)) {
      layout.alignSelf = asVal === 'start' ? 'flex-start' : (asVal === 'end' ? 'flex-end' : asVal);
    }
  }
  if (devModeCSS['overflow']) {
    const ovVal = resolveCssVars(devModeCSS['overflow']).toLowerCase();
    if (/^(hidden|auto|scroll|visible)$/.test(ovVal)) {
      layout.overflow = ovVal;
      if (ovVal === 'hidden') layout.clipsContent = true;
    }
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
    const rawW = resolveCssVars(devModeCSS['width']);
    if (rawW && !rawW.includes('%')) {
      const wVal = parseFloat(rawW);
      if (!isNaN(wVal)) layout.width = Math.round(wVal);
    }
  }

  if (devModeCSS['height'] && (!layout.height || layout.height === 0)) {
    const rawH = resolveCssVars(devModeCSS['height']);
    if (rawH && !rawH.includes('%')) {
      const hVal = parseFloat(rawH);
      if (!isNaN(hVal)) layout.height = Math.round(hVal);
    }
  }
  if (devModeCSS['min-height']) {
    const mhVal = parseFloat(resolveCssVars(devModeCSS['min-height']));
    if (!isNaN(mhVal) && mhVal > 0) layout.minHeight = Math.round(mhVal);
  }
  if (devModeCSS['max-width']) {
    const mwVal = parseFloat(resolveCssVars(devModeCSS['max-width']));
    if (!isNaN(mwVal) && mwVal > 0) layout.maxWidth = Math.round(mwVal);
  }
  if (devModeCSS['min-width']) {
    const minWVal = parseFloat(resolveCssVars(devModeCSS['min-width']));
    if (!isNaN(minWVal) && minWVal > 0) layout.minWidth = Math.round(minWVal);
  }

  // 3b. Authoritative Dev Mode Box Shadow & Opacity
  if (devModeCSS['box-shadow']) {
    const bsClean = resolveCssVars(devModeCSS['box-shadow']);
    if (bsClean && bsClean !== 'none') {
      // Split top-level comma-separated shadow layers (ignoring commas inside rgba())
      const shadowLayers = [];
      let depth = 0;
      let start = 0;
      for (let i = 0; i < bsClean.length; i += 1) {
        if (bsClean[i] === '(') depth += 1;
        else if (bsClean[i] === ')') depth = Math.max(0, depth - 1);
        else if (bsClean[i] === ',' && depth === 0) {
          shadowLayers.push(bsClean.slice(start, i).trim());
          start = i + 1;
        }
      }
      shadowLayers.push(bsClean.slice(start).trim());
      const validLayers = shadowLayers.filter(Boolean);
      if (validLayers.length > 1) {
        // Multi-layer box-shadow: preserve exact CSS in custom_css
        style.devModeBoxShadow = bsClean;
      }
      const first = validLayers[0] || '';
      const isInset = /\binset\b/i.test(first);
      const color = normalizeCssColor(first) || 'rgba(0,0,0,0.15)';
      const nums = (first.replace(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|\binset\b/gi, '').match(/-?[\d.]+(?=px|\b)/g) || []).map((n) => parseFloat(n));
      if (nums.length >= 2) {
        style.boxShadow = {
          horizontal: Math.round(nums[0] || 0),
          vertical: Math.round(nums[1] || 0),
          blur: Math.round(nums[2] || 0),
          spread: Math.round(nums[3] || 0),
          color,
          position: isInset ? 'inset' : '',
        };
      }
    }
  }

  if (devModeCSS['opacity'] !== undefined) {
    const opVal = parseFloat(resolveCssVars(devModeCSS['opacity']));
    if (!isNaN(opVal) && opVal >= 0 && opVal < 1) {
      style.opacity = Math.round(opVal * 1000) / 1000;
    }
  }

  // 3c. Lossless Residual Dev Mode CSS Passthrough
  // Properties that Elementor has no native UI control for (glassmorphism, blend modes, filters, transforms, etc.)
  const RESIDUAL_PROPS = [
    'backdrop-filter',
    '-webkit-backdrop-filter',
    'filter',
    'mix-blend-mode',
    'background-blend-mode',
    'transform',
    'aspect-ratio',
    'clip-path',
    '-webkit-text-stroke',
    '-webkit-text-stroke-width',
    '-webkit-text-stroke-color',
    'font-feature-settings',
    'font-variant-numeric',
  ];
  for (const prop of RESIDUAL_PROPS) {
    if (devModeCSS[prop]) {
      const val = resolveCssVars(devModeCSS[prop]);
      if (val && val !== 'none' && val !== 'normal' && val !== 'auto') {
        if (!style.devModeExtraCss) style.devModeExtraCss = {};
        style.devModeExtraCss[prop] = val;
      }
    }
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
      } else if (lhClean === 'normal') {
        text.lineHeightRaw = 'normal';
        text.lineHeight = 1.2;
        text.lineHeightUnit = 'em';
      } else if (/^[\d.]+$/.test(lhClean)) {
        text.lineHeight = Math.round(parseFloat(lhClean) * 100) / 100;
        text.lineHeightUnit = 'em';
      }
    }
    if (devModeCSS['color']) {
      const normC = normalizeCssColor(devModeCSS['color']);
      if (normC) text.color = normC;
    }
    if (devModeCSS['letter-spacing']) {
      const lsMatch = resolveCssVars(devModeCSS['letter-spacing']).match(/([-\d.]+)\s*(px|em|rem|%)?/i);
      if (lsMatch) {
        const lsVal = parseFloat(lsMatch[1]);
        const lsUnit = (lsMatch[2] || 'px').toLowerCase();
        if (!Number.isNaN(lsVal)) {
          if (lsUnit === '%') {
            text.letterSpacing = Math.round((lsVal / 100) * 1000) / 1000;
            text.letterSpacingUnit = 'em';
          } else {
            text.letterSpacing = lsVal;
            text.letterSpacingUnit = lsUnit;
          }
        }
      }
    }
    if (devModeCSS['text-align']) {
      text.align = resolveCssVars(devModeCSS['text-align']).toLowerCase();
    }
    if (devModeCSS['text-transform']) {
      text.transform = resolveCssVars(devModeCSS['text-transform']);
    }
    if (devModeCSS['text-decoration'] || devModeCSS['text-decoration-line']) {
      const td = resolveCssVars(devModeCSS['text-decoration-line'] || devModeCSS['text-decoration']).toLowerCase();
      if (td.includes('underline')) text.decoration = 'underline';
      else if (td.includes('line-through')) text.decoration = 'line-through';
      else if (td.includes('overline')) text.decoration = 'overline';
    }
    if (devModeCSS['font-style']) {
      text.fontStyle = resolveCssVars(devModeCSS['font-style']);
    }
    if (devModeCSS['text-shadow']) {
      const tsClean = resolveCssVars(devModeCSS['text-shadow']);
      if (tsClean && tsClean !== 'none') {
        const tsColor = normalizeCssColor(tsClean) || 'rgba(0,0,0,0.25)';
        const tsNums = (tsClean.replace(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/gi, '').match(/-?[\d.]+(?=px|\b)/g) || []).map((n) => parseFloat(n));
        if (tsNums.length >= 2) {
          text.textShadow = {
            horizontal: Math.round(tsNums[0] || 0),
            vertical: Math.round(tsNums[1] || 0),
            blur: Math.round(tsNums[2] || 0),
            color: tsColor,
          };
        }
      }
    }
    if (devModeCSS['-webkit-text-stroke']) {
      const strokeVal = resolveCssVars(devModeCSS['-webkit-text-stroke']);
      if (strokeVal && strokeVal !== 'none') {
        text.textStrokeCss = strokeVal;
      }
    }
  }
}

/**
 * Live Inspector for Figma Dev Mode CSS (`await node.getCSSAsync()`).
 * Extracts raw Dev Mode CSS, unwraps `var(--token, fallback)` values, identifies CSS variables
 * and color swatches, and computes the exact Elementor widget & control mapping for display in the Plugin UI.
 */
async function inspectNodeDevMode(node, options = {}) {
  if (!node) return null;
  const { includeSubtree = false, maxSubtreeNodes = 20 } = options;

  const inspectSingle = async (target, depth = 0, parent = null) => {
    let rawCss = {};
    let hasNativeApi = false;
    if (typeof target.getCSSAsync === 'function') {
      hasNativeApi = true;
      try {
        const res = await target.getCSSAsync();
        if (res && typeof res === 'object') {
          rawCss = { ...res };
        }
      } catch (e) { }
    }

    const choice = resolveWidget(target);
    const entry = {
      id: target.id,
      name: safeStr(target.name, 'Unnamed'),
      type: target.type === 'TEXT' ? 'text' : safeStr(target.type, 'FRAME').toLowerCase(),
      rawType: safeStr(target.type, 'FRAME'),
      widget: choice.widget,
      widgetSource: choice.source,
      layout: extractLayout(target, parent),
      style: extractStyle(target),
      text: target.type === 'TEXT' ? extractTypography(target) : null,
    };

    if (Object.keys(rawCss).length > 0) {
      applyDevModeCSSToNode(entry, rawCss);
    }

    const resolvedCss = {};
    const cssVariables = [];
    const lines = [];
    const resolvedLines = [];

    for (const [prop, val] of Object.entries(rawCss)) {
      const strVal = String(val);
      const unwrapped = resolveCssVars(strVal);
      resolvedCss[prop] = unwrapped;
      lines.push(`  ${prop}: ${strVal};`);
      resolvedLines.push(`  ${prop}: ${unwrapped};`);

      const varMatches = strVal.match(/--[a-zA-Z0-9_-]+/g);
      if (varMatches) {
        for (const vm of varMatches) {
          if (!cssVariables.includes(vm)) cssVariables.push(vm);
        }
      }
    }

    // Build selector slug from layer name
    const slug = safeStr(target.name, 'layer')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'layer';
    const selector = `.f2e-${slug}`;

    const headerComment = `/* Layer: "${entry.name}" (${target.id}) | Type: ${entry.rawType} | Elementor: ${entry.widget} */`;
    const cssBlock = lines.length > 0
      ? `${headerComment}\n${selector} {\n${lines.join('\n')}\n}`
      : `${headerComment}\n${selector} {\n  /* Node không có thuộc tính CSS trực tiếp từ getCSSAsync() */\n}`;

    const resolvedCssBlock = resolvedLines.length > 0
      ? `${headerComment}\n${selector} {\n${resolvedLines.join('\n')}\n}`
      : cssBlock;

    // Build human-readable Elementor Mapping Summary pills
    const mappingPills = [];
    const L = entry.layout || {};
    const S = entry.style || {};
    const T = entry.text || null;

    if (L.width || L.height) {
      const hMode = L.sizingH ? ` (${L.sizingH})` : '';
      const vMode = L.sizingV ? ` (${L.sizingV})` : '';
      mappingPills.push({ label: 'Size', value: `${L.width || 0}px${hMode} × ${L.height || 0}px${vMode}` });
    }
    if (L.mode === 'flex') {
      mappingPills.push({
        label: 'Flex',
        value: `${L.direction || 'row'}${L.wrap ? ' wrap' : ''} • align: ${L.align || 'MIN'} / ${L.justify || 'MIN'}`,
      });
    } else if (L.mode === 'grid') {
      mappingPills.push({ label: 'Grid', value: `${L.columns || 2} cols` });
    }
    if (typeof L.gap === 'number' && L.gap > 0) {
      mappingPills.push({ label: 'Gap', value: `${L.gap}px` });
    }
    if (L.padding && (L.padding.top || L.padding.right || L.padding.bottom || L.padding.left)) {
      mappingPills.push({
        label: 'Padding',
        value: `${L.padding.top}px ${L.padding.right}px ${L.padding.bottom}px ${L.padding.left}px`,
      });
    }
    if (S.background) {
      mappingPills.push({ label: 'BG', value: S.background, color: S.background });
    } else if (S.gradient) {
      mappingPills.push({ label: 'Gradient', value: `${S.gradient.angle}deg (${S.gradient.color1} → ${S.gradient.color2})`, color: S.gradient.color1 });
    }
    if (S.borderWidth && (S.borderWidth.top || S.borderWidth.right || S.borderWidth.bottom || S.borderWidth.left)) {
      const bw = S.borderWidth;
      const bwStr = bw.isLinked ? `${bw.top}px` : `${bw.top}px ${bw.right}px ${bw.bottom}px ${bw.left}px`;
      mappingPills.push({
        label: 'Border',
        value: `${bwStr} solid ${S.borderColor || '#000000'}`,
        color: S.borderColor || null,
      });
    }
    if (S.radius && (S.radius.top || S.radius.right || S.radius.bottom || S.radius.left)) {
      const r = S.radius;
      const rStr = r.isLinked ? `${r.top}px` : `${r.top}px ${r.right}px ${r.bottom}px ${r.left}px`;
      mappingPills.push({ label: 'Radius', value: rStr });
    }
    if (T) {
      mappingPills.push({
        label: 'Font',
        value: `${T.fontFamily} ${T.fontWeight} • ${T.fontSize}px/${T.lineHeight || ''}${T.lineHeightUnit || 'px'}`,
        color: T.color || null,
      });
      if (T.gradientCss || T.gradient) {
        const gLabel = T.gradient
          ? `${T.gradient.angle}deg (${T.gradient.color1} → ${T.gradient.color2})`
          : T.gradientCss;
        mappingPills.push({
          label: 'Text Gradient',
          value: gLabel,
          color: (T.gradient && T.gradient.color1) || T.color || null,
        });
      }
    }

    return {
      nodeId: target.id,
      name: entry.name,
      type: entry.rawType,
      depth,
      width: L.width || 0,
      height: L.height || 0,
      widget: entry.widget,
      widgetSource: entry.widgetSource,
      hasNativeApi,
      propertyCount: Object.keys(rawCss).length,
      rawCss,
      resolvedCss,
      cssVariables,
      cssBlock,
      resolvedCssBlock,
      mappingPills,
    };
  };

  const rootResult = await inspectSingle(node, 0, node.parent || null);

  if (includeSubtree) {
    const subtreeBlocks = [rootResult.cssBlock];
    const subtreeResolvedBlocks = [rootResult.resolvedCssBlock];
    const subtreeNodes = [];
    let visited = 0;

    const walkKids = async (curr, depth) => {
      const kids = visibleChildren(curr);
      for (const child of kids) {
        if (visited >= maxSubtreeNodes) return;
        visited += 1;
        const childInfo = await inspectSingle(child, depth, curr);
        subtreeNodes.push(childInfo);
        if (childInfo.propertyCount > 0) {
          subtreeBlocks.push(childInfo.cssBlock);
          subtreeResolvedBlocks.push(childInfo.resolvedCssBlock);
        }
        await walkKids(child, depth + 1);
      }
    };

    await walkKids(node, 1);
    rootResult.subtreeCount = subtreeNodes.length;
    rootResult.subtreeCssBlock = subtreeBlocks.join('\n\n');
    rootResult.subtreeResolvedCssBlock = subtreeResolvedBlocks.join('\n\n');
  }

  return rootResult;
}


  // ── Module: src/extraction/design-system.js ──
/**
 * Design System & Site Settings extraction (Local Variables/Styles + Dev Mode auto-synthesis).
 */
function detectColorRole(name) {
  const lower = safeStr(name).toLowerCase();
  if (/(^|[-_/ ])(primary|brand|main)([-_/ ]|$)/i.test(lower)) return 'primary';
  if (/(^|[-_/ ])(secondary)([-_/ ]|$)/i.test(lower)) return 'secondary';
  if (/(^|[-_/ ])(text|body|content|foreground)([-_/ ]|$)/i.test(lower)) return 'text';
  if (/(^|[-_/ ])(accent|highlight)([-_/ ]|$)/i.test(lower)) return 'accent';
  return 'custom';
}
function detectTypographyRole(name) {
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
async function extractLocalDesignSystem(figmaApi, activeSelection = null) {
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
        recordColor(textHex, isBtn ? 'btn' : 'text', extractVarNameFromCssVal(cssColor));
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
        recordColor(bgRaw, isBtn ? 'btn' : 'bg', extractVarNameFromCssVal(bgRaw));
      } else if (bgRaw && String(bgRaw).includes('gradient')) {
        const colorMatches = String(bgRaw).match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/gi) || [];
        for (const cm of colorMatches.slice(0, 2)) {
          recordColor(cm, isBtn ? 'btn' : 'bg', extractVarNameFromCssVal(bgRaw));
        }
      } else {
        const solidBg = extractSolidColor(n.fills);
        if (solidBg) recordColor(solidBg, isBtn ? 'btn' : 'bg');
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

/**
 * Full extraction of selected Figma nodes into the F2E Intermediate Representation (IR)
 */
async function extractDesignSelection(selection, options = {}) {
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

    if (['call-to-action', 'testimonial', 'flip-box', 'price-table'].includes(choice.widget)) {
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
      for (const slideChild of rawKids) {
        if (!slideChild || slideChild.visible === false) continue;
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

      const isPureRedAsterisk = (color) => {
        if (!color || typeof color !== 'string') return false;
        const c = color.trim().toUpperCase();
        return c === '#FF0000' || c === '#F00' || c === '#EF4444' || c === '#DC2626' || c === '#E11D48';
      };

      const isButtonLikeNode = (n) => {
        if (!n || n.type === 'TEXT') return false;
        const tCount = collectTextDescendants(n).length;
        if (tCount === 0 || tCount > 2) return false;
        const lower = safeStr(n.name).toLowerCase();
        if (lower.includes('btn') || lower.includes('button') || lower.includes('submit') || lower.includes('cta')) return true;
        const resolved = resolveWidget(n);
        return resolved && resolved.widget === 'button';
      };

      const isInputBoxLike = (k) => {
        if (!k || k.type === 'TEXT') return false;
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
          kName.includes('field')
        );
      };

      const findInputBoxNode = (fieldNode) => {
        const kids = visibleChildren(fieldNode);
        // Look for a styled child box (has background, border, or radius and is not a label/TEXT node)
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

      const parseSingleField = async (fieldNode, parentRef, widthPct = '100') => {
        const lowerName = safeStr(fieldNode.name).toLowerCase();
        const childTextNodes = collectTextDescendants(fieldNode);
        const texts = childTextNodes.map((t) => safeStr(t.characters || t.name).trim()).filter(Boolean);
        if (texts.length === 0) return;

        // If label is split across two text nodes (e.g. "Họ và tên" + "*"), combine them cleanly
        let label = texts[0];
        let placeholderIdx = 1;
        if (texts.length >= 2 && texts[1] === '*') {
          label = `${texts[0]} *`;
          placeholderIdx = 2;
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

        let fieldType = 'text';
        if (combinedSearch.includes('email') || combinedSearch.includes('mail')) {
          fieldType = 'email';
        } else if (combinedSearch.includes('phone') || combinedSearch.includes('tel') || combinedSearch.includes('điện thoại') || combinedSearch.includes('sđt')) {
          fieldType = 'tel';
        } else if (combinedSearch.includes('số lượng') || combinedSearch.includes('quantity')) {
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

        formFields.push({
          id: `field_${formFields.length + 1}`,
          type: fieldType,
          label: cleanLabel,
          placeholder,
          required: isRequired || fieldType === 'email' ? 'true' : '',
          width: widthPct,
        });
      };

      const walkFormChildren = async (kids, parentRef, depth = 0) => {
        for (const child of kids) {
          if (!child || child.visible === false) continue;

          if (isButtonLikeNode(child)) {
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
          if (depth < 3 && grandFrameKids.length >= 2) {
            const isHorizontalRow = child.layoutMode === 'HORIZONTAL';
            if (isHorizontalRow) {
              const nonBtnCols = grandFrameKids.filter((gk) => !isButtonLikeNode(gk));
              const colPct = nonBtnCols.length === 2 ? '50' : (nonBtnCols.length === 3 ? '33' : '100');
              for (const colField of grandKids) {
                if (isButtonLikeNode(colField)) {
                  await walkFormChildren([colField], child, depth + 1);
      } else {
                  await parseSingleField(colField, child, colPct);
                }
              }
              continue;
            }
            // Vertical wrapper (e.g. "Fields" group containing multiple fields)
            if (allTextsInChild.length >= 3 || grandFrameKids.every((gk) => collectTextDescendants(gk).length >= 1)) {
              await walkFormChildren(grandKids, child, depth + 1);
              continue;
            }
          }

          // Case 2: Single field node (e.g. Field -> [Label, Input Box])
          await parseSingleField(child, parentRef, '100');
        }
      };

      await walkFormChildren(rawKids, node, 0);
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
function collectVisualImageDescendants(node, options = {}, depth = 0) {
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
function findFirstVisualDescendant(node, depth = 0) {
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



  // ── Module: src/exporters/compiler-helpers.js ──
/**
 * Shared Elementor v3/v4 compiler helpers (box values, typography, box styles, subtree collectors).
 */
function boxValue(box, isLinked = false) {
  const t = Math.round(Number(box && box.top) || 0);
  const r = Math.round(Number(box && box.right) || 0);
  const b = Math.round(Number(box && box.bottom) || 0);
  const l = Math.round(Number(box && box.left) || 0);
  return {
    unit: (box && box.unit) || 'px',
    top: String(t),
    right: String(r),
    bottom: String(b),
    left: String(l),
    isLinked: Boolean(box && box.isLinked !== undefined ? box.isLinked : (isLinked || (t === r && r === b && b === l))),
  };
}
function scaleBox(box, factor, cap) {
  if (box && box.unit && box.unit !== 'px') {
    return {
      top: Number(box.top) || 0,
      right: Number(box.right) || 0,
      bottom: Number(box.bottom) || 0,
      left: Number(box.left) || 0,
      isLinked: Boolean(box.isLinked),
      unit: box.unit,
    };
  }
  return {
    top: Math.min(cap, Math.round((Number(box && box.top) || 0) * factor)),
    right: Math.min(cap, Math.round((Number(box && box.right) || 0) * factor)),
    bottom: Math.min(cap, Math.round((Number(box && box.bottom) || 0) * factor)),
    left: Math.min(cap, Math.round((Number(box && box.left) || 0) * factor)),
    isLinked: false,
    unit: 'px',
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
function applyGlobalColor() {
  // Exact Figma hex colors are preserved directly on Elementor controls.
  // Verified Active Kit `__globals__` IDs are bound server-side by WordPress `GlobalStyles::bindGlobalsToElements()`.
}
function appendCustomCss(settings, cssBlock) {
  if (!settings || !cssBlock || !String(cssBlock).trim()) return;
  const block = String(cssBlock).trim();
  settings.custom_css = settings.custom_css ? `${settings.custom_css}\n${block}` : block;
}

/**
 * Zero-Loss Dev Mode Residual CSS Passthrough:
 * Emits Figma Dev Mode properties that Elementor has no native UI control for
 * (multi-stop gradients, multi-layer box-shadow, backdrop-filter, filter, mix-blend-mode,
 * transform, aspect-ratio, clip-path, opacity, -webkit-text-stroke) into `custom_css`.
 */
function applyDevModeResidualCss(settings, style = {}, targetSelector = 'selector') {
  if (!settings || !style) return;
  const decls = [];
  if (style.devModeBackgroundCss && !style.backgroundImage && !/url\(\s*</i.test(style.devModeBackgroundCss)) {
    decls.push(`  background: ${style.devModeBackgroundCss};`);
  }
  if (style.devModeBoxShadow) {
    decls.push(`  box-shadow: ${style.devModeBoxShadow};`);
  }
  if (typeof style.opacity === 'number' && style.opacity >= 0 && style.opacity < 1) {
    decls.push(`  opacity: ${style.opacity};`);
  }
  if (style.devModeExtraCss && typeof style.devModeExtraCss === 'object') {
    for (const [prop, val] of Object.entries(style.devModeExtraCss)) {
      if (!val) continue;
      // Avoid emitting -webkit-text-stroke on outer container if handled on text selector
      if (targetSelector === 'selector' && prop.startsWith('-webkit-text-stroke')) continue;
      decls.push(`  ${prop}: ${val};`);
    }
  }
  if (decls.length > 0) {
    appendCustomCss(settings, `${targetSelector} {\n${decls.join('\n')}\n}`);
  }
}
function applyTextShadowAndEffects(settings, text = {}, selectorTarget = 'selector') {
  if (!settings || !text) return;
  if (text.textShadow && typeof text.textShadow === 'object') {
    settings.text_shadow_text_shadow_type = 'yes';
    settings.text_shadow_text_shadow = {
      horizontal: Math.round(Number(text.textShadow.horizontal) || 0),
      vertical: Math.round(Number(text.textShadow.vertical) || 0),
      blur: Math.round(Number(text.textShadow.blur) || 0),
      color: text.textShadow.color || 'rgba(0,0,0,0.25)',
    };
  }
  if (text.textStrokeCss) {
    appendCustomCss(settings, `${selectorTarget} {\n  -webkit-text-stroke: ${text.textStrokeCss};\n}`);
  }
}
function applyCommonBoxStyle(settings, style = {}, resolveMedia, options = {}) {
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
  }

  if (style.backgroundImage && resolveMedia) {
    const media = resolveMedia(style.backgroundImage, style.backgroundImageDataUri);
    if (media.url) {
      settings.background_background = 'classic';
      settings.background_image = media;
      settings.background_size = style.backgroundSize || 'cover';
      settings.background_position = style.backgroundPosition || 'center center';
      settings.background_repeat = style.backgroundRepeat || 'no-repeat';
    }
  }

  if (style.radius) {
    settings.border_radius = boxValue(style.radius);
  }

  const bt = Math.round(Number(style.borderWidth && style.borderWidth.top) || 0);
  const br = Math.round(Number(style.borderWidth && style.borderWidth.right) || 0);
  const bb = Math.round(Number(style.borderWidth && style.borderWidth.bottom) || 0);
  const bl = Math.round(Number(style.borderWidth && style.borderWidth.left) || 0);
  const hasAnyBorderWidth = bt > 0 || br > 0 || bb > 0 || bl > 0;
  const isVerticalDividerOnly = bt === 0 && bb === 0 && (br > 0 || bl > 0);

  if (hasAnyBorderWidth && style.borderColor) {
    settings.border_border = style.borderStyle || 'solid';
    settings.border_width = boxValue(style.borderWidth);
    settings.border_color = style.borderColor;
    // When a column divider border is right-only or left-only on Desktop, clear it on Mobile where columns stack vertically
    if (isVerticalDividerOnly) {
      settings.border_width_mobile = boxValue({ top: 0, right: 0, bottom: 0, left: 0 }, true);
    }
  }

  // Linear Gradient Border Solution:
  // Elementor does not natively support linear-gradient on border-color.
  // Preserve EXACT per-side border widths (`border-width: T R B L !important;`) so 1-sided borders
  // (e.g. `border-right: 1px solid`) NEVER turn into 4-sided full box borders!
  if (options.linearBorder !== false && style.borderGradient && hasAnyBorderWidth) {
    const g = style.borderGradient;
    const gradCss = style.devModeBorderImage && style.devModeBorderImage.startsWith('linear-gradient')
      ? style.devModeBorderImage
      : `linear-gradient(${g.angle}deg, ${g.color1} ${g.stop1}%, ${g.color2} ${g.stop2}%)`;
    const bgSolid = style.background || '#ffffff';
    const bgLayer = style.gradient
      ? `linear-gradient(${style.gradient.angle}deg, ${style.gradient.color1} ${style.gradient.stop1}%, ${style.gradient.color2} ${style.gradient.stop2}%)`
      : `linear-gradient(${bgSolid}, ${bgSolid})`;
    const bwCss = (bt === br && br === bb && bb === bl) ? `${bt}px` : `${bt}px ${br}px ${bb}px ${bl}px`;
    const allFourSides = bt > 0 && br > 0 && bb > 0 && bl > 0;

    let borderSnippet = '';
    if (style.radius && allFourSides) {
      borderSnippet = `selector {\n  border-style: solid !important;\n  border-color: transparent !important;\n  border-width: ${bwCss} !important;\n  background-image: ${bgLayer}, ${gradCss} !important;\n  background-origin: border-box !important;\n  background-clip: padding-box, border-box !important;\n}`;
    } else {
      borderSnippet = `selector {\n  border-style: solid !important;\n  border-width: ${bwCss} !important;\n  border-image: ${gradCss} 1 !important;\n}`;
      if (isVerticalDividerOnly) {
        borderSnippet += `\n@media (max-width: 767px) {\n  selector { border-width: 0 !important; }\n}`;
      }
    }
    appendCustomCss(settings, borderSnippet);
  }

  if (style.boxShadow) {
    settings.box_shadow_box_shadow_type = 'yes';
    settings.box_shadow_box_shadow = style.boxShadow;
    if (style.boxShadow.position === 'inset') {
      settings.box_shadow_box_shadow_position = 'inset';
    }
  }

  applyDevModeResidualCss(settings, style, 'selector');
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
  if (typeof text.letterSpacing === 'number' && text.letterSpacing !== 0) {
    settings[`${prefix}_letter_spacing`] = {
      unit: text.letterSpacingUnit || 'px',
      size: Number(text.letterSpacing),
      sizes: [],
    };
  }
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
function getTextGradientCss(text) {
  if (!text) return null;
  if (typeof text.gradientCss === 'string' && text.gradientCss.includes('gradient')) {
    return text.gradientCss.trim();
  }
  if (text.gradient && text.gradient.color1 && text.gradient.color2) {
    const g = text.gradient;
    return `linear-gradient(${g.angle ?? 180}deg, ${g.color1} ${g.stop1 ?? 0}%, ${g.color2} ${g.stop2 ?? 100}%)`;
  }
  return null;
}
function buildTextClipRule(selectorTarget, gradCss) {
  return `${selectorTarget} {\n  background: ${gradCss};\n  background-clip: text;\n  -webkit-background-clip: text;\n  -webkit-text-fill-color: transparent;\n}`;
}
function collectSubtreeTexts(node, nodes) {
  if (!node) return [];
  if (Array.isArray(node.extractedTexts) && node.extractedTexts.length > 0 && (!node.children || node.children.length === 0)) {
    return node.extractedTexts.map((t, idx) => ({
      id: `${node.id}-txt-${idx}`,
      text: t,
      responsive: node.responsive,
    }));
  }
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (n.text && n.text.characters) out.push(n);
    for (const cid of n.children || []) walk(nodes[cid]);
  };
  walk(node);
  return out;
}
function scopeSvgIds(svgMarkup, scopeSuffix) {
  if (typeof svgMarkup !== 'string' || !svgMarkup.includes('<svg')) return svgMarkup || '';
  const suffix = String(scopeSuffix || 'f2e').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!suffix) return svgMarkup;

  const ids = [];
  const idAttrRegex = /\bid\s*=\s*(["'])([^"']+)\1/g;
  let match;
  while ((match = idAttrRegex.exec(svgMarkup)) !== null) {
    if (match[2] && !ids.includes(match[2])) {
      ids.push(match[2]);
    }
  }
  if (ids.length === 0) return svgMarkup;

  ids.sort((a, b) => b.length - a.length);
  const escRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = svgMarkup;
  for (const oldId of ids) {
    const newId = `${oldId}_${suffix}`;
    const eId = escRegex(oldId);
    out = out
      .replace(new RegExp(`(\\bid\\s*=\\s*)(["'])${eId}\\2`, 'g'), `$1$2${newId}$2`)
      .replace(new RegExp(`url\\(\\s*(["']?)#${eId}\\1\\s*\\)`, 'g'), `url(#${newId})`)
      .replace(new RegExp(`((?:xlink:)?href\\s*=\\s*)(["'])#${eId}\\2`, 'g'), `$1$2#${newId}$2`);
  }
  return out;
}
function svgMarkupToDataUri(markup) {
  if (!markup || typeof markup !== 'string') return '';
  return `data:image/svg+xml;base64,${bytesToBase64(utf8Bytes(markup))}`;
}
function collectSubtreeImages(node, nodes) {
  if (!node) return [];
  if (Array.isArray(node.extractedImages) && node.extractedImages.length > 0) {
    return node.extractedImages.filter(Boolean);
  }
  const out = [];
  const seen = new Set();
  const pushUnique = (imgObj) => {
    if (!imgObj || (!imgObj.sha256 && !imgObj.dataUri)) return;
    const key = `${imgObj.sha256 || ''}|${(imgObj.dataUri || '').slice(0, 48)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(imgObj);
  };
  const walk = (n) => {
    if (!n) return;
    if (Array.isArray(n.extractedImages) && n.extractedImages.length > 0) {
      for (const ei of n.extractedImages) pushUnique(ei);
    }
    if (n.image) pushUnique(n.image);
    if (n.raster) pushUnique(n.raster);
    if (!n.image && !n.raster && n.style && n.style.backgroundImage) {
      pushUnique({ sha256: n.style.backgroundImage, dataUri: n.style.backgroundImageDataUri || '' });
    }
    if (!n.image && !n.raster && !(n.style && n.style.backgroundImage) && n.svg) {
      pushUnique({
        sha256: n.svg.sha256 || '',
        dataUri: n.svg.markup ? svgMarkupToDataUri(n.svg.markup) : '',
      });
    }
    for (const cid of n.children || []) walk(nodes[cid]);
  };
  walk(node);
  return out;
}
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
]);function verifyAndHealElementorJson(elements, doc = null, options = {}) {
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

    // ── 2. Auto-Heal `icon-box` with Raster Asset or Raw `<svg>` String ──
    if (el.elType === 'widget' && el.widgetType === 'icon-box') {
      const selIcon = settings.selected_icon;
      const isStringRasterOrUrl = selIcon && selIcon.library === 'svg' && typeof selIcon.value === 'string' && !selIcon.value.includes('<svg') && selIcon.value.trim() !== '';
      const isObjRaster = selIcon && selIcon.library === 'svg' && selIcon.value && typeof selIcon.value === 'object' && selIcon.value.url && /^data:image\/(png|jpeg|jpg|webp|gif)|(\.(png|jpe?g|webp|gif)(\?|$))/i.test(selIcon.value.url);

      if (isStringRasterOrUrl || isObjRaster) {
        const imgObj = typeof selIcon.value === 'object'
          ? { id: selIcon.value.id || '', url: selIcon.value.url }
          : { id: '', url: selIcon.value };
        el.widgetType = 'image-box';
        settings.image = imgObj;
        settings.thumbnail_size = 'full';
        if (settings.icon_space !== undefined && settings.image_space === undefined) {
          settings.image_space = settings.icon_space;
          delete settings.icon_space;
        }
        if (typeof settings.custom_css === 'string') {
          settings.custom_css = settings.custom_css.replace(/\.elementor-icon-box-title/g, '.elementor-image-box-title');
        }
        delete settings.selected_icon;
        delete settings.primary_color;
        delete settings.icon_size;
        recordFix(nodeId, title, 'Chuyển đổi Icon Box chứa ảnh raster sang Image Box hợp lệ');
      } else {
        const hasRawSvg = selIcon && selIcon.library === 'svg' && typeof selIcon.value === 'string' && selIcon.value.includes('<svg');
        const hasOnlyOneText = !settings.description_text || String(settings.description_text).trim() === '';
        const hasRealSvgPaths = hasRawSvg && /<(path|circle|rect|polygon|polyline|line|g|ellipse)\b/i.test(selIcon.value);

        if (hasRawSvg && (hasOnlyOneText || hasRealSvgPaths)) {
          const svgWidgetId = shortId(`${el.id}-svg`);
          const svgMarkup = scopeSvgIds(selIcon.value.trim(), svgWidgetId);
          const wMatch = svgMarkup.match(/\bwidth=["'](\d+(?:\.\d+)?)/i);
          const hMatch = svgMarkup.match(/\bheight=["'](\d+(?:\.\d+)?)/i);
          const iconW = wMatch ? Math.round(parseFloat(wMatch[1])) : 40;
          const iconH = hMatch ? Math.round(parseFloat(hMatch[1])) : 40;
          const isRowBox = settings.position === 'left' || settings.position === 'right';

          const iconWidget = {
            id: svgWidgetId,
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
              editor: `<p style="margin:0;">${escapeHtml(rawTitle)}</p>`,
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
            const descHtml = rawDesc
              .split(/\n+/)
              .map((line) => `<p style="margin:0;">${escapeHtml(line)}</p>`)
              .join('');
            childElements.push({
              id: shortId(`${el.id}-desc`),
              elType: 'widget',
              widgetType: 'text-editor',
              isInner: false,
              settings: {
                editor: descHtml || '<p style="margin:0;"></p>',
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
          const prevSettings = settings;

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
            _flex_size: prevSettings._flex_size || 'grow',
            _f2e_node_id: nodeId,
            _title: title,
          };
          if (prevSettings._background_background) {
            el.settings.background_background = prevSettings._background_background;
            if (prevSettings._background_color) el.settings.background_color = prevSettings._background_color;
            if (prevSettings._background_gradient_type) el.settings.background_gradient_type = prevSettings._background_gradient_type;
            if (prevSettings._background_color_stop) el.settings.background_color_stop = prevSettings._background_color_stop;
            if (prevSettings._background_color_b) el.settings.background_color_b = prevSettings._background_color_b;
            if (prevSettings._background_color_b_stop) el.settings.background_color_b_stop = prevSettings._background_color_b_stop;
            if (prevSettings._background_gradient_angle) el.settings.background_gradient_angle = prevSettings._background_gradient_angle;
            if (prevSettings._background_image) el.settings.background_image = prevSettings._background_image;
          }
          if (prevSettings._border_radius) {
            el.settings.border_radius = prevSettings._border_radius;
          }
          if (prevSettings._box_shadow_box_shadow_type) {
            el.settings.box_shadow_box_shadow_type = prevSettings._box_shadow_box_shadow_type;
            if (prevSettings._box_shadow_box_shadow) el.settings.box_shadow_box_shadow = prevSettings._box_shadow_box_shadow;
            if (prevSettings._box_shadow_box_shadow_position) el.settings.box_shadow_box_shadow_position = prevSettings._box_shadow_box_shadow_position;
          }
          if (prevSettings.custom_css) {
            el.settings.custom_css = prevSettings.custom_css;
          }
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
                editor: `<p style="margin:0;">${escapeHtml(it.body || it.title || '')}</p>`,
                align: 'left',
              },
              elements: [],
            },
          ],
        }));
        recordFix(nodeId, title, `Khôi phục ${extItems.length} mục Accordion từ cây thiết kế Figma`);
      }
    }

    // ── 3C. Auto-Heal Counter & Gradient Text (`background-clip: text`) from IR / Dev Mode CSS ──
    if (el.elType === 'widget' && irNode && irNode.text) {
      const irText = irNode.text;
      const gradCss = irText.gradientCss
        || (irText.gradient && irText.gradient.color1 && irText.gradient.color2
          ? `linear-gradient(${irText.gradient.angle ?? 180}deg, ${irText.gradient.color1} ${irText.gradient.stop1 ?? 0}%, ${irText.gradient.color2} ${irText.gradient.stop2 ?? 100}%)`
          : null);

      if (el.widgetType === 'counter') {
        let counterHealed = false;
        const rawChars = String(irText.characters || '').trim();
        // If single-number counter duplicated its number string as `title` (e.g. title === "08"), clear duplicate title
        if (settings.title && settings.title === rawChars) {
          settings.title = '';
          counterHealed = true;
        }
        // Preserve leading zero(s) like "08" -> prefix: "0"
        const leadZero = /^(0+)(?=\d)/.exec(rawChars);
        if (leadZero && !settings.prefix) {
          settings.prefix = leadZero[1];
          counterHealed = true;
        }
        if (!settings.typography_number_typography && (irText.fontFamily || irText.fontSize)) {
          settings.typography_number_typography = 'custom';
          settings.typography_number_font_family = irText.fontFamily || 'Inter';
          settings.typography_number_font_weight = String(irText.fontWeight || '700');
          settings.typography_number_font_style = irText.fontStyle || 'normal';
          settings.typography_number_font_size = { unit: 'px', size: Number(irText.fontSize) || 48, sizes: [] };
          if (irText.lineHeight) {
            settings.typography_number_line_height = {
              unit: irText.lineHeightUnit || 'px',
              size: Number(irText.lineHeight),
              sizes: [],
            };
          }
          counterHealed = true;
        }
        if (!settings.number_color && (irText.color || (irText.gradient && irText.gradient.color2))) {
          settings.number_color = irText.color || irText.gradient.color2;
          counterHealed = true;
        }
        if (gradCss && (!settings.custom_css || !settings.custom_css.includes('background-clip'))) {
          appendCustomCss(settings, `selector .elementor-counter-number-wrapper, selector .elementor-counter-number {\n  background: ${gradCss};\n  background-clip: text;\n  -webkit-background-clip: text;\n  -webkit-text-fill-color: transparent;\n}`);
          counterHealed = true;
        }
        if (counterHealed) {
          recordFix(nodeId, title, 'Bổ sung đầy đủ Typography, Leading Zero Prefix và Gradient Text CSS từ Figma Dev Mode cho Counter');
        }
      } else if ((el.widgetType === 'heading' || el.widgetType === 'text-editor') && gradCss) {
        if (!settings.custom_css || !settings.custom_css.includes('background-clip')) {
          const targetSel = el.widgetType === 'heading' ? 'selector .elementor-heading-title' : 'selector';
          appendCustomCss(settings, `${targetSel} {\n  background: ${gradCss};\n  background-clip: text;\n  -webkit-background-clip: text;\n  -webkit-text-fill-color: transparent;\n}`);
          recordFix(nodeId, title, 'Bổ sung hiệu ứng chữ chuyển màu (background-clip: text) từ Figma Dev Mode');
        }
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

    if (Array.isArray(el.elements)) {
      for (const child of el.elements) {
        if (child && '_healedFromIconBox' in child) {
          delete child._healedFromIconBox;
        }
      }
    }
    return el;
  };

  for (let i = 0; i < list.length; i += 1) {
    list[i] = healElement(list[i], null);
    if (list[i] && '_healedFromIconBox' in list[i]) {
      delete list[i]._healedFromIconBox;
    }
  }

  return {
    elements: list,
    report,
  };
}


  // ── Module: src/exporters/elementor-v4.js ──
/**
 * Elementor v4 Atomic Widgets Compiler (`e-flexbox`, `e-heading`, `e-paragraph`, `e-button`, `e-image`, `e-svg`).
 */


function buildV4ImageSrcProp(media) {
  if (media && Number(media.id) > 0) {
    return {
      $$type: 'image-src',
      value: {
        id: { $$type: 'image-attachment-id', value: Number(media.id) },
        url: null,
      },
    };
  }
  if (media && media.url) {
    return {
      $$type: 'image-src',
      value: {
        id: null,
        url: { $$type: 'url', value: media.url },
      },
    };
  }
  return null;
}
function compileElementorV4(doc, options = {}) {
  const { attachmentMap = {} } = options;
  const nodes = doc.nodes || {};

  const resolveMedia = (sha, fallbackDataUri = '') => {
    if (sha && attachmentMap[sha] && attachmentMap[sha].url) {
      return { id: Number(attachmentMap[sha].id) || 0, url: attachmentMap[sha].url };
    }
    return { id: 0, url: fallbackDataUri || '' };
  };

  const buildV4Node = (nodeId) => {
    const node = nodes[nodeId];
    if (!node) return null;

    const cleanId = String(node.sourceNodeId || nodeId).replace(/[^a-zA-Z0-9_-]/g, '-');
    const classId = `e-${cleanId}-${shortId(cleanId)}`;
    const wType = mapToV4WidgetType(node);

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
      const imgRef = node.image || node.raster || node.svg;
      const fallbackUri = (imgRef && imgRef.dataUri) || (node.svg && node.svg.markup ? svgMarkupToDataUri(node.svg.markup) : '');
      const media = imgRef ? resolveMedia(imgRef.sha256, fallbackUri) : { id: 0, url: fallbackUri };
      const srcProp = buildV4ImageSrcProp(media) || {
        $$type: 'image-src',
        value: { id: null, url: { $$type: 'url', value: '' } },
      };
      settings.image = {
        $$type: 'image',
        value: {
          src: srcProp,
          size: { $$type: 'string', value: 'full' },
        },
      };
    } else if (wType === 'e-svg') {
      const svgRef = node.svg || node.image || node.raster;
      const fallbackUri = (node.svg && node.svg.markup ? svgMarkupToDataUri(node.svg.markup) : '') || (svgRef && svgRef.dataUri) || '';
      const media = svgRef ? resolveMedia(svgRef.sha256, fallbackUri) : { id: 0, url: fallbackUri };
      settings.svg = {
        $$type: 'svg-src',
        value: media && Number(media.id) > 0
          ? { id: { $$type: 'image-attachment-id', value: Number(media.id) }, url: null }
          : { id: null, url: { $$type: 'url', value: (media && media.url) || '' } },
      };
    }

    const variants = [buildV4Variant('desktop', node.layout, node.style, node.text, resolveMedia)];
    if (node.responsive && node.responsive.tablet) {
      variants.push(buildV4Variant('tablet', node.responsive.tablet, {}, node.responsive.tablet, resolveMedia));
    }
    if (node.responsive && node.responsive.mobile) {
      variants.push(buildV4Variant('mobile', node.responsive.mobile, {}, node.responsive.mobile, resolveMedia));
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

function mapToV4WidgetType(nodeOrWidget) {
  const widget = typeof nodeOrWidget === 'string' ? nodeOrWidget : (nodeOrWidget && nodeOrWidget.widget);
  const node = typeof nodeOrWidget === 'object' ? nodeOrWidget : null;
  switch (widget) {
    case 'heading': return 'e-heading';
    case 'text-editor': return 'e-paragraph';
    case 'button': return 'e-button';
    case 'image':
    case 'theme-post-featured-image':
      return 'e-image';
    case 'theme-site-logo':
    case 'site-logo':
      return (node && node.svg && !node.raster && !node.image) ? 'e-svg' : 'e-image';
    case 'icon': return 'e-svg';
    default: return 'e-flexbox';
  }
}

function buildV4Variant(breakpoint, layout = {}, style = {}, text = {}, resolveMedia = null) {
  const props = {};
  if (layout.direction) {
    props['flex-direction'] = { $$type: 'string', value: layout.direction };
  }
  if (typeof layout.gap === 'number') {
    props.gap = { $$type: 'size', value: { size: layout.gap, unit: 'px', isLinked: true } };
  }
  if (layout.padding) {
    const pUnit = layout.padding.unit || 'px';
    props.padding = {
      $$type: 'dimensions',
      value: {
        'block-start': { $$type: 'size', value: { size: Number(layout.padding.top) || 0, unit: pUnit } },
        'inline-end': { $$type: 'size', value: { size: Number(layout.padding.right) || 0, unit: pUnit } },
        'block-end': { $$type: 'size', value: { size: Number(layout.padding.bottom) || 0, unit: pUnit } },
        'inline-start': { $$type: 'size', value: { size: Number(layout.padding.left) || 0, unit: pUnit } },
      },
    };
  }
  if (style.background || (style.backgroundImage && resolveMedia)) {
    const bgVal = {};
    if (style.background) {
      bgVal.color = { $$type: 'color', value: style.background };
    }
    if (style.backgroundImage && resolveMedia) {
      const bgMedia = resolveMedia(style.backgroundImage, style.backgroundImageDataUri);
      const bgSrc = buildV4ImageSrcProp(bgMedia);
      if (bgSrc) {
        bgVal['background-overlay'] = {
          $$type: 'background-overlay',
          value: [
            {
              $$type: 'background-image-overlay',
              value: {
                image: {
                  $$type: 'image',
                  value: {
                    src: bgSrc,
                    size: { $$type: 'string', value: 'full' },
                  },
                },
                size: { $$type: 'string', value: style.backgroundSize || 'cover' },
                position: { $$type: 'string', value: style.backgroundPosition || 'center center' },
                repeat: { $$type: 'string', value: style.backgroundRepeat || 'no-repeat' },
              },
            },
          ],
        };
      }
    }
    if (Object.keys(bgVal).length > 0) {
      props.background = { $$type: 'background', value: bgVal };
    }
  }
  if (text && text.color) {
    props.color = { $$type: 'color', value: text.color };
  }
  if (text && text.fontSize) {
    props['font-size'] = { $$type: 'size', value: { size: text.fontSize, unit: 'px' } };
  }
  if (text && text.fontFamily) {
    props['font-family'] = { $$type: 'string', value: text.fontFamily };
  }
  return {
    meta: { breakpoint, state: null },
    props,
  };
}



  // ── Module: src/exporters/nested-widgets.js ──
/**
 * Elementor Nested Container Widgets (`nested-accordion`, `nested-tabs`).
 */
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



  // ── Module: src/exporters/pro-widgets.js ──
/**
 * Elementor Pro Widget Builders (`form`, `nav-menu`, `call-to-action`, `price-table`, `flip-box`, `slides`, `loop-grid`).
 */
function buildProForm(node, nodes, allocId) {
  const formFields = [];
  const content = node.content || {};
  let submitLabel = content.submitLabel || 'Send Message';

  if (Array.isArray(content.formFields) && content.formFields.length > 0) {
    for (const [idx, f] of content.formFields.entries()) {
      formFields.push({
        _id: shortId(`${node.id}-fld-${idx}`),
        custom_id: `field_${idx + 1}`,
        field_type: f.type || 'text',
        field_label: f.label,
        placeholder: f.placeholder || f.label,
        required: f.required ? 'true' : '',
        width: f.width || '100',
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

  const hasRequired = formFields.some((f) => f.required === 'true');
  const settings = {
    form_name: content.name || 'Figma Form',
    form_fields: formFields,
    button_text: submitLabel,
    button_size: 'md',
    ...(hasRequired ? { mark_required: 'yes' } : {}),
  };

  if (node.layout && typeof node.layout.gap === 'number') {
    settings.row_gap = { unit: 'px', size: node.layout.gap, sizes: [] };
  }
  const isAsteriskRed = (hex) => {
    const c = String(hex || '').toUpperCase();
    return c === '#FF0000' || c === '#EF4444' || c === '#DC2626';
  };
  if (content.labelTypography) {
    if (content.labelTypography.color && !isAsteriskRed(content.labelTypography.color)) {
      settings.label_color = content.labelTypography.color;
    }
    applyTypographySettings(settings, 'label_typography', content.labelTypography, node.responsive);
  }
  const fieldTypo = content.fieldTypography || node.text || null;
  if (fieldTypo) {
    if (fieldTypo.color && !isAsteriskRed(fieldTypo.color)) {
      settings.field_text_color = fieldTypo.color;
    }
    applyTypographySettings(settings, 'field_typography', fieldTypo, node.responsive);
  }
  if (content.fieldStyle) {
    settings.field_background_color = content.fieldStyle.background || '#FFFFFF';
    if (content.fieldStyle.borderColor) settings.field_border_color = content.fieldStyle.borderColor;
    if (content.fieldStyle.borderWidth) settings.field_border_width = boxValue(content.fieldStyle.borderWidth);
    if (content.fieldStyle.radius) settings.field_border_radius = boxValue(content.fieldStyle.radius);
  }
  if (content.buttonTypography) {
    if (content.buttonTypography.color) settings.button_text_color = content.buttonTypography.color;
    applyTypographySettings(settings, 'button_typography', content.buttonTypography, node.responsive);
  }
  if (content.buttonStyle) {
    if (content.buttonStyle.background) settings.button_background_color = content.buttonStyle.background;
    else if (content.buttonStyle.gradient) settings.button_background_color = content.buttonStyle.gradient.color1;
    if (content.buttonStyle.radius) settings.button_border_radius = boxValue(content.buttonStyle.radius);
  }
  if (content.buttonPadding) {
    settings.button_text_padding = boxValue(content.buttonPadding);
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'form',
    isInner: false,
    settings,
    elements: [],
  };
}
function buildProNavMenu(node, nodes, allocId) {
  const menuItems = (node.content && node.content.menuItems) || [];
  const textItems = collectSubtreeTexts(node, nodes);
  let items = menuItems.map((m) => (typeof m === 'string' ? m : m.name));
  if (items.length === 0) {
    items = textItems.map((t) => t.text.characters);
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

  if (node.layout && typeof node.layout.gap === 'number' && node.layout.gap > 0) {
    settings.padding_horizontal_menu_item = { unit: 'px', size: Math.round(node.layout.gap / 2), sizes: [] };
  }

  const navTypo = node.text || (textItems[0] && textItems[0].text) || null;
  if (navTypo) {
    applyTypographySettings(settings, 'typography', navTypo, node.responsive);
    if (navTypo.color) {
      settings.color_menu_item = navTypo.color;
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
  const textItems = collectSubtreeTexts(node, nodes);
  const texts = textItems.map((t) => t.text.characters);
  const imgs = collectSubtreeImages(node, nodes);
  const settings = {
    skin: 'classic',
    title: texts[0] || (node.content && node.content.name) || 'Call to Action',
    description: texts[1] || '',
    button: (node.content && node.content.ctaButtonText) || texts[2] || 'Learn More',
    bg_image: imgs[0] ? resolveMedia(imgs[0].sha256, imgs[0].dataUri) : { id: '', url: '' },
  };

  if (textItems[0] && textItems[0].text) {
    if (textItems[0].text.color) settings.title_color = textItems[0].text.color;
    applyTypographySettings(settings, 'title_typography', textItems[0].text, node.responsive);
  }
  if (textItems[1] && textItems[1].text) {
    if (textItems[1].text.color) settings.description_color = textItems[1].text.color;
    applyTypographySettings(settings, 'description_typography', textItems[1].text, node.responsive);
  }
  if (textItems[2] && textItems[2].text) {
    if (textItems[2].text.color) settings.button_text_color = textItems[2].text.color;
    applyTypographySettings(settings, 'button_typography', textItems[2].text, node.responsive);
  }
  if (node.style && node.style.background) {
    settings.content_bg_color = node.style.background;
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'call-to-action',
    isInner: false,
    settings,
    elements: [],
  };
}
function buildProPriceTable(node, nodes, allocId) {
  const textItems = collectSubtreeTexts(node, nodes);
  const texts = textItems.map((t) => t.text.characters);
  const priceNode = textItems.find((t) => /[$€£₫¥]|\d+\s*\/\s*(mo|yr|tháng|năm)/i.test(t.text.characters) || /^\$?\d+$/.test(t.text.characters.trim()));
  const priceText = (priceNode && priceNode.text.characters) || '49';
  const numericPrice = priceText.replace(/[^0-9.]/g, '') || '49';
  const headingNode = textItems[0] || null;
  const heading = (headingNode && headingNode.text.characters) || (node.content && node.content.name) || 'Pro Plan';
  const subHeadingNode = (textItems[1] && textItems[1] !== priceNode) ? textItems[1] : null;
  const btnNode = textItems.length > 2 ? textItems[textItems.length - 1] : null;
  const excludeSet = new Set([headingNode, subHeadingNode, priceNode, btnNode].filter(Boolean));
  const featureTexts = textItems
    .filter((t) => !excludeSet.has(t))
    .map((t) => t.text.characters)
    .filter(Boolean);
  const features = featureTexts.map((ft, idx) => ({
    _id: shortId(`feat-${idx}`),
    item_text: ft,
    selected_icon: { value: 'fas fa-check', library: 'fa-solid' },
  }));

  const settings = {
    heading,
    sub_heading: (subHeadingNode && subHeadingNode.text.characters) || 'Monthly Plan',
    price: numericPrice,
    currency_symbol: 'dollar',
    period: 'Monthly',
    features_list: features,
    button_text: (btnNode && btnNode.text.characters) || 'Get Started',
  };

  if (headingNode && headingNode.text) {
    if (headingNode.text.color) settings.heading_color = headingNode.text.color;
    applyTypographySettings(settings, 'heading_typography', headingNode.text, node.responsive);
  }
  if (priceNode && priceNode.text) {
    if (priceNode.text.color) settings.price_color = priceNode.text.color;
    applyTypographySettings(settings, 'price_typography', priceNode.text, node.responsive);
  }
  if (textItems[2] && textItems[2].text) {
    if (textItems[2].text.color) settings.features_color = textItems[2].text.color;
    applyTypographySettings(settings, 'features_typography', textItems[2].text, node.responsive);
  }

  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'price-table',
    isInner: false,
    settings,
    elements: [],
  };
}
function buildProFlipBox(node, nodes, allocId, resolveMedia) {
  const textItems = collectSubtreeTexts(node, nodes);
  const texts = textItems.map((t) => t.text.characters);
  const imgs = collectSubtreeImages(node, nodes);
  const settings = {
    title_text_a: texts[0] || (node.content && node.content.name) || 'Front Title',
    description_text_a: texts[1] || '',
    title_text_b: texts[2] || texts[0] || 'Back Title',
    description_text_b: texts[3] || texts[1] || '',
    button_text: texts[4] || 'Read More',
  };
  if (textItems[0] && textItems[0].text) {
    if (textItems[0].text.color) settings.title_color_a = textItems[0].text.color;
    applyTypographySettings(settings, 'title_typography_a', textItems[0].text, node.responsive);
  }
  if (textItems[1] && textItems[1].text) {
    if (textItems[1].text.color) settings.description_color_a = textItems[1].text.color;
    applyTypographySettings(settings, 'description_typography_a', textItems[1].text, node.responsive);
  }
  if (node.style && node.style.background) {
    settings.background_a_background = 'classic';
    settings.background_a_color = node.style.background;
  }
  if (imgs[0] && resolveMedia) {
    const mediaA = resolveMedia(imgs[0].sha256, imgs[0].dataUri);
    if (mediaA && mediaA.url) {
      settings.background_a_background = 'classic';
      settings.background_a_image = mediaA;
    }
  }
  if (imgs[1] && resolveMedia) {
    const mediaB = resolveMedia(imgs[1].sha256, imgs[1].dataUri);
    if (mediaB && mediaB.url) {
      settings.background_b_background = 'classic';
      settings.background_b_image = mediaB;
    }
  }
  return {
    id: allocId(node.id),
    elType: 'widget',
    widgetType: 'flip-box',
    isInner: false,
    settings,
    elements: [],
  };
}
function buildProSlides(node, nodes, allocId, resolveMedia) {
  const slides = [];
  const extractedSlides = (node.content && Array.isArray(node.content.slides)) ? node.content.slides : [];
  if (extractedSlides.length > 0) {
    for (let i = 0; i < extractedSlides.length; i += 1) {
      const sl = extractedSlides[i];
      const texts = (sl.texts || []).map((t) => (typeof t === 'string' ? t : t.characters)).filter(Boolean);
      const media = sl.image && resolveMedia ? resolveMedia(sl.image.sha256, sl.image.dataUri) : { id: '', url: '' };
      slides.push({
        _id: shortId(sl.id || `${node.id}-slide-${i}`),
        heading: texts[0] || sl.name || `Slide ${i + 1}`,
        description: texts[1] || '',
        button_text: texts[2] || 'Click Here',
        background_color: sl.background || '#1E293B',
        background_image: media,
      });
    }
  } else {
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
function buildGenericProWidget(node, nodes, wType, allocId, resolveMedia) {
  const textItems = collectSubtreeTexts(node, nodes);
  const texts = textItems.map((t) => t.text.characters);
  const firstTypo = node.text || (textItems[0] && textItems[0].text) || null;
  const settings = {};
  if (wType === 'theme-post-featured-image') {
    const sha = (node.image && node.image.sha256) || (node.raster && node.raster.sha256) || (node.svg && node.svg.sha256) || '';
    const fallback = (node.image && node.image.dataUri) || (node.raster && node.raster.dataUri) || (node.svg && node.svg.markup ? svgMarkupToDataUri(node.svg.markup) : '');
    const media = resolveMedia ? resolveMedia(sha, fallback) : { id: '', url: fallback };
    settings.image = media;
    settings.image_size = 'full';
    if (node.layout && node.layout.width) {
      settings.width = { unit: 'px', size: Math.round(Number(node.layout.width)), sizes: [] };
    }
    if (node.style && node.style.radius) {
      settings.image_border_radius = boxValue(node.style.radius);
    }
  } else if (wType === 'blockquote') {
    settings.blockquote_content = texts[0] || (node.content && node.content.name) || '';
    settings.author_name = texts[1] || '';
    settings.tweet_button_Label = 'Tweet';
    if (firstTypo) {
      if (firstTypo.color) settings.content_text_color = firstTypo.color;
      applyTypographySettings(settings, 'content_typography', firstTypo, node.responsive);
    }
  } else if (wType === 'animated-headline') {
    settings.before_text = texts[0] || '';
    settings.highlighted_text = texts[1] || (node.content && node.content.name) || '';
    if (firstTypo) {
      if (firstTypo.color) settings.title_color = firstTypo.color;
      applyTypographySettings(settings, 'title_typography', firstTypo, node.responsive);
    }
  } else if (firstTypo) {
    if (firstTypo.color) settings.title_color = firstTypo.color;
    applyTypographySettings(settings, 'typography', firstTypo, node.responsive);
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
};
function compileElementorV3(doc, options = {}) {
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
function compileElementorClipboard(doc, options = {}) {
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

  if (Number(layout.maxWidth) > 0 && !settings.boxed_width) {
    settings.content_width = 'boxed';
    settings.boxed_width = { unit: 'px', size: Math.round(Number(layout.maxWidth)), sizes: [] };
  }

  // Important: Top-level root sections get boxed widths and responsive padding matching Dev standards
  if (isRoot) {
    const padL = Number(layout.padding && layout.padding.left) || 0;
    const padR = Number(layout.padding && layout.padding.right) || 0;
    if (padL >= 40 && padR >= 40 && (Number(layout.width) || 0) >= 1100) {
      const innerContentW = Math.max(960, Math.min(1320, (Number(layout.width) || 1440) - padL - padR));
      const padT = (layout.padding && typeof layout.padding.top === 'number') ? layout.padding.top : 64;
      const padB = (layout.padding && typeof layout.padding.bottom === 'number') ? layout.padding.bottom : 64;
      settings.content_width = 'boxed';
      settings.boxed_width = { unit: 'px', size: innerContentW, sizes: [] };
      settings.boxed_width_tablet = { unit: 'px', size: 768, sizes: [] };
      settings.boxed_width_mobile = { unit: 'px', size: 360, sizes: [] };
      settings.padding = boxValue({ top: padT, right: 24, bottom: padB, left: 24 });
      settings.padding_tablet = boxValue({ top: Math.min(padT, 50), right: 24, bottom: Math.min(padB, 50), left: 24 });
      settings.padding_mobile = boxValue({ top: Math.min(padT, 30), right: 16, bottom: Math.min(padB, 30), left: 16 });
      settings.margin = boxValue({ top: 0, right: 0, bottom: 0, left: 0 });
    } else {
      const basePad = layout.padding || { top: 60, right: 24, bottom: 60, left: 24 };
      settings.content_width = 'full';
      settings.padding = boxValue(basePad);
      settings.padding_tablet = boxValue((node.responsive && node.responsive.tablet && node.responsive.tablet.padding) || scaleBox(basePad, 0.85, 40));
      settings.padding_mobile = boxValue((node.responsive && node.responsive.mobile && node.responsive.mobile.padding) || scaleBox(basePad, 0.65, 24));
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

function postStatus(message, extra = {}) {
  if (typeof figma !== 'undefined' && figma && figma.ui) {
    figma.ui.postMessage({ type: 'status', message, ...extra });
  }
}

function announce(message, isError = false) {
  postStatus(message, { done: true, error: isError });
  try {
    if (typeof figma !== 'undefined' && typeof figma.notify === 'function') {
      figma.notify(message, { error: isError, timeout: isError ? 5500 : 3500 });
    }
  } catch (e) { }
}function normalizeSiteUrl(rawUrl) {
  const cleaned = String(rawUrl || '').trim().replace(/\/+$/, '');
  const match = /^(https?:)\/\/([^/?#]+)(\/[^?#]*)?$/i.exec(cleaned);
  if (!match) {
    throw new Error('Vui lòng nhập URL WordPress hợp lệ (ví dụ: https://example.com hoặc http://localhost:10040).');
  }
  return `${match[1].toLowerCase()}//${match[2]}${(match[3] || '').replace(/\/+$/, '')}`;
}async function wpRequest(siteUrl, token, endpoint, init = {}) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  const url = `${baseUrl}/index.php?rest_route=/f2e-bridge/v1${endpoint}`;
  const timeoutMs = Number(init.timeoutMs) > 0 ? Number(init.timeoutMs) : 30000;

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

  let controller = null;
  let timerId = null;
  if (typeof AbortController === 'function') {
    try {
      controller = new AbortController();
      fetchOptions.signal = controller.signal;
    } catch (e) {
      controller = null;
    }
  }

  const raceTimeout = (promise) => new Promise((resolve, reject) => {
    timerId = setTimeout(() => {
      if (controller) {
        try { controller.abort(); } catch (e) { }
      }
      const timeoutErr = new Error(`Yêu cầu WordPress hết thời gian (${timeoutMs}ms): ${endpoint}`);
      timeoutErr.isTimeout = true;
      reject(timeoutErr);
    }, timeoutMs);
    Promise.resolve(promise).then(
      (val) => {
        clearTimeout(timerId);
        timerId = null;
        resolve(val);
      },
      (err) => {
        clearTimeout(timerId);
        timerId = null;
        reject(err);
      }
    );
  });

  let response;
  try {
    response = await raceTimeout(fetch(url, fetchOptions));
  } catch (err) {
    if (err && err.isTimeout) throw err;
    const detail = err && err.message ? `: ${err.message}` : '';
    const isHttpCustomLocal = /^http:\/\/(?!localhost|127\.0\.0\.1|\[::1\])/i.test(baseUrl);
    const localHint = isHttpCustomLocal
      ? ' (Lưu ý: Figma chặn HTTP thường với tên miền .local do Mixed Content — hãy dùng http://localhost:PORT của LocalWP, ví dụ http://localhost:10040, hoặc bật Trust SSL trong LocalWP để dùng https://)'
      : '';
    const netErr = new Error(`Không thể kết nối tới WordPress${detail}${localHint}.`);
    netErr.isNetwork = true;
    throw netErr;
  }

  let body;
  try {
    if (typeof response.json === 'function') {
      body = await raceTimeout(response.json());
    } else if (typeof response.text === 'function') {
      const txt = await raceTimeout(response.text());
      body = JSON.parse(txt);
    } else {
      throw new Error('Response object has neither json() nor text()');
    }
  } catch (e) {
    if (e && e.isTimeout) throw e;
    const parseErr = new Error(`WordPress trả về dữ liệu không phải JSON (HTTP ${response.status}): ${e && e.message ? e.message : e}`);
    parseErr.status = response.status;
    throw parseErr;
  }

  if (!response.ok || !body || body.success === false) {
    const errMsg = (body && (body.message || (body.data && body.data.message))) || `WordPress trả về lỗi HTTP ${response.status}.`;
    const httpErr = new Error(errMsg);
    httpErr.status = response.status;
    throw httpErr;
  }
  return body.data !== undefined ? body.data : body;
}

/** Build flat indented outline of current selection for the Widget Tagging UI */function buildSelectionOutline(selection) {
  const items = [];
  const walk = (node, depth, isTopRoot = false, isAutoBg = false) => {
    if (!node || node.visible === false || items.length >= 250) return;
    const resolved = resolveWidget(node);
    const effectiveWidget = isAutoBg && resolved.source !== 'override' ? 'background' : resolved.widget;
    const effectiveSource = isAutoBg && resolved.source !== 'override' ? 'heuristic' : resolved.source;
    const hasAutoLayout = Boolean(node.layoutMode && node.layoutMode !== 'NONE');
    items.push({
      nodeId: node.id,
      name: String(node.name || 'Unnamed').slice(0, 64),
      type: node.type,
      depth,
      widget: effectiveWidget,
      source: effectiveSource,
      hasAutoLayout,
      childCount: visibleChildren(node).length,
    });
    // Do not expand internal layers/vectors of atomic leaf widgets (icons, logos, buttons, images, background, etc.)
    // or layers marked "skip", so the outline matches Elementor's actual widget hierarchy!
    if (isAtomicLeafWidget(effectiveWidget)) {
      return;
    }
    const { bgIds } = detectCompositeBackgroundChildren(node);
    for (const child of visibleChildren(node)) {
      walk(child, depth + 1, false, bgIds.has(child.id));
    }
  };
  for (const root of selection) {
    walk(root, 0, true, false);
  }
  return items;
}function sendOutlineToUi() {
  const selection = figma.currentPage.selection || [];
  figma.ui.postMessage({
    type: 'outline',
    selectionIds: selection.map((n) => n.id),
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

  if (selection.length > 0) {
    inspectNodeDevMode(selection[0], { includeSubtree: false })
      .then((data) => {
        if (data) {
          figma.ui.postMessage({ type: 'dev-mode-css', data });
        }
      })
      .catch(() => { });
  } else {
    figma.ui.postMessage({ type: 'dev-mode-css', data: null });
  }
}

async function handleInspectNodeDevMode(msg = {}) {
  const { nodeId, includeSubtree = false, focusCanvas = false } = msg;
  const selection = figma.currentPage.selection || [];
  let target = null;

  if (nodeId) {
    if (typeof figma.getNodeByIdAsync === 'function') {
      try {
        target = await figma.getNodeByIdAsync(nodeId);
      } catch (e) { }
    }
    if (!target) {
      const findInTree = (list) => {
        for (const n of list || []) {
          if (!n) continue;
          if (n.id === nodeId) return n;
          if (Array.isArray(n.children)) {
            const found = findInTree(n.children);
            if (found) return found;
          }
        }
        return null;
      };
      target = findInTree(selection);
    }
  } else if (selection.length > 0) {
    target = selection[0];
  }

  if (!target) {
    throw new Error('Hãy chọn một Layer hoặc Frame trên Figma để xem Dev Mode CSS.');
  }

  if (focusCanvas && figma.viewport && typeof figma.viewport.scrollAndZoomIntoView === 'function') {
    try {
      figma.viewport.scrollAndZoomIntoView([target]);
    } catch (e) { }
  }

  const data = await inspectNodeDevMode(target, { includeSubtree: Boolean(includeSubtree) });
  figma.ui.postMessage({ type: 'dev-mode-css', data });
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
    throw new Error('Hãy chọn ít nhất 1 Frame hoặc Group trên Figma trước khi phân tích.');
  }
  const result = fixAndOptimizeCanvasSelection(selection);
  sendOutlineToUi();
  announce(
    `Đã phân tích an toàn (0 thay đổi giao diện gốc): gắn ${result.taggedBackgrounds || 0} lớp BG gộp nền, ${result.taggedIcons || 0} Icon SVG & ${result.virtualLayoutFrames || 0} Frame Virtual Layout.`
  );
}

async function getActiveSelectionForExtraction() {
  const selection = figma.currentPage.selection || [];
  if (selection.length > 0) {
    return selection;
  }
  if (responsiveState.desktop && responsiveState.desktop.nodeId && typeof figma.getNodeByIdAsync === 'function') {
    const desktopNode = await figma.getNodeByIdAsync(responsiveState.desktop.nodeId);
    if (desktopNode && !desktopNode.removed) {
      return [desktopNode];
    }
  }
  throw new Error('Vui lòng chọn ít nhất 1 Frame hoặc Component trên Figma!');
}

const pendingWebpRequests = new Map();async function processRasterAssetsInUi(
  document,
  assetPayloads,
  { imageFormat = 'WEBP', quality = 0.82, maxWidth = 0, onBatchProgress = null } = {}
) {
  const rasterAssets = (assetPayloads || []).filter((a) => a && a.kind === 'image' && a.base64);
  if (rasterAssets.length === 0) return { count: 0, savedPct: 0, keptOriginal: 0, warnings: 0 };

  const targetFormat = String(imageFormat || 'WEBP').toUpperCase();
  const targetMime = targetFormat === 'JPG' ? 'image/jpeg' : (targetFormat === 'PNG' ? 'image/png' : 'image/webp');
  const clampedQuality = Math.max(0.3, Math.min(1, Number(quality) || 0.82));
  const clampedMaxWidth = Math.max(0, Math.round(Number(maxWidth) || 0));

  postStatus(`Đang xử lý ${rasterAssets.length} ảnh (${targetFormat}${clampedMaxWidth > 0 ? `, max ${clampedMaxWidth}px` : ''}) ngay tại chỗ…`);

  // Split into bounded IPC batches (max 4 assets or 4 MB per batch)
  const MAX_BATCH_ASSETS = 4;
  const MAX_BATCH_BYTES = 4 * 1024 * 1024;
  const batches = [];
  let curBatch = [];
  let curBatchBytes = 0;
  for (const asset of rasterAssets) {
    const estBytes = Number(asset.byteLength) || Math.ceil((asset.base64 || '').length * 0.75);
    if (curBatch.length > 0 && (curBatch.length >= MAX_BATCH_ASSETS || curBatchBytes + estBytes > MAX_BATCH_BYTES)) {
      batches.push({ items: curBatch, bytes: curBatchBytes });
      curBatch = [];
      curBatchBytes = 0;
    }
    curBatch.push(asset);
    curBatchBytes += estBytes;
  }
  if (curBatch.length > 0) {
    batches.push({ items: curBatch, bytes: curBatchBytes });
  }

  const shaMap = new Map();
  let totalOrig = 0;
  let totalComp = 0;
  let convertedCount = 0;
  let keptOriginal = 0;
  let warningCount = 0;

  const pushOptWarning = (message) => {
    warningCount += 1;
    if (document && Array.isArray(document.warnings)) {
      document.warnings.push({ code: 'image-optimize-warning', message });
    }
  };

  for (let bIdx = 0; bIdx < batches.length; bIdx += 1) {
    const batch = batches[bIdx];
    const requestId = `imgopt-${Date.now()}-${bIdx}-${Math.random().toString(16).slice(2, 8)}`;
    const timeoutMs = Math.max(20000, Math.min(120000, batch.items.length * 8000 + Math.ceil(batch.bytes / 1048576) * 4000));

    let timedOut = false;
    const results = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        timedOut = true;
        pendingWebpRequests.delete(requestId);
        resolve([]);
      }, timeoutMs);
      pendingWebpRequests.set(requestId, (resList) => {
        clearTimeout(timer);
        resolve(Array.isArray(resList) ? resList : []);
      });
      figma.ui.postMessage({
        type: 'compress-assets-webp',
        requestId,
        targetFormat,
        quality: clampedQuality,
        maxWidth: clampedMaxWidth,
        assets: batch.items.map((a) => ({
          sha256: a.sha256,
          mime: a.mime || 'image/png',
          base64: a.base64,
        })),
      });
    });

    if (timedOut) {
      pushOptWarning(`Batch xử lý ảnh ${bIdx + 1}/${batches.length} hết thời gian (${timeoutMs}ms); giữ nguyên ảnh gốc.`);
    }

    if (typeof onBatchProgress === 'function') {
      onBatchProgress(bIdx + 1, batches.length);
    }

    for (const res of results) {
      if (!res || !res.oldSha256) continue;
      if (res.error) {
        pushOptWarning(`Không thể tối ưu ảnh (${res.oldSha256.slice(0, 8)}): ${res.error}`);
        continue;
      }
      if (res.skipped || !res.base64) continue;

      const origAsset = rasterAssets.find((a) => a.sha256 === res.oldSha256);
      if (!origAsset) continue;

      const outBytes = base64ToBytes(res.base64);
      if (!outBytes || outBytes.byteLength === 0) continue;

      const origBytesLen = Number(origAsset.byteLength || 0);
      // Size guard: for WebP conversion, keep original PNG/JPG if WebP output is >= original size
      if (targetFormat === 'WEBP' && origBytesLen > 0 && outBytes.byteLength >= origBytesLen) {
        keptOriginal += 1;
        continue;
      }
      if (targetFormat !== 'WEBP' && !res.resized && origBytesLen > 0 && outBytes.byteLength >= origBytesLen) {
        keptOriginal += 1;
        continue;
      }

      const outMime = res.mime || targetMime;
      const newSha = await sha256(outBytes);
      const newDataUri = `data:${outMime};base64,${res.base64}`;

      totalOrig += origBytesLen;
      totalComp += outBytes.byteLength;
      convertedCount += 1;

      if (document.assets && document.assets[res.oldSha256]) {
        delete document.assets[res.oldSha256];
      }
      origAsset.sha256 = newSha;
      origAsset.mime = outMime;
      origAsset.base64 = res.base64;
      origAsset.byteLength = outBytes.byteLength;
      if (document.assets) {
        document.assets[newSha] = origAsset;
      }
      shaMap.set(res.oldSha256, { sha256: newSha, mime: outMime, dataUri: newDataUri });
    }
  }

  // Remap all node image, backgroundImage, extractedImages, and slides[].image references
  if (shaMap.size > 0 && document && document.nodes) {
    for (const n of Object.values(document.nodes)) {
      if (!n) continue;
      if (n.raster && shaMap.has(n.raster.sha256)) {
        n.raster = { ...shaMap.get(n.raster.sha256) };
      }
      if (n.image && shaMap.has(n.image.sha256)) {
        n.image = { ...shaMap.get(n.image.sha256) };
      }
      if (n.style && n.style.backgroundImage && shaMap.has(n.style.backgroundImage)) {
        const mapped = shaMap.get(n.style.backgroundImage);
        n.style.backgroundImage = mapped.sha256;
        n.style.backgroundImageDataUri = mapped.dataUri;
      }
      if (Array.isArray(n.extractedImages)) {
        n.extractedImages = n.extractedImages.map((imgRef) => {
          if (imgRef && imgRef.sha256 && shaMap.has(imgRef.sha256)) {
            return { ...shaMap.get(imgRef.sha256) };
          }
          return imgRef;
        });
      }
      if (n.content && Array.isArray(n.content.slides)) {
        for (const sl of n.content.slides) {
          if (sl && sl.image && sl.image.sha256 && shaMap.has(sl.image.sha256)) {
            sl.image = { ...shaMap.get(sl.image.sha256) };
          }
        }
      }
    }
  }

  const savedPct = totalOrig > 0 ? Math.max(0, Math.round((1 - totalComp / totalOrig) * 100)) : 0;
  return { count: convertedCount, savedPct, keptOriginal, warnings: warningCount };
}async function compressRasterAssetsToWebpInUi(document, assetPayloads, { quality = 0.82, maxWidth = 0, onBatchProgress = null } = {}) {
  return processRasterAssetsInUi(document, assetPayloads, {
    imageFormat: 'WEBP',
    quality,
    maxWidth,
    onBatchProgress,
  });
}async function handleCompileForClipboardOrDownload(payload = {}) {
  const {
    action = 'clipboard',
    imageFormat = 'PNG',
    imageScale = 2,
    webpQuality = 0.82,
    imageMaxWidth = 0,
    siteUrl = '',
    autoUnwrap = true,
    linearBorder = true,
    devModeCss = true,
  } = payload;

  const selection = await getActiveSelectionForExtraction();
  postStatus('Đang quét Design System từ Figma…', { progress: 4 });
  const designTokens = await extractLocalDesignSystem(figma, selection);
  const { document, assetPayloads } = await extractDesignSelection(selection, {
    fileKey: figma.fileKey || 'local-file',
    imageFormat,
    imageScale,
    useDevModeCss: devModeCss !== false,
    responsiveFrames: {
      tablet: responsiveState.tablet,
      mobile: responsiveState.mobile,
    },
    designTokens,
    onProgress: (phase, cur, total) => {
      const ratio = total > 0 ? cur / total : 1;
      if (phase === 'nodes') {
        const pct = Math.round(8 + ratio * 47); // 8% -> 55%
        postStatus(`Đang trích xuất layer Figma (${cur}/${total})…`, { progress: pct });
      } else if (phase === 'assets') {
        const pct = Math.round(55 + ratio * 25); // 55% -> 80%
        postStatus(`Đang cắt ảnh & SVG (${cur}/${total})…`, { progress: pct });
      }
    },
  });

  let webpNote = '';
  const fmtUpper = String(imageFormat || 'PNG').toUpperCase();
  const maxWNum = Number(imageMaxWidth) || 0;
  if (fmtUpper === 'WEBP' || (maxWNum > 0 && (fmtUpper === 'PNG' || fmtUpper === 'JPG'))) {
    postStatus(`Đang tối ưu ảnh (${fmtUpper}) ngay tại chỗ…`, { progress: 82 });
    const imgRep = await processRasterAssetsInUi(document, assetPayloads, {
      imageFormat: fmtUpper,
      quality: webpQuality,
      maxWidth: maxWNum,
      onBatchProgress: (done, total) => {
        const pct = Math.round(82 + (done / Math.max(1, total)) * 10); // 82% -> 92%
        postStatus(`Đang xử lý ảnh batch ${done}/${total}…`, { progress: pct });
      },
    });
    if (imgRep.count > 0) {
      webpNote = fmtUpper === 'WEBP' ? ` [WebP -${imgRep.savedPct}%]` : ` [${fmtUpper} resized]`;
    }
  }
  postStatus('Đang biên dịch & kiểm tra độ khớp Elementor…', { progress: 94 });

  const v3CompileOpts = {
    siteUrl,
    autoUnwrap: autoUnwrap !== false,
    linearBorder: linearBorder !== false,
  };

  if (action === 'clipboard') {
    const clipboardData = compileElementorClipboard(document, v3CompileOpts);
    const rep = clipboardData.fidelityReport || {};
    const healNote = rep.healedCount ? ` [Auto-Healed ${rep.healedCount} điểm lệch]` : ' [Khớp 100%]';
    figma.ui.postMessage({
      type: 'clipboard-ready',
      json: JSON.stringify(clipboardData),
      title: document.title,
      warnings: document.warnings,
      fidelityReport: rep,
    });
    announce(`Đã copy "${document.title}" (${clipboardData.elements.length} sections)${webpNote}${healNote}! Mở Elementor Editor và bấm Ctrl+V.`);
    return;
  }

  if (action === 'download-elementor-v3') {
    const v3Json = compileElementorV3(document, v3CompileOpts);
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
    const v4Json = compileElementorV4(document, { siteUrl });
    figma.ui.postMessage({
      type: 'download-ready',
      filename: `${slugify(document.title)}-elementor-v4-atomic.json`,
      json: JSON.stringify(v4Json, null, 2),
      warnings: document.warnings,
    });
    announce('Đã xuất file Elementor v4 Atomic (.json) thành công!');
    return;
  }

  const v3Compiled = compileElementorV3(document, v3CompileOpts);
  const bundle = {
    kind: 'f2e.bundle',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    document,
    assets: assetPayloads,
    elementorV3: v3Compiled,
    elementorV4: compileElementorV4(document, { siteUrl }),
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
}async function handleLivePushToWordPress(payload) {
  const {
    siteUrl,
    targetType = 'page',
    templateType = 'page',
    targetPostId = 0,
    postTitle = '',
    postStatus: wpPostStatus = 'draft',
    pageLayout = 'elementor_canvas',
    importMode = 'resync',
    elementorVersion = 'v3',
    syncGlobalStyles = true,
    imageFormat = 'PNG',
    imageScale = 2,
    webpQuality = 0.82,
    imageMaxWidth = 0,
    customTokens = null,
    autoUnwrap = true,
    linearBorder = true,
    devModeCss = true,
  } = payload;

  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const site = Array.isArray(stored) ? stored.find((s) => s.siteUrl === siteUrl) : null;
  if (!site) {
    throw new Error('Vui lòng chọn hoặc kết nối một website WordPress trước khi Push.');
  }

  const selection = await getActiveSelectionForExtraction();
  postStatus('1/4: Đang quét Design System từ Figma…', { progress: 4 });
  let designTokens = { colors: [], typography: [] };
  if (syncGlobalStyles) {
    try {
      designTokens = customTokens && (Array.isArray(customTokens.colors) || Array.isArray(customTokens.typography))
        ? customTokens
        : await extractLocalDesignSystem(figma, selection);
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
      useDevModeCss: devModeCss !== false,
      responsiveFrames: {
        tablet: responsiveState.tablet,
        mobile: responsiveState.mobile,
      },
      designTokens,
      onProgress: (phase, cur, total) => {
        const ratio = total > 0 ? cur / total : 1;
        if (phase === 'nodes') {
          const pct = Math.round(6 + ratio * 32); // 6% -> 38%
          postStatus(`1/4: Đang trích xuất layer Figma (${cur}/${total})…`, { progress: pct });
        } else if (phase === 'assets') {
          const pct = Math.round(38 + ratio * 20); // 38% -> 58%
          postStatus(`1/4: Đang cắt ảnh & SVG (${cur}/${total})…`, { progress: pct });
        }
      },
    });
    document = extracted.document;
    assetPayloads = extracted.assetPayloads;
    const fmtUpper = String(imageFormat || 'PNG').toUpperCase();
    const maxWNum = Number(imageMaxWidth) || 0;
    if (fmtUpper === 'WEBP' || (maxWNum > 0 && (fmtUpper === 'PNG' || fmtUpper === 'JPG'))) {
      postStatus(`1/4: Đang tối ưu ảnh (${fmtUpper}) ngay tại chỗ…`, { progress: 60 });
      await processRasterAssetsInUi(document, assetPayloads, {
        imageFormat: fmtUpper,
        quality: webpQuality,
        maxWidth: maxWNum,
        onBatchProgress: (done, total) => {
          const pct = Math.round(60 + (done / Math.max(1, total)) * 6); // 60% -> 66%
          postStatus(`1/4: Đang xử lý ảnh batch ${done}/${total}…`, { progress: pct });
        },
      });
    }
  } catch (extErr) {
    throw new Error(`Lỗi ở bước 1B (Extract Node): ${extErr && extErr.message ? extErr.message : extErr}`);
  }

  // Step 2: Upload deduplicated assets (SHA-256) with 10MB guard, transient retry & failure aggregation
  const attachmentMap = {};
  const MAX_ASSET_BYTES = 10 * 1024 * 1024;
  try {
    if (assetPayloads.length > 0) {
      const CONCURRENCY = Math.min(4, assetPayloads.length);
      let cursor = 0;
      let completed = 0;
      const failedAssets = [];

      const isTransientError = (err) => {
        if (!err) return false;
        if (err.isTimeout || err.isNetwork) return true;
        if (typeof err.status === 'number') return err.status >= 500 || err.status === 429;
        return /timeout|hết thời gian|network|fetch/i.test(String(err.message || ''));
      };

      const uploadWorker = async () => {
        while (cursor < assetPayloads.length) {
          const idx = cursor;
          cursor += 1;
          const asset = assetPayloads[idx];
          const byteLen = Number(asset.byteLength || 0) || Math.ceil(String(asset.base64 || '').length * 0.75);
          if (byteLen > MAX_ASSET_BYTES) {
            failedAssets.push({
              sha256: asset.sha256,
              error: `${asset.assetId || asset.sha256.slice(0, 8)} vượt quá giới hạn 10MB (${(byteLen / 1048576).toFixed(1)}MB). Hãy bật WebP, độ phân giải 1x hoặc giới hạn rộng tối đa.`,
            });
            completed += 1;
            continue;
          }

          const uploadPct = Math.round(68 + (completed / assetPayloads.length) * 18); // 68% -> 86%
          postStatus(`2/4: Đang đồng bộ tài nguyên ${completed + 1}/${assetPayloads.length} (SHA-256: ${asset.sha256.slice(0, 8)})…`, { progress: uploadPct });

          let lastErr = null;
          let uploaded = null;
          for (let attempt = 0; attempt <= 1; attempt += 1) {
            try {
              uploaded = await wpRequest(site.siteUrl, site.token, '/assets', {
                method: 'POST',
                timeoutMs: 90000,
                body: JSON.stringify({
                  sha256: asset.sha256,
                  mime: asset.mime,
                  kind: asset.kind,
                  base64: asset.base64,
                  name: document.title,
                }),
              });
              lastErr = null;
              break;
            } catch (err) {
              lastErr = err;
              if (attempt === 0 && isTransientError(err)) {
                await new Promise((r) => setTimeout(r, 400));
                continue;
              }
              break;
            }
          }

          if (lastErr) {
            failedAssets.push({
              sha256: asset.sha256,
              error: `${asset.assetId || asset.sha256.slice(0, 8)}: ${lastErr.message || lastErr}`,
            });
          } else if (uploaded && Number(uploaded.id) > 0 && uploaded.url) {
            attachmentMap[asset.sha256] = { id: uploaded.id, url: uploaded.url };
          } else {
            failedAssets.push({
              sha256: asset.sha256,
              error: `${asset.assetId || asset.sha256.slice(0, 8)}: WordPress không trả về id/url hợp lệ.`,
            });
          }
          completed += 1;
        }
      };

      const workers = [];
      for (let w = 0; w < CONCURRENCY; w += 1) {
        workers.push(uploadWorker());
      }
      await Promise.all(workers);

      if (failedAssets.length > 0) {
        const preview = failedAssets.slice(0, 2).map((f) => f.error).join('; ');
        throw new Error(
          `Upload thất bại ${failedAssets.length}/${assetPayloads.length} tài nguyên (đã lưu ${Object.keys(attachmentMap).length}, các file đã lên sẽ được tái sử dụng qua SHA-256 khi thử lại): ${preview}`
        );
      }
    }
  } catch (assetErr) {
    throw new Error(`Lỗi ở bước 2 (Upload Asset): ${assetErr && assetErr.message ? assetErr.message : assetErr}`);
  }

  // Step 3: Optionally sync Global Design System (Colors & Typography)
  try {
    if (syncGlobalStyles && (designTokens.colors.length > 0 || designTokens.typography.length > 0)) {
      postStatus('3/4: Đang đồng bộ Global Colors & Fonts vào Elementor Site Settings…', { progress: 88 });
      await wpRequest(site.siteUrl, site.token, '/design-system', {
        method: 'POST',
        body: JSON.stringify(designTokens),
      });
    }
  } catch (dsErr) {
    throw new Error(`Lỗi ở bước 3 (Sync Globals): ${dsErr && dsErr.message ? dsErr.message : dsErr}`);
  }

  // Step 4: Compile on client with resolved attachmentMap & send compiled elements to WordPress
  let result;
  let fidelityReport = null;
  try {
    postStatus('4/4: Đang kiểm tra độ khớp thiết kế & cập nhật cấu trúc Elementor trên WordPress…', { progress: 94 });
    let compiledElements;
    if (elementorVersion === 'v4') {
      compiledElements = compileElementorV4(document, { siteUrl: site.siteUrl, attachmentMap }).content;
    } else {
      const v3Out = compileElementorV3(document, {
        siteUrl: site.siteUrl,
        attachmentMap,
        autoUnwrap: autoUnwrap !== false,
        linearBorder: linearBorder !== false,
      });
      compiledElements = v3Out.content;
      fidelityReport = v3Out.fidelityReport;
    }

    result = await wpRequest(site.siteUrl, site.token, '/import', {
      method: 'POST',
      timeoutMs: 90000,
      body: JSON.stringify({
        title: postTitle || document.title,
        targetType,
        templateType,
        targetPostId: Number(targetPostId) || 0,
        postStatus: wpPostStatus,
        pageLayout,
        importMode,
        elementorVersion,
        attachmentMap,
        content: compiledElements,
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
  await handleLoadSiteTargets(site.siteUrl).catch(() => {});
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
  const tokens = (options && options.customTokens && (Array.isArray(options.customTokens.colors) || Array.isArray(options.customTokens.typography)))
    ? options.customTokens
    : await extractLocalDesignSystem(figma, figma.currentPage.selection);
  if (tokens.colors.length === 0 && tokens.typography.length === 0 && !tokens.themeStyles?.buttons && !tokens.settings?.layout?.containerWidth) {
    throw new Error('Chưa phát hiện màu sắc hoặc kiểu chữ nào. Hãy chọn 1 Frame trên Figma rồi bấm "Quét lại".');
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
}function createMessageHandler() {
  return async (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'compress-assets-webp-result') {
      const resolver = pendingWebpRequests.get(msg.requestId);
      if (resolver) {
        pendingWebpRequests.delete(msg.requestId);
        resolver(msg.results || []);
      }
      return;
    }
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
        case 'inspect-node-css':
          await handleInspectNodeDevMode(msg);
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
        case 'save-prefs':
          await figma.clientStorage.setAsync(STORAGE_PREFS_KEY, msg.prefs || {});
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
}function initPluginRuntime() {
  figma.showUI(__html__, { width: 480, height: 680 });
  figma.on('selectionchange', sendOutlineToUi);
  sendOutlineToUi();

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

  figma.ui.onmessage = createMessageHandler();
}

if (typeof figma !== 'undefined' && figma && figma.ui && figma.clientStorage && typeof figma.showUI === 'function') {
  initPluginRuntime();
}


})();
