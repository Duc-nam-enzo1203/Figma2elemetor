import assert from 'node:assert/strict';
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
  makeOversizedPng,
  makeCorruptPayloads,
  makeValidSvg,
  makeMaliciousSvgs,
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
import { wp } from '../lib/localwp.mjs';

export function getTier3Tests() {
  return [
    // T3-01: F1 x F2 — Composite-BG Isolation + Multi-Format Raster/SVG Export
    {
      id: 'T3-01',
      tier: 3,
      feature: 'F1,F2',
      name: 'F1 x F2: Composite-BG isolation + multi-format raster/SVG export',
      async run({ runId }) {
        const api = await importPluginApi();
        const bgPng = makePng(400, 400, { nonce: `${runId}-t301-bg` });
        const photoWebp = makeWebpVP8L(400, 400, { nonce: `${runId}-t301-webp` });
        const svg = makeValidSvg({ width: 32, height: 32, nonce: `${runId}-t301-svg` });

        const fgHeading = createMockTextNode({ id: 't31-h', characters: 'Hero Title', fontSize: 44 });
        const fgCta = createMockFrameNode({ id: 't31-cta', name: 'CTA [btn]', children: [createMockTextNode({ id: 't31-bt', characters: 'Go' })] });

        const hero = createMockFrameNode({
          id: 't31-hero',
          name: 'Hero',
          layoutMode: 'NONE',
          width: 1440,
          height: 600,
          exportAsync: async () => new Uint8Array(bgPng),
          children: [
            createMockImageNode({ id: 't31-bg', name: 'bg', imageBytes: bgPng }),
            createMockFrameNode({ id: 't31-ov', name: 'Overlay', fills: [solidFill('#000000', 0.35)] }),
            fgHeading,
            fgCta,
          ],
        });
        const iconBox = createMockFrameNode({
          id: 't31-icb',
          name: 'Icon Card',
          pluginData: { 'f2e-widget': 'icon-box' },
          children: [
            createMockVectorNode({ id: 't31-ic', width: 32, height: 32, svgMarkup: svg }),
            createMockTextNode({ id: 't31-ict', characters: 'Vector Icon' }),
            createMockTextNode({ id: 't31-icd', characters: 'Vector description' }),
          ],
        });
        const webpPhoto = createMockImageNode({ id: 't31-wp', name: 'Photo', width: 2400, height: 1200, imageBytes: photoWebp });

        const root = createMockFrameNode({ id: 't31-root', children: [hero, iconBox, webpPhoto] });
        const { document, assetPayloads } = await api.extractDesignSelection([root], { fileKey: 't301', imageFormat: 'PNG' });

        assert.equal(fgHeading.visible, true);
        assert.equal(fgCta.visible, true);
        assert.ok(assetPayloads.some((a) => a.kind === 'svg' && a.mime === 'image/svg+xml'));
        assert.ok(assetPayloads.some((a) => a.kind === 'image' && a.mime === 'image/png'));
        assert.ok(document.nodes['f2e:t301:t31-hero'].style.backgroundImage);
      },
    },

    // T3-02: F1 x F3 — Dev Mode CSS + Virtual Auto-Layout + Pro/Nested Compilation
    {
      id: 'T3-02',
      tier: 3,
      feature: 'F1,F3',
      name: 'F1 x F3: Dev Mode CSS + Virtual Auto-Layout + Pro/Nested compilation',
      async run() {
        const api = await importPluginApi();
        const root = createMockFrameNode({
          id: 't32-root',
          name: 'Page',
          layoutMode: 'NONE',
          width: 1200,
          height: 900,
          children: [
            createMockFrameNode({
              id: 't32-c1',
              name: 'Card 1',
              x: 0,
              y: 0,
              width: 380,
              height: 180,
              css: { 'border-radius': '16px', background: 'linear-gradient(90deg, #16A34A, #0F172A)' },
              children: [createMockTextNode({ id: 't32-c1t', characters: 'Card 1', color: '#FFFFFF' })],
            }),
            createMockFrameNode({
              id: 't32-c2',
              name: 'Card 2',
              x: 400,
              y: 0,
              width: 380,
              height: 180,
              css: { 'border-radius': '16px' },
              children: [createMockTextNode({ id: 't32-c2t', characters: 'Card 2' })],
            }),
            createMockFrameNode({
              id: 't32-cnt',
              name: 'Stat [counter]',
              x: 0,
              y: 220,
              children: [
                createMockTextNode({
                  id: 't32-cn',
                  characters: '08',
                  fontSize: 48,
                  css: { background: 'linear-gradient(180deg, #16A34A, #22C55E)', '-webkit-background-clip': 'text' },
                }),
                createMockTextNode({ id: 't32-cl', characters: 'Years' }),
              ],
            }),
            createMockFrameNode({
              id: 't32-acc',
              name: 'FAQ',
              x: 0,
              y: 340,
              pluginData: { 'f2e-widget': 'nested-accordion' },
              children: [
                createMockFrameNode({ id: 't32-aq1', children: [createMockTextNode({ id: 't32-q1', characters: 'Q1?' }), createMockTextNode({ id: 't32-a1', characters: 'A1.' })] }),
              ],
            }),
            createMockFrameNode({
              id: 't32-frm',
              name: 'Form',
              x: 0,
              y: 520,
              pluginData: { 'f2e-widget': 'form' },
              children: [
                createMockFrameNode({ id: 't32-f1', children: [createMockTextNode({ id: 't32-fl1', characters: 'Email *' })] }),
              ],
            }),
          ],
        });

        const { document } = await api.extractDesignSelection([root], { fileKey: 't302' });
        const v3 = api.compileElementorV3(document);
        const check = api.validateElementorV3Tree(v3.content);
        assert.equal(check.valid, true, `Schema errors: ${JSON.stringify(check.errors)}`);

        const findByWidget = (els, wt) => {
          for (const el of els) {
            if (el.widgetType === wt) return el;
            if (Array.isArray(el.elements)) {
              const f = findByWidget(el.elements, wt);
              if (f) return f;
            }
          }
          return null;
        };
        const counter = findByWidget(v3.content, 'counter');
        assert.ok(counter && counter.settings.prefix === '0' && counter.settings.ending_number === 8);
        assert.ok(findByWidget(v3.content, 'nested-accordion'));
        assert.ok(findByWidget(v3.content, 'form'));
      },
    },

    // T3-03: F1 x F4 — Responsive Multi-Frame Extraction -> .f2e.json Bundle & Clipboard
    {
      id: 'T3-03',
      tier: 3,
      feature: 'F1,F4',
      name: 'F1 x F4: Responsive multi-frame extraction -> .f2e.json bundle & clipboard',
      async run() {
        const api = await importPluginApi();
        const mkPage = (pad, dir, fs) => createMockFrameNode({
          id: `rp-${pad}`,
          name: 'Responsive Hero',
          layoutMode: dir,
          paddingTop: pad,
          paddingBottom: pad,
          children: [createMockTextNode({ id: `rt-${pad}`, name: 'Title', characters: 'Responsive Heading', fontSize: fs })],
        });
        const desktop = mkPage(80, 'HORIZONTAL', 48);
        const tablet = mkPage(48, 'HORIZONTAL', 36);
        const mobile = mkPage(24, 'VERTICAL', 28);

        const { document, assetPayloads } = await api.extractDesignSelection([desktop], {
          fileKey: 't303',
          responsiveFrames: { tablet, mobile },
        });
        const clipboard = api.compileElementorClipboard(document);
        const v3 = api.compileElementorV3(document);
        const v4 = api.compileElementorV4(document);

        assert.equal(clipboard.type, 'elementor');
        assert.equal(clipboard.elements[0].settings.padding_mobile?.top, '24');
        assert.equal(clipboard.elements[0].settings.flex_direction_mobile, 'column');
        assert.ok(!JSON.stringify(clipboard).includes('undefined'));
        assert.equal(api.validateElementorV3Tree(v3.content).valid, true);
        assert.equal(api.validateElementorV4Tree(v4.content).valid, true);
        assert.ok(Array.isArray(assetPayloads));
      },
    },

    // T3-04: F1 x F5 — Design System Extraction -> /design-system Active Kit Sync + __globals__ Binding
    {
      id: 'T3-04',
      tier: 3,
      feature: 'F1,F5',
      name: 'F1 x F5: Design System extraction -> /design-system Active Kit sync + __globals__ binding',
      async run({ env, wpClient, ledger, runId }) {
        const api = await importPluginApi();
        const primaryColor = '#1B4D3E';
        const colorName = `[F2E-E2E ${runId}] Canopy Brand`;
        const typoName = `[F2E-E2E ${runId}] Canopy Display`;

        const figmaApi = createMockFigmaApi({
          colorVariables: [
            { id: 'v1', name: colorName, variableCollectionId: 'col-1', valuesByMode: { 'mode-1': hexToFigmaRgb(primaryColor) } },
          ],
          textStyles: [
            { id: 'ts1', name: `H1 ${typoName}`, fontSize: 44, fontName: { family: 'Inter', style: 'Bold' }, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PIXELS', value: 0 } },
          ],
        });

        try {
          const ds = await api.extractLocalDesignSystem(figmaApi);
          const syncRes = await wpClient.syncDesignSystem(ds);
          assert.equal(syncRes.status, 200);
          assert.ok(Number(syncRes.json?.data?.kitId) > 0);

          const root = createMockFrameNode({
            id: 't34-root',
            name: 'Branded Page',
            children: [
              createMockTextNode({
                id: 't34-h',
                characters: 'Branded Headline',
                fontSize: 44,
                fontFamily: 'Inter',
                fontStyle: 'Bold',
                color: primaryColor,
              }),
            ],
          });
          const { document } = await api.extractDesignSelection([root], { fileKey: `t304-${runId}`, designTokens: ds });
          const v3 = api.compileElementorV3(document);
          const importRes = await wpClient.importDocument({
            title: `[F2E-E2E ${runId}] Globals Bound`,
            postStatus: 'draft',
            content: v3.content,
          });
          assert.equal(importRes.status, 200);
          const postId = importRes.json.data.postId;
          recordCreatedPost(ledger, postId);

          const saved = JSON.parse(wp(env, 'post', 'meta', 'get', String(postId), '_elementor_data'));
          const headingEl = saved[0].elements[0];
          const globals = headingEl.settings.__globals__ || {};
          const boundColor = String(globals.title_color || '');
          assert.ok(boundColor.startsWith('globals/colors?id='), `Expected verified bound global color, got "${boundColor}"`);
          assert.ok(!boundColor.endsWith('=primary') && !boundColor.endsWith('=848461d'), 'Must bind real Kit global ID, not bogus default');
        } finally {
          const restored = restoreActiveKit(env, ledger.kitId, ledger.kitSnapshotB64);
          assert.equal(restored.verified, true, 'Active Kit must restore after T3-04');
        }
      },
    },

    // T3-05: F2 x F3 — Mixed Image Formats (PNG, JPEG, WebP, SVG <=64px vs >64px) -> v3 & v4 Widgets
    {
      id: 'T3-05',
      tier: 3,
      feature: 'F2,F3',
      name: 'F2 x F3: Mixed image formats (PNG, JPEG, WebP, SVG <=64px vs >64px) -> v3 & v4 widgets',
      async run({ runId }) {
        const api = await importPluginApi();
        const smallSvg = makeValidSvg({ width: 32, height: 32, nonce: `${runId}-sm-svg` });
        const bigSvg = makeValidSvg({ width: 120, height: 64, nonce: `${runId}-lg-svg` });
        const png = makePng(120, 120, { nonce: `${runId}-t305-png` });
        const jpg = makeJpeg(120, 120, { nonce: `${runId}-t305-jpg` });

        const root = createMockFrameNode({
          id: 't35-root',
          children: [
            createMockVectorNode({ id: 't35-sm', name: 'Small Icon', width: 32, height: 32, svgMarkup: smallSvg }),
            createMockVectorNode({ id: 't35-lg', name: 'Large Logo', width: 120, height: 64, svgMarkup: bigSvg }),
            createMockFrameNode({
              id: 't35-gal',
              name: 'Gallery',
              pluginData: { 'f2e-widget': 'image-gallery' },
              children: [createMockImageNode({ id: 't35-g1', imageBytes: png }), createMockImageNode({ id: 't35-g2', imageBytes: jpg })],
            }),
            createMockFrameNode({
              id: 't35-car',
              name: 'Carousel',
              pluginData: { 'f2e-widget': 'image-carousel' },
              children: [createMockImageNode({ id: 't35-c1', imageBytes: png }), createMockImageNode({ id: 't35-c2', imageBytes: jpg })],
            }),
            createMockImageNode({ id: 't35-im', name: 'Standalone Photo', imageBytes: png }),
          ],
        });

        const { document, assetPayloads } = await api.extractDesignSelection([root], { fileKey: 't305' });
        const attachmentMap = {};
        assetPayloads.forEach((a, idx) => {
          attachmentMap[a.sha256] = {
            id: 700 + idx,
            url: `https://thecanopyresident.local/wp-content/uploads/t305-${idx}.${a.kind === 'svg' ? 'svg' : 'png'}`,
          };
        });

        const v3 = api.compileElementorV3(document, { attachmentMap });
        const els = v3.content[0].elements;
        assert.equal(els[0].widgetType, 'icon', '<=64px uploaded SVG should compile to icon');
        assert.equal(els[0].settings.selected_icon?.library, 'svg');
        assert.equal(els[1].widgetType, 'html', '>64px SVG should compile to html wrapper');
        assert.equal(els[2].widgetType, 'image-gallery');
        assert.equal(els[2].settings.wp_gallery.length, 2);
        assert.equal(els[3].widgetType, 'image-carousel');
        assert.equal(els[3].settings.carousel.length, 2);

        const v4 = api.compileElementorV4(document, { attachmentMap });
        assert.equal(api.validateElementorV4Tree(v4.content).valid, true);
        const v4Types = v4.content[0].elements.map((e) => e.widgetType);
        assert.ok(v4Types.includes('e-svg') && v4Types.includes('e-image'));
      },
    },

    // T3-06: F2 x F4 — XSS-Tainted SVG & Dual SVG Data-URI Encoding -> Clipboard & Bundle Hydration (Live WP)
    {
      id: 'T3-06',
      tier: 3,
      feature: 'F2,F4',
      name: 'F2 x F4: XSS SVG (;base64, & ;utf8,) -> clipboard editor-bridge.js & .f2e.json hydration (live WP)',
      async run({ env, wpClient, token, ledger, runId }) {
        const xss = makeMaliciousSvgs(`${runId}-t306`).cssImportAndForeignObject;

        // 1. Clipboard via editor-bridge.js
        const harness = createEditorBridgeHarness({
          restUrl: `${wpClient.baseUrl}/wp-json/f2e-bridge/v1`,
          token,
        });
        const clipJson = JSON.stringify({
          type: 'elementor',
          elements: [
            {
              id: 't36c',
              elType: 'container',
              settings: { _f2e_node_id: 'n-t36c', _title: `[F2E-E2E ${runId}] T3-06 Clip` },
              elements: [
                { id: 't36-u', elType: 'widget', widgetType: 'theme-site-logo', settings: { _f2e_node_id: 'n-t36u', _title: `[F2E-E2E ${runId}] T3-06 UTF8`, custom_image: { id: '', url: svgToUtf8Uri(xss) } }, elements: [] },
                { id: 't36-b', elType: 'widget', widgetType: 'image', settings: { _f2e_node_id: 'n-t36b', _title: `[F2E-E2E ${runId}] T3-06 B64`, image: { id: '', url: svgToBase64Uri(xss) } }, elements: [] },
              ],
            },
          ],
        });
        const pasteRes = await harness.dispatchPaste(clipJson);
        for (const req of pasteRes.uploadRequests) {
          if (req.responseJson?.data?.id) recordCreatedAttachment(ledger, req.responseJson.data.id, req.responseJson.data.reused);
        }
        const pastedEls = pasteRes.createdCalls[0].args.model.elements;
        assert.ok(pastedEls[0].settings.custom_image.id > 0);
        assert.ok(pastedEls[1].settings.image.id > 0);
        for (const u of [pastedEls[0].settings.custom_image.url, pastedEls[1].settings.image.url]) {
          const g = await wpClient.fetchUrl(wpClient.toTargetOriginUrl(u));
          assert.equal(g.status, 200);
          assert.ok(!g.text.toLowerCase().includes('<foreignobject') && !g.text.toLowerCase().includes('@import') && !g.text.toLowerCase().includes('<animate'));
        }

        // 2. Bundle /import
        const bRes = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] T3-06 Bundle`,
          postStatus: 'draft',
          content: [
            { id: 'b36-1', elType: 'widget', widgetType: 'theme-site-logo', settings: { _f2e_node_id: 'n-b36-1', custom_image: { id: '', url: svgToUtf8Uri(xss) } }, elements: [] },
            { id: 'b36-2', elType: 'widget', widgetType: 'image', settings: { _f2e_node_id: 'n-b36-2', image: { id: '', url: svgToBase64Uri(xss) } }, elements: [] },
          ],
        });
        assert.equal(bRes.status, 200);
        recordCreatedPost(ledger, bRes.json.data.postId);
        await verifyImportedDocument(env, wpClient, bRes.json.data.postId, { ledger, minMediaRefs: 2 });
      },
    },

    // T3-07: F2 x F5 — Magic-Byte Spoofing / Oversized Rejection + SHA-256 Dedup & Trashed-Attachment Recovery
    {
      id: 'T3-07',
      tier: 3,
      feature: 'F2,F5',
      name: 'F2 x F5: Spoofing/oversized rejection + SHA-256 dedup & trashed-attachment recovery',
      async run({ env, wpClient, ledger, runId }) {
        const png = makePng(400, 400, { nonce: `${runId}-t307` });
        const sha = sha256Hex(png);

        const up1 = await wpClient.uploadAsset({
          sha256: sha,
          mime: 'image/png',
          kind: 'raster',
          base64: png.toString('base64'),
          name: `[F2E-E2E ${runId}] T3-07 Active`,
        });
        assert.equal(up1.status, 200);
        const id1 = up1.json.data.id;
        recordCreatedAttachment(ledger, id1, up1.json.data.reused);
        await verifyMediaAttachment(env, wpClient, id1, 'image/png', { expectedSha256: sha, expectThumbnails: true });

        // Dedup active hit
        const up2 = await wpClient.uploadAsset({
          sha256: sha,
          mime: 'image/png',
          kind: 'raster',
          base64: png.toString('base64'),
          name: `[F2E-E2E ${runId}] T3-07 Dedup`,
        });
        assert.equal(up2.json.data.reused, true);
        assert.equal(up2.json.data.id, id1);

        // Trash id1 and verify re-upload recovers with a brand-new active attachment
        wp(env, 'post', 'trash', String(id1));
        const up3 = await wpClient.uploadAsset({
          sha256: sha,
          mime: 'image/png',
          kind: 'raster',
          base64: png.toString('base64'),
          name: `[F2E-E2E ${runId}] T3-07 Recovered`,
        });
        assert.equal(up3.status, 200);
        assert.equal(up3.json.data.reused, false, 'Trashed attachment must not be reused');
        assert.notEqual(up3.json.data.id, id1);
        recordCreatedAttachment(ledger, up3.json.data.id, false);
        await verifyMediaAttachment(env, wpClient, up3.json.data.id, 'image/png', { expectedSha256: sha, expectThumbnails: true });

        // Spoofed PNG bytes claiming image/webp
        const spoof = await wpClient.uploadAsset({
          sha256: '',
          mime: 'image/webp',
          base64: makeCorruptPayloads().htmlAsPng.toString('base64'),
          name: `[F2E-E2E ${runId}] Spoof`,
        });
        assert.ok(spoof.status >= 400 && spoof.json?.success !== true);

        // >10 MB payload
        const oversized = await wpClient.uploadAsset({
          sha256: '',
          mime: 'image/png',
          base64: makeOversizedPng().toString('base64'),
          name: `[F2E-E2E ${runId}] Oversized`,
        });
        assert.ok(oversized.status >= 400 && oversized.json?.success !== true);
      },
    },

    // T3-08: F3 x F4 — Server Fallback Transpiler (TranspilerV3/V4) vs Client-Compiled Bundle Parity
    {
      id: 'T3-08',
      tier: 3,
      feature: 'F3,F4',
      name: 'F3 x F4: Server fallback transpiler (TranspilerV3/V4) vs client-compiled bundle parity',
      async run({ env, wpClient, ledger, runId }) {
        const api = await importPluginApi();
        const png = makePng(120, 120, { nonce: `${runId}-t308` });
        const root = createMockFrameNode({
          id: 't38-root',
          name: `[F2E-E2E ${runId}] Parity`,
          children: [
            createMockTextNode({ id: 't38-h', characters: 'Parity Heading', fontSize: 36 }),
            createMockImageNode({ id: 't38-i', imageBytes: png }),
          ],
        });
        const { document, assetPayloads } = await api.extractDesignSelection([root], { fileKey: `t308-${runId}` });
        const v3Client = api.compileElementorV3(document);

        // 1. Client-compiled bundle
        const resClient = await wpClient.importDocument({
          kind: 'f2e.bundle',
          version: '1.0.0',
          title: `[F2E-E2E ${runId}] Client Bundle`,
          document,
          assets: assetPayloads,
          elementorV3: v3Client,
        });
        assert.equal(resClient.status, 200);
        recordCreatedPost(ledger, resClient.json.data.postId);

        // 2. Server TranspilerV3 fallback (omitting elementorV3/content)
        const resServer = await wpClient.importDocument({
          kind: 'f2e.bundle',
          version: '1.0.0',
          title: `[F2E-E2E ${runId}] Server Transpiler`,
          document,
          assets: assetPayloads,
        });
        assert.equal(resServer.status, 200);
        recordCreatedPost(ledger, resServer.json.data.postId);

        const clientAudit = await verifyImportedDocument(env, wpClient, resClient.json.data.postId, { ledger, minMediaRefs: 1 });
        const serverAudit = await verifyImportedDocument(env, wpClient, resServer.json.data.postId, { ledger, minMediaRefs: 1 });

        const collectF2eIds = (els, out = new Set()) => {
          for (const e of els || []) {
            if (e.settings?._f2e_node_id) out.add(e.settings._f2e_node_id);
            collectF2eIds(e.elements, out);
          }
          return out;
        };
        const cIds = collectF2eIds(clientAudit.parsed);
        const sIds = collectF2eIds(serverAudit.parsed);
        for (const id of cIds) {
          assert.ok(sIds.has(id), `Server TranspilerV3 missing _f2e_node_id "${id}" present in client bundle`);
        }
      },
    },

    // T3-09: F3 x F5 — Target Types (page vs elementor_library header) & DocumentWriter Modes + Missing targetPostId
    {
      id: 'T3-09',
      tier: 3,
      feature: 'F3,F5',
      name: 'F3 x F5: Target types (page vs elementor_library header) & DocumentWriter modes',
      async run({ env, wpClient, ledger, runId }) {
        // 1. elementor_library header template
        const tplRes = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] Header Template`,
          targetType: 'elementor_library',
          templateType: 'header',
          postStatus: 'draft',
          content: [{ id: 'hdr1', elType: 'container', settings: { _f2e_node_id: 'n-hdr1' }, elements: [] }],
        });
        assert.equal(tplRes.status, 200);
        const tplId = tplRes.json.data.postId;
        recordCreatedPost(ledger, tplId);
        assert.equal(wp(env, 'post', 'get', String(tplId), '--field=post_type'), 'elementor_library');
        assert.equal(wp(env, 'post', 'meta', 'get', String(tplId), '_elementor_template_type'), 'header');

        // 2. page with append -> resync -> replace
        const pageRes = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] Modes Page`,
          targetType: 'page',
          postStatus: 'draft',
          content: [{ id: 'p1', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'n-p1', title: 'One' }, elements: [] }],
        });
        const pageId = pageRes.json.data.postId;
        recordCreatedPost(ledger, pageId);

        const appRes = await wpClient.importDocument({
          targetPostId: pageId,
          importMode: 'append',
          content: [{ id: 'p2', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'n-p2', title: 'Two' }, elements: [] }],
        });
        assert.equal(appRes.json.data.elementCount, 2);

        const resyncRes = await wpClient.importDocument({
          targetPostId: pageId,
          importMode: 'resync',
          content: [{ id: 'p1-new', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'n-p1', title: 'One Updated' }, elements: [] }],
        });
        assert.equal(resyncRes.status, 200);
        const treeAfterResync = JSON.parse(wp(env, 'post', 'meta', 'get', String(pageId), '_elementor_data'));
        assert.equal(treeAfterResync[0].id, 'p1');
        assert.equal(treeAfterResync[0].settings.title, 'One Updated');
        assert.equal(treeAfterResync.length, 2);

        const repRes = await wpClient.importDocument({
          targetPostId: pageId,
          importMode: 'replace',
          content: [{ id: 'p3', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'n-p3', title: 'Replaced' }, elements: [] }],
        });
        assert.equal(repRes.json.data.elementCount, 1);

        const missingRes = await wpClient.importDocument({
          targetPostId: 99999999,
          content: [{ id: 'mx', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: 'mx', title: 'Bad' }, elements: [] }],
        });
        assert.ok(missingRes.status >= 400 && missingRes.json?.success !== true);
      },
    },

    // T3-10: F4 x F5 — .f2e.json Batch Upload + attachmentMap Hydration vs Clipboard editor-bridge.js Live Dedup
    {
      id: 'T3-10',
      tier: 3,
      feature: 'F4,F5',
      name: 'F4 x F5: /assets/batch + /import attachmentMap vs clipboard editor-bridge.js live dedup',
      async run({ env, wpClient, token, ledger, runId }) {
        const png = makePng(160, 160, { nonce: `${runId}-t310-png` });
        const sha = sha256Hex(png);

        const batchRes = await wpClient.uploadAssetsBatch({
          assets: [{ sha256: sha, mime: 'image/png', base64: png.toString('base64'), name: `[F2E-E2E ${runId}] T3-10 Batch` }],
          name: `[F2E-E2E ${runId}] T3-10`,
        });
        assert.equal(batchRes.status, 200);
        assert.equal(batchRes.json.data.count, 1);
        const att = batchRes.json.data.attachmentMap[sha];
        assert.ok(att && att.id > 0);
        recordCreatedAttachment(ledger, att.id, att.reused);

        const impRes = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] T3-10 Import`,
          attachmentMap: batchRes.json.data.attachmentMap,
          content: [
            { id: 'im310', elType: 'widget', widgetType: 'image', settings: { _f2e_node_id: 'n-im310', image: att }, elements: [] },
          ],
        });
        assert.equal(impRes.status, 200);
        recordCreatedPost(ledger, impRes.json.data.postId);
        await verifyImportedDocument(env, wpClient, impRes.json.data.postId, { ledger, minMediaRefs: 1 });

        // Paste exact same PNG bytes via editor-bridge.js -> must get reused: true & exact same id/url
        const harness = createEditorBridgeHarness({
          restUrl: `${wpClient.baseUrl}/wp-json/f2e-bridge/v1`,
          token,
        });
        const pasteRes = await harness.dispatchPaste(JSON.stringify({
          type: 'elementor',
          elements: [
            { id: 'p310', elType: 'widget', widgetType: 'image', settings: { _f2e_node_id: 'n-p310', image: { id: '', url: bufferToDataUri(png, 'image/png') } }, elements: [] },
          ],
        }));
        assert.equal(pasteRes.uploadRequests.length, 1);
        assert.equal(pasteRes.uploadRequests[0].responseJson?.data?.reused, true);
        assert.equal(pasteRes.uploadRequests[0].responseJson?.data?.id, att.id);
      },
    },
  ];
}
