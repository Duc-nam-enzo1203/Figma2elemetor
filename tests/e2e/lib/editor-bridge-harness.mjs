import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_BRIDGE_PATH = path.resolve(__dirname, '../../../packages/wordpress-plugin/admin/js/editor-bridge.js');

/**
 * Executes unmodified `packages/wordpress-plugin/admin/js/editor-bridge.js` inside a
 * `node:vm` sandbox wired to live WordPress `/wp-json/f2e-bridge/v1/assets` (or an optional
 * mock fetch override for negative failure isolation tests).
 */
export function createEditorBridgeHarness({ restUrl, token = '', nonce = '', overrideFetch = null } = {}) {
  const code = fs.readFileSync(EDITOR_BRIDGE_PATH, 'utf8');
  const listeners = { paste: [] };
  const createdCalls = [];
  const uploadRequests = [];
  const consoleWarnings = [];
  const consoleErrors = [];
  const mockRootContainer = { id: 'document', model: { elType: 'document' } };

  const wrappedFetch = async (url, init = {}) => {
    if (typeof overrideFetch === 'function') {
      const res = await overrideFetch(url, init);
      uploadRequests.push({ url, method: init.method || 'GET', status: res.status, mocked: true });
      return res;
    }

    const reqHeaders = { ...(init.headers || {}) };
    if (token && !reqHeaders.Authorization && !reqHeaders.authorization) {
      reqHeaders.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, { ...init, headers: reqHeaders });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    let bodyParsed = null;
    try {
      bodyParsed = init.body ? JSON.parse(init.body) : null;
    } catch {
      bodyParsed = null;
    }
    uploadRequests.push({
      url,
      method: init.method || 'GET',
      mime: bodyParsed?.mime || '',
      base64Length: typeof bodyParsed?.base64 === 'string' ? bodyParsed.base64.length : 0,
      status: res.status,
      responseJson: json,
    });

    return {
      ok: res.ok,
      status: res.status,
      json: async () => json,
      text: async () => text,
    };
  };

  const sandboxDocument = {
    activeElement: { tagName: 'BODY', isContentEditable: false },
  };

  const sandboxWindow = {
    jQuery: () => ({}),
    f2eEditorConfig: {
      restUrl,
      nonce,
    },
    addEventListener(type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
  };
  sandboxWindow.window = sandboxWindow;

  const sandbox = {
    window: sandboxWindow,
    document: sandboxDocument,
    elementor: {
      getPreviewContainer: () => mockRootContainer,
    },
    $e: {
      run: async (cmd, args) => {
        createdCalls.push({ cmd, args });
        return args?.model;
      },
    },
    fetch: wrappedFetch,
    console: {
      log: () => {},
      info: () => {},
      warn: (...args) => consoleWarnings.push(args.map(String).join(' ')),
      error: (...args) => consoleErrors.push(args.map(String).join(' ')),
    },
    JSON,
    Map,
    Promise,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;

  vm.runInNewContext(code, sandbox, { filename: 'editor-bridge.js' });

  return {
    window: sandboxWindow,
    bridge: sandboxWindow.f2eEditorBridge,
    createdCalls,
    uploadRequests,
    consoleWarnings,
    consoleErrors,

    async dispatchPaste(text, { activeTag = 'BODY', isContentEditable = false } = {}) {
      sandboxDocument.activeElement = {
        tagName: activeTag,
        isContentEditable,
      };
      let prevented = false;
      let stopped = false;
      const event = {
        clipboardData: {
          getData: (type) => (type === 'text/plain' ? text : ''),
        },
        preventDefault: () => { prevented = true; },
        stopPropagation: () => { stopped = true; },
        stopImmediatePropagation: () => { stopped = true; },
      };

      const startCalls = createdCalls.length;
      const startUploads = uploadRequests.length;

      for (const fn of listeners.paste || []) {
        await fn(event);
      }

      return {
        prevented,
        stopped,
        createdCalls: createdCalls.slice(startCalls),
        uploadRequests: uploadRequests.slice(startUploads),
      };
    },
  };
}
