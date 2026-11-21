/**
 * F2E Bridge — Elementor Editor Integration
 *
 * 1. Registers `$e.run('f2e-bridge/insert', { elements })` to programmatically insert
 *    Figma-compiled containers and widgets into the open Elementor Editor canvas.
 * 2. Automatically intercepts Data-URI base64 images when pasting from Figma Clipboard (`Ctrl+V`),
 *    uploads them via `/wp-json/f2e-bridge/v1/assets` with SHA-256 deduplication, and replaces
 *    the temporary Data-URI with a real WordPress Media Library `{ id, url }` attachment!
 */

(function ($) {
  'use strict';

  if (typeof window === 'undefined') return;

  const f2eEditorBridge = {
    async uploadDataUriIfNeeded(dataUri, title = 'Figma Pasted Asset') {
      if (!dataUri || typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) {
        return null;
      }
      const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUri);
      if (!match) return null;

      try {
        const res = await fetch(`${window.f2eEditorConfig?.restUrl || '/wp-json/f2e-bridge/v1'}/assets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce': window.f2eEditorConfig?.nonce || '',
          },
          body: JSON.stringify({
            sha256: '',
            mime: match[1],
            base64: match[2],
            name: title,
          }),
        });
        const json = await res.json();
        if (json && json.success && json.data && json.data.id) {
          return { id: json.data.id, url: json.data.url };
        }
      } catch (e) {
        console.warn('[F2E Bridge] Could not auto-upload pasted Data-URI asset:', e);
      }
      return null;
    },

    async hydrateElementAssets(element) {
      if (!element || typeof element !== 'object') return element;
      const settings = element.settings || {};

      if (settings.image && typeof settings.image.url === 'string' && settings.image.url.startsWith('data:image/')) {
        const uploaded = await this.uploadDataUriIfNeeded(settings.image.url, settings._title || 'Figma Image');
        if (uploaded) settings.image = uploaded;
      }
      if (settings.background_image && typeof settings.background_image.url === 'string' && settings.background_image.url.startsWith('data:image/')) {
        const uploaded = await this.uploadDataUriIfNeeded(settings.background_image.url, settings._title || 'Figma BG');
        if (uploaded) settings.background_image = uploaded;
      }

      if (Array.isArray(element.elements)) {
        for (let i = 0; i < element.elements.length; i += 1) {
          await this.hydrateElementAssets(element.elements[i]);
        }
      }
      return element;
    },

    async insertElements(elements) {
      if (typeof elementor === 'undefined' || typeof $e === 'undefined') {
        console.error('[F2E Bridge] Elementor Editor is not ready.');
        return;
      }
      const list = Array.isArray(elements) ? elements : [];
      const rootContainer = elementor.getPreviewContainer();

      for (const rawEl of list) {
        const el = await this.hydrateElementAssets(JSON.parse(JSON.stringify(rawEl)));
        await $e.run('document/elements/create', {
          container: rootContainer,
          model: el,
          options: { at: -1 },
        });
      }
    },
  };

  window.f2eEditorBridge = f2eEditorBridge;

  // Listen for paste event in Elementor Editor to support instant Ctrl+V of F2E Clipboard JSON
  window.addEventListener('paste', async (event) => {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable) {
      return;
    }
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text.startsWith('{') || !text.includes('"_f2e_node_id"')) {
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.type === 'elementor' && Array.isArray(parsed.elements)) {
        event.preventDefault();
        await f2eEditorBridge.insertElements(parsed.elements);
      }
    } catch (e) {
      // Not F2E JSON, let Elementor handle normally
    }
  });
})(window.jQuery);
