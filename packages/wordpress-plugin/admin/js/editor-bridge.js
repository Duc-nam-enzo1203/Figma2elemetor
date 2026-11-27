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
    _uploadCache: new Map(),

    async uploadDataUriIfNeeded(dataUri, title = 'Figma Pasted Asset') {
      if (!dataUri || typeof dataUri !== 'string') {
        return null;
      }
      let normalizedUri = dataUri.trim();
      if (normalizedUri.startsWith('<svg') || normalizedUri.startsWith('<?xml')) {
        normalizedUri = 'data:image/svg+xml;utf8,' + encodeURIComponent(normalizedUri);
      }
      if (!normalizedUri.startsWith('data:image/')) {
        return null;
      }
      if (this._uploadCache.has(normalizedUri)) {
        return this._uploadCache.get(normalizedUri);
      }

      const match = /^data:(image\/[a-z0-9.+-]+)((?:;[a-z0-9._-]+(?:=[^;,]+)?)*),([\s\S]+)$/i.exec(normalizedUri);
      if (!match) return null;

      const mime = match[1].toLowerCase();
      const paramTokens = (match[2] || '').toLowerCase().split(';').filter(Boolean);
      const rawPayload = match[3];
      const isBase64 = paramTokens.includes('base64');

      let base64Payload = '';
      if (isBase64) {
        base64Payload = rawPayload.trim();
      } else if (mime === 'image/svg+xml') {
        let svgText = rawPayload;
        if (!rawPayload.trimStart().startsWith('<')) {
          try {
            svgText = decodeURIComponent(rawPayload);
          } catch (_) {
            svgText = rawPayload;
          }
        }
        const bytes = new TextEncoder().encode(svgText);
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
          bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        base64Payload = btoa(bin);
      } else {
        return null;
      }

      const baseUrl = (window.f2eEditorConfig?.restUrl || '/wp-json/f2e-bridge/v1').replace(/\/+$/, '');
      const uploadPromise = (async () => {
        try {
          const res = await fetch(`${baseUrl}/assets`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'X-WP-Nonce': window.f2eEditorConfig?.nonce || '',
            },
            body: JSON.stringify({
              sha256: '',
              mime,
              base64: base64Payload,
              name: title,
            }),
          });
          if (!res.ok) {
            this._uploadCache.delete(normalizedUri);
            return null;
          }
          const json = await res.json();
          if (json && json.success && json.data && json.data.id) {
            return { id: json.data.id, url: json.data.url };
          }
          this._uploadCache.delete(normalizedUri);
        } catch (e) {
          this._uploadCache.delete(normalizedUri);
          console.warn('[F2E Bridge] Could not auto-upload pasted Data-URI asset:', e);
        }
        return null;
      })();

      this._uploadCache.set(normalizedUri, uploadPromise);
      return uploadPromise;
    },

    async materializeLoopTemplateIfNeeded(tpl) {
      if (!tpl || typeof tpl !== 'object' || !Array.isArray(tpl.elements) || tpl.elements.length === 0) {
        return null;
      }
      for (const el of tpl.elements) {
        await this.hydrateElementAssets(el);
      }
      const baseUrl = (window.f2eEditorConfig?.restUrl || '/wp-json/f2e-bridge/v1').replace(/\/+$/, '');
      try {
        const res = await fetch(`${baseUrl}/import`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce': window.f2eEditorConfig?.nonce || '',
          },
          body: JSON.stringify({
            title: tpl.title || 'F2E Loop Item',
            targetType: 'elementor_library',
            templateType: 'loop-item',
            postStatus: 'publish',
            importMode: 'replace',
            loopSource: tpl.source || 'post',
            loopSourceNodeId: tpl.sourceNodeId || '',
            content: tpl.elements,
          }),
        });
        if (!res.ok) return null;
        const json = await res.json();
        if (json && json.success && json.data && json.data.postId) {
          return String(json.data.postId);
        }
      } catch (e) {
        console.warn('[F2E Bridge] Could not auto-create Loop Item template:', e);
      }
      return null;
    },

    _isInlineAssetString(val) {
      return typeof val === 'string' && (val.startsWith('data:image/') || val.includes('<svg'));
    },

    _hydrateV4ImageProp(imageProp, title, tasks) {
      if (!imageProp || typeof imageProp !== 'object' || !imageProp.value || typeof imageProp.value !== 'object') {
        return;
      }
      // Official Elementor 4.4.1 schema: value.src.value.{id, url}
      if (imageProp.value.src && imageProp.value.src.value && typeof imageProp.value.src.value === 'object') {
        const srcVal = imageProp.value.src.value;
        const rawUrl = (srcVal.url && typeof srcVal.url === 'object') ? srcVal.url.value : srcVal.url;
        if (this._isInlineAssetString(rawUrl)) {
          tasks.push(
            this.uploadDataUriIfNeeded(rawUrl, title).then((uploaded) => {
              if (uploaded) {
                srcVal.id = { $$type: 'image-attachment-id', value: uploaded.id };
                srcVal.url = null;
              }
            })
          );
        }
        return;
      }
      // F2E flat v4 schema: value.{id, url}
      if (this._isInlineAssetString(imageProp.value.url)) {
        tasks.push(
          this.uploadDataUriIfNeeded(imageProp.value.url, title).then((uploaded) => {
            if (uploaded) {
              imageProp.value.id = uploaded.id;
              imageProp.value.url = uploaded.url;
            }
          })
        );
      }
    },

    async hydrateElementAssets(element) {
      if (!element || typeof element !== 'object') return element;
      const settings = element.settings || {};
      const title = settings._title || 'Figma Asset';

      const tasks = [];
      const mediaKeys = [
        'image',
        'background_image',
        '_background_image',
        'background_overlay_image',
        'background_hover_image',
        '_background_hover_image',
        'background_overlay_hover_image',
        'background_a_image',
        'background_b_image',
        'custom_image',
        'bg_image',
        'testimonial_image',
        'image_overlay',
        'fallback_image',
        'poster',
      ];
      for (const key of mediaKeys) {
        if (key === 'image' && settings.image && settings.image.$$type === 'image') {
          continue;
        }
        if (settings[key] && this._isInlineAssetString(settings[key].url)) {
          tasks.push(
            this.uploadDataUriIfNeeded(settings[key].url, `${title} ${key}`).then((uploaded) => {
              if (uploaded) settings[key] = uploaded;
            })
          );
        }
      }

      // Check gallery & carousel arrays
      for (const gKey of ['gallery', 'wp_gallery', 'carousel']) {
        if (Array.isArray(settings[gKey])) {
          for (const item of settings[gKey]) {
            if (item && this._isInlineAssetString(item.url)) {
              tasks.push(
                this.uploadDataUriIfNeeded(item.url, `${title} ${gKey}`).then((uploaded) => {
                  if (uploaded) {
                    item.id = uploaded.id;
                    item.url = uploaded.url;
                  }
                })
              );
            }
          }
        }
      }

      // Check repeater lists (slides, icon_list, features_list, social_icon_list, tabs, items)
      for (const listKey of ['slides', 'icon_list', 'features_list', 'social_icon_list', 'tabs', 'items']) {
        if (!Array.isArray(settings[listKey])) continue;
        for (const item of settings[listKey]) {
          if (!item || typeof item !== 'object') continue;
          if (this._isInlineAssetString(item.url)) {
            tasks.push(
              this.uploadDataUriIfNeeded(item.url, `${title} ${listKey}`).then((uploaded) => {
                if (uploaded) {
                  item.id = uploaded.id;
                  item.url = uploaded.url;
                }
              })
            );
          }
          for (const subKey of ['image', 'background_image', 'bg_image']) {
            if (item[subKey] && this._isInlineAssetString(item[subKey].url)) {
              tasks.push(
                this.uploadDataUriIfNeeded(item[subKey].url, `${title} ${listKey} ${subKey}`).then((uploaded) => {
                  if (uploaded) item[subKey] = uploaded;
                })
              );
            }
          }
          for (const iconKey of ['selected_icon', 'social_icon']) {
            const icon = item[iconKey];
            if (icon && icon.library === 'svg') {
              if (this._isInlineAssetString(icon.value)) {
                tasks.push(
                  this.uploadDataUriIfNeeded(icon.value, `${title} icon`).then((uploaded) => {
                    if (uploaded) icon.value = uploaded;
                  })
                );
              } else if (icon.value && this._isInlineAssetString(icon.value.url)) {
                tasks.push(
                  this.uploadDataUriIfNeeded(icon.value.url, `${title} icon`).then((uploaded) => {
                    if (uploaded) icon.value = uploaded;
                  })
                );
              }
            }
          }
        }
      }

      // Check top-level selected_icon with library === 'svg'
      if (settings.selected_icon && settings.selected_icon.library === 'svg') {
        const icon = settings.selected_icon;
        if (this._isInlineAssetString(icon.value)) {
          tasks.push(
            this.uploadDataUriIfNeeded(icon.value, `${title} selected_icon`).then((uploaded) => {
              if (uploaded) icon.value = uploaded;
            })
          );
        } else if (icon.value && this._isInlineAssetString(icon.value.url)) {
          tasks.push(
            this.uploadDataUriIfNeeded(icon.value.url, `${title} selected_icon`).then((uploaded) => {
              if (uploaded) icon.value = uploaded;
            })
          );
        }
      }

      // Elementor v4 e-image
      if (settings.image && settings.image.$$type === 'image') {
        this._hydrateV4ImageProp(settings.image, `${title} v4 image`, tasks);
      }

      // Auto-create and link Elementor Pro Loop Item template for loop-grid / loop-carousel
      if (settings._f2e_loop_template && typeof settings._f2e_loop_template === 'object') {
        const loopTpl = settings._f2e_loop_template;
        tasks.push(
          this.materializeLoopTemplateIfNeeded(loopTpl).then((postId) => {
            if (postId) {
              settings.template_id = postId;
            }
            delete settings._f2e_loop_template;
          })
        );
      }

      // Elementor v4 e-svg
      if (settings.svg && typeof settings.svg === 'object') {
        const svgTarget = (settings.svg.value && typeof settings.svg.value === 'object') ? settings.svg.value : settings.svg;
        if (svgTarget.url && typeof svgTarget.url === 'object' && svgTarget.url.$$type === 'url') {
          if (this._isInlineAssetString(svgTarget.url.value)) {
            tasks.push(
              this.uploadDataUriIfNeeded(svgTarget.url.value, `${title} v4 svg`).then((uploaded) => {
                if (uploaded) {
                  svgTarget.id = { $$type: 'image-attachment-id', value: uploaded.id };
                  svgTarget.url = { $$type: 'url', value: uploaded.url };
                }
              })
            );
          }
        } else {
          const rawSvg = svgTarget.url || svgTarget.markup || svgTarget.html;
          if (this._isInlineAssetString(rawSvg)) {
            tasks.push(
              this.uploadDataUriIfNeeded(rawSvg, `${title} v4 svg`).then((uploaded) => {
                if (uploaded) {
                  svgTarget.id = uploaded.id;
                  svgTarget.url = uploaded.url;
                }
              })
            );
          }
        }
      }

      // Elementor v4 styles background images
      if (element.styles && typeof element.styles === 'object') {
        for (const styleDef of Object.values(element.styles)) {
          if (!styleDef || !Array.isArray(styleDef.variants)) continue;
          for (const variant of styleDef.variants) {
            const props = variant?.props;
            if (!props || typeof props !== 'object') continue;
            if (props.background?.$$type === 'background') {
              const overlays = props.background.value?.['background-overlay']?.value;
              if (Array.isArray(overlays)) {
                for (const overlay of overlays) {
                  if (overlay?.$$type === 'background-image-overlay' && overlay.value?.image) {
                    this._hydrateV4ImageProp(overlay.value.image, `${title} v4 bg`, tasks);
                  }
                }
              }
            }
            if (props.backgroundImage && typeof props.backgroundImage === 'object') {
              if (props.backgroundImage.$$type === 'image') {
                this._hydrateV4ImageProp(props.backgroundImage, `${title} v4 bgImage`, tasks);
              } else if (props.backgroundImage.$$type === 'url' && this._isInlineAssetString(props.backgroundImage.value)) {
                tasks.push(
                  this.uploadDataUriIfNeeded(props.backgroundImage.value, `${title} v4 bgImage`).then((uploaded) => {
                    if (uploaded) props.backgroundImage.value = uploaded.url;
                  })
                );
              }
            }
          }
        }
      }

      if (Array.isArray(element.elements) && element.elements.length > 0) {
        tasks.push(Promise.all(element.elements.map((child) => this.hydrateElementAssets(child))));
      }
      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
      return element;
    },

    async insertElements(elements) {
      if (typeof elementor === 'undefined' || typeof $e === 'undefined') {
        console.error('[F2E Bridge] Elementor Editor is not ready.');
        return;
      }
      const list = Array.isArray(elements) ? elements : [];
      let targetContainer = null;
      if (elementor.selection && typeof elementor.selection.getElements === 'function') {
        const selected = elementor.selection.getElements();
        if (selected && selected.length > 0) {
          const first = selected[0];
          const elType = first?.model?.get ? first.model.get('elType') : first?.model?.elType;
          if (elType === 'container') {
            targetContainer = first;
          }
        }
      }
      if (!targetContainer) {
        targetContainer = elementor.getPreviewContainer();
      }
      if (!targetContainer) {
        console.warn('[F2E Bridge] Elementor preview container is not ready.');
        return;
      }

      for (const rawEl of list) {
        const el = await this.hydrateElementAssets(JSON.parse(JSON.stringify(rawEl)));
        await $e.run('document/elements/create', {
          container: targetContainer,
          model: el,
          options: { at: -1 },
        });
      }
    },
  };

  window.f2eEditorBridge = f2eEditorBridge;

  function showToast(message, type = 'info', duration = 3000) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function' || !document.body) {
      return;
    }
    try {
      let toast = document.getElementById('f2e-editor-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'f2e-editor-toast';
        toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999999;padding:10px 18px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:13px;font-weight:500;box-shadow:0 4px 14px rgba(0,0,0,0.25);transition:all .3s ease;display:flex;align-items:center;gap:8px;pointer-events:none;opacity:0;transform:translateY(10px);';
        document.body.appendChild(toast);
      }
      if (type === 'loading') {
        toast.style.background = '#1e293b';
        toast.style.color = '#38bdf8';
        toast.style.border = '1px solid #334155';
        toast.textContent = message;
      } else if (type === 'success') {
        toast.style.background = '#065f46';
        toast.style.color = '#34d399';
        toast.style.border = '1px solid #059669';
        toast.textContent = message;
      } else if (type === 'error') {
        toast.style.background = '#991b1b';
        toast.style.color = '#fca5a5';
        toast.style.border = '1px solid #b91c1c';
        toast.textContent = message;
      }
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
      if (duration > 0) {
        setTimeout(() => {
          if (toast) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
          }
        }, duration);
      }
    } catch (_) { }
  }

  let isPasting = false;
  const handlePasteEvent = async (event) => {
    const activeDoc = event.target?.ownerDocument || document;
    const activeEl = activeDoc.activeElement || document.activeElement;
    const activeTag = activeEl?.tagName?.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea' || activeEl?.isContentEditable || event.target?.isContentEditable) {
      return;
    }
    const text = (event.clipboardData?.getData('text/plain') || '').trim();
    if (!text.startsWith('{') || !text.includes('"_f2e_node_id"')) {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_) {
      // Not valid JSON, let Elementor handle normally
      return;
    }
    if (parsed && parsed.type === 'elementor' && Array.isArray(parsed.elements)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (isPasting) {
        return;
      }
      isPasting = true;
      showToast('Đang chèn và nạp hình ảnh từ Figma...', 'loading', 0);
      try {
        await f2eEditorBridge.insertElements(parsed.elements);
        showToast('Đã dán giao diện Figma thành công!', 'success', 3000);
      } catch (err) {
        console.error('[F2E Bridge] Insert error:', err);
        showToast('Có lỗi xảy ra khi dán giao diện.', 'error', 4000);
      } finally {
        isPasting = false;
      }
    }
  };

  // 1. Listen on top-level window in capture phase (maintains test compatibility)
  window.addEventListener('paste', handlePasteEvent, true);

  // 2. Attach to Elementor Preview iframe window & document so pasting directly on canvas is intercepted
  function attachIframePasteListeners() {
    try {
      const iframe = document.getElementById('elementor-preview-iframe');
      if (iframe) {
        if (iframe.contentWindow && !iframe.contentWindow._f2eBridgeAttached) {
          iframe.contentWindow._f2eBridgeAttached = true;
          iframe.contentWindow.addEventListener('paste', handlePasteEvent, true);
        }
        if (iframe.contentDocument && !iframe.contentDocument._f2eBridgeAttached) {
          iframe.contentDocument._f2eBridgeAttached = true;
          iframe.contentDocument.addEventListener('paste', handlePasteEvent, true);
        }
      }
    } catch (_) { }
  }

  attachIframePasteListeners();

  if (typeof elementor !== 'undefined') {
    if (typeof elementor.on === 'function') {
      elementor.on('preview:loaded', attachIframePasteListeners);
    }
    if (elementor.channels?.editor?.on) {
      elementor.channels.editor.on('preview:loaded', attachIframePasteListeners);
    }
  }
})(window.jQuery);
