import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  importPluginApi,
  createMockFrameNode,
  createMockTextNode,
  createMockImageNode,
  createMockVectorNode,
  createMockFigmaApi,
  hexToFigmaRgb,
  solidFill,
} from '../lib/figma-mocks.mjs';
import {
  makePng,
  makeJpeg,
  makeWebpVP8L,
  makeValidSvg,
  svgToBase64Uri,
  svgToUtf8Uri,
  bufferToDataUri,
  sha256Hex,
} from '../lib/media-generators.mjs';
import { createEditorBridgeHarness } from '../lib/editor-bridge-harness.mjs';
import {
  resolveLocalWpEnv,
  redactToken,
  phpEvalStdin,
  phpLintFile,
  phpRunFile,
} from '../lib/localwp.mjs';
import {
  HARD_PROTECTED_IDS,
  safeForceDeletePost,
  recordCreatedAttachment,
  createRunLedger,
} from '../lib/cleanup.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');

function makeLocalAssetsMockFetch() {
  let nextId = 9001;
  const seen = new Map();
  return async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : {};
    const key = body.sha256 || `${body.mime}:${String(body.base64 || '').slice(0, 64)}:${String(body.base64 || '').length}`;
    if (seen.has(key)) {
      const prev = seen.get(key);
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { ...prev, reused: true } }),
        text: async () => JSON.stringify({ success: true, data: { ...prev, reused: true } }),
      };
    }
    const id = nextId++;
    const ext = body.mime === 'image/svg+xml' ? 'svg' : (body.mime === 'image/jpeg' ? 'jpg' : (body.mime === 'image/webp' ? 'webp' : 'png'));
    const entry = { id, url: `https://thecanopyresident.local/wp-content/uploads/2026/11/e2e-${id}.${ext}`, reused: false };
    seen.set(key, entry);
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: entry }),
      text: async () => JSON.stringify({ success: true, data: entry }),
    };
  };
}

export function getTier1Tests() {
  return [
    // ── F1: Figma Extraction & Selection Pipeline (6 tests) ──
    {
      id: 'F1-T1-01',
      tier: 1,
      feature: 'F1',
      name: 'Multi-section page extraction (f2e.document contract)',
      async run() {
        const api = await importPluginApi();
        const root = createMockFrameNode({
          id: 'p1',
          name: 'Landing Page',
          width: 1440,
          height: 2000,
          layoutMode: 'VERTICAL',
          children: [
            createMockFrameNode({
              id: 'hdr',
              name: 'Header',
              width: 1440,
              height: 80,
              layoutMode: 'HORIZONTAL',
              children: [createMockTextNode({ id: 'logo-t', name: 'Brand', characters: 'Canopy', fontSize: 22 })],
            }),
            createMockFrameNode({
              id: 'hero',
              name: 'Hero',
              width: 1440,
              height: 500,
              layoutMode: 'NONE',
              children: [
                createMockTextNode({ id: 'h-title', name: 'Title', x: 80, y: 120, characters: 'Welcome Home', fontSize: 48 }),
                createMockTextNode({ id: 'badge', name: 'New Badge', x: 80, y: 60, layoutPositioning: 'ABSOLUTE', characters: '2026', fontSize: 12 }),
              ],
            }),
            createMockFrameNode({
              id: 'grid',
              name: 'Cards Row',
              width: 1200,
              height: 300,
              layoutMode: 'HORIZONTAL',
              children: [
                createMockFrameNode({ id: 'c1', name: 'Card 1', width: 380, height: 220, children: [createMockTextNode({ id: 'c1t', characters: 'Fast' }), createMockTextNode({ id: 'c1d', characters: 'Subtext one' })] }),
                createMockFrameNode({ id: 'c2', name: 'Card 2', width: 380, height: 220, children: [createMockTextNode({ id: 'c2t', characters: 'Safe' }), createMockTextNode({ id: 'c2d', characters: 'Subtext two' })] }),
              ],
            }),
            createMockFrameNode({
              id: 'ftr',
              name: 'Footer',
              width: 1440,
              height: 120,
              children: [createMockTextNode({ id: 'copy', characters: 'Copyright 2026', fontSize: 14 })],
            }),
          ],
        });

        const { document } = await api.extractDesignSelection([root], { fileKey: 't1-01' });
        assert.equal(document.kind, 'f2e.document');
        assert.equal(document.roots.length, 1);
        const serialized = JSON.stringify(document);
        assert.ok(!serialized.includes('undefined'), 'Document contains serialized undefined');
        for (const nid of ['p1', 'hdr', 'hero', 'h-title', 'badge', 'grid', 'c1', 'c2', 'ftr']) {
          assert.ok(document.nodes[`f2e:t1-01:${nid}`], `Missing node ${nid} in extracted document.nodes`);
        }
      },
    },

    {
      id: 'F1-T1-02',
      tier: 1,
      feature: 'F1',
      name: '3-Layer resolveWidget precedence',
      async run() {
        const api = await importPluginApi();
        const overrideWins = createMockFrameNode({
          id: 'rw-1',
          name: 'Random Frame [button]',
          pluginData: { 'f2e-widget': 'heading' },
          children: [createMockTextNode({ id: 'rw-1t', characters: 'Overridden' })],
        });
        const bracketTag = createMockFrameNode({
          id: 'rw-2',
          name: 'Contact [form]',
          children: [createMockTextNode({ id: 'rw-2t', characters: 'Email' })],
        });
        const bigHeading = createMockTextNode({ id: 'rw-3', name: 'Hero Copy', characters: 'Headline', fontSize: 48 });
        const bodyText = createMockTextNode({ id: 'rw-4', name: 'Copy', characters: 'This is a regular body paragraph with multiple words.', fontSize: 16 });
        const smallVec = createMockVectorNode({ id: 'rw-5', name: 'Checkmark', width: 24, height: 24 });

        assert.deepEqual(api.resolveWidget(overrideWins), { widget: 'heading', source: 'override' });
        assert.equal(api.resolveWidget(bracketTag).widget, 'form');
        assert.equal(api.resolveWidget(bigHeading).widget, 'heading');
        assert.equal(api.resolveWidget(bodyText).widget, 'text-editor');
        assert.equal(api.resolveWidget(smallVec).widget, 'icon');
      },
    },

    {
      id: 'F1-T1-03',
      tier: 1,
      feature: 'F1',
      name: 'Atomic composite widgets extract descendant images',
      async run() {
        const api = await importPluginApi();
        const mkImg = (id, tag) => {
          const bytes = makePng(64, 64, { nonce: `f1t103-${tag}` });
          return createMockImageNode({ id, name: tag, width: 300, height: 200, imageBytes: bytes, imageHash: sha256Hex(bytes) });
        };

        const gallery = createMockFrameNode({
          id: 'gal',
          name: 'Gallery',
          pluginData: { 'f2e-widget': 'image-gallery' },
          children: [mkImg('g1', 'g1'), mkImg('g2', 'g2'), mkImg('g3', 'g3')],
        });
        const carousel = createMockFrameNode({
          id: 'car',
          name: 'Carousel',
          pluginData: { 'f2e-widget': 'image-carousel' },
          children: [mkImg('c1', 'c1'), mkImg('c2', 'c2'), mkImg('c3', 'c3')],
        });
        const slides = createMockFrameNode({
          id: 'sld',
          name: 'Hero Slider',
          pluginData: { 'f2e-widget': 'slides' },
          children: [
            createMockFrameNode({ id: 's1', name: 'Slide 1', children: [mkImg('s1i', 's1'), createMockTextNode({ id: 's1t', characters: 'Slide 1' })] }),
            createMockFrameNode({ id: 's2', name: 'Slide 2', children: [mkImg('s2i', 's2'), createMockTextNode({ id: 's2t', characters: 'Slide 2' })] }),
          ],
        });
        const testimonial = createMockFrameNode({
          id: 'tst',
          name: 'Testimonial',
          pluginData: { 'f2e-widget': 'testimonial' },
          children: [mkImg('tav', 'tav'), createMockTextNode({ id: 'tq', characters: 'Loved our stay here.' }), createMockTextNode({ id: 'tn', characters: 'Alex' })],
        });
        const cta = createMockFrameNode({
          id: 'cta',
          name: 'CTA',
          pluginData: { 'f2e-widget': 'call-to-action' },
          children: [mkImg('ctai', 'cta'), createMockTextNode({ id: 'ctat', characters: 'Book Now' })],
        });
        const imgBox = createMockFrameNode({
          id: 'ib',
          name: 'Image Box',
          pluginData: { 'f2e-widget': 'image-box' },
          children: [mkImg('ibi', 'ib'), createMockTextNode({ id: 'ibt', characters: 'Card Title' }), createMockTextNode({ id: 'ibd', characters: 'Card Description' })],
        });

        const root = createMockFrameNode({
          id: 'root',
          name: 'Composite Page',
          children: [gallery, carousel, slides, testimonial, cta, imgBox],
        });

        const { assetPayloads } = await api.extractDesignSelection([root], { fileKey: 't1-03' });
        // 3 gallery + 3 carousel + 2 slides + 1 testimonial + 1 cta + 1 image-box = 11 unique images
        assert.ok(
          assetPayloads.length >= 11,
          `Expected >= 11 extracted descendant assets across composite widgets, got ${assetPayloads.length}`
        );
        for (const a of assetPayloads) {
          assert.match(a.sha256, /^[a-f0-9]{64}$/);
        }
      },
    },

    {
      id: 'F1-T1-04',
      tier: 1,
      feature: 'F1',
      name: 'Composite background isolation (freeform hero)',
      async run() {
        const api = await importPluginApi();
        const bgBytes = makePng(120, 80, { nonce: 'f1t104-bg' });
        const fgTitle = createMockTextNode({ id: 'fg-t', name: 'Hero Heading', x: 80, y: 100, characters: 'Composite Hero', fontSize: 44 });
        const fgBtn = createMockFrameNode({
          id: 'fg-b',
          name: 'CTA [btn]',
          x: 80,
          y: 200,
          width: 160,
          height: 44,
          children: [createMockTextNode({ id: 'fg-bt', characters: 'Start' })],
        });
        let fgHiddenDuringExport = false;
        const hero = createMockFrameNode({
          id: 'comp-hero',
          name: 'Hero',
          width: 1440,
          height: 600,
          layoutMode: 'NONE',
          children: [
            createMockImageNode({ id: 'bg-img', name: 'bg', width: 1440, height: 600, imageBytes: bgBytes, imageHash: sha256Hex(bgBytes) }),
            createMockFrameNode({ id: 'bg-ov', name: 'Overlay', width: 1440, height: 600, fills: [solidFill('#000000', 0.4)] }),
            fgTitle,
            fgBtn,
          ],
          exportAsync: async () => {
            fgHiddenDuringExport = fgTitle.visible === false && fgBtn.visible === false;
            return new Uint8Array(bgBytes);
          },
        });

        const { document, assetPayloads } = await api.extractDesignSelection([hero], { fileKey: 't1-04' });
        assert.equal(fgHiddenDuringExport, true, 'Foreground nodes must be hidden during composite-bg exportAsync');
        assert.equal(fgTitle.visible, true, 'Foreground text visibility must be restored after export');
        assert.equal(fgBtn.visible, true, 'Foreground button visibility must be restored after export');
        assert.equal(assetPayloads.length, 1);
        assert.ok(document.nodes['f2e:t1-04:fg-t'], 'Foreground heading must remain in document.nodes');
        assert.ok(document.nodes['f2e:t1-04:fg-b'], 'Foreground button must remain in document.nodes');
      },
    },

    {
      id: 'F1-T1-05',
      tier: 1,
      feature: 'F1',
      name: 'Dev Mode CSS + CSS variable resolution (applyDevModeCSSToNode)',
      async run() {
        const api = await importPluginApi();
        const entry = {
          type: 'frame',
          layout: {},
          style: {},
        };
        api.applyDevModeCSSToNode(entry, {
          background: 'linear-gradient(135deg, var(--brand, #16A34A) 0%, #0F172A 100%)',
          'box-shadow': '0 10px 30px var(--shadow, rgba(0, 0, 0, 0.25))',
          border: '2px dashed var(--border, #CBD5E1)',
          'backdrop-filter': 'blur(12px)',
        });
        assert.ok(entry.style.gradient, 'Gradient should be parsed from Dev Mode CSS');
        assert.equal(entry.style.gradient.color1, '#16A34A');
        assert.ok(entry.style.boxShadow, 'Box shadow with nested rgba() fallback should resolve');
        assert.equal(entry.style.borderColor, '#CBD5E1', 'Border color var(--border, #CBD5E1) must resolve');
        assert.ok(!JSON.stringify(entry.style).includes('var(--'), 'Raw var(--...) must not leak into resolved entry.style');
        assert.ok(entry.style.devModeExtraCss?.['backdrop-filter'] === 'blur(12px)', 'Residual CSS should preserve backdrop-filter');
      },
    },

    {
      id: 'F1-T1-06',
      tier: 1,
      feature: 'F1',
      name: 'Design System extraction & Dev Mode fallback (extractLocalDesignSystem)',
      async run() {
        const api = await importPluginApi();
        const popApi = createMockFigmaApi({
          colorVariables: [
            { id: 'v1', name: 'Primary / Emerald', variableCollectionId: 'col-1', valuesByMode: { 'mode-1': hexToFigmaRgb('#16A34A') } },
            { id: 'v2', name: 'Text / Slate', variableCollectionId: 'col-1', valuesByMode: { 'mode-1': hexToFigmaRgb('#0F172A') } },
          ],
          textStyles: [
            { id: 't1', name: 'H1 Display', fontSize: 48, fontName: { family: 'Inter', style: 'Bold' }, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0 } },
            { id: 't2', name: 'Body Base', fontSize: 16, fontName: { family: 'Inter', style: 'Regular' }, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0 } },
          ],
        });
        const ds1 = await api.extractLocalDesignSystem(popApi);
        assert.ok(ds1.colors.some((c) => c.role === 'primary' && c.value === '#16A34A'));
        assert.ok(ds1.typography.some((t) => t.role === 'h1' && t.fontSize === 48));
        assert.ok(ds1.typography.some((t) => t.role === 'body' && t.fontSize === 16));

        const fallbackSelection = [
          createMockFrameNode({
            id: 'ds-fb',
            name: 'Page',
            children: [
              createMockTextNode({ id: 'fb-h1', characters: 'Hero Title', fontSize: 44, fontStyle: 'Bold', color: '#111827' }),
              createMockTextNode({ id: 'fb-body', characters: 'Long descriptive body copy for synthesis.', fontSize: 16, color: '#334155' }),
              createMockFrameNode({ id: 'fb-btn', name: 'CTA [btn]', fills: [solidFill('#16A34A')], children: [createMockTextNode({ id: 'fb-bt', characters: 'Go', color: '#FFFFFF' })] }),
            ],
          }),
        ];
        const emptyApi = createMockFigmaApi({ selection: fallbackSelection });
        const ds2 = await api.extractLocalDesignSystem(emptyApi, fallbackSelection);
        assert.ok(ds2.colors.length > 0, 'Dev Mode fallback must synthesize color tokens');
        assert.ok(ds2.typography.length > 0, 'Dev Mode fallback must synthesize typography tokens');
      },
    },

    // ── F2: Image Format Processing & Encoding (5 tests) ──
    {
      id: 'F2-T1-01',
      tier: 1,
      feature: 'F2',
      name: 'Valid PNG export & SHA-256 deduplication',
      async run() {
        const api = await importPluginApi();
        const bytes = makePng(200, 160, { nonce: 'f2t101' });
        const expectedSha = sha256Hex(bytes);
        const root = createMockFrameNode({
          id: 'p-png',
          children: [
            createMockImageNode({ id: 'i1', name: 'Photo 1', imageBytes: bytes, imageHash: 'h1' }),
            createMockImageNode({ id: 'i2', name: 'Photo 2', imageBytes: bytes, imageHash: 'h2' }),
          ],
        });

        const { assetPayloads } = await api.extractDesignSelection([root], { imageFormat: 'PNG', imageScale: 2 });
        assert.equal(assetPayloads.length, 1, 'Identical PNG bytes must deduplicate to 1 payload');
        assert.equal(assetPayloads[0].mime, 'image/png');
        assert.equal(assetPayloads[0].sha256, expectedSha);
        const decoded = Buffer.from(assetPayloads[0].base64, 'base64');
        assert.deepEqual([...decoded.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      },
    },

    {
      id: 'F2-T1-02',
      tier: 1,
      feature: 'F2',
      name: 'Valid JPEG export (imageFormat: JPG)',
      async run() {
        const api = await importPluginApi();
        const bytes = makeJpeg(240, 180, { nonce: 'f2t102' });
        const root = createMockFrameNode({
          id: 'p-jpg',
          children: [
            createMockTextNode({ id: 'jt', name: 'Caption', characters: 'Gallery Shot', fontSize: 16 }),
            createMockImageNode({ id: 'j1', name: 'Jpg Photo', imageBytes: bytes, imageHash: 'jh1' }),
          ],
        });
        const { document, assetPayloads } = await api.extractDesignSelection([root], { fileKey: 'f2j', imageFormat: 'JPG' });
        assert.equal(assetPayloads.length, 1);
        assert.equal(assetPayloads[0].mime, 'image/jpeg');
        const irImg = document.nodes['f2e:f2j:j1'].image;
        assert.ok(irImg.dataUri.startsWith('data:image/jpeg;base64,'));
        const decoded = Buffer.from(assetPayloads[0].base64, 'base64');
        assert.deepEqual([...decoded.subarray(0, 3)], [0xff, 0xd8, 0xff]);
      },
    },

    {
      id: 'F2-T1-03',
      tier: 1,
      feature: 'F2',
      name: 'Valid WebP (VP8L) payload & PHP GD acceptance + WEBP extraction',
      async run() {
        const api = await importPluginApi();
        const webpBytes = makeWebpVP8L(200, 160, { nonce: 'f2t103' });
        assert.equal(webpBytes.subarray(0, 4).toString('ascii'), 'RIFF');
        assert.equal(webpBytes.subarray(8, 12).toString('ascii'), 'WEBP');

        // Verify PHP 8.2.29 GD accepts our VP8L WebP payload
        const env = resolveLocalWpEnv();
        if (fs.existsSync(env.phpBin)) {
          const b64 = webpBytes.toString('base64');
          const out = phpEvalStdin(
            env,
            `$r=base64_decode("${b64}"); $i=getimagesizefromstring($r); $g=imagecreatefromstring($r); echo $i[0]."x".$i[1]." ".$i["mime"]." ".imagesx($g)."x".imagesy($g);`
          );
          assert.equal(out, '200x160 image/webp 200x160');
        }

        // Verify extractDesignSelection supports imageFormat: 'WEBP'
        const root = createMockFrameNode({
          id: 'p-webp',
          children: [
            createMockTextNode({ id: 'wt', name: 'Caption', characters: 'WebP Shot', fontSize: 16 }),
            createMockImageNode({ id: 'w1', name: 'WebP Photo', imageBytes: webpBytes }),
          ],
        });
        const { assetPayloads } = await api.extractDesignSelection([root], { imageFormat: 'WEBP' });
        assert.equal(assetPayloads.length, 1);
        assert.equal(assetPayloads[0].mime, 'image/webp');
      },
    },

    {
      id: 'F2-T1-04',
      tier: 1,
      feature: 'F2',
      name: 'Clean multi-color vector SVG export',
      async run() {
        const api = await importPluginApi();
        const svg = makeValidSvg({ width: 48, height: 48, nonce: 'f2t104' });
        const root = createMockFrameNode({
          id: 'p-svg',
          children: [
            createMockTextNode({ id: 'st', name: 'Brand Heading', characters: 'Brand Assets', fontSize: 28 }),
            createMockVectorNode({ id: 'lg', name: 'Brand Logo', width: 96, height: 48, svgMarkup: svg, pluginData: { 'f2e-widget': 'theme-site-logo' } }),
            createMockVectorNode({ id: 'ic', name: 'Arrow Icon', width: 24, height: 24, svgMarkup: svg }),
          ],
        });
        const { document, assetPayloads } = await api.extractDesignSelection([root], { fileKey: 'f2s' });
        assert.equal(assetPayloads.length, 1);
        assert.equal(assetPayloads[0].kind, 'svg');
        assert.equal(assetPayloads[0].mime, 'image/svg+xml');
        assert.equal(assetPayloads[0].sha256, sha256Hex(Buffer.from(svg, 'utf8')));
        assert.ok(document.nodes['f2e:f2s:lg'].svg.markup.includes('<linearGradient'));
      },
    },

    {
      id: 'F2-T1-05',
      tier: 1,
      feature: 'F2',
      name: 'Multi-layer composite background baking (PNG & JPG)',
      async run() {
        const api = await importPluginApi();
        const pngBytes = makePng(160, 120, { nonce: 'f2t105-png' });
        const jpgBytes = makeJpeg(160, 120, { nonce: 'f2t105-jpg' });
        const buildHero = (bytes) => createMockFrameNode({
          id: 'ch',
          name: 'Hero',
          layoutMode: 'NONE',
          exportAsync: async () => new Uint8Array(bytes),
          children: [
            createMockFrameNode({ id: 'l1', name: 'bg', fills: [solidFill('#0F172A')] }),
            createMockFrameNode({ id: 'l2', name: 'Mask', fills: [solidFill('#16A34A', 0.2)] }),
            createMockFrameNode({ id: 'l3', name: 'Line', fills: [solidFill('#FFFFFF', 0.1)] }),
            createMockFrameNode({ id: 'l4', name: 'Overlay', fills: [solidFill('#000000', 0.3)] }),
            createMockTextNode({ id: 'fg1', name: 'Headline', characters: 'Welcome', fontSize: 42 }),
            createMockTextNode({ id: 'fg2', name: 'Subcopy', characters: 'Subtitle', fontSize: 18 }),
          ],
        });

        const resPng = await api.extractDesignSelection([buildHero(pngBytes)], { fileKey: 'cpng', imageFormat: 'PNG' });
        assert.equal(resPng.assetPayloads.length, 1);
        assert.equal(resPng.assetPayloads[0].mime, 'image/png');
        assert.equal(resPng.document.nodes['f2e:cpng:ch'].style.backgroundImage, resPng.assetPayloads[0].sha256);

        const resJpg = await api.extractDesignSelection([buildHero(jpgBytes)], { fileKey: 'cjpg', imageFormat: 'JPG' });
        assert.equal(resJpg.assetPayloads.length, 1);
        assert.equal(resJpg.assetPayloads[0].mime, 'image/jpeg');
        assert.equal(resJpg.document.nodes['f2e:cjpg:ch'].style.backgroundImage, resJpg.assetPayloads[0].sha256);
      },
    },

    // ── F3: Elementor v3 & v4 Compilation (6 tests) ──
    {
      id: 'F3-T1-01',
      tier: 1,
      feature: 'F3',
      name: 'Full v3 Container + Basic/General widgets compilation & schema validation',
      async run() {
        const api = await importPluginApi();
        const png = makePng(64, 64, { nonce: 'f3t101' });
        const svg = makeValidSvg({ width: 24, height: 24, nonce: 'f3t101' });
        const page = createMockFrameNode({
          id: 'v3-p',
          name: 'Widgets Page',
          children: [
            createMockTextNode({ id: 'w-h', characters: 'Main Heading', fontSize: 40 }),
            createMockTextNode({ id: 'w-t', characters: 'Body copy paragraph with enough words.', fontSize: 16 }),
            createMockFrameNode({ id: 'w-b', name: 'CTA [btn]', children: [createMockTextNode({ id: 'w-bt', characters: 'Click Me' })] }),
            createMockImageNode({ id: 'w-i', name: 'Photo', imageBytes: png }),
            createMockVectorNode({ id: 'w-ic', name: 'Star Icon', width: 24, height: 24, svgMarkup: svg }),
            createMockFrameNode({ id: 'w-div', name: 'Divider [divider]', height: 2, width: 300, fills: [solidFill('#CBD5E1')] }),
            createMockFrameNode({ id: 'w-spc', name: 'Spacer [spacer]', height: 32, width: 100 }),
            createMockFrameNode({ id: 'w-il', name: 'List [icon-list]', children: [createMockTextNode({ id: 'il1', characters: 'Item One' }), createMockTextNode({ id: 'il2', characters: 'Item Two' })] }),
            createMockFrameNode({ id: 'w-cnt', name: 'Stat [counter]', children: [createMockTextNode({ id: 'cnt-n', characters: '99+' }), createMockTextNode({ id: 'cnt-l', characters: 'Clients' })] }),
          ],
        });
        const { document } = await api.extractDesignSelection([page], { fileKey: 'f31' });
        const v3 = api.compileElementorV3(document);
        const check = api.validateElementorV3Tree(v3.content);
        assert.equal(check.valid, true, `Schema errors: ${JSON.stringify(check.errors)}`);
        assert.ok(check.checkedCount >= 9);
        const checkNodeIds = (els) => {
          for (const el of els) {
            assert.ok(el.settings._f2e_node_id, `Missing _f2e_node_id on ${el.id}`);
            if (Array.isArray(el.elements)) checkNodeIds(el.elements);
          }
        };
        checkNodeIds(v3.content);
      },
    },

    {
      id: 'F3-T1-02',
      tier: 1,
      feature: 'F3',
      name: 'Nested & Pro widgets compilation (nested-accordion, form, nav-menu, slides, price-table, call-to-action)',
      async run() {
        const api = await importPluginApi();
        const png = makePng(64, 64, { nonce: 'f3t102' });
        const page = createMockFrameNode({
          id: 'pro-p',
          name: 'Pro Page',
          children: [
            createMockFrameNode({
              id: 'p-acc',
              name: 'FAQ',
              pluginData: { 'f2e-widget': 'nested-accordion' },
              children: [
                createMockFrameNode({ id: 'acc1', children: [createMockTextNode({ id: 'aq1', characters: 'Q1?' }), createMockTextNode({ id: 'aa1', characters: 'A1.' })] }),
                createMockFrameNode({ id: 'acc2', children: [createMockTextNode({ id: 'aq2', characters: 'Q2?' }), createMockTextNode({ id: 'aa2', characters: 'A2.' })] }),
              ],
            }),
            createMockFrameNode({
              id: 'p-frm',
              name: 'Contact',
              pluginData: { 'f2e-widget': 'form' },
              children: [
                createMockFrameNode({ id: 'f1', name: 'Name Field', children: [createMockTextNode({ id: 'f1l', characters: 'Name' })] }),
                createMockFrameNode({ id: 'f2', name: 'Email Field', children: [createMockTextNode({ id: 'f2l', characters: 'Email' })] }),
              ],
            }),
            createMockFrameNode({
              id: 'p-nav',
              name: 'Nav',
              pluginData: { 'f2e-widget': 'nav-menu' },
              children: [createMockTextNode({ id: 'nv1', characters: 'Home' }), createMockTextNode({ id: 'nv2', characters: 'About' })],
            }),
            createMockFrameNode({
              id: 'p-sld',
              name: 'Slides',
              pluginData: { 'f2e-widget': 'slides' },
              children: [createMockFrameNode({ id: 'sl1', children: [createMockImageNode({ id: 'sl1i', imageBytes: png }), createMockTextNode({ id: 'sl1t', characters: 'Hero' })] })],
            }),
            createMockFrameNode({
              id: 'p-prc',
              name: 'Price',
              pluginData: { 'f2e-widget': 'price-table' },
              children: [createMockTextNode({ id: 'pr1', characters: 'Pro' }), createMockTextNode({ id: 'pr2', characters: '$49/mo' }), createMockTextNode({ id: 'pr3', characters: 'Unlimited' })],
            }),
            createMockFrameNode({
              id: 'p-cta',
              name: 'CTA',
              pluginData: { 'f2e-widget': 'call-to-action' },
              children: [createMockImageNode({ id: 'ctai', imageBytes: png }), createMockTextNode({ id: 'ct1', characters: 'Join' }), createMockTextNode({ id: 'ct2', characters: 'Now' })],
            }),
          ],
        });

        const { document } = await api.extractDesignSelection([page], { fileKey: 'f32' });
        const v3 = api.compileElementorV3(document);
        const check = api.validateElementorV3Tree(v3.content);
        assert.equal(check.valid, true, `Pro schema errors: ${JSON.stringify(check.errors)}`);
        const accEl = v3.content[0].elements.find((e) => e.widgetType === 'nested-accordion');
        assert.ok(accEl && accEl.settings.items.length === 2 && accEl.elements.length === 2);
      },
    },

    {
      id: 'F3-T1-03',
      tier: 1,
      feature: 'F3',
      name: 'Container unwrapping rules (single-child vs multi-child vs [unwrap])',
      async run() {
        const api = await importPluginApi();
        const hdr = createMockFrameNode({
          id: 'u-hdr',
          name: 'Header',
          width: 1440,
          children: [
            createMockFrameNode({
              id: 'u-box',
              name: 'Box',
              width: 1200,
              layoutMode: 'HORIZONTAL',
              children: [
                createMockTextNode({ id: 'uh1', characters: 'Logo' }),
                createMockTextNode({ id: 'uh2', characters: 'Menu' }),
                createMockTextNode({ id: 'uh3', characters: 'CTA' }),
              ],
            }),
          ],
        });
        const multi = createMockFrameNode({
          id: 'u-sec',
          name: 'Section',
          width: 1440,
          layoutMode: 'HORIZONTAL',
          children: [
            createMockFrameNode({ id: 'col1', name: 'Col 1', width: 600, children: [createMockTextNode({ id: 'c1t', characters: 'Col 1' })] }),
            createMockFrameNode({ id: 'col2', name: 'Col 2', width: 600, children: [createMockTextNode({ id: 'c2t', characters: 'Col 2' })] }),
          ],
        });
        const explicitUnwrap = createMockFrameNode({
          id: 'u-exp',
          name: 'Outer',
          children: [
            createMockFrameNode({
              id: 'u-wrap',
              name: 'Wrapper [unwrap]',
              children: [createMockTextNode({ id: 'uw1', characters: 'Promoted 1' }), createMockTextNode({ id: 'uw2', characters: 'Promoted 2' })],
            }),
          ],
        });

        const dHdr = (await api.extractDesignSelection([hdr])).document;
        const cHdr = api.compileElementorV3(dHdr);
        assert.equal(cHdr.content[0].settings.content_width, 'boxed');
        assert.equal(cHdr.content[0].elements.length, 3, 'Single inner wrapper should unwrap into Header container');

        const dMulti = (await api.extractDesignSelection([multi])).document;
        const cMulti = api.compileElementorV3(dMulti);
        assert.equal(cMulti.content[0].elements.length, 2, 'Two sibling columns must not unwrap');

        const dExp = (await api.extractDesignSelection([explicitUnwrap])).document;
        const cExp = api.compileElementorV3(dExp);
        assert.equal(cExp.content[0].elements.length, 2, '[unwrap] children must be promoted');
      },
    },

    {
      id: 'F3-T1-04',
      tier: 1,
      feature: 'F3',
      name: 'Fidelity Verifier auto-healing (verifyAndHealElementorJson)',
      async run() {
        const api = await importPluginApi();
        const svg = makeValidSvg({ width: 32, height: 32, nonce: 'f3t104' });
        const elements = [
          {
            id: 'box1',
            elType: 'widget',
            widgetType: 'icon-box',
            isInner: false,
            settings: {
              title_text: 'Fast Support',
              description_text: '',
              selected_icon: { library: 'svg', value: svg },
              __globals__: { title_color: 'globals/colors?id=primary' },
              _f2e_node_id: 'n-ic',
            },
            elements: [],
          },
          {
            id: 'wrap1',
            elType: 'container',
            isInner: true,
            settings: {
              width: { unit: 'px', size: 157, sizes: [] },
              _f2e_node_id: 'n-wrap',
            },
            elements: [
              { id: 't1', elType: 'widget', widgetType: 'heading', settings: { title: 'Eyebrow' }, elements: [] },
            ],
          },
        ];

        const { elements: healed, report } = api.verifyAndHealElementorJson(elements, null);
        assert.ok(report.healedCount >= 2, `Expected >= 2 healed fixes, got ${report.healedCount}`);
        assert.equal(healed[0].elType, 'container', 'icon-box with raw SVG must heal to container');
        assert.equal(healed[0].elements[0].widgetType, 'html');
        assert.equal(healed[0].settings.__globals__, undefined, 'Unverified __globals__ must be stripped');
        assert.equal(healed[1].settings.width, undefined, 'Tight HUG text wrapper width must be removed');
      },
    },

    {
      id: 'F3-T1-05',
      tier: 1,
      feature: 'F3',
      name: 'Elementor v4 Atomic compilation (e-flexbox, e-heading, e-paragraph, e-button, e-image, e-svg)',
      async run() {
        const api = await importPluginApi();
        const png = makePng(64, 64, { nonce: 'f3t105' });
        const svg = makeValidSvg({ width: 32, height: 32, nonce: 'f3t105' });
        const shaPng = sha256Hex(png);
        const shaSvg = sha256Hex(Buffer.from(svg, 'utf8'));

        const desktop = createMockFrameNode({
          id: 'v4-root',
          name: 'Atomic Hero',
          layoutMode: 'VERTICAL',
          children: [
            createMockTextNode({ id: 'v4-h', name: 'Hero Heading', characters: 'Atomic Heading', fontSize: 40 }),
            createMockTextNode({ id: 'v4-p', name: 'Body', characters: 'Atomic paragraph description text.', fontSize: 16 }),
            createMockFrameNode({ id: 'v4-b', name: 'Button [btn]', children: [createMockTextNode({ id: 'v4-bt', characters: 'Go' })] }),
            createMockImageNode({ id: 'v4-i', name: 'Photo', imageBytes: png }),
            createMockVectorNode({ id: 'v4-s', name: 'Vector', width: 32, height: 32, svgMarkup: svg }),
          ],
        });
        const tablet = createMockFrameNode({
          id: 'v4-tab',
          name: 'Atomic Hero',
          layoutMode: 'VERTICAL',
          paddingTop: 24,
          children: [createMockTextNode({ id: 'v4-ht', characters: 'Atomic Heading', fontSize: 32 })],
        });

        const { document } = await api.extractDesignSelection([desktop], {
          fileKey: 'f35',
          responsiveFrames: { tablet, mobile: null },
        });
        const attachmentMap = {
          [shaPng]: { id: 501, url: 'https://thecanopyresident.local/wp-content/uploads/v4.png' },
          [shaSvg]: { id: 502, url: 'https://thecanopyresident.local/wp-content/uploads/v4.svg' },
        };
        const v4 = api.compileElementorV4(document, { attachmentMap });
        const check = api.validateElementorV4Tree(v4.content);
        assert.equal(check.valid, true, `v4 schema errors: ${JSON.stringify(check.errors)}`);

        const children = v4.content[0].elements;
        assert.deepEqual(
          children.map((c) => c.widgetType),
          ['e-heading', 'e-paragraph', 'e-button', 'e-image', 'e-svg']
        );
        const imgEl = children.find((c) => c.widgetType === 'e-image');
        assert.equal(imgEl.settings.image.value.id, 501, 'compileElementorV4 must resolve attachmentMap id on e-image');
        assert.equal(imgEl.settings.image.value.url, attachmentMap[shaPng].url);
      },
    },

    {
      id: 'F3-T1-06',
      tier: 1,
      feature: 'F3',
      name: 'theme-post-featured-image & image-gallery / image-carousel v3 compilation',
      async run() {
        const api = await importPluginApi();
        const png1 = makePng(64, 64, { nonce: 'f3t106-1' });
        const png2 = makePng(64, 64, { nonce: 'f3t106-2' });
        const sha1 = sha256Hex(png1);
        const sha2 = sha256Hex(png2);

        const root = createMockFrameNode({
          id: 'f36-root',
          name: 'Media Page',
          children: [
            createMockImageNode({
              id: 'feat',
              name: 'Featured Image',
              imageBytes: png1,
              pluginData: { 'f2e-widget': 'theme-post-featured-image' },
            }),
            createMockFrameNode({
              id: 'gal',
              name: 'Gallery',
              pluginData: { 'f2e-widget': 'image-gallery' },
              children: [
                createMockImageNode({ id: 'g1', imageBytes: png1 }),
                createMockImageNode({ id: 'g2', imageBytes: png2 }),
              ],
            }),
            createMockFrameNode({
              id: 'car',
              name: 'Carousel',
              pluginData: { 'f2e-widget': 'image-carousel' },
              children: [
                createMockImageNode({ id: 'c1', imageBytes: png1 }),
                createMockImageNode({ id: 'c2', imageBytes: png2 }),
              ],
            }),
          ],
        });

        const { document } = await api.extractDesignSelection([root], { fileKey: 'f36' });
        const attachmentMap = {
          [sha1]: { id: 601, url: 'https://thecanopyresident.local/wp-content/uploads/1.png' },
          [sha2]: { id: 602, url: 'https://thecanopyresident.local/wp-content/uploads/2.png' },
        };
        const v3 = api.compileElementorV3(document, { attachmentMap });
        const widgets = v3.content[0].elements;
        const galEl = widgets.find((w) => w.widgetType === 'image-gallery');
        const carEl = widgets.find((w) => w.widgetType === 'image-carousel');
        assert.ok(galEl && galEl.settings.wp_gallery.length === 2, 'image-gallery must populate wp_gallery with 2 items');
        assert.equal(galEl.settings.wp_gallery[0].id, 601);
        assert.ok(carEl && carEl.settings.carousel.length === 2, 'image-carousel must populate carousel with 2 items');
        assert.equal(carEl.settings.carousel[1].id, 602);
      },
    },

    // ── F4: Clipboard & .f2e.json Bundle Hydration (6 tests, local sandbox zero WP mutation) ──
    {
      id: 'F4-T1-01',
      tier: 1,
      feature: 'F4',
      name: 'compileElementorClipboard envelope & editor-bridge.js paste intercept',
      async run() {
        const api = await importPluginApi();
        const pngUri = bufferToDataUri(makePng(64, 64, { nonce: 'f4t101-png' }), 'image/png');
        const jpgUri = bufferToDataUri(makeJpeg(64, 64, { nonce: 'f4t101-jpg' }), 'image/jpeg');
        const bgUri = bufferToDataUri(makePng(64, 64, { nonce: 'f4t101-bg' }), 'image/png');

        const clipboardPayload = api.compileElementorClipboard({
          kind: 'f2e.document',
          title: 'Clipboard Test',
          roots: ['r1'],
          nodes: {
            r1: {
              id: 'r1',
              sourceNodeId: 'n-r1',
              widget: 'container',
              children: ['w1', 'w2'],
              layout: { direction: 'column' },
              style: { backgroundImageDataUri: bgUri },
              content: { name: 'Hero' },
            },
            w1: {
              id: 'w1',
              sourceNodeId: 'n-w1',
              widget: 'image',
              children: [],
              layout: { width: 200, height: 150 },
              image: { dataUri: pngUri },
              content: { name: 'Photo' },
            },
            w2: {
              id: 'w2',
              sourceNodeId: 'n-w2',
              widget: 'image-box',
              children: [],
              layout: { direction: 'column' },
              image: { dataUri: jpgUri },
              content: { name: 'Card', title_text: 'Card', description_text: 'Desc' },
            },
          },
        });
        assert.equal(clipboardPayload.type, 'elementor');
        assert.ok(Array.isArray(clipboardPayload.elements));

        const harness = createEditorBridgeHarness({
          restUrl: 'https://thecanopyresident.local/wp-json/f2e-bridge/v1',
          overrideFetch: makeLocalAssetsMockFetch(),
        });
        const res = await harness.dispatchPaste(JSON.stringify(clipboardPayload));
        assert.equal(res.prevented, true, 'preventDefault must be called');
        assert.equal(res.stopped, true, 'stopImmediatePropagation must be called');
        assert.equal(res.createdCalls.length, 1);
        const created = res.createdCalls[0].args.model;
        assert.ok(created.settings.background_image.id > 0);
        assert.ok(created.elements[0].settings.image.id > 0);
        assert.ok(created.elements[1].settings.image.id > 0);
      },
    },

    {
      id: 'F4-T1-02',
      tier: 1,
      feature: 'F4',
      name: 'editor-bridge.js hydrates theme-site-logo (;utf8, & ;base64, SVG) + icon-box selected_icon',
      async run() {
        const svg = makeValidSvg({ width: 48, height: 48, nonce: 'f4t102' });
        const payload = {
          type: 'elementor',
          elements: [
            {
              id: 'c1',
              elType: 'container',
              settings: { _f2e_node_id: 'n-c1' },
              elements: [
                {
                  id: 'lg1',
                  elType: 'widget',
                  widgetType: 'theme-site-logo',
                  settings: { _f2e_node_id: 'n-lg1', custom_image: { id: '', url: svgToUtf8Uri(svg) } },
                  elements: [],
                },
                {
                  id: 'ib1',
                  elType: 'widget',
                  widgetType: 'icon-box',
                  settings: {
                    _f2e_node_id: 'n-ib1',
                    selected_icon: { library: 'svg', value: { id: '', url: svgToBase64Uri(svg) } },
                  },
                  elements: [],
                },
              ],
            },
          ],
        };

        const harness = createEditorBridgeHarness({
          restUrl: 'https://thecanopyresident.local/wp-json/f2e-bridge/v1',
          overrideFetch: makeLocalAssetsMockFetch(),
        });
        const res = await harness.dispatchPaste(JSON.stringify(payload));
        assert.equal(res.createdCalls.length, 1);
        const els = res.createdCalls[0].args.model.elements;
        assert.ok(els[0].settings.custom_image.id > 0 && els[0].settings.custom_image.url.endsWith('.svg'));
        assert.ok(els[1].settings.selected_icon.value.id > 0 && els[1].settings.selected_icon.value.url.endsWith('.svg'));
      },
    },

    {
      id: 'F4-T1-03',
      tier: 1,
      feature: 'F4',
      name: 'editor-bridge.js hydrates wp_gallery, carousel, slides, & overlay/hover BGs',
      async run() {
        const png1 = bufferToDataUri(makePng(64, 64, { nonce: 'f4t103-1' }), 'image/png');
        const png2 = bufferToDataUri(makePng(64, 64, { nonce: 'f4t103-2' }), 'image/png');
        const jpg1 = bufferToDataUri(makeJpeg(64, 64, { nonce: 'f4t103-3' }), 'image/jpeg');
        const webp1 = bufferToDataUri(makeWebpVP8L(64, 64, { nonce: 'f4t103-4' }), 'image/webp');

        const payload = {
          type: 'elementor',
          elements: [
            {
              id: 'c1',
              elType: 'container',
              settings: {
                _f2e_node_id: 'n-c1',
                background_overlay_image: { id: '', url: png1 },
                background_hover_image: { id: '', url: jpg1 },
              },
              elements: [
                { id: 'gal1', elType: 'widget', widgetType: 'image-gallery', settings: { _f2e_node_id: 'n-g', wp_gallery: [{ id: '', url: png1 }, { id: '', url: webp1 }] }, elements: [] },
                { id: 'car1', elType: 'widget', widgetType: 'image-carousel', settings: { _f2e_node_id: 'n-ca', carousel: [{ id: '', url: jpg1 }, { id: '', url: png2 }] }, elements: [] },
                { id: 'sld1', elType: 'widget', widgetType: 'slides', settings: { _f2e_node_id: 'n-s', slides: [{ _id: 's1', background_image: { id: '', url: webp1 } }] }, elements: [] },
              ],
            },
          ],
        };

        const harness = createEditorBridgeHarness({
          restUrl: 'https://thecanopyresident.local/wp-json/f2e-bridge/v1',
          overrideFetch: makeLocalAssetsMockFetch(),
        });
        const res = await harness.dispatchPaste(JSON.stringify(payload));
        assert.equal(res.createdCalls.length, 1);
        const model = res.createdCalls[0].args.model;
        assert.ok(!JSON.stringify(model).includes('data:image/'), 'Zero data:image/ URIs may remain after hydration');
        assert.ok(model.settings.background_overlay_image.id > 0);
        assert.ok(model.settings.background_hover_image.id > 0);
        assert.ok(model.elements[0].settings.wp_gallery.every((i) => i.id > 0));
        assert.ok(model.elements[1].settings.carousel.every((i) => i.id > 0));
        assert.ok(model.elements[2].settings.slides[0].background_image.id > 0);
      },
    },

    {
      id: 'F4-T1-04',
      tier: 1,
      feature: 'F4',
      name: 'editor-bridge.js hydrates v4 Atomic (e-image & e-svg) + _uploadCache dedup',
      async run() {
        const pngUri = bufferToDataUri(makePng(64, 64, { nonce: 'f4t104-dup' }), 'image/png');
        const svgUri = svgToBase64Uri(makeValidSvg({ width: 32, height: 32, nonce: 'f4t104-svg' }));

        const payload = {
          type: 'elementor',
          elements: [
            {
              id: 'v4c',
              elType: 'e-flexbox',
              widgetType: 'e-flexbox',
              settings: { _f2e_node_id: 'n-v4c', classes: { $$type: 'classes', value: ['e-root'] } },
              elements: [
                { id: 'ei1', elType: 'widget', widgetType: 'e-image', settings: { _f2e_node_id: 'n-ei1', image: { $$type: 'image', value: { id: 0, url: pngUri } } }, elements: [] },
                { id: 'ei2', elType: 'widget', widgetType: 'e-image', settings: { _f2e_node_id: 'n-ei2', image: { $$type: 'image', value: { id: 0, url: pngUri } } }, elements: [] },
                { id: 'es1', elType: 'widget', widgetType: 'e-svg', settings: { _f2e_node_id: 'n-es1', image: { $$type: 'image', value: { id: 0, url: svgUri } } }, elements: [] },
              ],
            },
          ],
        };

        const harness = createEditorBridgeHarness({
          restUrl: 'https://thecanopyresident.local/wp-json/f2e-bridge/v1',
          overrideFetch: makeLocalAssetsMockFetch(),
        });
        const res = await harness.dispatchPaste(JSON.stringify(payload));
        // Only 2 HTTP POSTs: 1 for deduplicated PNG, 1 for SVG
        assert.equal(res.uploadRequests.length, 2, `Expected 2 HTTP requests via _uploadCache dedup, got ${res.uploadRequests.length}`);
        const els = res.createdCalls[0].args.model.elements;
        assert.ok(els[0].settings.image.value.id > 0);
        assert.equal(els[0].settings.image.value.id, els[1].settings.image.value.id);
        assert.ok(els[2].settings.image.value.id > 0);
      },
    },

    {
      id: 'F4-T1-05',
      tier: 1,
      feature: 'F4',
      name: '.f2e.json full bundle contract (assets[] + document + elementorV3 + elementorV4)',
      async run() {
        const api = await importPluginApi();
        const png = makePng(64, 64, { nonce: 'f4t105' });
        const svg = makeValidSvg({ width: 32, height: 32, nonce: 'f4t105' });
        const root = createMockFrameNode({
          id: 'b-root',
          name: 'Bundle Page',
          children: [
            createMockTextNode({ id: 'b-t', name: 'Heading', characters: 'Bundle Title', fontSize: 32 }),
            createMockImageNode({ id: 'b-i', imageBytes: png }),
            createMockVectorNode({ id: 'b-s', svgMarkup: svg }),
          ],
        });
        const { document, assetPayloads } = await api.extractDesignSelection([root], { fileKey: 'f45' });
        const elementorV3 = api.compileElementorV3(document);
        const elementorV4 = api.compileElementorV4(document);
        const bundle = {
          kind: 'f2e.bundle',
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          document,
          assets: assetPayloads,
          elementorV3,
          elementorV4,
        };
        assert.equal(bundle.kind, 'f2e.bundle');
        assert.equal(bundle.assets.length, 2);
        assert.equal(api.validateElementorV3Tree(bundle.elementorV3.content).valid, true);
        assert.equal(api.validateElementorV4Tree(bundle.elementorV4.content).valid, true);
      },
    },

    {
      id: 'F4-T1-06',
      tier: 1,
      feature: 'F4',
      name: '.f2e.json IR-only fallback envelope contract (omitting elementorV3/content)',
      async run() {
        const api = await importPluginApi();
        const png = makePng(64, 64, { nonce: 'f4t106' });
        const root = createMockFrameNode({
          id: 'ir-root',
          name: 'IR Only Page',
          children: [
            createMockTextNode({ id: 'ir-h', characters: 'Server Transpile Heading', fontSize: 36 }),
            createMockImageNode({ id: 'ir-i', imageBytes: png }),
          ],
        });
        const { document, assetPayloads } = await api.extractDesignSelection([root], { fileKey: 'f46' });
        const payload = {
          kind: 'f2e.bundle',
          version: '1.0.0',
          title: 'IR Only Import',
          document,
          assets: assetPayloads,
        };
        assert.equal(payload.elementorV3, undefined);
        assert.equal(payload.content, undefined);
        assert.equal(payload.document.kind, 'f2e.document');
        assert.equal(payload.assets.length, 1);
      },
    },

    // ── F5: WordPress REST, Media Library & Document Persistence (6 tests, zero mutation) ──
    {
      id: 'F5-T1-01',
      tier: 1,
      feature: 'F5',
      name: 'LocalWP & tooling discovery unit check (sites.json -> pvmndgd0V + 8.2.29 + token redaction)',
      async run() {
        const env = resolveLocalWpEnv();
        assert.equal(env.hostname, 'thecanopyresident.local');
        assert.equal(env.siteId, 'pvmndgd0V', 'Must resolve pvmndgd0V from sites.json');
        assert.equal(env.phpVersion, '8.2.29');
        assert.ok(env.phpIni.includes('pvmndgd0V'), `php.ini must belong to pvmndgd0V, got ${env.phpIni}`);
        assert.ok(fs.existsSync(env.phpBin), `php.exe missing at ${env.phpBin}`);
        assert.ok(fs.existsSync(env.wpCli), `wp-cli.phar missing at ${env.wpCli}`);
        assert.equal(env.hasWpConfig, true, `wp-config.php missing in ${env.wpPath}`);

        const redacted = redactToken('f2e_live_0123456789abcdef0123456789abcdef');
        assert.ok(!redacted.includes('0123456789abcdef'), 'redactToken must mask secret bytes');
        assert.ok(redacted.includes('****'));
      },
    },

    {
      id: 'F5-T1-02',
      tier: 1,
      feature: 'F5',
      name: 'REST payload & header contract builders (/status, /assets, /assets/batch, /design-system, /import, rest_route)',
      async run({ wpClient }) {
        assert.equal(wpClient.buildUrl('/status'), `${wpClient.baseUrl}/wp-json/f2e-bridge/v1/status`);
        assert.equal(
          wpClient.buildUrl('/status', { useRestRoute: true, query: { search: 'Hero' } }),
          `${wpClient.baseUrl}/index.php?search=Hero&rest_route=%2Ff2e-bridge%2Fv1%2Fstatus`
        );
        assert.equal(wpClient.buildUrl('/assets/batch'), `${wpClient.baseUrl}/wp-json/f2e-bridge/v1/assets/batch`);
        assert.equal(wpClient.buildUrl('/design-system'), `${wpClient.baseUrl}/wp-json/f2e-bridge/v1/design-system`);
        assert.equal(wpClient.buildUrl('/import'), `${wpClient.baseUrl}/wp-json/f2e-bridge/v1/import`);
      },
    },

    {
      id: 'F5-T1-03',
      tier: 1,
      feature: 'F5',
      name: 'Raster & SVG 400x400 fixture generators (magic bytes + unique nonce SHA-256)',
      async run() {
        const pngA = makePng(400, 400, { nonce: 'runA' });
        const pngB = makePng(400, 400, { nonce: 'runB' });
        const jpg = makeJpeg(400, 400, { nonce: 'runA' });
        const webp = makeWebpVP8L(400, 400, { nonce: 'runA' });
        const svg = makeValidSvg({ width: 48, height: 48, nonce: 'runA' });

        assert.notEqual(sha256Hex(pngA), sha256Hex(pngB), 'Per-run nonce must produce unique PNG SHA-256');
        assert.deepEqual([...pngA.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
        assert.deepEqual([...jpg.subarray(0, 3)], [0xff, 0xd8, 0xff]);
        assert.equal(webp.subarray(0, 4).toString('ascii'), 'RIFF');
        assert.equal(webp.subarray(8, 12).toString('ascii'), 'WEBP');
        assert.ok(svgToBase64Uri(svg).startsWith('data:image/svg+xml;base64,'));
        assert.ok(svgToUtf8Uri(svg).startsWith('data:image/svg+xml;utf8,'));
      },
    },

    {
      id: 'F5-T1-04',
      tier: 1,
      feature: 'F5',
      name: 'Cleanup ledger & baseline protection guard',
      async run() {
        const env = resolveLocalWpEnv();
        for (const pid of HARD_PROTECTED_IDS) {
          assert.throws(() => safeForceDeletePost(env, pid, new Set(HARD_PROTECTED_IDS)), /SAFETY GUARD/);
        }
        assert.throws(() => safeForceDeletePost(env, 999, new Set([999])), /SAFETY GUARD/);

        const tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, 'tests', 'e2e', '.tmp-ledger-test-'));
        try {
          const ledger = createRunLedger('t1-guard', tmpDir, {
            kitId: 7,
            kitSnapshotB64: 'czowOiIiOw==',
            protectedPostIds: [3, 7, 237, 500],
          });
          recordCreatedAttachment(ledger, 500, false); // protected -> ignored
          recordCreatedAttachment(ledger, 600, true);  // reused -> ignored
          recordCreatedAttachment(ledger, 601, false); // new -> recorded
          const saved = JSON.parse(fs.readFileSync(ledger.ledgerPath, 'utf8'));
          assert.deepEqual(saved.createdAttachmentIds, [601]);
        } finally {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      },
    },

    {
      id: 'F5-T1-05',
      tier: 1,
      feature: 'F5',
      name: 'PHP plugin lint & baseline CLI transpiler test gate',
      async run() {
        const env = resolveLocalWpEnv();
        const wpPluginDir = path.join(REPO_ROOT, 'packages', 'wordpress-plugin');
        const phpFiles = [];
        const walkPhp = (dir) => {
          for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, ent.name);
            if (ent.isDirectory()) walkPhp(full);
            else if (ent.isFile() && ent.name.endsWith('.php')) phpFiles.push(full);
          }
        };
        walkPhp(wpPluginDir);
        assert.ok(phpFiles.length >= 10);
        for (const f of phpFiles) {
          const out = phpLintFile(env, f);
          assert.ok(out.includes('No syntax errors detected'), `PHP lint failed on ${f}: ${out}`);
        }

        const testOut = phpRunFile(env, path.join(wpPluginDir, 'tests', 'transpiler-test.php'));
        assert.ok(testOut.includes('passed') || testOut.includes('OK') || testOut.includes('PASS'), `Unexpected PHP test output: ${testOut}`);
      },
    },

    {
      id: 'F5-T1-06',
      tier: 1,
      feature: 'F5',
      name: 'Live read-only reachability & auth/CORS smoke',
      async run({ wpClient, skip }) {
        let unauth;
        try {
          unauth = await wpClient.status({ auth: false });
        } catch (err) {
          skip(`LocalWP unreachable: ${err.message}`);
          return;
        }
        assert.equal(unauth.status, 401);
        assert.equal(unauth.json?.code, 'rest_forbidden');

        const auth = await wpClient.status({ auth: true });
        assert.equal(auth.status, 200);
        assert.equal(auth.json?.success, true);
        assert.ok(auth.json?.data?.bridgeVersion);
        assert.ok(auth.json?.data?.elementorVersion);
        assert.equal(typeof auth.json?.data?.hasPro, 'boolean');

        const optNull = await wpClient.optionsPreflight('/status', { origin: 'null' });
        assert.equal(optNull.status, 204);
        assert.equal(optNull.headers.get('access-control-allow-origin'), 'null');
      },
    },
  ];
}
