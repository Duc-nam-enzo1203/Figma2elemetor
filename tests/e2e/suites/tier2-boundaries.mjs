import assert from 'node:assert/strict';
import {
  importPluginApi,
  createMockFrameNode,
  createMockTextNode,
  createMockImageNode,
  createMockVectorNode,
  solidFill,
  imageFill,
} from '../lib/figma-mocks.mjs';
import {
  makePng,
  makeJpeg,
  makeWebpVP8L,
  makeOversizedPng,
  makeCorruptPayloads,
  makeValidSvg,
  makeDuplicateDefsSvgs,
  makeMaliciousSvgs,
  makeMalformedSvg,
  svgToBase64Uri,
  svgToUtf8Uri,
  bufferToDataUri,
  sha256Hex,
} from '../lib/media-generators.mjs';
import { createEditorBridgeHarness } from '../lib/editor-bridge-harness.mjs';
import {
  recordCreatedPost,
  recordCreatedAttachment,
  restoreActiveKit,
} from '../lib/cleanup.mjs';
import { verifyMediaAttachment, verifyImportedDocument } from '../lib/assertions.mjs';
import { wp, wpJson } from '../lib/localwp.mjs';

export function getTier2Tests() {
  return [
    // ── F1 Boundary & Adversarial (6 tests) ──
    {
      id: 'F1-T2-01',
      tier: 2,
      feature: 'F1',
      name: 'Symbol(figma.mixed) safety on all node properties',
      async run() {
        const api = await importPluginApi();
        const mixed = Symbol('figma.mixed');
        const textNode = createMockTextNode({
          id: 'mx-t',
          name: 'Mixed Heading',
          characters: 'Mixed Style Headline',
          fontSize: mixed,
          fills: mixed,
        });
        textNode.fontName = mixed;
        textNode.lineHeight = mixed;
        textNode.letterSpacing = mixed;
        textNode.textCase = mixed;
        textNode.textDecoration = mixed;
        textNode.getRangeFontSize = () => 36;
        textNode.getRangeFontName = () => ({ family: 'Inter', style: 'Bold' });
        textNode.getRangeFills = () => [solidFill('#16A34A')];

        const frame = createMockFrameNode({
          id: 'mx-f',
          name: 'Mixed Frame',
          cornerRadius: mixed,
          strokeWeight: mixed,
          fills: mixed,
          children: [textNode],
        });

        const { document } = await api.extractDesignSelection([frame], { fileKey: 'mx1' });
        const extractedText = document.nodes['f2e:mx1:mx-t'];
        assert.ok(extractedText, 'Mixed text node must be extracted without TypeError');
        assert.equal(extractedText.text.fontSize, 36);
        assert.equal(extractedText.text.fontFamily, 'Inter');
        assert.equal(extractedText.text.color, '#16A34A');
      },
    },

    {
      id: 'F1-T2-02',
      tier: 2,
      feature: 'F1',
      name: 'BG_NAME_HINTS false-positive immunity (Main Logo, Hotline, Vector Icon)',
      async run() {
        const api = await importPluginApi();
        const svg = makeValidSvg({ width: 32, height: 32, nonce: 'f1t202' });
        const bgBytes = makePng(120, 80, { nonce: 'f1t202-bg' });

        const card = createMockFrameNode({
          id: 'bg-fp',
          name: 'Hero Card',
          layoutMode: 'NONE',
          width: 800,
          height: 400,
          exportAsync: async () => new Uint8Array(bgBytes),
          children: [
            createMockImageNode({ id: 'real-bg', name: 'bg', width: 800, height: 400, imageBytes: bgBytes }),
            createMockVectorNode({ id: 'fg-logo', name: 'Main Logo', width: 96, height: 36, svgMarkup: svg, pluginData: { 'f2e-widget': 'theme-site-logo' } }),
            createMockTextNode({ id: 'fg-hotline', name: 'Hotline', characters: '1800-555-0199', fontSize: 16 }),
            createMockVectorNode({ id: 'fg-vicon', name: 'Vector Icon', width: 20, height: 20, svgMarkup: svg }),
            createMockTextNode({ id: 'fg-body', name: 'Card Title', characters: 'Service Info', fontSize: 20 }),
          ],
        });

        const { document } = await api.extractDesignSelection([card], { fileKey: 'bgfp' });
        assert.ok(document.nodes['f2e:bgfp:fg-logo'], 'Main Logo must NOT be swallowed into composite-bg');
        assert.ok(document.nodes['f2e:bgfp:fg-hotline'], 'Hotline text must NOT be swallowed into composite-bg');
        assert.ok(document.nodes['f2e:bgfp:fg-vicon'], 'Vector Icon must NOT be swallowed into composite-bg');
      },
    },

    {
      id: 'F1-T2-03',
      tier: 2,
      feature: 'F1',
      name: 'Raster-filled Container with foreground children hides FG during exportAsync',
      async run() {
        const api = await importPluginApi();
        const bgBytes = makePng(120, 80, { nonce: 'f1t203' });
        const fgHeading = createMockTextNode({ id: 'rf-h', name: 'Heading', characters: 'Banner Title', fontSize: 36 });
        const fgBtn = createMockFrameNode({
          id: 'rf-b',
          name: 'CTA [btn]',
          children: [createMockTextNode({ id: 'rf-bt', characters: 'Explore' })],
        });
        let fgWereHidden = false;
        const banner = createMockFrameNode({
          id: 'rf-root',
          name: 'Image Banner',
          width: 1200,
          height: 400,
          fills: [imageFill('banner-hash')],
          children: [fgHeading, fgBtn],
          exportAsync: async () => {
            fgWereHidden = fgHeading.visible === false && fgBtn.visible === false;
            return new Uint8Array(bgBytes);
          },
        });

        const { document } = await api.extractDesignSelection([banner], { fileKey: 'rf1' });
        assert.equal(fgWereHidden, true, 'Foreground children must be hidden while raster-filled container exports BG');
        assert.equal(fgHeading.visible, true);
        assert.equal(fgBtn.visible, true);
        assert.ok(document.nodes['f2e:rf1:rf-h']);
        assert.ok(document.nodes['f2e:rf1:rf-b']);
      },
    },

    {
      id: 'F1-T2-04',
      tier: 2,
      feature: 'F1',
      name: 'Auto-Layout HUG container + immutable INSTANCE guard on composite-bg',
      async run() {
        const api = await importPluginApi();
        const bgBytes = makePng(100, 80, { nonce: 'f1t204' });
        const lockedInstance = createMockFrameNode({
          id: 'inst-fg',
          name: 'Locked Component',
          type: 'INSTANCE',
          children: [createMockTextNode({ id: 'inst-t', characters: 'Immutable Child' })],
        });
        Object.defineProperty(lockedInstance, 'visible', {
          get: () => true,
          set: () => { throw new TypeError('Cannot assign to read only property visible of INSTANCE'); },
          configurable: true,
        });

        const hugHero = createMockFrameNode({
          id: 'hug-hero',
          name: 'Hero',
          layoutMode: 'VERTICAL',
          layoutSizingVertical: 'HUG',
          width: 800,
          height: 300,
          exportAsync: async () => new Uint8Array(bgBytes),
          children: [
            createMockImageNode({ id: 'hug-bg', name: 'bg', imageBytes: bgBytes }),
            lockedInstance,
          ],
        });

        const { document, assetPayloads } = await api.extractDesignSelection([hugHero], { fileKey: 'hug1' });
        assert.equal(assetPayloads.length, 1);
        assert.ok(document.nodes['f2e:hug1:inst-fg']);
      },
    },

    {
      id: 'F1-T2-05',
      tier: 2,
      feature: 'F1',
      name: 'Keyword collision in findFirstVisualDescendant (icon-box with Service Content / Topic Card)',
      async run() {
        const api = await importPluginApi();
        const svg = makeValidSvg({ width: 28, height: 28, nonce: 'f1t205' });
        const iconBox = createMockFrameNode({
          id: 'kw-box',
          name: 'Feature Card',
          pluginData: { 'f2e-widget': 'icon-box' },
          children: [
            createMockFrameNode({
              id: 'kw-text-wrap',
              name: 'Service Content',
              children: [
                createMockTextNode({ id: 'kw-t', name: 'Topic Card', characters: 'Fast Delivery', fontSize: 18 }),
                createMockTextNode({ id: 'kw-d', name: 'Summary', characters: 'Same-day dispatch', fontSize: 14 }),
              ],
            }),
            createMockVectorNode({ id: 'kw-arrow', name: 'Arrow', width: 28, height: 28, svgMarkup: svg }),
          ],
        });

        const { document, assetPayloads } = await api.extractDesignSelection([iconBox], { fileKey: 'kw1' });
        assert.equal(assetPayloads.length, 1, 'Actual SVG Arrow must be exported');
        assert.equal(assetPayloads[0].kind, 'svg');
        assert.ok(document.nodes['f2e:kw1:kw-box'].svg?.markup.includes('<svg'), 'icon-box must bind the Arrow SVG, not Service Content text wrapper');
      },
    },

    {
      id: 'F1-T2-06',
      tier: 2,
      feature: 'F1',
      name: 'Empty selection, invisible nodes, & [skip] subtree pruning',
      async run() {
        const api = await importPluginApi();
        await assert.rejects(() => api.extractDesignSelection([]), /Không có layer|layer/i);
        await assert.rejects(
          () => api.extractDesignSelection([createMockFrameNode({ id: 'inv', visible: false, children: [createMockTextNode({ id: 'invt' })] })]),
          /Không có layer|layer/i
        );

        const png = makePng(64, 64, { nonce: 'f1t206-skip' });
        const page = createMockFrameNode({
          id: 'sk-root',
          name: 'Page',
          children: [
            createMockTextNode({ id: 'keep', characters: 'Keep Me' }),
            createMockFrameNode({
              id: 'sk-branch',
              name: 'Secret [skip]',
              children: [
                createMockTextNode({ id: 'sk-t', characters: 'Must Skip' }),
                createMockImageNode({ id: 'sk-img', imageBytes: png }),
              ],
            }),
          ],
        });
        const { document, assetPayloads } = await api.extractDesignSelection([page], { fileKey: 'sk1' });
        assert.ok(document.nodes['f2e:sk1:keep']);
        assert.equal(document.nodes['f2e:sk1:sk-branch'], undefined);
        assert.equal(document.nodes['f2e:sk1:sk-img'], undefined);
        assert.equal(assetPayloads.length, 0);
      },
    },

    // ── F2 Boundary & Adversarial (6 tests) ──
    {
      id: 'F2-T2-01',
      tier: 2,
      feature: 'F2',
      name: 'Raster-inside-SVG wrapper frame must export raster PNG, never <svg><image .../>',
      async run() {
        const api = await importPluginApi();
        const realPng = makePng(80, 80, { nonce: 'f2t201' });
        const wrappedImage = createMockFrameNode({
          id: 'r-in-svg',
          name: 'Brand Logo',
          width: 120,
          height: 60,
          fills: [],
          pluginData: { 'f2e-widget': 'theme-site-logo' },
          children: [
            createMockImageNode({ id: 'inner-raster', name: 'RasterBitmap', width: 120, height: 60, imageBytes: realPng }),
          ],
          exportAsync: async ({ format }) => {
            if (format === 'SVG') {
              return new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="data:image/png;base64,AAAA"/></svg>', 'utf8'));
            }
            return new Uint8Array(realPng);
          },
        });

        const { assetPayloads } = await api.extractDesignSelection([wrappedImage], { fileKey: 'ris' });
        assert.equal(assetPayloads.length, 1);
        assert.equal(assetPayloads[0].mime, 'image/png', 'Wrapper containing IMAGE child must export raster PNG, not SVG with <image>');
      },
    },

    {
      id: 'F2-T2-02',
      tier: 2,
      feature: 'F2',
      name: 'icon-box with raster image descendant must NOT put PNG dataUri in selected_icon',
      async run() {
        const api = await importPluginApi();
        const png = makePng(64, 64, { nonce: 'f2t202' });
        const box = createMockFrameNode({
          id: 'ricon-box',
          name: 'Raster Icon Box',
          pluginData: { 'f2e-widget': 'icon-box' },
          children: [
            createMockImageNode({ id: 'ricon-img', name: 'Badge Photo', width: 48, height: 48, imageBytes: png }),
            createMockTextNode({ id: 'ricon-t', characters: 'Feature Title', fontSize: 18 }),
            createMockTextNode({ id: 'ricon-d', characters: 'Feature Description', fontSize: 14 }),
          ],
        });
        const { document } = await api.extractDesignSelection([box], { fileKey: 'ric' });
        const v3 = api.compileElementorV3(document);
        const json = JSON.stringify(v3.content);
        const el = v3.content[0];
        if (el.widgetType === 'icon-box' && el.settings.selected_icon?.library === 'svg') {
          const valStr = JSON.stringify(el.settings.selected_icon.value || '');
          assert.ok(!valStr.includes('data:image/png'), 'selected_icon (svg) must never contain a PNG data URI');
        }
        assert.ok(!json.includes('"library":"svg","value":"data:image/png'));
      },
    },

    {
      id: 'F2-T2-03',
      tier: 2,
      feature: 'F2',
      name: 'Dev Mode url(<path-to-image>) leakage guard on image widget',
      async run() {
        const api = await importPluginApi();
        const png = makePng(80, 80, { nonce: 'f2t203' });
        const imgNode = createMockImageNode({
          id: 'leak-img',
          name: 'Hero Photo',
          imageBytes: png,
          css: {
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, #000 100%), url(<path-to-image>) lightgray 50% / cover no-repeat',
          },
        });
        const { document } = await api.extractDesignSelection([imgNode], { fileKey: 'lk1' });
        const v3 = api.compileElementorV3(document);
        const serialized = JSON.stringify(v3.content);
        assert.ok(!serialized.includes('<path-to-image>'), 'Compiled JSON must strip literal <path-to-image> placeholder');
      },
    },

    {
      id: 'F2-T2-04',
      tier: 2,
      feature: 'F2',
      name: 'Malicious XSS / XXE SVG sanitization (live /assets + /import html widget)',
      async run({ env, wpClient, ledger, runId }) {
        const xssSvgs = makeMaliciousSvgs(`${runId}-f2t204`);
        for (const [label, svg] of Object.entries(xssSvgs)) {
          const b64 = Buffer.from(svg, 'utf8').toString('base64');
          const res = await wpClient.uploadAsset({
            sha256: '',
            mime: 'image/svg+xml',
            kind: 'svg',
            base64: b64,
            name: `[F2E-E2E ${runId}] XSS ${label}`,
          });
          assert.equal(res.status, 200, `Upload sanitized SVG (${label}) failed: ${res.text}`);
          const id = res.json?.data?.id;
          recordCreatedAttachment(ledger, id, res.json?.data?.reused);

          const fetched = await wpClient.fetchUrl(wpClient.toTargetOriginUrl(res.json.data.url));
          assert.equal(fetched.status, 200);
          const body = fetched.text.toLowerCase();
          assert.ok(!body.includes('<script'), `XSS <script> leaked in ${label}`);
          assert.ok(!body.includes('onload='), `XSS onload= leaked in ${label}`);
          assert.ok(!body.includes('onclick='), `XSS onclick= leaked in ${label}`);
          assert.ok(!body.includes('<foreignobject'), `XSS <foreignObject> leaked in ${label}`);
          assert.ok(!body.includes('<animate'), `XSS <animate> leaked in ${label}`);
          assert.ok(!body.includes('@import'), `CSS @import leaked in ${label}`);
          assert.ok(!body.includes('<image'), `Embedded <image> leaked in ${label}`);
          assert.ok(!body.includes('<!entity'), `XXE <!ENTITY leaked in ${label}`);
          assert.ok(body.includes('<rect'), `Safe <rect> geometry lost in ${label}`);
        }

        // Also test /import html widget sanitization
        const importRes = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] HTML Widget Sanitize`,
          postStatus: 'draft',
          content: [
            {
              id: 'htmlx1',
              elType: 'widget',
              widgetType: 'html',
              settings: {
                _f2e_node_id: 'n-htmlx1',
                html: `<div>${xssSvgs.scriptAndEvents}</div>`,
              },
              elements: [],
            },
          ],
        });
        assert.equal(importRes.status, 200);
        const postId = importRes.json?.data?.postId;
        recordCreatedPost(ledger, postId);
        const savedData = wp(env, 'post', 'meta', 'get', String(postId), '_elementor_data');
        assert.ok(!savedData.toLowerCase().includes('<script'), 'Imported html widget must strip <script>');
        assert.ok(!savedData.toLowerCase().includes('onload='), 'Imported html widget must strip onload=');
      },
    },

    {
      id: 'F2-T2-05',
      tier: 2,
      feature: 'F2',
      name: 'Duplicate SVG <defs> ID collision across multiple inline SVG widgets',
      async run({ runId }) {
        const api = await importPluginApi();
        const [svgA, svgB] = makeDuplicateDefsSvgs(`${runId}-defs`);
        const root = createMockFrameNode({
          id: 'defs-root',
          name: 'Icons Page',
          children: [
            createMockVectorNode({ id: 'ic-a', name: 'Icon A', width: 96, height: 48, svgMarkup: svgA }),
            createMockVectorNode({ id: 'ic-b', name: 'Icon B', width: 96, height: 48, svgMarkup: svgB }),
          ],
        });
        const { document } = await api.extractDesignSelection([root], { fileKey: 'defs1' });
        const v3 = api.compileElementorV3(document);
        const htmlWidgets = v3.content[0].elements.map((e) => e.settings?.html || '');
        assert.equal(htmlWidgets.length, 2);
        // Extract all id="..." values inside both SVGs
        const idsA = [...htmlWidgets[0].matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
        const idsB = [...htmlWidgets[1].matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
        assert.ok(idsA.length > 0 && idsB.length > 0);
        const overlap = idsA.filter((id) => idsB.includes(id));
        assert.equal(overlap.length, 0, `Duplicate SVG <defs> IDs collided across widgets: ${overlap.join(', ')}`);
      },
    },

    {
      id: 'F2-T2-06',
      tier: 2,
      feature: 'F2',
      name: 'Oversized (>10 MB), corrupted magic-byte, & empty/broken exportAsync',
      async run({ wpClient, runId }) {
        const api = await importPluginApi();
        // (a) >10 MB PNG to /assets
        const bigPng = makeOversizedPng(10 * 1024 * 1024 + 64);
        const bigRes = await wpClient.uploadAsset({
          sha256: sha256Hex(bigPng),
          mime: 'image/png',
          kind: 'raster',
          base64: bigPng.toString('base64'),
          name: `[F2E-E2E ${runId}] Oversized`,
        });
        assert.ok(bigRes.status >= 400 && bigRes.json?.success !== true, `>10 MB upload must fail, got ${bigRes.status}`);

        // (b) HTML script disguised as image/png
        const corrupt = makeCorruptPayloads();
        const spoofingRes = await wpClient.uploadAsset({
          sha256: sha256Hex(corrupt.htmlAsPng),
          mime: 'image/png',
          kind: 'raster',
          base64: corrupt.htmlAsPng.toString('base64'),
          name: `[F2E-E2E ${runId}] Corrupt`,
        });
        assert.ok(spoofingRes.status >= 400 && spoofingRes.json?.success !== true, `Corrupt PNG magic bytes must fail, got ${spoofingRes.status}`);

        // (c) exportAsync rejecting must warn without crashing
        const brokenRoot = createMockFrameNode({
          id: 'brk-root',
          children: [
            createMockTextNode({ id: 'brk-t', characters: 'Survives' }),
            createMockImageNode({
              id: 'brk-i',
              exportAsync: async () => { throw new Error('Figma renderer busy'); },
            }),
          ],
        });
        const { document } = await api.extractDesignSelection([brokenRoot], { fileKey: 'brk1' });
        assert.ok(document.warnings.some((w) => w.code === 'asset-export-failed'));
        assert.ok(document.nodes['f2e:brk1:brk-t']);
      },
    },

    // ── F3 Boundary & Adversarial (6 tests) ──
    {
      id: 'F3-T2-01',
      tier: 2,
      feature: 'F3',
      name: 'Schema validator negative detection (v3 & v4)',
      async run() {
        const api = await importPluginApi();
        const badV3 = [
          {
            id: 'bad1',
            elType: 'widget',
            widgetType: 'icon-box',
            settings: {
              title_color: 'var(--bad)',
              custom_css: 'selector { color: red;',
              selected_icon: { library: 'svg', value: '<svg></svg>' },
            },
            elements: [],
          },
          {
            id: 'accbad',
            elType: 'widget',
            widgetType: 'nested-accordion',
            settings: { items: [{ _id: 'i1', item_title: 'Q1' }] },
            elements: [],
          },
        ];
        const v3Res = api.validateElementorV3Tree(badV3);
        assert.equal(v3Res.valid, false);
        const codes = new Set(v3Res.errors.map((e) => e.code));
        assert.ok(codes.has('invalid-color'));
        assert.ok(codes.has('unbalanced-css'));
        assert.ok(codes.has('raw-svg-in-icon-box'));
        assert.ok(codes.has('accordion-panel-mismatch'));

        const badV4 = [{ id: 'v4b', elType: 'e-flexbox', widgetType: 'e-flexbox', settings: {}, styles: {}, elements: [] }];
        const v4Res = api.validateElementorV4Tree(badV4);
        assert.equal(v4Res.valid, false);
        assert.ok(v4Res.errors.some((e) => e.code === 'missing-v4-classes'));
      },
    },

    {
      id: 'F3-T2-02',
      tier: 2,
      feature: 'F3',
      name: 'nested-accordion with non-text divider child & < / > characters',
      async run() {
        const api = await importPluginApi();
        const acc = createMockFrameNode({
          id: 'acc-adv',
          name: 'FAQ',
          pluginData: { 'f2e-widget': 'nested-accordion' },
          children: [
            createMockFrameNode({ id: 'acc-div', name: 'Divider', width: 600, height: 1, fills: [solidFill('#E2E8F0')] }),
            createMockFrameNode({
              id: 'acc-q1',
              name: 'Item 1',
              children: [
                createMockTextNode({ id: 'aq-t', characters: 'Is Price < 100 & > 50?' }),
                createMockTextNode({ id: 'aa-t', characters: 'Yes, value < 100 and > 50 applies.' }),
              ],
            }),
          ],
        });
        const { document } = await api.extractDesignSelection([acc], { fileKey: 'acc1' });
        const v3 = api.compileElementorV3(document);
        const accEl = v3.content[0];
        assert.equal(accEl.widgetType, 'nested-accordion');
        assert.equal(accEl.settings.items.length, 1);
        assert.equal(accEl.elements.length, 1);
        const panelEditor = accEl.elements[0].elements[0]?.settings?.editor || '';
        assert.ok(panelEditor.includes('&lt;') && panelEditor.includes('&gt;'), 'Must HTML-escape < and > inside accordion panel editor');
      },
    },

    {
      id: 'F3-T2-03',
      tier: 2,
      feature: 'F3',
      name: 'Percentage border-radius: 50% & PERCENT letterSpacing',
      async run() {
        const api = await importPluginApi();
        const root = createMockFrameNode({
          id: 'pct-root',
          name: 'Avatar Pill',
          width: 100,
          height: 100,
          fills: [solidFill('#16A34A')],
          css: { 'border-radius': '50%' },
          children: [
            createMockTextNode({
              id: 'pct-txt',
              characters: 'VIP',
              fontSize: 14,
              letterSpacing: { unit: 'PERCENT', value: 5 },
            }),
          ],
        });
        const { document } = await api.extractDesignSelection([root], { fileKey: 'pct1' });
        const v3 = api.compileElementorV3(document);
        const container = v3.content[0];
        assert.equal(container.settings.border_radius?.unit, '%', 'border-radius: 50% must preserve % unit');
        assert.equal(container.settings.border_radius?.top, '50');
        const heading = container.elements[0];
        const lsUnit = heading.settings.typography_letter_spacing?.unit;
        assert.ok(lsUnit === 'em' || lsUnit === '%', `PERCENT letterSpacing must not degrade to px, got ${lsUnit}`);
      },
    },

    {
      id: 'F3-T2-04',
      tier: 2,
      feature: 'F3',
      name: 'Absorbed [bg]/border child borderGradient & 1-sided strokes',
      async run() {
        const api = await importPluginApi();
        const card = createMockFrameNode({
          id: 'str-card',
          name: 'Border Card',
          width: 400,
          height: 200,
          strokes: [solidFill('#16A34A')],
          strokeWeight: 1,
          strokeTopWeight: 1,
          strokeRightWeight: 0,
          strokeBottomWeight: 1,
          strokeLeftWeight: 0,
          children: [
            createMockFrameNode({
              id: 'str-bg',
              name: 'border',
              layoutPositioning: 'ABSOLUTE',
              css: { 'border-image': 'linear-gradient(90deg, #16A34A, #2563EB) 1' },
            }),
            createMockTextNode({ id: 'str-t', characters: 'Top & Bottom Border' }),
          ],
        });
        const { document } = await api.extractDesignSelection([card], { fileKey: 'str1' });
        const v3 = api.compileElementorV3(document);
        const bw = v3.content[0].settings.border_width;
        assert.equal(bw.top, '1');
        assert.equal(bw.right, '0');
        assert.equal(bw.bottom, '1');
        assert.equal(bw.left, '0');
      },
    },

    {
      id: 'F3-T2-05',
      tier: 2,
      feature: 'F3',
      name: 'Missing attachmentMap entry fallback & non-finite number guard',
      async run() {
        const api = await importPluginApi();
        const png = makePng(64, 64, { nonce: 'f3t205' });
        const root = createMockFrameNode({
          id: 'nf-root',
          width: Number.NaN,
          height: 300,
          children: [
            createMockImageNode({ id: 'nf-img', imageBytes: png }),
          ],
        });
        const { document } = await api.extractDesignSelection([root], { fileKey: 'nf1' });
        const v3 = api.compileElementorV3(document, { attachmentMap: {} });
        const check = api.validateElementorV3Tree(v3.content);
        assert.equal(check.valid, true, `Validation failed: ${JSON.stringify(check.errors)}`);
        const imgEl = v3.content[0].elements[0];
        assert.ok(imgEl.settings.image.url.startsWith('data:image/png;base64,'), 'Missing attachmentMap entry must fall back to dataUri');
      },
    },

    {
      id: 'F3-T2-06',
      tier: 2,
      feature: 'F3',
      name: 'Duplicate el.id prevention under 50 repetitive sibling nodes',
      async run() {
        const api = await importPluginApi();
        const kids = Array.from({ length: 50 }, (_, i) =>
          createMockTextNode({ id: `dup:node:${i}`, name: 'Item', characters: `Item ${i}` })
        );
        const root = createMockFrameNode({ id: 'dup-root', children: kids });
        const { document } = await api.extractDesignSelection([root], { fileKey: 'dup1' });
        const v3 = api.compileElementorV3(document);
        const check = api.validateElementorV3Tree(v3.content);
        assert.equal(check.valid, true, `Duplicate ID errors: ${JSON.stringify(check.errors)}`);
        assert.equal(v3.content[0].elements.length, 50);
      },
    },

    // ── F4 Boundary & Adversarial (6 tests) ──
    {
      id: 'F4-T2-01',
      tier: 2,
      feature: 'F4',
      name: 'editor-bridge.js ignores paste inside INPUT / TEXTAREA / contentEditable',
      async run({ wpClient, token }) {
        const harness = createEditorBridgeHarness({
          restUrl: `${wpClient.baseUrl}/wp-json/f2e-bridge/v1`,
          token,
        });
        const payload = JSON.stringify({
          type: 'elementor',
          elements: [{ id: 'x1', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'n1', title: 'Hi' }, elements: [] }],
        });
        for (const ctx of [
          { activeTag: 'INPUT', isContentEditable: false },
          { activeTag: 'TEXTAREA', isContentEditable: false },
          { activeTag: 'DIV', isContentEditable: true },
        ]) {
          const res = await harness.dispatchPaste(payload, ctx);
          assert.equal(res.prevented, false);
          assert.equal(res.uploadRequests.length, 0);
          assert.equal(res.createdCalls.length, 0);
        }
      },
    },

    {
      id: 'F4-T2-02',
      tier: 2,
      feature: 'F4',
      name: 'editor-bridge.js ignores non-F2E JSON & native Elementor JSON without _f2e_node_id',
      async run({ wpClient, token }) {
        const harness = createEditorBridgeHarness({
          restUrl: `${wpClient.baseUrl}/wp-json/f2e-bridge/v1`,
          token,
        });
        for (const text of [
          'plain text paste',
          '{invalid json',
          JSON.stringify({ type: 'elementor', elements: [{ id: 'native1', elType: 'widget', widgetType: 'heading', settings: { title: 'Native' }, elements: [] }] }),
        ]) {
          const res = await harness.dispatchPaste(text);
          assert.equal(res.prevented, false);
          assert.equal(res.uploadRequests.length, 0);
          assert.equal(res.createdCalls.length, 0);
        }
      },
    },

    {
      id: 'F4-T2-03',
      tier: 2,
      feature: 'F4',
      name: 'editor-bridge.js graceful handling when /assets returns HTTP 500 or network error',
      async run() {
        const harness = createEditorBridgeHarness({
          restUrl: 'https://thecanopyresident.local/wp-json/f2e-bridge/v1',
          overrideFetch: async () => ({
            ok: false,
            status: 500,
            json: async () => ({ code: 'upload_failed', message: 'Simulated failure' }),
            text: async () => '{"code":"upload_failed"}',
          }),
        });
        const pngUri = bufferToDataUri(makePng(32, 32, { nonce: 'f4t203' }), 'image/png');
        const payload = JSON.stringify({
          type: 'elementor',
          elements: [
            { id: 'f500', elType: 'widget', widgetType: 'image', settings: { _f2e_node_id: 'n-f500', image: { id: '', url: pngUri } }, elements: [] },
          ],
        });
        const res = await harness.dispatchPaste(payload);
        assert.equal(res.prevented, true);
        assert.equal(res.createdCalls.length, 1, 'Editor $e.run must still execute without throwing');
      },
    },

    {
      id: 'F4-T2-04',
      tier: 2,
      feature: 'F4',
      name: 'editor-bridge.js XSS SVG inside pasted ;utf8, & ;base64, URI (live /assets)',
      async run({ wpClient, token, ledger, runId }) {
        const harness = createEditorBridgeHarness({
          restUrl: `${wpClient.baseUrl}/wp-json/f2e-bridge/v1`,
          token,
        });
        const xssSvg = makeMaliciousSvgs(`${runId}-f4t204`).scriptAndEvents;
        const payload = JSON.stringify({
          type: 'elementor',
          elements: [
            {
              id: 'xss-c',
              elType: 'container',
              settings: { _f2e_node_id: 'n-xssc', _title: `[F2E-E2E ${runId}] XSS Paste` },
              elements: [
                {
                  id: 'xss-lg',
                  elType: 'widget',
                  widgetType: 'theme-site-logo',
                  settings: { _f2e_node_id: 'n-xlg', _title: `[F2E-E2E ${runId}] XSS Logo`, custom_image: { id: '', url: svgToUtf8Uri(xssSvg) } },
                  elements: [],
                },
                {
                  id: 'xss-im',
                  elType: 'widget',
                  widgetType: 'image',
                  settings: { _f2e_node_id: 'n-xim', _title: `[F2E-E2E ${runId}] XSS Img`, image: { id: '', url: svgToBase64Uri(xssSvg) } },
                  elements: [],
                },
              ],
            },
          ],
        });

        const res = await harness.dispatchPaste(payload);
        for (const req of res.uploadRequests) {
          const id = req.responseJson?.data?.id;
          if (id) recordCreatedAttachment(ledger, id, req.responseJson?.data?.reused);
        }
        assert.equal(res.createdCalls.length, 1);
        const els = res.createdCalls[0].args.model.elements;
        assert.ok(els[0].settings.custom_image.id > 0, 'theme-site-logo ;utf8, SVG must hydrate via live /assets');
        assert.ok(els[1].settings.image.id > 0, 'image ;base64, SVG must hydrate via live /assets');

        for (const url of [els[0].settings.custom_image.url, els[1].settings.image.url]) {
          const getRes = await wpClient.fetchUrl(wpClient.toTargetOriginUrl(url));
          assert.equal(getRes.status, 200);
          assert.ok(!getRes.text.toLowerCase().includes('<script'));
          assert.ok(!getRes.text.toLowerCase().includes('onload='));
        }
      },
    },

    {
      id: 'F4-T2-05',
      tier: 2,
      feature: 'F4',
      name: '.f2e.json import with invalid targetPostId (99999999) & disallowed HTML in html widget',
      async run({ env, wpClient, ledger, runId }) {
        const beforePages = wp(env, 'post', 'list', '--post_type=page', '--post_status=any', '--format=count');
        const badTargetRes = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] Invalid Target`,
          targetPostId: 99999999,
          content: [{ id: 'x1', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'n1', title: 'Should Fail' }, elements: [] }],
        });
        assert.ok(badTargetRes.status >= 400 && badTargetRes.json?.success !== true, `Non-existent targetPostId must fail cleanly, got ${badTargetRes.status}`);
        const afterPages = wp(env, 'post', 'list', '--post_type=page', '--post_status=any', '--format=count');
        assert.equal(afterPages, beforePages, 'Failed targetPostId must never create an orphan page');

        const htmlImport = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] Sanitize HTML`,
          postStatus: 'draft',
          content: [
            {
              id: 'h1',
              elType: 'widget',
              widgetType: 'html',
              settings: {
                _f2e_node_id: 'nh1',
                html: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><rect width="10" height="10"/></svg>',
              },
              elements: [],
            },
          ],
        });
        assert.equal(htmlImport.status, 200);
        recordCreatedPost(ledger, htmlImport.json?.data?.postId);
        const saved = wp(env, 'post', 'meta', 'get', String(htmlImport.json.data.postId), '_elementor_data');
        assert.ok(!saved.toLowerCase().includes('<script'));
        assert.ok(!saved.toLowerCase().includes('onload='));
      },
    },

    {
      id: 'F4-T2-06',
      tier: 2,
      feature: 'F4',
      name: 'Clipboard & .f2e.json with mixed valid + broken data:image/ URLs (partial failure isolation)',
      async run({ wpClient, token, ledger, runId }) {
        const validUri = bufferToDataUri(makePng(120, 120, { nonce: `${runId}-f4t206` }), 'image/png');
        const brokenUri = 'data:image/png;base64,!!!invalid-base64!!!';

        const harness = createEditorBridgeHarness({
          restUrl: `${wpClient.baseUrl}/wp-json/f2e-bridge/v1`,
          token,
        });
        const pastePayload = JSON.stringify({
          type: 'elementor',
          elements: [
            {
              id: 'mix-c',
              elType: 'container',
              settings: { _f2e_node_id: 'n-mixc', _title: `[F2E-E2E ${runId}] Mix`, background_image: { id: '', url: brokenUri } },
              elements: [
                {
                  id: 'mix-i',
                  elType: 'widget',
                  widgetType: 'image',
                  settings: { _f2e_node_id: 'n-mixi', _title: `[F2E-E2E ${runId}] Valid Mix`, image: { id: '', url: validUri } },
                  elements: [],
                },
              ],
            },
          ],
        });
        const res = await harness.dispatchPaste(pastePayload);
        for (const req of res.uploadRequests) {
          const id = req.responseJson?.data?.id;
          if (id) recordCreatedAttachment(ledger, id, req.responseJson?.data?.reused);
        }
        assert.equal(res.createdCalls.length, 1);
        const validImg = res.createdCalls[0].args.model.elements[0].settings.image;
        assert.ok(validImg.id > 0 && /^https?:\/\//.test(validImg.url), 'Valid PNG must hydrate even when sibling data URI fails');
      },
    },

    // ── F5 Live LocalWP Integration Tests (10 tests) ──
    {
      id: 'F5-T2-01',
      tier: 2,
      feature: 'F5',
      name: 'Auth & CORS preflight contract (/status, /index.php?rest_route=, Origin: null & figma.com)',
      async run({ wpClient, ledger, runId }) {
        const unauth = await wpClient.status({ auth: false });
        assert.equal(unauth.status, 401);
        assert.equal(unauth.json?.code, 'rest_forbidden');

        // Keep failed Bearer auth to 1 single request per run (far below 15/600s rate limit)
        const badAuth = await wpClient.status({ auth: 'f2e_live_invalid000' });
        assert.equal(badAuth.status, 401);

        // /index.php?rest_route= parity
        const restRouteRes = await wpClient.statusViaRestRoute({ auth: true });
        assert.equal(restRouteRes.status, 200);
        assert.equal(restRouteRes.json?.success, true);

        // Search filter after creating a run-scoped page
        const searchMarker = `F2E-SEARCH-${runId}`;
        const created = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] ${searchMarker}`,
          postStatus: 'draft',
          content: [{ id: 's1', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'ns1', title: searchMarker }, elements: [] }],
        });
        assert.equal(created.status, 200);
        const postId = created.json.data.postId;
        recordCreatedPost(ledger, postId);

        const searchRes = await wpClient.status({ search: searchMarker });
        assert.equal(searchRes.status, 200);
        assert.ok(searchRes.json.data.pages.some((p) => Number(p.id) === Number(postId)), 'Search must find created page');

        // CORS OPTIONS & GET for Origin: null & https://www.figma.com
        const optNull = await wpClient.optionsPreflight('/status', { origin: 'null' });
        assert.equal(optNull.status, 204);
        assert.equal(optNull.headers.get('access-control-allow-origin'), 'null');

        const optFigma = await wpClient.optionsPreflight('/status', { origin: 'https://www.figma.com' });
        assert.equal(optFigma.status, 204);
        assert.equal(
          optFigma.headers.get('access-control-allow-origin'),
          'https://www.figma.com',
          'OPTIONS preflight must echo https://www.figma.com'
        );

        const getFigma = await wpClient.status({ auth: true, headers: { Origin: 'https://www.figma.com' } });
        assert.equal(getFigma.status, 200);
        assert.equal(getFigma.headers.get('access-control-allow-origin'), 'https://www.figma.com');
      },
    },

    {
      id: 'F5-T2-02',
      tier: 2,
      feature: 'F5',
      name: 'Raster uploads (400x400 PNG, JPEG, WebP) + _wp_attachment_metadata + thumbnails + HTTP 200',
      async run({ env, wpClient, ledger, runId }) {
        const fixtures = [
          { mime: 'image/png', buf: makePng(400, 400, { nonce: `${runId}-f5t202-png` }), label: 'PNG' },
          { mime: 'image/jpeg', buf: makeJpeg(400, 400, { nonce: `${runId}-f5t202-jpg` }), label: 'JPEG' },
          { mime: 'image/webp', buf: makeWebpVP8L(400, 400, { nonce: `${runId}-f5t202-webp` }), label: 'WebP' },
        ];

        for (const fx of fixtures) {
          const sha = sha256Hex(fx.buf);
          const up = await wpClient.uploadAsset({
            sha256: sha,
            mime: fx.mime,
            kind: 'raster',
            base64: fx.buf.toString('base64'),
            name: `[F2E-E2E ${runId}] ${fx.label} 400x400`,
          });
          assert.equal(up.status, 200, `${fx.label} upload failed: ${up.text}`);
          assert.equal(up.json?.success, true);
          assert.equal(up.json?.data?.reused, false, `${fx.label} must not collide with pre-existing media`);
          const attId = up.json.data.id;
          recordCreatedAttachment(ledger, attId, up.json.data.reused);

          await verifyMediaAttachment(env, wpClient, attId, fx.mime, {
            expectedSha256: sha,
            expectedWidth: 400,
            expectedHeight: 400,
            expectThumbnails: true,
          });
        }
      },
    },

    {
      id: 'F5-T2-03',
      tier: 2,
      feature: 'F5',
      name: 'SVG uploads (;base64,, ;utf8,, %3C, XSS) + SVG metadata + sanitized HTTP 200',
      async run({ env, wpClient, ledger, runId }) {
        const svg1 = makeValidSvg({ width: 64, height: 48, nonce: `${runId}-svg-b64` });
        const svg2 = makeValidSvg({ width: 72, height: 36, nonce: `${runId}-svg-utf8` });
        const svg3 = makeValidSvg({ width: 48, height: 48, nonce: `${runId}-svg-pct` });

        const payloads = [
          { label: 'base64-uri', base64: svgToBase64Uri(svg1), mime: 'image/png' }, // tests URI mime override
          { label: 'utf8-uri', base64: svgToUtf8Uri(svg2), mime: 'image/svg+xml' },
          { label: 'pct-encoded', base64: encodeURIComponent(svg3), mime: 'image/svg+xml' },
        ];

        for (const p of payloads) {
          const up = await wpClient.uploadAsset({
            sha256: '',
            mime: p.mime,
            kind: 'svg',
            base64: p.base64,
            name: `[F2E-E2E ${runId}] SVG ${p.label}`,
          });
          assert.equal(up.status, 200, `SVG upload (${p.label}) failed: ${up.text}`);
          const attId = up.json?.data?.id;
          recordCreatedAttachment(ledger, attId, up.json?.data?.reused);
          assert.ok(up.json?.data?.url.endsWith('.svg'), `SVG ${p.label} URL must end in .svg: ${up.json?.data?.url}`);
          await verifyMediaAttachment(env, wpClient, attId, 'image/svg+xml', { expectThumbnails: false });
        }
      },
    },

    {
      id: 'F5-T2-04',
      tier: 2,
      feature: 'F5',
      name: 'SHA-256 deduplication & error handling (missing base64, >10MB, corrupt magic, malformed XML)',
      async run({ wpClient, ledger, runId }) {
        const png = makePng(120, 120, { nonce: `${runId}-dedup` });
        const sha = sha256Hex(png);
        const b64 = png.toString('base64');

        const first = await wpClient.uploadAsset({
          sha256: sha,
          mime: 'image/png',
          kind: 'raster',
          base64: b64,
          name: `[F2E-E2E ${runId}] Dedup`,
        });
        assert.equal(first.status, 200);
        assert.equal(first.json.data.reused, false);
        recordCreatedAttachment(ledger, first.json.data.id, false);

        const second = await wpClient.uploadAsset({
          sha256: sha,
          mime: 'image/png',
          kind: 'raster',
          base64: b64,
          name: `[F2E-E2E ${runId}] Dedup Again`,
        });
        assert.equal(second.status, 200);
        assert.equal(second.json.data.reused, true);
        assert.equal(second.json.data.id, first.json.data.id);

        const thirdNoHash = await wpClient.uploadAsset({
          sha256: '',
          mime: 'image/png',
          kind: 'raster',
          base64: b64,
          name: `[F2E-E2E ${runId}] Dedup EmptyHash`,
        });
        assert.equal(thirdNoHash.status, 200);
        assert.equal(thirdNoHash.json.data.reused, true);
        assert.equal(thirdNoHash.json.data.id, first.json.data.id);

        const missingB64 = await wpClient.uploadAsset({ sha256: '', mime: 'image/png', base64: '' });
        assert.equal(missingB64.status, 400);
        assert.equal(missingB64.json?.code, 'missing_base64');

        const malformedSvg = await wpClient.uploadAsset({
          sha256: '',
          mime: 'image/svg+xml',
          base64: Buffer.from(makeMalformedSvg(), 'utf8').toString('base64'),
          name: `[F2E-E2E ${runId}] BadSVG`,
        });
        assert.ok(malformedSvg.status >= 400 && malformedSvg.json?.success !== true);

        const corrupt = makeCorruptPayloads();
        const badMagic = await wpClient.uploadAsset({
          sha256: '',
          mime: 'image/webp',
          base64: corrupt.aviAsWebp.toString('base64'),
          name: `[F2E-E2E ${runId}] BadRIFF`,
        });
        assert.ok(badMagic.status >= 400 && badMagic.json?.success !== true);
      },
    },

    {
      id: 'F5-T2-05',
      tier: 2,
      feature: 'F5',
      name: 'Batch asset upload (/assets/batch 4 mixed assets + partial failure errors[])',
      async run({ wpClient, ledger, runId }) {
        const png = makePng(128, 128, { nonce: `${runId}-b-png` });
        const jpg = makeJpeg(128, 128, { nonce: `${runId}-b-jpg` });
        const webp = makeWebpVP8L(128, 128, { nonce: `${runId}-b-webp` });
        const svg = Buffer.from(makeValidSvg({ width: 40, height: 40, nonce: `${runId}-b-svg` }), 'utf8');

        const items = [
          { sha256: sha256Hex(png), mime: 'image/png', base64: png.toString('base64'), name: `[F2E-E2E ${runId}] Batch PNG` },
          { sha256: sha256Hex(jpg), mime: 'image/jpeg', base64: jpg.toString('base64'), name: `[F2E-E2E ${runId}] Batch JPG` },
          { sha256: sha256Hex(webp), mime: 'image/webp', base64: webp.toString('base64'), name: `[F2E-E2E ${runId}] Batch WEBP` },
          { sha256: sha256Hex(svg), mime: 'image/svg+xml', base64: svg.toString('base64'), name: `[F2E-E2E ${runId}] Batch SVG` },
        ];
        const batchRes = await wpClient.uploadAssetsBatch({ assets: items, name: `[F2E-E2E ${runId}] Batch` });
        assert.equal(batchRes.status, 200);
        assert.equal(batchRes.json?.data?.count, 4);
        for (const it of items) {
          const entry = batchRes.json?.data?.attachmentMap?.[it.sha256];
          assert.ok(entry && entry.id > 0 && entry.url, `Batch missing attachmentMap entry for ${it.mime}`);
          recordCreatedAttachment(ledger, entry.id, entry.reused);
          const getRes = await wpClient.fetchUrl(wpClient.toTargetOriginUrl(entry.url));
          assert.equal(getRes.status, 200);
        }

        // Partial failure surfacing in errors[]
        const goodPng = makePng(64, 64, { nonce: `${runId}-b-good` });
        const badBytes = makeCorruptPayloads().htmlAsPng;
        const partialRes = await wpClient.uploadAssetsBatch({
          assets: [
            { sha256: sha256Hex(goodPng), mime: 'image/png', base64: goodPng.toString('base64'), name: `[F2E-E2E ${runId}] Batch Good` },
            { sha256: sha256Hex(badBytes), mime: 'image/png', base64: badBytes.toString('base64'), name: `[F2E-E2E ${runId}] Batch Corrupt` },
          ],
        });
        assert.equal(partialRes.status, 200);
        const goodEntry = partialRes.json?.data?.attachmentMap?.[sha256Hex(goodPng)];
        if (goodEntry?.id) recordCreatedAttachment(ledger, goodEntry.id, goodEntry.reused);
        assert.ok(goodEntry && goodEntry.id > 0);
        assert.equal(partialRes.json?.data?.attachmentMap?.[sha256Hex(badBytes)], undefined);
        assert.ok(Array.isArray(partialRes.json?.data?.errors) && partialRes.json.data.errors.length >= 1, 'Batch partial failure must surface errors[]');
      },
    },

    {
      id: 'F5-T2-06',
      tier: 2,
      feature: 'F5',
      name: 'Global Design System sync + lossless Active Kit restore',
      async run({ env, wpClient, ledger, runId }) {
        const colorName = `[F2E-E2E ${runId}] Accent`;
        const typoName = `[F2E-E2E ${runId}] Display`;

        try {
          const res = await wpClient.syncDesignSystem({
            colors: [{ name: colorName, value: '#1B4D3E', role: 'accent' }],
            typography: [{ name: typoName, fontFamily: 'Inter', fontWeight: '700', fontSize: 36, role: 'h1' }],
            settings: { layout: { containerWidth: 1240 } },
          });
          assert.equal(res.status, 200);
          assert.equal(res.json?.success, true);
          assert.equal(Number(res.json?.data?.kitId), Number(ledger.kitId));

          const kitMeta = wpJson(env, 'post', 'meta', 'get', String(ledger.kitId), '_elementor_page_settings', '--format=json');
          assert.ok(kitMeta.custom_colors?.some((c) => c.title === colorName), 'Kit custom_colors must contain synced color');
          assert.ok(kitMeta.custom_typography?.some((t) => t.title === typoName), 'Kit custom_typography must contain synced typo');
        } finally {
          const restored = restoreActiveKit(env, ledger.kitId, ledger.kitSnapshotB64);
          assert.equal(restored.verified, true, 'Active Kit snapshot restore must match byte-for-byte');
        }
      },
    },

    {
      id: 'F5-T2-07',
      tier: 2,
      feature: 'F5',
      name: 'v3 Live Push /import + full hydration + published frontend GET /?p=<id> HTTP 200',
      async run({ env, wpClient, ledger, runId }) {
        const pngUri = bufferToDataUri(makePng(160, 160, { nonce: `${runId}-v3-png` }), 'image/png');
        const webpUri = bufferToDataUri(makeWebpVP8L(160, 160, { nonce: `${runId}-v3-webp` }), 'image/webp');
        const bgUri = bufferToDataUri(makeJpeg(160, 160, { nonce: `${runId}-v3-bg` }), 'image/jpeg');
        const svgB64 = svgToBase64Uri(makeValidSvg({ width: 32, height: 32, nonce: `${runId}-v3-svg` }));
        const galUri = bufferToDataUri(makePng(160, 160, { nonce: `${runId}-v3-gal` }), 'image/png');
        const carUri = bufferToDataUri(makeJpeg(160, 160, { nonce: `${runId}-v3-car` }), 'image/jpeg');
        const marker = `E2E-V3-LIVE-${runId}`;

        const importRes = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] v3 Full Hydration`,
          postStatus: 'publish',
          content: [
            {
              id: 'v3root1',
              elType: 'container',
              settings: {
                _f2e_node_id: 'n-v3root',
                background_background: 'classic',
                background_image: { id: '', url: bgUri },
              },
              elements: [
                { id: 'v3h1', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'n-v3h1', title: marker }, elements: [] },
                { id: 'v3img1', elType: 'widget', widgetType: 'image', settings: { _f2e_node_id: 'n-v3img1', image: { id: '', url: pngUri } }, elements: [] },
                { id: 'v3ibox', elType: 'widget', widgetType: 'image-box', settings: { _f2e_node_id: 'n-v3ibox', title_text: 'Suite', image: { id: '', url: webpUri } }, elements: [] },
                { id: 'v3icb', elType: 'widget', widgetType: 'icon-box', settings: { _f2e_node_id: 'n-v3icb', title_text: 'Icon', selected_icon: { library: 'svg', value: svgB64 } }, elements: [] },
                { id: 'v3car', elType: 'widget', widgetType: 'image-carousel', settings: { _f2e_node_id: 'n-v3car', carousel: [{ id: '', url: carUri }] }, elements: [] },
                { id: 'v3gal', elType: 'widget', widgetType: 'image-gallery', settings: { _f2e_node_id: 'n-v3gal', wp_gallery: [{ id: '', url: galUri }] }, elements: [] },
              ],
            },
          ],
        });
        assert.equal(importRes.status, 200, `v3 import failed: ${importRes.text}`);
        const postId = importRes.json.data.postId;
        recordCreatedPost(ledger, postId);

        await verifyImportedDocument(env, wpClient, postId, {
          expectedVersion: 'v3',
          expectPublished: true,
          expectedText: marker,
          ledger,
          minMediaRefs: 6,
        });
      },
    },

    {
      id: 'F5-T2-08',
      tier: 2,
      feature: 'F5',
      name: 'v4 Atomic /import hydration (e-flexbox, e-heading, e-image, e-svg)',
      async run({ env, wpClient, ledger, runId }) {
        const pngUri = bufferToDataUri(makePng(120, 120, { nonce: `${runId}-v4-png` }), 'image/png');
        const svgUri = svgToUtf8Uri(makeValidSvg({ width: 32, height: 32, nonce: `${runId}-v4-svg` }));

        const importRes = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] v4 Hydration`,
          elementorVersion: 'v4',
          postStatus: 'draft',
          content: [
            {
              id: 'v4f1',
              elType: 'e-flexbox',
              widgetType: 'e-flexbox',
              settings: { _f2e_node_id: 'n-v4f1', classes: { $$type: 'classes', value: ['e-root'] } },
              styles: { 'e-root': { id: 'e-root', label: 'local', type: 'class', variants: [] } },
              elements: [
                {
                  id: 'v4h1',
                  elType: 'widget',
                  widgetType: 'e-heading',
                  settings: { _f2e_node_id: 'n-v4h1', classes: { $$type: 'classes', value: ['e-h'] }, title: { $$type: 'string', value: 'Atomic Heading' } },
                  styles: { 'e-h': { id: 'e-h', label: 'local', type: 'class', variants: [] } },
                  elements: [],
                },
                {
                  id: 'v4i1',
                  elType: 'widget',
                  widgetType: 'e-image',
                  settings: { _f2e_node_id: 'n-v4i1', classes: { $$type: 'classes', value: ['e-i'] }, image: { $$type: 'image', value: { id: 0, url: pngUri } } },
                  styles: { 'e-i': { id: 'e-i', label: 'local', type: 'class', variants: [] } },
                  elements: [],
                },
                {
                  id: 'v4s1',
                  elType: 'widget',
                  widgetType: 'e-svg',
                  settings: { _f2e_node_id: 'n-v4s1', classes: { $$type: 'classes', value: ['e-s'] }, image: { $$type: 'image', value: { id: 0, url: svgUri } } },
                  styles: { 'e-s': { id: 'e-s', label: 'local', type: 'class', variants: [] } },
                  elements: [],
                },
              ],
            },
          ],
        });
        assert.equal(importRes.status, 200, `v4 import failed: ${importRes.text}`);
        const postId = importRes.json.data.postId;
        recordCreatedPost(ledger, postId);

        await verifyImportedDocument(env, wpClient, postId, {
          expectedVersion: 'v4',
          ledger,
          minMediaRefs: 2,
        });
      },
    },

    {
      id: 'F5-T2-09',
      tier: 2,
      feature: 'F5',
      name: '.f2e.json bundle import & server IR fallback',
      async run({ env, wpClient, ledger, runId }) {
        const api = await importPluginApi();
        const png = makePng(120, 120, { nonce: `${runId}-f5t209` });
        const root = createMockFrameNode({
          id: 'bnd-root',
          name: `[F2E-E2E ${runId}] Bundle Import`,
          children: [
            createMockTextNode({ id: 'bnd-h', characters: 'Bundle Headline', fontSize: 36 }),
            createMockImageNode({ id: 'bnd-i', name: 'Bundle Photo', imageBytes: png }),
          ],
        });
        const { document, assetPayloads } = await api.extractDesignSelection([root], { fileKey: `b-${runId}` });
        const v3 = api.compileElementorV3(document);

        // Path 1: Bundle with elementorV3.content + assets[] + empty attachmentMap
        const bundleRes = await wpClient.importDocument({
          kind: 'f2e.bundle',
          version: '1.0.0',
          title: `[F2E-E2E ${runId}] Bundle v3`,
          document,
          assets: assetPayloads,
          elementorV3: v3,
        });
        assert.equal(bundleRes.status, 200, `Bundle import failed: ${bundleRes.text}`);
        recordCreatedPost(ledger, bundleRes.json.data.postId);
        await verifyImportedDocument(env, wpClient, bundleRes.json.data.postId, { ledger, minMediaRefs: 1 });

        // Path 2: IR-only fallback (no elementorV3 / content)
        const irRes = await wpClient.importDocument({
          kind: 'f2e.bundle',
          version: '1.0.0',
          title: `[F2E-E2E ${runId}] Bundle IR Fallback`,
          document,
          assets: assetPayloads,
        });
        assert.equal(irRes.status, 200, `IR fallback import failed: ${irRes.text}`);
        recordCreatedPost(ledger, irRes.json.data.postId);
        await verifyImportedDocument(env, wpClient, irRes.json.data.postId, { ledger, minMediaRefs: 1 });
      },
    },

    {
      id: 'F5-T2-10',
      tier: 2,
      feature: 'F5',
      name: 'Import modes (resync / append / replace) & missing targetPostId',
      async run({ env, wpClient, ledger, runId }) {
        // Create initial page
        const initRes = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] Modes Test`,
          postStatus: 'draft',
          content: [
            { id: 'elemA1', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'e2e-n1', title: 'Initial Title' }, elements: [] },
          ],
        });
        assert.equal(initRes.status, 200);
        const postId = initRes.json.data.postId;
        recordCreatedPost(ledger, postId);

        // Inject custom_css & manual WP widget into _elementor_data via WP-CLI
        const curTree = JSON.parse(wp(env, 'post', 'meta', 'get', String(postId), '_elementor_data'));
        curTree[0].settings.custom_css = '/* keep */';
        curTree.push({ id: 'manualW1', elType: 'widget', widgetType: 'text-editor', settings: { editor: '<p>Manual WP Widget</p>' }, elements: [] });
        wp(env, 'post', 'meta', 'update', String(postId), '_elementor_data', JSON.stringify(curTree));

        // 1. resync
        const resyncRes = await wpClient.importDocument({
          targetPostId: postId,
          importMode: 'resync',
          content: [
            { id: 'newTempId', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'e2e-n1', title: 'Updated Title' }, elements: [] },
          ],
        });
        assert.equal(resyncRes.status, 200);
        const afterResync = JSON.parse(wp(env, 'post', 'meta', 'get', String(postId), '_elementor_data'));
        assert.equal(afterResync[0].id, 'elemA1', 'resync must preserve existing Elementor element id');
        assert.equal(afterResync[0].settings.title, 'Updated Title');
        assert.equal(afterResync[0].settings.custom_css, '/* keep */', 'resync must preserve custom_css');
        assert.ok(afterResync.some((el) => el.id === 'manualW1'), 'resync must preserve manual WP widgets');

        // 2. append
        const appendRes = await wpClient.importDocument({
          targetPostId: postId,
          importMode: 'append',
          content: [{ id: 'app1', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'e2e-n2', title: 'Appended' }, elements: [] }],
        });
        assert.equal(appendRes.status, 200);
        assert.equal(appendRes.json.data.elementCount, 3);

        // 3. replace
        const replaceRes = await wpClient.importDocument({
          targetPostId: postId,
          importMode: 'replace',
          content: [{ id: 'rep1', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'e2e-n3', title: 'Replaced' }, elements: [] }],
        });
        assert.equal(replaceRes.status, 200);
        assert.equal(replaceRes.json.data.elementCount, 1);

        // 4. missing targetPostId must fail cleanly
        const beforeCount = wp(env, 'post', 'list', '--post_type=page', '--post_status=any', '--format=count');
        const missingRes = await wpClient.importDocument({
          targetPostId: 99999999,
          title: `[F2E-E2E ${runId}] Should Fail`,
          content: [{ id: 'm1', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'm1', title: 'X' }, elements: [] }],
        });
        assert.ok(missingRes.status >= 400 && missingRes.json?.success !== true, `Missing targetPostId must fail, got ${missingRes.status}`);
        const afterCount = wp(env, 'post', 'list', '--post_type=page', '--post_status=any', '--format=count');
        assert.equal(afterCount, beforeCount, 'Missing targetPostId must not create a new post');
      },
    },
  ];
}
