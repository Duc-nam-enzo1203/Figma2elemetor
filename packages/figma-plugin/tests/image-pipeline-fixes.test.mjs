import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bytesToBase64, sha256 } from '../src/utils/crypto.js';
import { resolveWidget, detectCompositeBackgroundChildren } from '../src/tagging/widget-resolver.js';
import { inferVirtualLayout, fixAndOptimizeCanvasSelection } from '../src/optimizer/auto-layout-fixer.js';
import { extractLayout, extractStyle, extractTypography } from '../src/extraction/primitives.js';
import { resolveCssVars, applyDevModeCSSToNode } from '../src/extraction/devmode-css.js';
import { extractLocalDesignSystem } from '../src/extraction/design-system.js';
import { extractDesignSelection, findFirstVisualDescendant } from '../src/extraction/extractor.js';
import { scopeSvgIds, collectSubtreeImages } from '../src/exporters/compiler-helpers.js';
import { compileElementorV3, compileElementorClipboard, compileElementorV4 } from '../src/exporters/elementor-compiler.js';
import { verifyAndHealElementorJson } from '../src/exporters/fidelity-verifier.js';
import { validateElementorV3Tree, validateElementorV4Tree } from '../src/exporters/schema-validator.js';
import {
  wpRequest,
  processRasterAssetsInUi,
  handleLivePushToWordPress,
  createMessageHandler,
} from '../src/code.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, '..');

function makePngBytes(tag = 1) {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, tag & 0xff, (tag >> 8) & 0xff, 1, 2, 3, 4]);
}

test('1. Atomic composite widgets extract child images & slides and compile non-empty media', async () => {
  const mkImgRect = (id, name, tag) => ({
    id,
    name,
    type: 'RECTANGLE',
    visible: true,
    width: 320,
    height: 200,
    fills: [{ type: 'IMAGE', visible: true, imageHash: `hash-${tag}` }],
    exportAsync: async () => makePngBytes(tag),
  });

  // 2-photo row stays container; 3-photo grid resolves as image-gallery
  const twoPhotoRow = {
    id: 'row:2img',
    name: 'Two Photo Row',
    type: 'FRAME',
    visible: true,
    width: 700,
    height: 220,
    layoutMode: 'HORIZONTAL',
    children: [mkImgRect('r2:1', 'Photo 1', 10), mkImgRect('r2:2', 'Photo 2', 11)],
  };
  assert.equal(resolveWidget(twoPhotoRow).widget, 'container');

  const threePhotoGrid = {
    id: 'gal:3img',
    name: 'Photo Grid',
    type: 'FRAME',
    visible: true,
    width: 960,
    height: 240,
    layoutMode: 'HORIZONTAL',
    children: [mkImgRect('g3:1', 'P1', 20), mkImgRect('g3:2', 'P2', 21), mkImgRect('g3:3', 'P3', 22)],
  };
  assert.equal(resolveWidget(threePhotoGrid).widget, 'image-gallery');

  const carouselNode = {
    id: 'car:1',
    name: '[image-carousel] Showcase',
    type: 'FRAME',
    visible: true,
    width: 800,
    height: 300,
    children: [mkImgRect('car:img1', 'Slide Img 1', 30), mkImgRect('car:img2', 'Slide Img 2', 31)],
  };

  const testimonialNode = {
    id: 'testi:1',
    name: '[testimonial] Client Review',
    type: 'FRAME',
    visible: true,
    width: 400,
    height: 220,
    children: [
      mkImgRect('testi:avatar', 'Avatar', 40),
      { id: 'testi:q', type: 'TEXT', visible: true, characters: 'Tuyệt vời, đội ngũ hỗ trợ rất nhiệt tình.' },
      { id: 'testi:n', type: 'TEXT', visible: true, characters: 'Nguyễn Văn A' },
      { id: 'testi:j', type: 'TEXT', visible: true, characters: 'CEO' },
    ],
  };

  const ctaNode = {
    id: 'cta:1',
    name: '[call-to-action] Banner',
    type: 'FRAME',
    visible: true,
    width: 900,
    height: 320,
    children: [
      mkImgRect('cta:bg', 'Hero Photo', 50),
      { id: 'cta:h', type: 'TEXT', visible: true, characters: 'Sẵn sàng trải nghiệm' },
      { id: 'cta:d', type: 'TEXT', visible: true, characters: 'Đăng ký dùng thử 14 ngày miễn phí.' },
      { id: 'cta:b', name: 'Btn', type: 'FRAME', visible: true, getPluginData: (k) => (k === 'f2e-widget' ? 'button' : ''), children: [{ id: 'cta:bt', type: 'TEXT', visible: true, characters: 'Bắt đầu ngay' }] },
    ],
  };

  const slidesNode = {
    id: 'sl:1',
    name: '[slides] Hero Slider',
    type: 'FRAME',
    visible: true,
    width: 1200,
    height: 480,
    children: [
      {
        id: 'sl:s1',
        name: 'Slide 1',
        type: 'FRAME',
        visible: true,
        width: 1200,
        height: 480,
        fills: [{ type: 'IMAGE', visible: true, imageHash: 'hash-60' }],
        exportAsync: async () => makePngBytes(60),
        children: [
          { id: 'sl:s1h', type: 'TEXT', visible: true, characters: 'Slide Một' },
          { id: 'sl:s1d', type: 'TEXT', visible: true, characters: 'Mô tả slide một' },
          { id: 'sl:s1b', type: 'TEXT', visible: true, characters: 'Khám phá' },
        ],
      },
      {
        id: 'sl:s2',
        name: 'Slide 2',
        type: 'FRAME',
        visible: true,
        width: 1200,
        height: 480,
        children: [
          mkImgRect('sl:s2img', 'Photo', 61),
          { id: 'sl:s2h', type: 'TEXT', visible: true, characters: 'Slide Hai' },
        ],
      },
    ],
  };

  const flipBoxNode = {
    id: 'fb:1',
    name: '[flip-box] Card',
    type: 'FRAME',
    visible: true,
    width: 360,
    height: 260,
    children: [
      mkImgRect('fb:img1', 'Front Photo', 70),
      mkImgRect('fb:img2', 'Back Photo', 71),
      { id: 'fb:t1', type: 'TEXT', visible: true, characters: 'Mặt trước' },
      { id: 'fb:d1', type: 'TEXT', visible: true, characters: 'Chi tiết' },
    ],
  };

  const priceTableNode = {
    id: 'pt:1',
    name: '[price-table] Pro Plan',
    type: 'FRAME',
    visible: true,
    width: 340,
    height: 440,
    children: [
      { id: 'pt:h', type: 'TEXT', visible: true, characters: 'Gói Pro' },
      { id: 'pt:sub', type: 'TEXT', visible: true, characters: 'Theo tháng' },
      { id: 'pt:p', type: 'TEXT', visible: true, characters: '$99' },
      { id: 'pt:f1', type: 'TEXT', visible: true, characters: 'Không giới hạn dự án' },
      { id: 'pt:btn', type: 'TEXT', visible: true, characters: 'Đăng ký ngay' },
    ],
  };

  const { document, assetPayloads } = await extractDesignSelection(
    [threePhotoGrid, carouselNode, testimonialNode, ctaNode, slidesNode, flipBoxNode, priceTableNode],
    { fileKey: 'composite-test' }
  );

  assert.ok(assetPayloads.length >= 9, `Expected >= 9 exported assets, got ${assetPayloads.length}`);
  const attachmentMap = {};
  let wpId = 100;
  for (const a of assetPayloads) {
    attachmentMap[a.sha256] = { id: ++wpId, url: `https://example.com/wp-content/uploads/${a.sha256.slice(0, 8)}.png` };
  }

  const v3 = compileElementorV3(document, { attachmentMap });
  const [galEl, carEl, testiEl, ctaEl, slEl, fbEl, ptEl] = v3.content;

  assert.equal(galEl.widgetType, 'image-gallery');
  assert.equal(galEl.settings.wp_gallery.length, 3);
  assert.ok(galEl.settings.wp_gallery.every((m) => m.id > 0 && m.url.startsWith('https://')));

  assert.equal(carEl.widgetType, 'image-carousel');
  assert.equal(carEl.settings.carousel.length, 2);

  assert.equal(testiEl.widgetType, 'testimonial');
  assert.ok(testiEl.settings.testimonial_image.url.startsWith('https://'));

  assert.equal(ctaEl.widgetType, 'call-to-action');
  assert.ok(ctaEl.settings.bg_image.url.startsWith('https://'));
  assert.equal(ctaEl.settings.button, 'Bắt đầu ngay');

  assert.equal(slEl.widgetType, 'slides');
  assert.equal(slEl.settings.slides.length, 2);
  assert.ok(slEl.settings.slides[0].background_image.url.startsWith('https://'));
  assert.ok(slEl.settings.slides[1].background_image.url.startsWith('https://'));

  assert.equal(fbEl.widgetType, 'flip-box');
  assert.ok(fbEl.settings.background_a_image.url.startsWith('https://'));
  assert.ok(fbEl.settings.background_b_image.url.startsWith('https://'));

  assert.equal(ptEl.widgetType, 'price-table');
  assert.equal(ptEl.settings.price, '99');
  assert.equal(ptEl.settings.button_text, 'Đăng ký ngay');
  assert.deepEqual(ptEl.settings.features_list.map((f) => f.item_text), ['Không giới hạn dự án']);

  assert.equal(validateElementorV3Tree(v3.content).valid, true);
});

test('2. Container raster fills hide foreground children, lock HUG Auto-Layout, guard INSTANCE & double border/shadow', async () => {
  const titleNode = { id: 'cbg:t', name: 'Title', type: 'TEXT', visible: true, characters: 'Hero Title', x: 40, y: 40, width: 300, height: 48 };
  const btnNode = {
    id: 'cbg:b',
    name: '[btn] CTA',
    type: 'FRAME',
    visible: true,
    x: 40,
    y: 120,
    width: 140,
    height: 44,
    children: [{ id: 'cbg:bt', type: 'TEXT', visible: true, characters: 'Click' }],
  };

  let fgHidden = false;
  let sizingFixedDuringExport = false;
  let strokesClearedDuringExport = false;
  let effectsClearedDuringExport = false;

  const hugContainer = {
    id: 'cbg:root',
    name: 'Hero Banner',
    type: 'FRAME',
    visible: true,
    width: 1200,
    height: 500,
    layoutMode: 'VERTICAL',
    primaryAxisSizingMode: 'AUTO',
    counterAxisSizingMode: 'AUTO',
    layoutSizingHorizontal: 'HUG',
    layoutSizingVertical: 'HUG',
    fills: [{ type: 'IMAGE', visible: true, imageHash: 'bg-hash' }],
    strokes: [{ type: 'SOLID', visible: true, color: { r: 0.1, g: 0.5, b: 0.2 } }],
    strokeWeight: 2,
    effects: [{ type: 'DROP_SHADOW', visible: true, offset: { x: 0, y: 4 }, radius: 12, color: { r: 0, g: 0, b: 0, a: 0.2 } }],
    opacity: 0.9,
    children: [titleNode, btnNode],
    exportAsync: async () => {
      fgHidden = !titleNode.visible && !btnNode.visible;
      sizingFixedDuringExport = hugContainer.primaryAxisSizingMode === 'FIXED' && hugContainer.layoutSizingHorizontal === 'FIXED';
      strokesClearedDuringExport = Array.isArray(hugContainer.strokes) && hugContainer.strokes.length === 0;
      effectsClearedDuringExport = Array.isArray(hugContainer.effects) && hugContainer.effects.length === 0;
      return makePngBytes(88);
    },
  };

  // Locked INSTANCE child where .visible throws
  const lockedChild = {
    id: 'inst:t',
    name: 'Locked Text',
    type: 'TEXT',
    characters: 'Instance Label',
    get visible() { return true; },
    set visible(_v) { throw new Error('Cannot modify visible inside INSTANCE'); },
  };
  const instanceContainer = {
    id: 'inst:root',
    name: 'Locked Card',
    type: 'INSTANCE',
    visible: true,
    width: 320,
    height: 200,
    fills: [{ type: 'IMAGE', visible: true, imageHash: 'inst-hash' }],
    get strokes() { return [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }]; },
    set strokes(_v) { throw new Error('Read-only strokes on INSTANCE'); },
    strokeWeight: 1,
    children: [lockedChild],
    exportAsync: async () => makePngBytes(89),
  };

  const { document } = await extractDesignSelection([hugContainer, instanceContainer], { fileKey: 'container-bg-test' });
  assert.equal(fgHidden, true);
  assert.equal(sizingFixedDuringExport, true);
  assert.equal(strokesClearedDuringExport, true);
  assert.equal(effectsClearedDuringExport, true);

  // Restored in finally
  assert.equal(titleNode.visible, true);
  assert.equal(btnNode.visible, true);
  assert.equal(hugContainer.primaryAxisSizingMode, 'AUTO');
  assert.equal(hugContainer.layoutSizingHorizontal, 'HUG');
  assert.equal(hugContainer.strokes.length, 1);
  assert.equal(hugContainer.effects.length, 1);
  assert.equal(hugContainer.opacity, 0.9);

  // INSTANCE warning emitted & read-only CSS border stripped so no double-border
  assert.ok(document.warnings.some((w) => w.code === 'composite-bg-instance-fg-visible'));
  const instIr = document.nodes['f2e:container-bg-test:inst:root'];
  assert.equal(instIr.style.borderWidth, undefined);

  const v3 = compileElementorV3(document);
  assert.equal(v3.content[0].settings.background_background, 'classic');
  assert.ok(v3.content[0].settings.background_image.url.startsWith('data:image/png;base64,'));
  assert.equal(v3.content[0].elements.length, 2);
});

test('3. Raster-in-SVG wrapper frames export as raster image (and reactive SVG <image> fallback re-exports as PNG)', async () => {
  const maskedPhotoFrame = {
    id: 'wrap:photo',
    name: '[image] Rounded Avatar',
    type: 'FRAME',
    visible: true,
    width: 120,
    height: 120,
    clipsContent: true,
    cornerRadius: 60,
    children: [
      { id: 'wrap:mask', name: 'Ellipse', type: 'ELLIPSE', visible: true, isMask: true, width: 120, height: 120 },
      { id: 'wrap:img', name: 'Photo', type: 'RECTANGLE', visible: true, width: 120, height: 120, fills: [{ type: 'IMAGE', visible: true, imageHash: 'av' }] },
    ],
    exportAsync: async ({ format }) => {
      assert.equal(format, 'PNG');
      return makePngBytes(91);
    },
  };

  const rasterLogoWrapper = {
    id: 'wrap:logo',
    name: 'Site Logo',
    type: 'FRAME',
    visible: true,
    width: 160,
    height: 48,
    getPluginData: (k) => (k === 'f2e-widget' ? 'theme-site-logo' : ''),
    children: [
      { id: 'wrap:logo-img', name: 'Logo PNG', type: 'RECTANGLE', visible: true, width: 160, height: 48, fills: [{ type: 'IMAGE', visible: true, imageHash: 'lg' }] },
    ],
    exportAsync: async ({ format }) => {
      assert.equal(format, 'PNG');
      return makePngBytes(92);
    },
  };

  // Reactive fallback: SVG export returns <svg><image xlink:href="data:image/png;base64,..."/></svg>
  const reactiveSvgWrapper = {
    id: 'wrap:reactive',
    name: 'Featured Image',
    type: 'FRAME',
    visible: true,
    width: 400,
    height: 240,
    getPluginData: (k) => (k === 'f2e-widget' ? 'theme-post-featured-image' : ''),
    children: [],
    exportAsync: async ({ format }) => {
      if (format === 'SVG') {
        return new TextEncoder().encode('<svg viewBox="0 0 400 240"><image xlink:href="data:image/png;base64,iVBORw0KGgo="/></svg>');
      }
      return makePngBytes(93);
    },
  };

  const { document, assetPayloads } = await extractDesignSelection(
    [maskedPhotoFrame, rasterLogoWrapper, reactiveSvgWrapper],
    { fileKey: 'raster-wrap' }
  );

  assert.equal(assetPayloads.length, 3);
  assert.ok(assetPayloads.every((a) => a.kind === 'image' && a.mime === 'image/png'));

  const v3 = compileElementorV3(document);
  assert.equal(v3.content[0].widgetType, 'image');
  assert.ok(v3.content[0].settings.image.url.startsWith('data:image/png;base64,'));

  assert.equal(v3.content[1].widgetType, 'theme-site-logo');
  assert.ok(v3.content[1].settings.image.url.startsWith('data:image/png;base64,'));
  assert.ok(v3.content[1].settings.custom_image.url.startsWith('data:image/png;base64,'));

  assert.equal(v3.content[2].widgetType, 'theme-post-featured-image');
  assert.ok(v3.content[2].settings.image.url.startsWith('data:image/png;base64,'));
});

test('4. Composite BG hints protect small "Vector" icons, catch post-FG overlays, and optimizer skips dividers/illustrations', () => {
  const smallVectorIcon = {
    id: 'fg:vec',
    name: 'Vector',
    type: 'VECTOR',
    visible: true,
    x: 24,
    y: 24,
    width: 36,
    height: 36,
  };
  const cardTitle = {
    id: 'fg:title',
    name: 'Title',
    type: 'TEXT',
    visible: true,
    x: 80,
    y: 28,
    width: 180,
    height: 24,
    characters: 'Fast Delivery',
  };
  const cardFrame = {
    id: 'card:vec',
    name: 'Feature Card',
    type: 'FRAME',
    visible: true,
    layoutMode: 'NONE',
    width: 320,
    height: 120,
    children: [smallVectorIcon, cardTitle],
  };

  const res1 = detectCompositeBackgroundChildren(cardFrame);
  assert.equal(res1.bgChildren.length, 0, 'Small 36x36 "Vector" icon must NOT be swallowed as composite background');

  const photoBg = { id: 'hero:photo', name: 'BG', type: 'RECTANGLE', visible: true, x: 0, y: 0, width: 1440, height: 600 };
  const heroText = { id: 'hero:txt', name: 'Heading', type: 'TEXT', visible: true, x: 100, y: 200, width: 500, height: 60, characters: 'Hero' };
  const topOverlay = { id: 'hero:ov', name: 'Tint Layer', type: 'RECTANGLE', visible: true, x: 0, y: 0, width: 1440, height: 600, opacity: 0.45 };
  const hero = {
    id: 'hero:ovroot',
    name: 'Hero',
    type: 'FRAME',
    visible: true,
    layoutMode: 'NONE',
    width: 1440,
    height: 600,
    children: [photoBg, heroText, topOverlay],
  };
  const res2 = detectCompositeBackgroundChildren(hero);
  assert.equal(res2.bgIds.has('hero:photo'), true);
  assert.equal(res2.bgIds.has('hero:ov'), true, 'Post-foreground translucent overlay >= 50% area must be detected as BG');

  const store = new Map();
  const dividerVec = {
    id: 'opt:div',
    name: 'Line',
    type: 'VECTOR',
    visible: true,
    width: 320,
    height: 1,
    getPluginData: (k) => store.get(`div:${k}`) || '',
    setPluginData: (k, v) => store.set(`div:${k}`, v),
  };
  const bigIllust = {
    id: 'opt:big',
    name: 'Illustration',
    type: 'FRAME',
    visible: true,
    width: 400,
    height: 360,
    children: [{ id: 'opt:v', type: 'VECTOR', visible: true }],
    getPluginData: (k) => store.get(`big:${k}`) || '',
    setPluginData: (k, v) => store.set(`big:${k}`, v),
  };
  const stats = fixAndOptimizeCanvasSelection([dividerVec, bigIllust]);
  assert.equal(stats.taggedIcons, 0, 'Divider and >128px illustration must not be tagged as icon');
});

test('5. findFirstVisualDescendant avoids "ic"/"pic" text collisions and raster icon-box converts cleanly to image-box', async () => {
  const iconBoxWithServiceContent = {
    id: 'ib:1',
    name: 'Service Card',
    type: 'FRAME',
    visible: true,
    width: 320,
    height: 220,
    layoutMode: 'VERTICAL',
    getPluginData: (k) => (k === 'f2e-widget' ? 'icon-box' : ''),
    children: [
      {
        id: 'ib:svc',
        name: 'Service Content',
        type: 'FRAME',
        visible: true,
        children: [
          { id: 'ib:t1', type: 'TEXT', visible: true, characters: 'Cloud Hosting' },
          { id: 'ib:t2', type: 'TEXT', visible: true, characters: 'High uptime SLA.' },
        ],
      },
      {
        id: 'ib:icon',
        name: 'Icon',
        type: 'FRAME',
        visible: true,
        width: 48,
        height: 48,
        children: [{ id: 'ib:pic', type: 'RECTANGLE', visible: true, width: 48, height: 48, fills: [{ type: 'IMAGE', visible: true, imageHash: 'ic-img' }] }],
        exportAsync: async () => makePngBytes(77),
      },
    ],
  };

  const found = findFirstVisualDescendant(iconBoxWithServiceContent);
  assert.equal(found && found.id, 'ib:icon', 'Must skip "Service Content" (contains "ic") and pick raster Icon wrapper');

  const { document } = await extractDesignSelection([iconBoxWithServiceContent], { fileKey: 'ib-raster' });
  const v3 = compileElementorV3(document);
  assert.equal(v3.content[0].widgetType, 'image-box', 'Raster icon-box must compile to image-box');
  assert.ok(v3.content[0].settings.image.url.startsWith('data:image/png;base64,'));
  assert.equal(validateElementorV3Tree(v3.content).valid, true);

  // Uploaded SVG in icon-box uses { id, url } object
  const svgIconBox = {
    id: 'ib:svg',
    name: 'SVG Feature',
    type: 'FRAME',
    visible: true,
    width: 300,
    height: 200,
    getPluginData: (k) => (k === 'f2e-widget' ? 'icon-box' : ''),
    children: [
      { id: 'ib:v', name: 'Icon', type: 'VECTOR', visible: true, width: 32, height: 32, exportAsync: async () => new TextEncoder().encode('<svg width="32" height="32"><path d="M0 0h32"/></svg>') },
      { id: 'ib:st1', type: 'TEXT', visible: true, characters: 'Speed' },
      { id: 'ib:st2', type: 'TEXT', visible: true, characters: 'Ultra fast.' },
    ],
  };
  const svgRes = await extractDesignSelection([svgIconBox], { fileKey: 'ib-svg' });
  const svgHash = svgRes.assetPayloads[0].sha256;
  const v3Uploaded = compileElementorV3(svgRes.document, {
    attachmentMap: { [svgHash]: { id: 555, url: 'https://example.com/icon.svg' } },
  });
  assert.equal(v3Uploaded.content[0].widgetType, 'icon-box');
  assert.deepEqual(v3Uploaded.content[0].settings.selected_icon, {
    value: { id: 555, url: 'https://example.com/icon.svg' },
    library: 'svg',
  });

  // Fidelity verifier heals manual broken raster icon-box and deletes _healedFromIconBox
  const healed = verifyAndHealElementorJson([
    {
      id: 'broken1',
      elType: 'widget',
      widgetType: 'icon-box',
      settings: {
        title_text: 'Broken',
        description_text: 'Raster in SVG slot',
        selected_icon: { library: 'svg', value: 'data:image/png;base64,AAAA' },
      },
      elements: [],
    },
  ]);
  assert.equal(healed.elements[0].widgetType, 'image-box');
  assert.equal('_healedFromIconBox' in healed.elements[0], false);
});

test('6. Site Logo uses ;base64, SVG data URI + both image/custom_image, and inline SVGs deduplicate <defs> IDs', async () => {
  const sharedSvg = '<svg viewBox="0 0 24 24"><defs><clipPath id="clip0_1"><rect width="24" height="24"/></clipPath><linearGradient id="paint0_1"><stop/></linearGradient></defs><g clip-path="url(#clip0_1)"><path fill="url(#paint0_1)"/></g></svg>';

  const logoNode = {
    id: 'logo:svg',
    name: 'Site Logo',
    type: 'FRAME',
    visible: true,
    width: 140,
    height: 40,
    getPluginData: (k) => (k === 'f2e-widget' ? 'theme-site-logo' : ''),
    children: [{ id: 'logo:v', type: 'VECTOR', visible: true }],
    exportAsync: async () => new TextEncoder().encode(sharedSvg),
  };
  const icon1 = {
    id: 'ic:1',
    name: 'Icon A',
    type: 'VECTOR',
    visible: true,
    width: 24,
    height: 24,
    exportAsync: async () => new TextEncoder().encode(sharedSvg),
  };
  const icon2 = {
    id: 'ic:2',
    name: 'Icon B',
    type: 'VECTOR',
    visible: true,
    width: 24,
    height: 24,
    exportAsync: async () => new TextEncoder().encode(sharedSvg),
  };

  const { document } = await extractDesignSelection([logoNode, icon1, icon2], { fileKey: 'svg-ids' });
  const v3 = compileElementorV3(document);

  const logoEl = v3.content[0];
  assert.ok(logoEl.settings.image.url.startsWith('data:image/svg+xml;base64,'));
  assert.equal(logoEl.settings.custom_image.url, logoEl.settings.image.url);

  const html1 = v3.content[1].settings.html;
  const html2 = v3.content[2].settings.html;
  const idMatch1 = /id="(clip0_1_[^"]+)"/.exec(html1);
  const idMatch2 = /id="(clip0_1_[^"]+)"/.exec(html2);
  assert.ok(idMatch1 && idMatch2);
  assert.notEqual(idMatch1[1], idMatch2[1], 'Duplicate SVG defs IDs must be uniquely scoped per element');
  assert.ok(html1.includes(`url(#${idMatch1[1]})`));
  assert.ok(html2.includes(`url(#${idMatch2[1]})`));
});

test('7. Dev Mode CSS: nested var(), url(<path-to-image>), % radius, % letterSpacing, individual strokes & GROUP offsets', async () => {
  assert.equal(
    resolveCssVars('0 4px 12px var(--shadow, rgba(0, 0, 0, 0.25))'),
    '0 4px 12px rgba(0, 0, 0, 0.25)'
  );
  assert.equal(
    resolveCssVars('var(--bg, linear-gradient(180deg, var(--c1, #FFF) 0%, #000 100%))'),
    'linear-gradient(180deg, #FFF 0%, #000 100%)'
  );

  // url(<path-to-image>) stripped on image widget & % radius preserved
  const imgEntry = { type: 'frame', widget: 'image', style: {}, layout: {} };
  applyDevModeCSSToNode(imgEntry, {
    background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 100%), url(<path-to-image>) lightgray 50% / cover no-repeat',
    'border-radius': '50% / 50%',
    width: '100%',
  });
  assert.equal(imgEntry.style.devModeBackgroundCss, undefined);
  assert.equal(imgEntry.style.radius.unit, '%');
  assert.equal(imgEntry.style.radius.top, 50);
  assert.equal(imgEntry.layout.width, undefined, '% width must not coerce to px');

  // Individual stroke where strokeTopWeight === strokeWeight
  const strokeStyle = extractStyle({
    type: 'FRAME',
    strokes: [{ type: 'SOLID', visible: true, color: { r: 0, g: 0, b: 0 } }],
    strokeWeight: 1,
    strokeTopWeight: 1,
    strokeRightWeight: 0,
    strokeBottomWeight: 1,
    strokeLeftWeight: 0,
  });
  assert.deepEqual(strokeStyle.borderWidth, { top: 1, right: 0, bottom: 1, left: 0, isLinked: false });

  // GROUP child relative offset
  const groupLayout = extractLayout(
    { type: 'TEXT', x: 150, y: 220, width: 100, height: 24 },
    { type: 'GROUP', x: 100, y: 200 }
  );
  assert.equal(groupLayout.x, 50);
  assert.equal(groupLayout.y, 20);

  // PERCENT letterSpacing & lineHeight precision + Dev Mode em letter-spacing
  const typo = extractTypography({
    type: 'TEXT',
    characters: 'TRACKING',
    fontSize: 16,
    fontName: { family: 'Inter', style: 'Bold' },
    lineHeight: { unit: 'PERCENT', value: 125 },
    letterSpacing: { unit: 'PERCENT', value: 5 },
  });
  assert.equal(typo.lineHeight, 1.25);
  assert.equal(typo.letterSpacing, 0.05);
  assert.equal(typo.letterSpacingUnit, 'em');

  const dmTxt = { type: 'text', text: { ...typo }, style: {}, layout: {} };
  applyDevModeCSSToNode(dmTxt, { 'letter-spacing': '-0.02em' });
  assert.equal(dmTxt.text.letterSpacing, -0.02);
  assert.equal(dmTxt.text.letterSpacingUnit, 'em');

  // QuickJS SceneNode prototype getter safety in inferVirtualLayout(node, rawKids)
  class MockSceneNode {
    get width() { return 600; }
    get height() { return 200; }
    get type() { return 'FRAME'; }
    get x() { return 0; }
    get y() { return 0; }
  }
  const qNode = new MockSceneNode();
  const inf = inferVirtualLayout(qNode, [
    { id: 'q1', visible: true, x: 20, y: 20, width: 100, height: 40 },
    { id: 'q2', visible: true, x: 140, y: 20, width: 100, height: 40 },
  ]);
  assert.equal(inf.width, 600);
  assert.equal(inf.padding.right, 360);

  // Design system rgb() support
  const ds = await extractLocalDesignSystem({
    currentPage: {
      selection: [
        {
          id: 'ds:f',
          name: 'Card',
          type: 'FRAME',
          visible: true,
          getCSSAsync: async () => ({ background: 'rgb(22, 163, 74)' }),
          children: [],
        },
      ],
    },
  });
  assert.ok(ds.colors.some((c) => c.value === '#16A34A'));
});

test('8. Absorbed [bg] borderGradient, autoUnwrap/linearBorder flags, and nested-accordion sync + escapeHtml', async () => {
  const cardWithBgChild = {
    id: 'bgc:root',
    name: 'Card',
    type: 'FRAME',
    visible: true,
    width: 360,
    height: 200,
    layoutMode: 'VERTICAL',
    children: [
      {
        id: 'bgc:bg',
        name: 'border',
        type: 'RECTANGLE',
        visible: true,
        layoutPositioning: 'ABSOLUTE',
        x: 0,
        y: 0,
        width: 360,
        height: 200,
        cornerRadius: 12,
        strokes: [{
          type: 'GRADIENT_LINEAR',
          visible: true,
          gradientStops: [
            { position: 0, color: { r: 0.1, g: 0.8, b: 0.3, a: 1 } },
            { position: 1, color: { r: 0.0, g: 0.4, b: 0.9, a: 1 } },
          ],
        }],
        strokeWeight: 2,
      },
      { id: 'bgc:t', type: 'TEXT', visible: true, characters: 'Hello' },
    ],
  };

  const extBg = await extractDesignSelection([cardWithBgChild], { fileKey: 'bg-grad' });
  const v3On = compileElementorV3(extBg.document, { linearBorder: true });
  assert.ok(v3On.content[0].settings.custom_css.includes('background-clip: padding-box, border-box'));

  const v3Off = compileElementorV3(extBg.document, { linearBorder: false });
  assert.ok(!String(v3Off.content[0].settings.custom_css || '').includes('background-clip: padding-box, border-box'));

  // nested-accordion with leading divider + XSS characters
  const accNode = {
    id: 'acc:1',
    name: '[accordion] FAQ',
    type: 'FRAME',
    visible: true,
    width: 600,
    height: 200,
    children: [
      { id: 'acc:div', name: 'Divider', type: 'LINE', visible: true, width: 600, height: 1 },
      {
        id: 'acc:row1',
        name: 'FAQ Item',
        type: 'FRAME',
        visible: true,
        children: [
          { id: 'acc:q1', type: 'TEXT', visible: true, characters: 'Q1?' },
          { id: 'acc:a1', type: 'TEXT', visible: true, characters: 'x < 5 & <script>alert(1)</script>' },
        ],
      },
    ],
  };
  const extAcc = await extractDesignSelection([accNode], { fileKey: 'acc-xss' });
  const v3Acc = compileElementorV3(extAcc.document);
  const accEl = v3Acc.content[0];
  assert.equal(accEl.widgetType, 'nested-accordion');
  const bodyEditor = accEl.elements[0].elements[0].elements[0].settings.editor;
  assert.ok(bodyEditor.includes('&lt;script&gt;'));
  assert.ok(bodyEditor.includes('&amp;'));
  assert.equal(validateElementorV3Tree(v3Acc.content).valid, true);
});

test('9. Elementor v4 Atomic attachmentMap, e-image, e-svg, Style_Schema keys & validator negative test', async () => {
  const bytes = makePngBytes(55);
  const imgHash = await sha256(bytes);
  const svgStr = '<svg width="24" height="24"><path d="M0 0h24"/></svg>';
  const svgHash = await sha256(new TextEncoder().encode(svgStr));

  const doc = {
    kind: 'f2e.document',
    title: 'V4 Test',
    roots: ['n:root'],
    nodes: {
      'n:root': {
        id: 'n:root',
        sourceNodeId: '1:1',
        widget: 'container',
        children: ['n:img', 'n:svg'],
        layout: { direction: 'column', gap: 16, padding: { top: 20, right: 20, bottom: 20, left: 20 } },
        style: { background: '#FFFFFF', backgroundImage: imgHash, backgroundImageDataUri: 'data:image/png;base64,AA==' },
      },
      'n:img': {
        id: 'n:img',
        sourceNodeId: '1:2',
        widget: 'image',
        children: [],
        layout: {},
        style: {},
        image: { sha256: imgHash, dataUri: 'data:image/png;base64,AA==' },
      },
      'n:svg': {
        id: 'n:svg',
        sourceNodeId: '1:3',
        widget: 'icon',
        children: [],
        layout: {},
        style: {},
        svg: { sha256: svgHash, markup: svgStr },
      },
    },
  };

  const v4 = compileElementorV4(doc, {
    attachmentMap: {
      [imgHash]: { id: 321, url: 'https://example.com/hero.webp' },
      [svgHash]: { id: 322, url: 'https://example.com/icon.svg' },
    },
  });

  const rootV4 = v4.content[0];
  const rootProps = Object.values(rootV4.styles)[0].variants[0].props;
  assert.equal(rootProps.background.$$type, 'background');
  assert.equal(rootProps.background.value['background-overlay'].value[0].value.image.value.src.value.id.value, 321);
  assert.equal(rootProps.padding.$$type, 'dimensions');

  const imgEl = rootV4.elements[0];
  assert.equal(imgEl.widgetType, 'e-image');
  assert.equal(imgEl.settings.image.value.src.value.id.value, 321);
  assert.equal(imgEl.settings.image.value.src.value.url, null);

  const svgEl = rootV4.elements[1];
  assert.equal(svgEl.widgetType, 'e-svg');
  assert.equal(svgEl.settings.svg.$$type, 'svg-src');
  assert.equal(svgEl.settings.svg.value.id.value, 322);

  assert.equal(validateElementorV4Tree(v4.content).valid, true);

  const badV4 = [{
    id: 'badv4',
    widgetType: 'e-flexbox',
    settings: { classes: { $$type: 'classes', value: ['c1'] } },
    styles: { c1: { variants: [{ meta: { breakpoint: 'desktop' }, props: { backgroundColor: { $$type: 'color', value: '#FFF' } } }] } },
    elements: [],
  }];
  assert.equal(validateElementorV4Tree(badV4).valid, false);
});

test('10. code.js: wpRequest timeout, batched processRasterAssetsInUi, size guard, remapping & Live Push Step 2/4', async () => {
  const prevFigma = globalThis.figma;
  const prevFetch = globalThis.fetch;
  const postedMessages = [];

  try {
    const mockStorage = new Map([
      ['f2e.sites.v1', [{ siteUrl: 'https://wp.test', token: 'f2e_live_secret' }]],
    ]);
    globalThis.figma = {
      fileKey: 'test-file',
      currentPage: {
        selection: [
          {
            id: 'push:1',
            name: 'Hero',
            type: 'FRAME',
            visible: true,
            width: 800,
            height: 400,
            children: [
              { id: 'push:txt', name: 'Heading', type: 'TEXT', visible: true, characters: 'Hero Title' },
              { id: 'push:img', name: 'Photo', type: 'RECTANGLE', visible: true, width: 400, height: 300, fills: [{ type: 'IMAGE', visible: true, imageHash: 'p1' }], exportAsync: async () => makePngBytes(12) },
            ],
          },
        ],
      },
      ui: {
        postMessage: (m) => postedMessages.push(m),
      },
      clientStorage: {
        getAsync: async (k) => mockStorage.get(k),
        setAsync: async (k, v) => mockStorage.set(k, v),
      },
      notify: () => {},
    };

    // 10A. wpRequest timeout (also test without AbortController)
    const savedAbort = globalThis.AbortController;
    globalThis.AbortController = undefined;
    globalThis.fetch = () => new Promise(() => {});
    await assert.rejects(
      () => wpRequest('https://wp.test', 'tok', '/status', { timeoutMs: 25 }),
      /hết thời gian/
    );
    globalThis.AbortController = savedAbort;

    // 10B. processRasterAssetsInUi multi-batch (>4 assets), size guard (larger WebP keeps PNG), and extractedImages/slides remapping
    const handler = createMessageHandler();
    const assets = [];
    const doc = { assets: {}, nodes: {}, warnings: [] };
    for (let i = 0; i < 6; i += 1) {
      const raw = new Uint8Array(40 + i).fill(i + 1);
      const sha = await sha256(raw);
      const b64 = bytesToBase64(raw);
      const asset = { assetId: `a-${i}`, kind: 'image', sha256: sha, mime: 'image/png', byteLength: raw.byteLength, base64: b64 };
      assets.push(asset);
      doc.assets[sha] = asset;
    }
    doc.nodes['n1'] = {
      id: 'n1',
      extractedImages: [{ sha256: assets[0].sha256, mime: 'image/png', dataUri: `data:image/png;base64,${assets[0].base64}` }],
      content: { slides: [{ id: 's1', image: { sha256: assets[1].sha256, mime: 'image/png', dataUri: `data:image/png;base64,${assets[1].base64}` } }] },
    };

    // Intercept compress-assets-webp posts and reply via handler
    globalThis.figma.ui.postMessage = (m) => {
      postedMessages.push(m);
      if (m.type === 'compress-assets-webp') {
        const results = m.assets.map((a, idx) => {
          // Make the last asset's WebP LARGER than original so size guard keeps original PNG
          const isOversizedWebp = a.sha256 === assets[5].sha256;
          const outBytes = isOversizedWebp ? new Uint8Array(120).fill(9) : new Uint8Array(10 + idx).fill(7);
          return { oldSha256: a.sha256, mime: 'image/webp', base64: bytesToBase64(outBytes) };
        });
        setTimeout(() => handler({ type: 'compress-assets-webp-result', requestId: m.requestId, results }), 5);
      }
    };

    const optRep = await processRasterAssetsInUi(doc, assets, { imageFormat: 'WEBP', quality: 0.82, maxWidth: 1200 });
    assert.equal(optRep.count, 5);
    assert.equal(optRep.keptOriginal, 1);
    assert.equal(assets[5].mime, 'image/png', 'Larger WebP must keep original PNG');
    assert.equal(doc.nodes['n1'].extractedImages[0].mime, 'image/webp');
    assert.equal(doc.nodes['n1'].content.slides[0].image.mime, 'image/webp');

    // 10C. Live Push: transient 500 retry succeeds, v4 receives attachmentMap, trailing /status error does not mask success
    let assetAttempts = 0;
    let importedBody = null;
    globalThis.fetch = async (url, opts) => {
      if (url.includes('rest_route=/f2e-bridge/v1/assets')) {
        assetAttempts += 1;
        if (assetAttempts === 1) {
          return { ok: false, status: 502, json: async () => ({ success: false, message: 'Bad Gateway' }) };
        }
        return { ok: true, status: 200, json: async () => ({ success: true, data: { id: 777, url: 'https://wp.test/wp-content/uploads/p.png' } }) };
      }
      if (url.includes('rest_route=/f2e-bridge/v1/import')) {
        importedBody = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({ success: true, data: { postId: 42, actionLabel: 'Created' } }) };
      }
      if (url.includes('rest_route=/f2e-bridge/v1/status')) {
        return { ok: false, status: 500, json: async () => ({ success: false, message: 'Transient status fail' }) };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
    };

    await handleLivePushToWordPress({
      siteUrl: 'https://wp.test',
      elementorVersion: 'v4',
      syncGlobalStyles: false,
      imageFormat: 'PNG',
    });
    assert.equal(assetAttempts, 2, 'Transient 502 must retry once and succeed');
    const v4ImgEl = importedBody.content[0].elements.find((e) => e.widgetType === 'e-image');
    assert.ok(v4ImgEl, 'Compiled v4 tree must contain e-image element');
    assert.equal(v4ImgEl.settings.image.value.src.value.id.value, 777);

    // 10D. Persistent 500 failure in Step 2 aggregates and surfaces failed asset error
    globalThis.fetch = async (url) => {
      if (url.includes('rest_route=/f2e-bridge/v1/assets')) {
        return { ok: false, status: 500, json: async () => ({ success: false, message: 'Disk full' }) };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
    };
    await assert.rejects(
      () => handleLivePushToWordPress({
        siteUrl: 'https://wp.test',
        elementorVersion: 'v3',
        syncGlobalStyles: false,
        imageFormat: 'PNG',
      }),
      /Upload thất bại 1\/1 tài nguyên.*Disk full/
    );

    // 10E. save-prefs persists preferences
    await handler({ type: 'save-prefs', prefs: { autoUnwrap: false, linearBorder: false, devModeCss: false } });
    assert.deepEqual(mockStorage.get('f2e.prefs.v1'), { autoUnwrap: false, linearBorder: false, devModeCss: false });
  } finally {
    globalThis.figma = prevFigma;
    globalThis.fetch = prevFetch;
  }
});

test('11. UI app.js in node:vm: canvas clamp/JPG/PNG resize, selection refresh, prefs & bundler $$type safety', async () => {
  const [appJs, indexHtml, distCode] = await Promise.all([
    readFile(resolve(pkgRoot, 'src/ui/app.js'), 'utf8'),
    readFile(resolve(pkgRoot, 'src/ui/index.html'), 'utf8'),
    readFile(resolve(pkgRoot, 'dist/code.js'), 'utf8'),
  ]);

  // Verify bundler syntax & literal $$type preservation
  assert.doesNotThrow(() => new vm.Script(distCode, { filename: 'dist/code.js' }));
  assert.ok(!indexHtml.includes('<!-- UI_SCRIPT_INJECTION -->'));

  const posted = [];
  const elements = new Map();
  const makeEl = (id, tag = 'div', props = {}) => {
    const el = {
      id,
      tagName: tag.toUpperCase(),
      style: {},
      dataset: {},
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); },
        remove(c) { this._set.delete(c); },
        toggle(c, f) { if (f) this._set.add(c); else this._set.delete(c); },
        contains(c) { return this._set.has(c); },
      },
      _listeners: {},
      addEventListener(ev, fn) { (this._listeners[ev] = this._listeners[ev] || []).push(fn); },
      appendChild() {},
      querySelectorAll() { return []; },
      querySelector() { return null; },
      focus() {},
      select() {},
      setSelectionRange() {},
      setAttribute() {},
      innerHTML: '',
      textContent: '',
      value: props.value ?? '',
      checked: props.checked ?? true,
      ...props,
    };
    if (id) elements.set(id, el);
    return el;
  };

  for (const id of [
    'btn-go-step-2', 'btn-back-step-1', 'btn-go-step-3', 'btn-back-step-2', 'btn-go-step-4', 'btn-back-step-3',
    'btn-scan-ds', 'btn-sync-all-ds', 'picker-close', 'picker-backdrop', 'picker-search',
    'btn-refresh', 'btn-reset-tags', 'exp-img-format', 'exp-img-scale', 'exp-webp-quality', 'exp-img-max-width',
    'wrap-img-quality', 'webp-settings-row', 'btn-copy-clipboard', 'btn-dl-bundle', 'btn-dl-v3', 'btn-dl-v4',
    'btn-toggle-add-site', 'btn-verify-site', 'btn-delete-site', 'site-select', 'push-target-type',
    'btn-live-push', 'btn-sync-tokens-only', 'btn-fix-layout', 'btn-clear-resp', 'sel-gemini-model',
    'btn-toggle-ai-cfg', 'btn-toggle-key-vis', 'btn-save-ai-cfg', 'btn-close-ai-modal', 'btn-ai-modal-done',
    'ai-progress-backdrop', 'btn-reset-tags-quick', 'btn-ai-smart-scan', 'btn-ds-add-color', 'btn-ds-add-font',
    'ds-edit-layout-bg', 'ds-edit-layout-bg-hex', 'chk-auto-unwrap', 'chk-linear-border', 'chk-dev-mode-css',
    'chk-sync-globals', 'push-title', 'push-mode', 'push-el-version', 'push-status', 'push-post-id',
    'push-template-type', 'sel-summary', 'outline-container', 'vp-desktop-name', 'vp-tablet-name', 'vp-mobile-name',
    'ds-colors-preview', 'ds-fonts-preview', 'ds-badge-colors', 'ds-badge-fonts', 'ds-badge-theme', 'ds-badge-layout',
    'add-site-box', 'wrap-template-type', 'status-bar', 'status-text', 'status-progress-track', 'status-progress-fill',
    'status-pct', 'wrap-custom-model', 'inp-gemini-key', 'ai-key-badge',
  ]) {
    makeEl(id, id.startsWith('chk-') ? 'input' : 'div', {
      value: id === 'exp-img-format' ? 'WEBP' : (id === 'exp-webp-quality' ? '0.82' : (id === 'exp-img-max-width' ? '1200' : '')),
      checked: true,
    });
  }

  let lastCanvasSize = null;
  let jpgFilledWhite = false;
  let canvasCleaned = false;

  const sandbox = {
    window: null,
    parent: { postMessage: (msg) => posted.push(msg.pluginMessage) },
    document: {
      getElementById: (id) => elements.get(id) || null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: (tag) => {
        if (tag === 'canvas') {
          const c = {
            _w: 0,
            _h: 0,
            set width(v) { this._w = v; if (v === 0) canvasCleaned = true; },
            get width() { return this._w; },
            set height(v) { this._h = v; },
            get height() { return this._h; },
            getContext: () => ({
              _fillStyle: '',
              set fillStyle(v) { this._fillStyle = v; },
              fillRect() { if (this._fillStyle === '#FFFFFF') jpgFilledWhite = true; },
              drawImage: () => { lastCanvasSize = { w: c._w, h: c._h }; },
            }),
            toDataURL: (mime) => `data:${mime};base64,ZmFrZQ==`,
          };
          return c;
        }
        return makeEl(null, tag);
      },
    },
    Image: class MockImage {
      set src(_v) {
        this.naturalWidth = 20000;
        this.naturalHeight = 10000;
        if (this.onload) this.onload();
      }
    },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    Blob,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(appJs, sandbox);

  // 11A. Quality row toggles only wrap-img-quality; maxWidth stays available for PNG/JPG
  const fmtEl = elements.get('exp-img-format');
  const qualWrap = elements.get('wrap-img-quality');
  fmtEl.value = 'PNG';
  fmtEl._listeners.change[0]();
  assert.equal(qualWrap.style.display, 'none');
  fmtEl.value = 'JPG';
  fmtEl._listeners.change[0]();
  assert.equal(qualWrap.style.display, 'block');

  // 11B. Oversized 20000x10000 image clamps below MAX_CANVAS_DIM & fills white for JPG & cleans canvas
  const jpgResults = await sandbox.processRasterAssetsInBrowser(
    [{ sha256: 'abc', mime: 'image/png', base64: 'AAAA' }],
    { targetFormat: 'JPG', quality: 0.8, maxWidth: 0 }
  );
  assert.equal(jpgResults[0].mime, 'image/jpeg');
  assert.ok(lastCanvasSize.w <= 16384 && lastCanvasSize.w * lastCanvasSize.h <= 67108864);
  assert.equal(jpgFilledWhite, true);
  assert.equal(canvasCleaned, true);

  // 11C. init-state applies prefs & selectionchange clears editableDesignSystem
  sandbox.window.onmessage({
    data: { pluginMessage: { type: 'init-state', sites: [], prefs: { autoUnwrap: false, linearBorder: true, devModeCss: false } } },
  });
  assert.equal(elements.get('chk-auto-unwrap').checked, false);
  assert.equal(elements.get('chk-dev-mode-css').checked, false);

  sandbox.window.onmessage({
    data: { pluginMessage: { type: 'design-system-preview', tokens: { colors: [{ name: 'A', value: '#111111', role: 'primary' }], typography: [] } } },
  });
  assert.ok(sandbox.getEditableDesignSystemPayload() !== null);

  sandbox.window.onmessage({
    data: {
      pluginMessage: {
        type: 'outline',
        selectionIds: ['frame:B'],
        selectionNames: ['Frame B'],
        selectionCount: 1,
        items: [{ nodeId: 'frame:B', name: 'Frame B', type: 'FRAME', depth: 0, widget: 'container', source: 'heuristic' }],
      },
    },
  });
  assert.equal(sandbox.getEditableDesignSystemPayload(), null, 'Selection change must clear stale editableDesignSystem');
});
