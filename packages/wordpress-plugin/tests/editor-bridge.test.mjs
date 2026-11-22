import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bridgePath = path.resolve(__dirname, '../admin/js/editor-bridge.js');
const bridgeCode = fs.readFileSync(bridgePath, 'utf8');

function createSandbox({ fetchImpl } = {}) {
  const listeners = new Map();
  const createdElements = [];
  const fetchCalls = [];

  const windowObj = {
    f2eEditorConfig: {
      restUrl: 'https://thecanopyresident.local/wp-json/f2e-bridge/v1/',
      nonce: 'nonce-123',
    },
    jQuery: {},
    addEventListener(type, fn, useCapture = false) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn, useCapture: Boolean(useCapture) });
    },
  };

  const sandbox = {
    window: windowObj,
    document: { activeElement: { tagName: 'BODY', isContentEditable: false } },
    elementor: {
      getPreviewContainer() {
        return { id: 'root' };
      },
    },
    $e: {
      async run(cmd, payload) {
        createdElements.push({ cmd, payload });
      },
    },
    fetch: async (url, init) => {
      fetchCalls.push({ url, init });
      if (fetchImpl) return fetchImpl(url, init);
      const body = JSON.parse(init.body);
      const ext = body.mime === 'image/svg+xml' ? 'svg' : 'png';
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            data: { id: 400 + fetchCalls.length, url: `https://thecanopyresident.local/wp-content/uploads/a${fetchCalls.length}.${ext}` },
          };
        },
      };
    },
    TextEncoder,
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
    console,
    Map,
    Promise,
    JSON,
  };

  vm.runInNewContext(bridgeCode, sandbox, { filename: bridgePath });
  return { sandbox, bridge: sandbox.window.f2eEditorBridge, listeners, createdElements, fetchCalls };
}

test('uploadDataUriIfNeeded supports ;base64,, ;utf8,, and ;charset=utf-8, SVG Data URIs and clears cache on failure', async () => {
  const { bridge, fetchCalls } = createSandbox();

  const b64Svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg viewBox="0 0 10 10"><path d="M0 0"/></svg>').toString('base64');
  const utf8Svg = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5"/></svg>');
  const charsetSvg = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg viewBox="0 0 14 14"><rect width="14" height="14"/></svg>');

  const r1 = await bridge.uploadDataUriIfNeeded(b64Svg, 'B64');
  const r2 = await bridge.uploadDataUriIfNeeded(utf8Svg, 'UTF8');
  const r3 = await bridge.uploadDataUriIfNeeded(charsetSvg, 'Charset');

  assert.equal(r1.id, 401);
  assert.equal(r2.id, 402);
  assert.equal(r3.id, 403);
  assert.equal(fetchCalls.length, 3);
  assert.equal(fetchCalls[0].init.credentials, 'same-origin');
  assert.equal(JSON.parse(fetchCalls[1].init.body).mime, 'image/svg+xml');
  assert.equal(JSON.parse(fetchCalls[2].init.body).mime, 'image/svg+xml');

  // Verify failed upload does not poison _uploadCache
  let failOnce = true;
  const retryEnv = createSandbox({
    fetchImpl: async () => {
      if (failOnce) {
        failOnce = false;
        return { ok: false, status: 500, async json() { return {}; } };
      }
      return { ok: true, status: 200, async json() { return { success: true, data: { id: 777, url: 'https://thecanopyresident.local/ok.png' } }; } };
    },
  });
  const pngUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert.equal(await retryEnv.bridge.uploadDataUriIfNeeded(pngUri), null);
  const retried = await retryEnv.bridge.uploadDataUriIfNeeded(pngUri);
  assert.equal(retried.id, 777);
});

test('hydrateElementAssets hydrates wp_gallery, carousel, background_overlay_image, selected_icon, and v4 e-image/e-svg/styles', async () => {
  const { bridge } = createSandbox();
  const pngUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const utf8Svg = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg viewBox="0 0 8 8"><path d="M0 0h8"/></svg>');

  const tree = {
    id: 'root1',
    settings: {
      background_overlay_image: { id: 0, url: pngUri },
      wp_gallery: [{ id: 0, url: pngUri }],
      carousel: [{ id: 0, url: pngUri }],
      selected_icon: { value: utf8Svg, library: 'svg' },
    },
    styles: {
      'cls-1': {
        variants: [{
          props: {
            backgroundImage: { $$type: 'image', value: { id: 0, url: pngUri } },
          },
        }],
      },
    },
    elements: [
      {
        id: 'v4img',
        widgetType: 'e-image',
        settings: {
          image: {
            $$type: 'image',
            value: {
              src: { $$type: 'image-src', value: { id: null, url: { $$type: 'url', value: pngUri } } },
            },
          },
        },
      },
      {
        id: 'v4svg',
        widgetType: 'e-svg',
        settings: {
          svg: { $$type: 'svg-src', value: { id: null, url: { $$type: 'url', value: utf8Svg } } },
        },
      },
    ],
  };

  const out = await bridge.hydrateElementAssets(tree);
  assert.ok(out.settings.background_overlay_image.id > 0);
  assert.ok(out.settings.wp_gallery[0].id > 0);
  assert.ok(out.settings.carousel[0].id > 0);
  assert.ok(out.settings.selected_icon.value.id > 0);
  assert.ok(out.styles['cls-1'].variants[0].props.backgroundImage.value.id > 0);
  assert.ok(out.elements[0].settings.image.value.src.value.id.value > 0);
  assert.equal(out.elements[0].settings.image.value.src.value.url, null);
  assert.ok(out.elements[1].settings.svg.value.id.value > 0);
  assert.ok(out.elements[1].settings.svg.value.url.value.endsWith('.svg'));
});

test('paste listener registers in capture phase and calls stopImmediatePropagation synchronously to prevent double-paste', async () => {
  const { listeners, createdElements } = createSandbox();
  const pasteListeners = listeners.get('paste') || [];
  assert.equal(pasteListeners.length, 1);
  assert.equal(pasteListeners[0].useCapture, true);

  let prevented = false;
  let stopped = false;
  let stoppedImmediate = false;
  const payload = JSON.stringify({
    type: 'elementor',
    elements: [{ id: 'p1', elType: 'widget', widgetType: 'heading', settings: { _f2e_node_id: '1:2', title: 'Hi' }, elements: [] }],
  });

  await pasteListeners[0].fn({
    clipboardData: { getData: () => payload },
    preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; },
    stopImmediatePropagation() { stoppedImmediate = true; },
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(stoppedImmediate, true);
  assert.equal(createdElements.length, 1);
});
