import {
  createMockFrameNode,
  createMockTextNode,
  createMockImageNode,
  createMockVectorNode,
  createMockFigmaApi,
  hexToFigmaRgb,
  solidFill,
  imageFill,
} from '../lib/figma-mocks.mjs';
import {
  makePng,
  makeJpeg,
  makeWebpVP8L,
  makeValidSvg,
  sha256Hex,
} from '../lib/media-generators.mjs';

/**
 * Built-in second distinct multi-section hospitality design fixture (`The Canopy Residences`)
 * exercising composite Hero BG, PNG/JPEG/WebP rasters, SVG logo & icon-boxes,
 * `image-gallery` (`wp_gallery`), `image-carousel` (`carousel`), `call-to-action`,
 * `testimonial`, `nested-accordion`, `form`, and Design System tokens.
 */
export function buildCanopyResidencesFixture({ runId = 'e2e', prefix = '[F2E-E2E]' } = {}) {
  const heroBgBytes = makePng(400, 400, {
    rgba1: [27, 77, 62, 255],
    rgba2: [15, 23, 42, 255],
    nonce: `${runId}-canopy-hero`,
  });
  const ctaJpgBytes = makeJpeg(400, 400, {
    rgb1: [27, 77, 62],
    rgb2: [217, 119, 6],
    nonce: `${runId}-canopy-cta`,
  });
  const avatarJpgBytes = makeJpeg(400, 400, {
    rgb1: [30, 41, 59],
    rgb2: [226, 232, 240],
    nonce: `${runId}-canopy-avatar`,
  });
  const galleryBytes = [
    makePng(400, 400, { rgba1: [22, 163, 74, 255], rgba2: [255, 255, 255, 255], nonce: `${runId}-gal-1` }),
    makeJpeg(400, 400, { rgb1: [15, 23, 42], rgb2: [217, 119, 6], nonce: `${runId}-gal-2` }),
    makePng(400, 400, { rgba1: [37, 99, 235, 255], rgba2: [241, 245, 249, 255], nonce: `${runId}-gal-3` }),
  ];
  const webpPhotoBytes = makeWebpVP8L(400, 400, { nonce: `${runId}-canopy-webp` });

  const logoSvg = makeValidSvg({ width: 96, height: 36, color: '#1B4D3E', nonce: `${runId}-canopy-logo` });
  const conciergeSvg1 = makeValidSvg({ width: 40, height: 40, color: '#D97706', nonce: `${runId}-canopy-ic1` });
  const conciergeSvg2 = makeValidSvg({ width: 40, height: 40, color: '#1B4D3E', nonce: `${runId}-canopy-ic2` });

  // 1. Header
  const header = createMockFrameNode({
    id: 'cr-hdr',
    name: 'Header',
    width: 1440,
    height: 80,
    layoutMode: 'HORIZONTAL',
    primaryAxisAlignItems: 'SPACE_BETWEEN',
    counterAxisAlignItems: 'CENTER',
    paddingLeft: 80,
    paddingRight: 80,
    fills: [solidFill('#FFFFFF')],
    children: [
      createMockVectorNode({
        id: 'cr-logo',
        name: 'Canopy Logo',
        width: 96,
        height: 36,
        svgMarkup: logoSvg,
        pluginData: { 'f2e-widget': 'theme-site-logo' },
      }),
      createMockFrameNode({
        id: 'cr-nav',
        name: 'Nav',
        width: 360,
        height: 24,
        layoutMode: 'HORIZONTAL',
        itemSpacing: 24,
        pluginData: { 'f2e-widget': 'nav-menu' },
        children: [
          createMockTextNode({ id: 'cr-nav-1', name: 'Residences', characters: 'Residences', fontSize: 15, color: '#1E293B' }),
          createMockTextNode({ id: 'cr-nav-2', name: 'Amenities', characters: 'Amenities', fontSize: 15, color: '#1E293B' }),
          createMockTextNode({ id: 'cr-nav-3', name: 'Contact', characters: 'Contact', fontSize: 15, color: '#1E293B' }),
        ],
      }),
      createMockFrameNode({
        id: 'cr-hdr-cta',
        name: 'Book Tour [btn]',
        width: 160,
        height: 44,
        layoutMode: 'HORIZONTAL',
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 10,
        paddingBottom: 10,
        cornerRadius: 8,
        fills: [solidFill('#1B4D3E')],
        children: [
          createMockTextNode({ id: 'cr-hdr-cta-t', name: 'Label', characters: 'Book Tour', fontSize: 14, fontStyle: 'SemiBold', color: '#FFFFFF' }),
        ],
      }),
    ],
  });

  // 2. Hero (Composite BG)
  const hero = createMockFrameNode({
    id: 'cr-hero',
    name: 'Hero Section',
    width: 1440,
    height: 640,
    layoutMode: 'NONE',
    exportAsync: async () => new Uint8Array(heroBgBytes),
    children: [
      createMockImageNode({
        id: 'cr-hero-bg',
        name: 'bg',
        width: 1440,
        height: 640,
        imageBytes: heroBgBytes,
        imageHash: sha256Hex(heroBgBytes),
      }),
      createMockFrameNode({
        id: 'cr-hero-overlay',
        name: 'Overlay',
        width: 1440,
        height: 640,
        fills: [solidFill('#0F172A', 0.45)],
      }),
      createMockTextNode({
        id: 'cr-hero-title',
        name: 'Hero Title',
        x: 100,
        y: 180,
        width: 720,
        height: 64,
        characters: `${prefix} The Canopy Residences`,
        fontSize: 48,
        fontFamily: 'Playfair Display',
        fontStyle: 'Bold',
        color: '#FFFFFF',
      }),
      createMockTextNode({
        id: 'cr-hero-sub',
        name: 'Hero Subtitle',
        x: 100,
        y: 260,
        width: 600,
        height: 48,
        characters: 'Biophilic luxury living nestled above the emerald valley.',
        fontSize: 18,
        color: '#F8FAFC',
      }),
      createMockFrameNode({
        id: 'cr-hero-btn',
        name: 'Explore Button [btn]',
        x: 100,
        y: 340,
        width: 190,
        height: 48,
        layoutMode: 'HORIZONTAL',
        fills: [solidFill('#D97706')],
        cornerRadius: 8,
        children: [
          createMockTextNode({ id: 'cr-hero-btn-t', name: 'Text', characters: 'Explore Suites', fontSize: 16, fontStyle: 'SemiBold', color: '#FFFFFF' }),
        ],
      }),
    ],
  });

  // 3. Gallery (`image-gallery` -> `wp_gallery`)
  const gallery = createMockFrameNode({
    id: 'cr-gallery',
    name: 'Residence Gallery [image-gallery]',
    width: 1240,
    height: 360,
    layoutMode: 'HORIZONTAL',
    itemSpacing: 20,
    pluginData: { 'f2e-widget': 'image-gallery' },
    children: galleryBytes.map((bytes, i) => createMockImageNode({
      id: `cr-gal-${i + 1}`,
      name: `Suite Photo ${i + 1}`,
      width: 400,
      height: 400,
      imageBytes: bytes,
      imageHash: sha256Hex(bytes),
    })),
  });

  // 4. Carousel (`image-carousel` -> `carousel`)
  const carousel = createMockFrameNode({
    id: 'cr-carousel',
    name: 'Amenities Carousel [image-carousel]',
    width: 1240,
    height: 360,
    layoutMode: 'HORIZONTAL',
    itemSpacing: 16,
    pluginData: { 'f2e-widget': 'image-carousel' },
    children: galleryBytes.map((bytes, i) => createMockImageNode({
      id: `cr-car-${i + 1}`,
      name: `Amenity ${i + 1}`,
      width: 400,
      height: 400,
      imageBytes: bytes,
      imageHash: sha256Hex(bytes),
    })),
  });

  // 5. Concierge Icon Boxes
  const features = createMockFrameNode({
    id: 'cr-features',
    name: 'Concierge Features',
    width: 1240,
    height: 240,
    layoutMode: 'HORIZONTAL',
    itemSpacing: 24,
    children: [
      createMockFrameNode({
        id: 'cr-icbox-1',
        name: 'Private Butler',
        width: 580,
        height: 180,
        layoutMode: 'VERTICAL',
        itemSpacing: 12,
        pluginData: { 'f2e-widget': 'icon-box' },
        children: [
          createMockVectorNode({ id: 'cr-ic-1', name: 'Bell Icon', width: 40, height: 40, svgMarkup: conciergeSvg1 }),
          createMockTextNode({ id: 'cr-ic-t1', name: 'Title', characters: '24/7 Botanical Concierge', fontSize: 20, fontStyle: 'SemiBold', color: '#0F172A' }),
          createMockTextNode({ id: 'cr-ic-d1', name: 'Desc', characters: 'Dedicated hospitality hosts tailored to every residence.', fontSize: 15, color: '#475569' }),
        ],
      }),
      createMockFrameNode({
        id: 'cr-icbox-2',
        name: 'Wellness Spa',
        width: 580,
        height: 180,
        layoutMode: 'VERTICAL',
        itemSpacing: 12,
        pluginData: { 'f2e-widget': 'icon-box' },
        children: [
          createMockVectorNode({ id: 'cr-ic-2', name: 'Leaf Icon', width: 40, height: 40, svgMarkup: conciergeSvg2 }),
          createMockTextNode({ id: 'cr-ic-t2', name: 'Title', characters: 'Thermal Forest Spa', fontSize: 20, fontStyle: 'SemiBold', color: '#0F172A' }),
          createMockTextNode({ id: 'cr-ic-d2', name: 'Desc', characters: 'Mineral pools framed by old-growth cedar trees.', fontSize: 15, color: '#475569' }),
        ],
      }),
    ],
  });

  // 6. Pro Call-to-Action (`call-to-action`)
  const cta = createMockFrameNode({
    id: 'cr-cta',
    name: 'Penthouse CTA [call-to-action]',
    width: 1240,
    height: 420,
    layoutMode: 'VERTICAL',
    pluginData: { 'f2e-widget': 'call-to-action' },
    children: [
      createMockImageNode({
        id: 'cr-cta-img',
        name: 'Penthouse Photo',
        width: 400,
        height: 400,
        imageBytes: ctaJpgBytes,
        imageHash: sha256Hex(ctaJpgBytes),
      }),
      createMockTextNode({ id: 'cr-cta-t', name: 'Title', characters: 'Skyline Penthouse Collection', fontSize: 32, fontStyle: 'Bold', color: '#FFFFFF' }),
      createMockTextNode({ id: 'cr-cta-d', name: 'Desc', characters: 'Reserve a private architectural tour with panoramic terrace views.', fontSize: 16, color: '#E2E8F0' }),
      createMockTextNode({ id: 'cr-cta-b', name: 'Button', characters: 'Schedule Viewing', fontSize: 15, fontStyle: 'SemiBold', color: '#FFFFFF' }),
    ],
  });

  // 7. Testimonial (`testimonial`)
  const testimonial = createMockFrameNode({
    id: 'cr-testi',
    name: 'Resident Testimonial [testimonial]',
    width: 800,
    height: 220,
    layoutMode: 'VERTICAL',
    pluginData: { 'f2e-widget': 'testimonial' },
    children: [
      createMockImageNode({
        id: 'cr-testi-img',
        name: 'Avatar',
        width: 400,
        height: 400,
        imageBytes: avatarJpgBytes,
        imageHash: sha256Hex(avatarJpgBytes),
      }),
      createMockTextNode({
        id: 'cr-testi-quote',
        name: 'Quote',
        characters: 'Every morning feels like waking inside a serene botanical sanctuary with effortless urban access.',
        fontSize: 18,
        color: '#1E293B',
      }),
      createMockTextNode({ id: 'cr-testi-name', name: 'Author', characters: 'Elena Vance', fontSize: 16, fontStyle: 'SemiBold', color: '#0F172A' }),
      createMockTextNode({ id: 'cr-testi-role', name: 'Role', characters: 'Penthouse Owner', fontSize: 14, color: '#64748B' }),
    ],
  });

  // 8. Nested Accordion (`nested-accordion`)
  const faq = createMockFrameNode({
    id: 'cr-faq',
    name: 'Residences FAQ',
    width: 1240,
    height: 300,
    layoutMode: 'VERTICAL',
    itemSpacing: 12,
    pluginData: { 'f2e-widget': 'nested-accordion' },
    children: [
      createMockFrameNode({
        id: 'cr-faq-1',
        name: 'FAQ Item 1',
        width: 1240,
        height: 80,
        layoutMode: 'VERTICAL',
        children: [
          createMockTextNode({ id: 'cr-faq-q1', name: 'Q1', characters: 'Are private EV charging bays included?', fontSize: 17, fontStyle: 'SemiBold' }),
          createMockTextNode({ id: 'cr-faq-a1', name: 'A1', characters: 'Yes, every residence includes two dedicated 22kW underground charging bays.', fontSize: 15 }),
        ],
      }),
      createMockFrameNode({
        id: 'cr-faq-2',
        name: 'FAQ Item 2',
        width: 1240,
        height: 80,
        layoutMode: 'VERTICAL',
        children: [
          createMockTextNode({ id: 'cr-faq-q2', name: 'Q2', characters: 'What sustainability certifications hold?', fontSize: 17, fontStyle: 'SemiBold' }),
          createMockTextNode({ id: 'cr-faq-a2', name: 'A2', characters: 'LEED Platinum certified with solar thermal glazing and rainwater harvesting.', fontSize: 15 }),
        ],
      }),
    ],
  });

  // 9. Inquiry Form (`form`)
  const form = createMockFrameNode({
    id: 'cr-form',
    name: 'Inquiry Form',
    width: 680,
    height: 380,
    layoutMode: 'VERTICAL',
    itemSpacing: 16,
    pluginData: { 'f2e-widget': 'form' },
    children: [
      createMockFrameNode({
        id: 'cr-fld-name',
        name: 'Full Name Field',
        width: 680,
        height: 68,
        layoutMode: 'VERTICAL',
        children: [
          createMockTextNode({ id: 'cr-fld-name-lbl', name: 'Label', characters: 'Full Name *', fontSize: 14 }),
          createMockFrameNode({
            id: 'cr-fld-name-box',
            name: 'Input Box',
            width: 680,
            height: 44,
            fills: [solidFill('#FFFFFF')],
            strokes: [solidFill('#CBD5E1')],
            strokeWeight: 1,
            cornerRadius: 6,
            children: [createMockTextNode({ id: 'cr-fld-name-ph', name: 'Placeholder', characters: 'Enter your full name', fontSize: 14, color: '#94A3B8' })],
          }),
        ],
      }),
      createMockFrameNode({
        id: 'cr-fld-email',
        name: 'Email Field',
        width: 680,
        height: 68,
        layoutMode: 'VERTICAL',
        children: [
          createMockTextNode({ id: 'cr-fld-email-lbl', name: 'Label', characters: 'Email Address *', fontSize: 14 }),
          createMockFrameNode({
            id: 'cr-fld-email-box',
            name: 'Input Box',
            width: 680,
            height: 44,
            fills: [solidFill('#FFFFFF')],
            strokes: [solidFill('#CBD5E1')],
            strokeWeight: 1,
            cornerRadius: 6,
            children: [createMockTextNode({ id: 'cr-fld-email-ph', name: 'Placeholder', characters: 'guest@canopy.example', fontSize: 14, color: '#94A3B8' })],
          }),
        ],
      }),
      createMockFrameNode({
        id: 'cr-form-submit',
        name: 'Submit Button',
        width: 220,
        height: 48,
        layoutMode: 'HORIZONTAL',
        fills: [solidFill('#1B4D3E')],
        cornerRadius: 8,
        children: [
          createMockTextNode({ id: 'cr-form-submit-t', name: 'Label', characters: 'Request Brochure', fontSize: 15, fontStyle: 'SemiBold', color: '#FFFFFF' }),
        ],
      }),
    ],
  });

  const rootPage = createMockFrameNode({
    id: 'cr-page',
    name: `${prefix} The Canopy Residences`,
    width: 1440,
    height: 3600,
    layoutMode: 'VERTICAL',
    fills: [solidFill('#F8FAFC')],
    children: [header, hero, gallery, carousel, features, cta, testimonial, faq, form],
  });

  const figmaApi = createMockFigmaApi({
    colorVariables: [
      { id: 'var-1', name: `${prefix} Primary`, variableCollectionId: 'col-1', valuesByMode: { 'mode-1': hexToFigmaRgb('#1B4D3E') } },
      { id: 'var-2', name: `${prefix} Secondary`, variableCollectionId: 'col-1', valuesByMode: { 'mode-1': hexToFigmaRgb('#0F172A') } },
      { id: 'var-3', name: `${prefix} Accent`, variableCollectionId: 'col-1', valuesByMode: { 'mode-1': hexToFigmaRgb('#D97706') } },
      { id: 'var-4', name: `${prefix} Text`, variableCollectionId: 'col-1', valuesByMode: { 'mode-1': hexToFigmaRgb('#1E293B') } },
    ],
    textStyles: [
      { id: 'ts-1', name: 'H1 / Display', fontSize: 48, fontName: { family: 'Playfair Display', style: 'Bold' }, lineHeight: { unit: 'PERCENT', value: 120 }, letterSpacing: { unit: 'PIXELS', value: -0.5 } },
      { id: 'ts-2', name: 'Body / Regular', fontSize: 16, fontName: { family: 'Inter', style: 'Regular' }, lineHeight: { unit: 'PERCENT', value: 150 }, letterSpacing: { unit: 'PIXELS', value: 0 } },
    ],
    selection: [rootPage],
  });

  return {
    rootPage,
    selection: [rootPage],
    figmaApi,
    webpAsset: {
      bytes: webpPhotoBytes,
      sha256: sha256Hex(webpPhotoBytes),
      mime: 'image/webp',
      base64: webpPhotoBytes.toString('base64'),
    },
    extraAssets: {
      heroBgBytes,
      ctaJpgBytes,
      avatarJpgBytes,
      galleryBytes,
      logoSvg,
    },
  };
}
