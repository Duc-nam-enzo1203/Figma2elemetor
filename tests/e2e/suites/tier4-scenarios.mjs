import assert from 'node:assert/strict';
import { importPluginApi, createMockFrameNode, createMockTextNode, createMockImageNode, createMockVectorNode } from '../lib/figma-mocks.mjs';
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
  hasGpsPinaFixture,
  loadGpsPinaSelection,
  loadAllGpsPinaPngAssets,
} from '../fixtures/gps-pina-adapter.mjs';
import { buildCanopyResidencesFixture } from '../fixtures/canopy-residences.mjs';
import {
  recordCreatedPost,
  recordCreatedAttachment,
  restoreActiveKit,
} from '../lib/cleanup.mjs';
import { verifyMediaAttachment, verifyImportedDocument } from '../lib/assertions.mjs';
import { wp } from '../lib/localwp.mjs';

export function getTier4Tests() {
  return [
    // T4-S1: GPS PINA (Copy) Real Multi-Section Landing Page Live Push
    {
      id: 'T4-S1',
      tier: 4,
      feature: 'F1,F2,F3,F5',
      name: 'GPS PINA (Copy) real multi-section landing page live push (13 PNGs + real SVGs)',
      async run({ env, wpClient, ledger, runId, skip }) {
        if (!hasGpsPinaFixture()) {
          skip('External gps-pina-copy--figelem directory not present');
          return;
        }
        const api = await importPluginApi();
        const { selection } = loadGpsPinaSelection();

        // 1. Extract curated 8-section representative slice (Header, Hero, Real Scenarios, Core Features, Device, Regulatory, FAQ, Footer)
        const { document, assetPayloads } = await api.extractDesignSelection(selection, {
          fileKey: `gps-pina-${runId}`,
          imageFormat: 'PNG',
        });
        assert.ok(assetPayloads.length >= 5, `Expected >= 5 extracted assets from GPS PINA slice, got ${assetPayloads.length}`);

        // 2. Also include all 13 real PNGs from assets/images/ to verify 100% of dump images
        const all13Pngs = loadAllGpsPinaPngAssets();
        assert.equal(all13Pngs.length, 13, 'Expected all 13 real PNG files in gps-pina-copy--figelem/assets/images/');

        const attachmentMap = {};
        const uploadBatch = [];

        for (const p of all13Pngs) {
          const sha = sha256Hex(p.bytes);
          uploadBatch.push({
            sha256: sha,
            mime: 'image/png',
            base64: p.bytes.toString('base64'),
            name: `[F2E-E2E ${runId}] GPS PINA ${p.fileName}`,
          });
        }
        for (const a of assetPayloads) {
          if (!uploadBatch.some((b) => b.sha256 === a.sha256)) {
            uploadBatch.push({
              sha256: a.sha256,
              mime: a.mime,
              base64: a.base64,
              name: `[F2E-E2E ${runId}] GPS PINA ${a.assetId}`,
            });
          }
        }

        // Upload in chunks of 40 (batch max is 50)
        for (let i = 0; i < uploadBatch.length; i += 40) {
          const chunk = uploadBatch.slice(i, i + 40);
          const batchRes = await wpClient.uploadAssetsBatch({
            assets: chunk,
            name: `[F2E-E2E ${runId}] GPS PINA Batch`,
          });
          assert.equal(batchRes.status, 200, `GPS PINA batch upload failed: ${batchRes.text}`);
          for (const [sha, entry] of Object.entries(batchRes.json?.data?.attachmentMap || {})) {
            attachmentMap[sha] = entry;
            recordCreatedAttachment(ledger, entry.id, entry.reused);
          }
        }

        // Verify every one of the 13 real PNGs is stored in Media Library with valid metadata & HTTP 200
        for (const p of all13Pngs) {
          const sha = sha256Hex(p.bytes);
          const entry = attachmentMap[sha];
          assert.ok(entry && entry.id > 0, `Missing Media Library entry for real PNG ${p.fileName}`);
          await verifyMediaAttachment(env, wpClient, entry.id, 'image/png', {
            expectedSha256: sha,
            expectThumbnails: false,
          });
        }

        // 3. Compile & Live Push to WordPress
        const v3 = api.compileElementorV3(document, { siteUrl: wpClient.baseUrl, attachmentMap });
        assert.equal(api.validateElementorV3Tree(v3.content).valid, true);

        const impRes = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] GPS PINA (Copy)`,
          postStatus: 'publish',
          pageLayout: 'elementor_canvas',
          content: v3.content,
          attachmentMap,
        });
        assert.equal(impRes.status, 200, `GPS PINA /import failed: ${impRes.text}`);
        const postId = impRes.json.data.postId;
        recordCreatedPost(ledger, postId);

        await verifyImportedDocument(env, wpClient, postId, {
          expectedVersion: 'v3',
          expectPublished: true,
          ledger,
          minMediaRefs: 4,
        });
      },
    },

    // T4-S2: The Canopy Residences Hospitality Landing Page + WebP + Gallery/Carousel + Pro + Design System
    {
      id: 'T4-S2',
      tier: 4,
      feature: 'F1,F2,F3,F5',
      name: 'The Canopy Residences landing page (WebP, PNG, JPEG, SVG, gallery, carousel, Pro, Design System)',
      async run({ env, wpClient, ledger, runId }) {
        const api = await importPluginApi();
        const prefix = `[F2E-E2E ${runId}]`;
        const fixture = buildCanopyResidencesFixture({ runId, prefix });

        try {
          // 1. Extract & sync Design System
          const ds = await api.extractLocalDesignSystem(fixture.figmaApi, fixture.selection);
          const dsRes = await wpClient.syncDesignSystem(ds);
          assert.equal(dsRes.status, 200, `Design system sync failed: ${dsRes.text}`);

          // 2. Extract selection & upload assets + standalone WebP asset
          const { document, assetPayloads } = await api.extractDesignSelection(fixture.selection, {
            fileKey: `canopy-${runId}`,
            designTokens: ds,
            imageFormat: 'PNG',
          });

          const uploadItems = [
            ...assetPayloads.map((a) => ({
              sha256: a.sha256,
              mime: a.mime,
              base64: a.base64,
              name: `${prefix} Canopy ${a.assetId}`,
            })),
            {
              sha256: fixture.webpAsset.sha256,
              mime: 'image/webp',
              base64: fixture.webpAsset.base64,
              name: `${prefix} Canopy WebP Photo`,
            },
          ];

          const batchRes = await wpClient.uploadAssetsBatch({ assets: uploadItems, name: `${prefix} Canopy` });
          assert.equal(batchRes.status, 200);
          const attachmentMap = batchRes.json.data.attachmentMap;
          for (const entry of Object.values(attachmentMap)) {
            recordCreatedAttachment(ledger, entry.id, entry.reused);
          }

          // Verify 400x400 WebP asset thumbnails & metadata
          const webpEntry = attachmentMap[fixture.webpAsset.sha256];
          assert.ok(webpEntry && webpEntry.id > 0);
          await verifyMediaAttachment(env, wpClient, webpEntry.id, 'image/webp', {
            expectedSha256: fixture.webpAsset.sha256,
            expectedWidth: 400,
            expectedHeight: 400,
            expectThumbnails: true,
          });

          // 3. Compile v3 + Live Push
          const v3 = api.compileElementorV3(document, { siteUrl: wpClient.baseUrl, attachmentMap });
          assert.equal(api.validateElementorV3Tree(v3.content).valid, true);

          const impRes = await wpClient.importDocument({
            title: `${prefix} The Canopy Residences`,
            postStatus: 'publish',
            pageLayout: 'elementor_canvas',
            content: v3.content,
            attachmentMap,
          });
          assert.equal(impRes.status, 200);
          const postId = impRes.json.data.postId;
          recordCreatedPost(ledger, postId);

          const verified = await verifyImportedDocument(env, wpClient, postId, {
            expectedVersion: 'v3',
            expectPublished: true,
            expectedText: 'The Canopy Residences',
            ledger,
            minMediaRefs: 6,
          });

          // Ensure wp_gallery[], carousel[], bg_image, and testimonial_image are hydrated
          const savedJson = JSON.stringify(verified.parsed);
          assert.ok(savedJson.includes('"wp_gallery"'));
          assert.ok(savedJson.includes('"carousel"'));
          assert.ok(savedJson.includes('"bg_image"'));
          assert.ok(savedJson.includes('"testimonial_image"'));
        } finally {
          const restored = restoreActiveKit(env, ledger.kitId, ledger.kitSnapshotB64);
          assert.equal(restored.verified, true, 'Active Kit must restore after T4-S2');
        }
      },
    },

    // T4-S3: Elementor v4 Atomic Page Conversion (Live Push + Inline URI Hydration)
    {
      id: 'T4-S3',
      tier: 4,
      feature: 'F1,F2,F3,F5',
      name: 'Elementor v4 Atomic page conversion (pre-uploaded + inline data URI hydration)',
      async run({ env, wpClient, ledger, runId }) {
        const api = await importPluginApi();
        const pngBytes = makePng(400, 400, { nonce: `${runId}-t4s3-png` });
        const svgStr = makeValidSvg({ width: 48, height: 48, nonce: `${runId}-t4s3-svg` });

        const desktop = createMockFrameNode({
          id: 'v4s3-root',
          name: `[F2E-E2E ${runId}] v4 Atomic Page`,
          layoutMode: 'VERTICAL',
          children: [
            createMockTextNode({ id: 'v4s3-h', characters: 'v4 Atomic Architecture', fontSize: 40 }),
            createMockTextNode({ id: 'v4s3-p', characters: 'Responsive flexbox layout with atomic widgets.', fontSize: 16 }),
            createMockFrameNode({ id: 'v4s3-b', name: 'CTA [btn]', children: [createMockTextNode({ id: 'v4s3-bt', characters: 'Get Started' })] }),
            createMockImageNode({ id: 'v4s3-i', name: 'Atomic Image', imageBytes: pngBytes }),
            createMockVectorNode({ id: 'v4s3-s', name: 'Atomic SVG', width: 48, height: 48, svgMarkup: svgStr }),
          ],
        });
        const tablet = createMockFrameNode({ id: 'v4s3-tab', name: `[F2E-E2E ${runId}] v4 Atomic Page`, paddingTop: 32, children: [] });
        const mobile = createMockFrameNode({ id: 'v4s3-mob', name: `[F2E-E2E ${runId}] v4 Atomic Page`, paddingTop: 16, children: [] });

        const { document, assetPayloads } = await api.extractDesignSelection([desktop], {
          fileKey: `v4-${runId}`,
          responsiveFrames: { tablet, mobile },
        });

        // Path 1: Pre-uploaded attachmentMap + compileElementorV4
        const batchRes = await wpClient.uploadAssetsBatch({
          assets: assetPayloads.map((a) => ({ sha256: a.sha256, mime: a.mime, base64: a.base64, name: `[F2E-E2E ${runId}] v4` })),
        });
        const attachmentMap = batchRes.json.data.attachmentMap;
        for (const entry of Object.values(attachmentMap)) {
          recordCreatedAttachment(ledger, entry.id, entry.reused);
        }

        const v4Compiled = api.compileElementorV4(document, { attachmentMap });
        const imp1 = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] v4 Pre-Uploaded`,
          elementorVersion: 'v4',
          postStatus: 'draft',
          content: v4Compiled.content,
          attachmentMap,
        });
        assert.equal(imp1.status, 200);
        recordCreatedPost(ledger, imp1.json.data.postId);
        await verifyImportedDocument(env, wpClient, imp1.json.data.postId, { expectedVersion: 'v4', ledger, minMediaRefs: 2 });

        // Path 2: Unhydrated v4 content with inline data:image/png;base64 & data:image/svg+xml;utf8
        const v4Inline = api.compileElementorV4(document);
        // Ensure e-svg carries inline utf8 SVG URI for server hydration test
        const svgEl = v4Inline.content[0].elements.find((e) => e.widgetType === 'e-svg');
        if (svgEl) {
          svgEl.settings.image = { $$type: 'image', value: { id: 0, url: svgToUtf8Uri(svgStr) } };
        }
        const imp2 = await wpClient.importDocument({
          title: `[F2E-E2E ${runId}] v4 Inline Hydration`,
          elementorVersion: 'v4',
          postStatus: 'draft',
          content: v4Inline.content,
        });
        assert.equal(imp2.status, 200);
        recordCreatedPost(ledger, imp2.json.data.postId);
        await verifyImportedDocument(env, wpClient, imp2.json.data.postId, { expectedVersion: 'v4', ledger, minMediaRefs: 2 });
      },
    },

    // T4-S4: .f2e.json Portable Bundle Offline Import + Incremental resync Preservation
    {
      id: 'T4-S4',
      tier: 4,
      feature: 'F2,F3,F4,F5',
      name: '.f2e.json portable bundle offline import + incremental resync preservation',
      async run({ env, wpClient, ledger, runId }) {
        const api = await importPluginApi();
        const imgV1 = makePng(400, 400, { nonce: `${runId}-t4s4-v1` });
        const imgV2 = makeJpeg(400, 400, { nonce: `${runId}-t4s4-v2` });

        const makeDoc = async (headingText, imgBytes, nodeSuffix) => {
          const root = createMockFrameNode({
            id: 's4-hero',
            name: 'Hero Section',
            children: [
              createMockTextNode({ id: 's4-h', name: 'Hero Heading', characters: headingText, fontSize: 40 }),
              createMockImageNode({ id: `s4-img-${nodeSuffix}`, name: 'Hero Image', imageBytes: imgBytes }),
            ],
          });
          const { document, assetPayloads } = await api.extractDesignSelection([root], { fileKey: `s4-${runId}` });
          const v3 = api.compileElementorV3(document);
          return { document, assetPayloads, v3 };
        };

        // Step 1: Import bundle v1 (no pre-calling /assets)
        const b1 = await makeDoc('Bundle v1 Headline', imgV1, '1');
        const res1 = await wpClient.importDocument({
          kind: 'f2e.bundle',
          version: '1.0.0',
          title: `[F2E-E2E ${runId}] Bundle Resync Page`,
          postStatus: 'draft',
          document: b1.document,
          assets: b1.assetPayloads,
          elementorV3: b1.v3,
        });
        assert.equal(res1.status, 200);
        const postId = res1.json.data.postId;
        recordCreatedPost(ledger, postId);
        const audit1 = await verifyImportedDocument(env, wpClient, postId, { ledger, minMediaRefs: 1 });
        const origContainerId = audit1.parsed[0].id;

        // Step 2: Simulate manual WordPress edit (custom_css + manual text-editor widget)
        const editedTree = JSON.parse(wp(env, 'post', 'meta', 'get', String(postId), '_elementor_data'));
        editedTree[0].settings.custom_css = 'selector { border: 2px solid #1B4D3E; }';
        editedTree.push({
          id: 'manual-wp-w1',
          elType: 'widget',
          widgetType: 'text-editor',
          settings: { editor: '<p>Manual WP Editor Note</p>' },
          elements: [],
        });
        wp(env, 'post', 'meta', 'update', String(postId), '_elementor_data', JSON.stringify(editedTree));

        // Step 3: Re-sync bundle v2 updating Hero image & heading
        const b2 = await makeDoc('Bundle v2 Updated Headline', imgV2, '2');
        const res2 = await wpClient.importDocument({
          kind: 'f2e.bundle',
          version: '1.0.0',
          targetPostId: postId,
          importMode: 'resync',
          document: b2.document,
          assets: b2.assetPayloads,
          elementorV3: b2.v3,
        });
        assert.equal(res2.status, 200);
        const audit2 = await verifyImportedDocument(env, wpClient, postId, { ledger, minMediaRefs: 1 });
        assert.equal(audit2.parsed[0].id, origContainerId, 'resync must preserve root Elementor container id');
        assert.equal(audit2.parsed[0].settings.custom_css, 'selector { border: 2px solid #1B4D3E; }', 'resync must preserve manual custom_css');
        assert.ok(audit2.parsed.some((el) => el.id === 'manual-wp-w1'), 'resync must preserve manually added WP widget');

        // Step 4: Verify SHA-256 reuse on repeat asset push
        const dupRes = await wpClient.uploadAsset({
          sha256: sha256Hex(imgV1),
          mime: 'image/png',
          base64: imgV1.toString('base64'),
          name: `[F2E-E2E ${runId}] Reuse Check`,
        });
        assert.equal(dupRes.status, 200);
        assert.equal(dupRes.json.data.reused, true, 'Repeat SHA-256 must return reused: true');
      },
    },

    // T4-S5: Elementor Editor Clipboard Paste (Ctrl+V + editor-bridge.js Live Hydration)
    {
      id: 'T4-S5',
      tier: 4,
      feature: 'F2,F3,F4,F5',
      name: 'Elementor Editor clipboard paste (Ctrl+V + editor-bridge.js live /assets hydration)',
      async run({ wpClient, token, ledger, runId }) {
        const prefix = `[F2E-E2E ${runId}]`;
        const pngUri = bufferToDataUri(makePng(160, 160, { nonce: `${runId}-s5-png` }), 'image/png');
        const jpgUri = bufferToDataUri(makeJpeg(160, 160, { nonce: `${runId}-s5-jpg` }), 'image/jpeg');
        const webpUri = bufferToDataUri(makeWebpVP8L(160, 160, { nonce: `${runId}-s5-webp` }), 'image/webp');
        const utf8SvgUri = svgToUtf8Uri(makeValidSvg({ width: 96, height: 36, nonce: `${runId}-s5-logo` }));
        const b64SvgUri = svgToBase64Uri(makeValidSvg({ width: 32, height: 32, nonce: `${runId}-s5-icon` }));

        const clipboardPayload = {
          type: 'elementor',
          siteurl: wpClient.baseUrl,
          elements: [
            {
              id: 's5-root',
              elType: 'container',
              settings: {
                _f2e_node_id: 'n-s5-root',
                _title: `${prefix} Clipboard Root`,
                background_image: { id: '', url: pngUri },
              },
              elements: [
                { id: 's5-img', elType: 'widget', widgetType: 'image', settings: { _f2e_node_id: 'n-s5-i', _title: `${prefix} Photo`, image: { id: '', url: jpgUri } }, elements: [] },
                { id: 's5-logo', elType: 'widget', widgetType: 'theme-site-logo', settings: { _f2e_node_id: 'n-s5-lg', _title: `${prefix} Logo`, custom_image: { id: '', url: utf8SvgUri } }, elements: [] },
                { id: 's5-icb', elType: 'widget', widgetType: 'icon-box', settings: { _f2e_node_id: 'n-s5-ic', _title: `${prefix} Icon`, selected_icon: { library: 'svg', value: { id: '', url: b64SvgUri } } }, elements: [] },
                { id: 's5-gal', elType: 'widget', widgetType: 'image-gallery', settings: { _f2e_node_id: 'n-s5-gal', _title: `${prefix} Gallery`, wp_gallery: [{ id: '', url: pngUri }, { id: '', url: webpUri }] }, elements: [] },
                { id: 's5-car', elType: 'widget', widgetType: 'image-carousel', settings: { _f2e_node_id: 'n-s5-car', _title: `${prefix} Carousel`, carousel: [{ id: '', url: jpgUri }, { id: '', url: webpUri }] }, elements: [] },
                { id: 's5-sld', elType: 'widget', widgetType: 'slides', settings: { _f2e_node_id: 'n-s5-sld', _title: `${prefix} Slides`, slides: [{ _id: 'sl1', background_image: { id: '', url: webpUri } }] }, elements: [] },
                { id: 's5-v4i', elType: 'widget', widgetType: 'e-image', settings: { _f2e_node_id: 'n-s5-v4i', _title: `${prefix} v4Img`, image: { $$type: 'image', value: { id: 0, url: pngUri } } }, elements: [] },
              ],
            },
          ],
        };

        const harness = createEditorBridgeHarness({
          restUrl: `${wpClient.baseUrl}/wp-json/f2e-bridge/v1`,
          token,
        });

        const text = JSON.stringify(clipboardPayload);
        const paste1 = await harness.dispatchPaste(text);
        for (const req of paste1.uploadRequests) {
          if (req.responseJson?.data?.id) {
            recordCreatedAttachment(ledger, req.responseJson.data.id, req.responseJson.data.reused);
          }
        }

        assert.equal(paste1.prevented, true);
        assert.equal(paste1.stopped, true, 'editor-bridge.js must call event.stopImmediatePropagation()');
        assert.equal(paste1.createdCalls.length, 1);
        // 5 distinct data URIs (png, jpg, webp, utf8 svg, b64 svg) even though used across 8 slots
        assert.equal(paste1.uploadRequests.length, 5, `Expected 5 deduplicated uploads via _uploadCache, got ${paste1.uploadRequests.length}`);

        const hydratedModel = paste1.createdCalls[0].args.model;
        assert.ok(!JSON.stringify(hydratedModel).includes('data:image/'), 'Zero data:image/ URIs may remain in hydrated clipboard model');

        // Verify all uploaded URLs return HTTP 200
        for (const req of paste1.uploadRequests) {
          assert.equal(req.status, 200);
          const url = wpClient.toTargetOriginUrl(req.responseJson.data.url);
          const getRes = await wpClient.fetchUrl(url);
          assert.equal(getRes.status, 200, `Uploaded clipboard asset ${url} returned ${getRes.status}`);
        }

        // Repeat paste must trigger zero new HTTP uploads (_uploadCache hit)
        const paste2 = await harness.dispatchPaste(text);
        assert.equal(paste2.uploadRequests.length, 0, 'Repeat paste must hit _uploadCache with 0 extra HTTP requests');
        assert.equal(paste2.createdCalls.length, 1);
      },
    },
  ];
}
