/**
 * F2E Bridge — Figma Plugin Main Thread (Sandbox)
 * Runs inside Figma Desktop (100% Free, Zero REST API limits).
 */

import { bytesToBase64, base64ToBytes, sha256 } from './utils/crypto.js';
import {
  WIDGET_PLUGIN_KEY,
  WIDGET_CATALOG,
  SUPPORTED_WIDGETS,
  resolveWidget,
  visibleChildren,
  isAtomicLeafWidget,
  isContainerWidget,
  detectCompositeBackgroundChildren,
} from './tagging/widget-resolver.js';
import { fixAndOptimizeCanvasSelection } from './optimizer/auto-layout-fixer.js';
import {
  extractDesignSelection,
  extractLocalDesignSystem,
  captureResponsiveTree,
  inspectNodeDevMode,
} from './extraction/extractor.js';
import {
  compileElementorV3,
  compileElementorV4,
  compileElementorClipboard,
} from './exporters/elementor-compiler.js';

const STORAGE_SITES_KEY = 'f2e.sites.v1';
const STORAGE_PREFS_KEY = 'f2e.prefs.v1';
const STORAGE_AI_KEY = 'f2e.ai.config.v1';

const responsiveState = {
  desktop: null,
  tablet: null,
  mobile: null,
};

function postStatus(message, extra = {}) {
  if (typeof figma !== 'undefined' && figma && figma.ui) {
    figma.ui.postMessage({ type: 'status', message, ...extra });
  }
}

function announce(message, isError = false) {
  postStatus(message, { done: true, error: isError });
  try {
    if (typeof figma !== 'undefined' && typeof figma.notify === 'function') {
      figma.notify(message, { error: isError, timeout: isError ? 5500 : 3500 });
    }
  } catch (e) { }
}

export function normalizeSiteUrl(rawUrl) {
  const cleaned = String(rawUrl || '').trim().replace(/\/+$/, '');
  const match = /^(https?:)\/\/([^/?#]+)(\/[^?#]*)?$/i.exec(cleaned);
  if (!match) {
    throw new Error('Vui lòng nhập URL WordPress hợp lệ (ví dụ: https://example.com hoặc http://localhost:10040).');
  }
  return `${match[1].toLowerCase()}//${match[2]}${(match[3] || '').replace(/\/+$/, '')}`;
}

export async function wpRequest(siteUrl, token, endpoint, init = {}) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  const url = `${baseUrl}/index.php?rest_route=/f2e-bridge/v1${endpoint}`;
  const timeoutMs = Number(init.timeoutMs) > 0 ? Number(init.timeoutMs) : 30000;

  const fetchOptions = {
    method: init.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  };
  if (init.body !== undefined) {
    fetchOptions.body = init.body;
  }

  let controller = null;
  let timerId = null;
  if (typeof AbortController === 'function') {
    try {
      controller = new AbortController();
      fetchOptions.signal = controller.signal;
    } catch (e) {
      controller = null;
    }
  }

  const raceTimeout = (promise) => new Promise((resolve, reject) => {
    timerId = setTimeout(() => {
      if (controller) {
        try { controller.abort(); } catch (e) { }
      }
      const timeoutErr = new Error(`Yêu cầu WordPress hết thời gian (${timeoutMs}ms): ${endpoint}`);
      timeoutErr.isTimeout = true;
      reject(timeoutErr);
    }, timeoutMs);
    Promise.resolve(promise).then(
      (val) => {
        clearTimeout(timerId);
        timerId = null;
        resolve(val);
      },
      (err) => {
        clearTimeout(timerId);
        timerId = null;
        reject(err);
      }
    );
  });

  let response;
  try {
    response = await raceTimeout(fetch(url, fetchOptions));
  } catch (err) {
    if (err && err.isTimeout) throw err;
    const detail = err && err.message ? `: ${err.message}` : '';
    const isHttpCustomLocal = /^http:\/\/(?!localhost|127\.0\.0\.1|\[::1\])/i.test(baseUrl);
    const localHint = isHttpCustomLocal
      ? ' (Lưu ý: Figma chặn HTTP thường với tên miền .local do Mixed Content — hãy dùng http://localhost:PORT của LocalWP, ví dụ http://localhost:10040, hoặc bật Trust SSL trong LocalWP để dùng https://)'
      : '';
    const netErr = new Error(`Không thể kết nối tới WordPress${detail}${localHint}.`);
    netErr.isNetwork = true;
    throw netErr;
  }

  let body;
  try {
    if (typeof response.json === 'function') {
      body = await raceTimeout(response.json());
    } else if (typeof response.text === 'function') {
      const txt = await raceTimeout(response.text());
      body = JSON.parse(txt);
    } else {
      throw new Error('Response object has neither json() nor text()');
    }
  } catch (e) {
    if (e && e.isTimeout) throw e;
    const parseErr = new Error(`WordPress trả về dữ liệu không phải JSON (HTTP ${response.status}): ${e && e.message ? e.message : e}`);
    parseErr.status = response.status;
    throw parseErr;
  }

  if (!response.ok || !body || body.success === false) {
    const errMsg = (body && (body.message || (body.data && body.data.message))) || `WordPress trả về lỗi HTTP ${response.status}.`;
    const httpErr = new Error(errMsg);
    httpErr.status = response.status;
    throw httpErr;
  }
  return body.data !== undefined ? body.data : body;
}

/** Build flat indented outline of current selection for the Widget Tagging UI */
export function buildSelectionOutline(selection) {
  const items = [];
  const walk = (node, depth, isTopRoot = false, isAutoBg = false) => {
    if (!node || node.visible === false || items.length >= 250) return;
    const resolved = resolveWidget(node);
    const effectiveWidget = isAutoBg && resolved.source !== 'override' ? 'background' : resolved.widget;
    const effectiveSource = isAutoBg && resolved.source !== 'override' ? 'heuristic' : resolved.source;
    const hasAutoLayout = Boolean(node.layoutMode && node.layoutMode !== 'NONE');
    items.push({
      nodeId: node.id,
      name: String(node.name || 'Unnamed').slice(0, 64),
      type: node.type,
      depth,
      widget: effectiveWidget,
      source: effectiveSource,
      hasAutoLayout,
      childCount: visibleChildren(node).length,
    });
    // Do not expand internal layers/vectors of atomic leaf widgets (icons, logos, buttons, images, background, etc.)
    // or layers marked "skip", so the outline matches Elementor's actual widget hierarchy!
    if (isAtomicLeafWidget(effectiveWidget)) {
      return;
    }
    const { bgIds } = detectCompositeBackgroundChildren(node);
    for (const child of visibleChildren(node)) {
      walk(child, depth + 1, false, bgIds.has(child.id));
    }
  };
  for (const root of selection) {
    walk(root, 0, true, false);
  }
  return items;
}

export function sendOutlineToUi() {
  const selection = figma.currentPage.selection || [];
  figma.ui.postMessage({
    type: 'outline',
    selectionIds: selection.map((n) => n.id),
    selectionNames: selection.map((n) => n.name),
    selectionCount: selection.length,
    items: selection.length ? buildSelectionOutline(selection) : [],
    widgetCatalog: WIDGET_CATALOG,
    responsiveStatus: {
      desktop: responsiveState.desktop ? responsiveState.desktop.name : null,
      tablet: responsiveState.tablet ? responsiveState.tablet.name : null,
      mobile: responsiveState.mobile ? responsiveState.mobile.name : null,
    },
  });

  if (selection.length > 0) {
    inspectNodeDevMode(selection[0], { includeSubtree: false })
      .then((data) => {
        if (data) {
          figma.ui.postMessage({ type: 'dev-mode-css', data });
        }
      })
      .catch(() => { });
  } else {
    figma.ui.postMessage({ type: 'dev-mode-css', data: null });
  }
}

async function handleInspectNodeDevMode(msg = {}) {
  const { nodeId, includeSubtree = false, focusCanvas = false } = msg;
  const selection = figma.currentPage.selection || [];
  let target = null;

  if (nodeId) {
    if (typeof figma.getNodeByIdAsync === 'function') {
      try {
        target = await figma.getNodeByIdAsync(nodeId);
      } catch (e) { }
    }
    if (!target) {
      const findInTree = (list) => {
        for (const n of list || []) {
          if (!n) continue;
          if (n.id === nodeId) return n;
          if (Array.isArray(n.children)) {
            const found = findInTree(n.children);
            if (found) return found;
          }
        }
        return null;
      };
      target = findInTree(selection);
    }
  } else if (selection.length > 0) {
    target = selection[0];
  }

  if (!target) {
    throw new Error('Hãy chọn một Layer hoặc Frame trên Figma để xem Dev Mode CSS.');
  }

  if (focusCanvas && figma.viewport && typeof figma.viewport.scrollAndZoomIntoView === 'function') {
    try {
      figma.viewport.scrollAndZoomIntoView([target]);
    } catch (e) { }
  }

  const data = await inspectNodeDevMode(target, { includeSubtree: Boolean(includeSubtree) });
  figma.ui.postMessage({ type: 'dev-mode-css', data });
}

async function setLayerWidgetOverride(nodeId, widget) {
  const node = figma.getNodeByIdAsync ? await figma.getNodeByIdAsync(nodeId) : null;
  if (!node || typeof node.setPluginData !== 'function') {
    throw new Error('Không tìm thấy layer này trên canvas.');
  }
  if (widget && !SUPPORTED_WIDGETS.includes(widget)) {
    throw new Error(`Loại widget không hợp lệ: ${widget}`);
  }
  node.setPluginData(WIDGET_PLUGIN_KEY, widget || '');
  sendOutlineToUi();
}

async function handleResetAllWidgetOverrides() {
  const selection = figma.currentPage.selection || [];
  let cleared = 0;
  const walk = (node) => {
    if (!node) return;
    if (typeof node.setPluginData === 'function' && node.getPluginData(WIDGET_PLUGIN_KEY)) {
      node.setPluginData(WIDGET_PLUGIN_KEY, '');
      cleared += 1;
    }
    for (const child of node.children || []) walk(child);
  };
  for (const root of selection) walk(root);
  sendOutlineToUi();
  announce(`Đã đặt lại ${cleared} thẻ Widget về chế độ Tự động (Auto).`);
}

function handleCaptureResponsive(viewport) {
  if (!['desktop', 'tablet', 'mobile'].includes(viewport)) {
    throw new Error('Viewport không hợp lệ.');
  }
  const selection = figma.currentPage.selection || [];
  if (selection.length !== 1) {
    throw new Error(`Hãy chọn đúng 1 Frame trên Figma cho giao diện ${viewport.toUpperCase()}.`);
  }
  responsiveState[viewport] = captureResponsiveTree(selection[0]);
  sendOutlineToUi();
  announce(`Đã ghi nhận Frame "${selection[0].name}" cho giao diện ${viewport.toUpperCase()}.`);
}

function handleClearResponsive() {
  responsiveState.desktop = null;
  responsiveState.tablet = null;
  responsiveState.mobile = null;
  sendOutlineToUi();
  announce('Đã xóa cấu hình ghép 3 Frame Responsive.');
}

function handleFixAutoLayout() {
  const selection = figma.currentPage.selection || [];
  if (selection.length === 0) {
    throw new Error('Hãy chọn ít nhất 1 Frame hoặc Group trên Figma trước khi phân tích.');
  }
  const result = fixAndOptimizeCanvasSelection(selection);
  sendOutlineToUi();
  announce(
    `Đã phân tích an toàn (0 thay đổi giao diện gốc): gắn ${result.taggedBackgrounds || 0} lớp BG gộp nền, ${result.taggedIcons || 0} Icon SVG & ${result.virtualLayoutFrames || 0} Frame Virtual Layout.`
  );
}

async function getActiveSelectionForExtraction() {
  const selection = figma.currentPage.selection || [];
  if (selection.length > 0) {
    return selection;
  }
  if (responsiveState.desktop && responsiveState.desktop.nodeId && typeof figma.getNodeByIdAsync === 'function') {
    const desktopNode = await figma.getNodeByIdAsync(responsiveState.desktop.nodeId);
    if (desktopNode && !desktopNode.removed) {
      return [desktopNode];
    }
  }
  throw new Error('Vui lòng chọn ít nhất 1 Frame hoặc Component trên Figma!');
}

const pendingWebpRequests = new Map();

export async function processRasterAssetsInUi(
  document,
  assetPayloads,
  { imageFormat = 'WEBP', quality = 0.82, maxWidth = 0, onBatchProgress = null } = {}
) {
  const rasterAssets = (assetPayloads || []).filter((a) => a && a.kind === 'image' && a.base64);
  if (rasterAssets.length === 0) return { count: 0, savedPct: 0, keptOriginal: 0, warnings: 0 };

  const targetFormat = String(imageFormat || 'WEBP').toUpperCase();
  const targetMime = targetFormat === 'JPG' ? 'image/jpeg' : (targetFormat === 'PNG' ? 'image/png' : 'image/webp');
  const clampedQuality = Math.max(0.3, Math.min(1, Number(quality) || 0.82));
  const clampedMaxWidth = Math.max(0, Math.round(Number(maxWidth) || 0));

  postStatus(`Đang xử lý ${rasterAssets.length} ảnh (${targetFormat}${clampedMaxWidth > 0 ? `, max ${clampedMaxWidth}px` : ''}) ngay tại chỗ…`);

  // Split into bounded IPC batches (max 4 assets or 4 MB per batch)
  const MAX_BATCH_ASSETS = 4;
  const MAX_BATCH_BYTES = 4 * 1024 * 1024;
  const batches = [];
  let curBatch = [];
  let curBatchBytes = 0;
  for (const asset of rasterAssets) {
    const estBytes = Number(asset.byteLength) || Math.ceil((asset.base64 || '').length * 0.75);
    if (curBatch.length > 0 && (curBatch.length >= MAX_BATCH_ASSETS || curBatchBytes + estBytes > MAX_BATCH_BYTES)) {
      batches.push({ items: curBatch, bytes: curBatchBytes });
      curBatch = [];
      curBatchBytes = 0;
    }
    curBatch.push(asset);
    curBatchBytes += estBytes;
  }
  if (curBatch.length > 0) {
    batches.push({ items: curBatch, bytes: curBatchBytes });
  }

  const shaMap = new Map();
  let totalOrig = 0;
  let totalComp = 0;
  let convertedCount = 0;
  let keptOriginal = 0;
  let warningCount = 0;

  const pushOptWarning = (message) => {
    warningCount += 1;
    if (document && Array.isArray(document.warnings)) {
      document.warnings.push({ code: 'image-optimize-warning', message });
    }
  };

  for (let bIdx = 0; bIdx < batches.length; bIdx += 1) {
    const batch = batches[bIdx];
    const requestId = `imgopt-${Date.now()}-${bIdx}-${Math.random().toString(16).slice(2, 8)}`;
    const timeoutMs = Math.max(20000, Math.min(120000, batch.items.length * 8000 + Math.ceil(batch.bytes / 1048576) * 4000));

    let timedOut = false;
    const results = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        timedOut = true;
        pendingWebpRequests.delete(requestId);
        resolve([]);
      }, timeoutMs);
      pendingWebpRequests.set(requestId, (resList) => {
        clearTimeout(timer);
        resolve(Array.isArray(resList) ? resList : []);
      });
      figma.ui.postMessage({
        type: 'compress-assets-webp',
        requestId,
        targetFormat,
        quality: clampedQuality,
        maxWidth: clampedMaxWidth,
        assets: batch.items.map((a) => ({
          sha256: a.sha256,
          mime: a.mime || 'image/png',
          base64: a.base64,
        })),
      });
    });

    if (timedOut) {
      pushOptWarning(`Batch xử lý ảnh ${bIdx + 1}/${batches.length} hết thời gian (${timeoutMs}ms); giữ nguyên ảnh gốc.`);
    }

    if (typeof onBatchProgress === 'function') {
      onBatchProgress(bIdx + 1, batches.length);
    }

    for (const res of results) {
      if (!res || !res.oldSha256) continue;
      if (res.error) {
        pushOptWarning(`Không thể tối ưu ảnh (${res.oldSha256.slice(0, 8)}): ${res.error}`);
        continue;
      }
      if (res.skipped || !res.base64) continue;

      const origAsset = rasterAssets.find((a) => a.sha256 === res.oldSha256);
      if (!origAsset) continue;

      const outBytes = base64ToBytes(res.base64);
      if (!outBytes || outBytes.byteLength === 0) continue;

      const origBytesLen = Number(origAsset.byteLength || 0);
      // Size guard: for WebP conversion, keep original PNG/JPG if WebP output is >= original size
      if (targetFormat === 'WEBP' && origBytesLen > 0 && outBytes.byteLength >= origBytesLen) {
        keptOriginal += 1;
        continue;
      }
      if (targetFormat !== 'WEBP' && !res.resized && origBytesLen > 0 && outBytes.byteLength >= origBytesLen) {
        keptOriginal += 1;
        continue;
      }

      const outMime = res.mime || targetMime;
      const newSha = await sha256(outBytes);
      const newDataUri = `data:${outMime};base64,${res.base64}`;

      totalOrig += origBytesLen;
      totalComp += outBytes.byteLength;
      convertedCount += 1;

      if (document.assets && document.assets[res.oldSha256]) {
        delete document.assets[res.oldSha256];
      }
      origAsset.sha256 = newSha;
      origAsset.mime = outMime;
      origAsset.base64 = res.base64;
      origAsset.byteLength = outBytes.byteLength;
      if (document.assets) {
        document.assets[newSha] = origAsset;
      }
      shaMap.set(res.oldSha256, { sha256: newSha, mime: outMime, dataUri: newDataUri });
    }
  }

  // Remap all node image, backgroundImage, extractedImages, and slides[].image references
  if (shaMap.size > 0 && document && document.nodes) {
    for (const n of Object.values(document.nodes)) {
      if (!n) continue;
      if (n.raster && shaMap.has(n.raster.sha256)) {
        n.raster = { ...shaMap.get(n.raster.sha256) };
      }
      if (n.image && shaMap.has(n.image.sha256)) {
        n.image = { ...shaMap.get(n.image.sha256) };
      }
      if (n.style && n.style.backgroundImage && shaMap.has(n.style.backgroundImage)) {
        const mapped = shaMap.get(n.style.backgroundImage);
        n.style.backgroundImage = mapped.sha256;
        n.style.backgroundImageDataUri = mapped.dataUri;
      }
      if (Array.isArray(n.extractedImages)) {
        n.extractedImages = n.extractedImages.map((imgRef) => {
          if (imgRef && imgRef.sha256 && shaMap.has(imgRef.sha256)) {
            return { ...shaMap.get(imgRef.sha256) };
          }
          return imgRef;
        });
      }
      if (n.content && Array.isArray(n.content.slides)) {
        for (const sl of n.content.slides) {
          if (sl && sl.image && sl.image.sha256 && shaMap.has(sl.image.sha256)) {
            sl.image = { ...shaMap.get(sl.image.sha256) };
          }
        }
      }
    }
  }

  const savedPct = totalOrig > 0 ? Math.max(0, Math.round((1 - totalComp / totalOrig) * 100)) : 0;
  return { count: convertedCount, savedPct, keptOriginal, warnings: warningCount };
}

export async function compressRasterAssetsToWebpInUi(document, assetPayloads, { quality = 0.82, maxWidth = 0, onBatchProgress = null } = {}) {
  return processRasterAssetsInUi(document, assetPayloads, {
    imageFormat: 'WEBP',
    quality,
    maxWidth,
    onBatchProgress,
  });
}

export async function handleCompileForClipboardOrDownload(payload = {}) {
  const {
    action = 'clipboard',
    imageFormat = 'PNG',
    imageScale = 2,
    webpQuality = 0.82,
    imageMaxWidth = 0,
    siteUrl = '',
    autoUnwrap = true,
    linearBorder = true,
    devModeCss = true,
  } = payload;

  const selection = await getActiveSelectionForExtraction();
  postStatus('Đang quét Design System từ Figma…', { progress: 4 });
  const designTokens = await extractLocalDesignSystem(figma, selection);
  const { document, assetPayloads } = await extractDesignSelection(selection, {
    fileKey: figma.fileKey || 'local-file',
    imageFormat,
    imageScale,
    useDevModeCss: devModeCss !== false,
    responsiveFrames: {
      tablet: responsiveState.tablet,
      mobile: responsiveState.mobile,
    },
    designTokens,
    onProgress: (phase, cur, total) => {
      const ratio = total > 0 ? cur / total : 1;
      if (phase === 'nodes') {
        const pct = Math.round(8 + ratio * 47); // 8% -> 55%
        postStatus(`Đang trích xuất layer Figma (${cur}/${total})…`, { progress: pct });
      } else if (phase === 'assets') {
        const pct = Math.round(55 + ratio * 25); // 55% -> 80%
        postStatus(`Đang cắt ảnh & SVG (${cur}/${total})…`, { progress: pct });
      }
    },
  });

  let webpNote = '';
  const fmtUpper = String(imageFormat || 'PNG').toUpperCase();
  const maxWNum = Number(imageMaxWidth) || 0;
  if (fmtUpper === 'WEBP' || (maxWNum > 0 && (fmtUpper === 'PNG' || fmtUpper === 'JPG'))) {
    postStatus(`Đang tối ưu ảnh (${fmtUpper}) ngay tại chỗ…`, { progress: 82 });
    const imgRep = await processRasterAssetsInUi(document, assetPayloads, {
      imageFormat: fmtUpper,
      quality: webpQuality,
      maxWidth: maxWNum,
      onBatchProgress: (done, total) => {
        const pct = Math.round(82 + (done / Math.max(1, total)) * 10); // 82% -> 92%
        postStatus(`Đang xử lý ảnh batch ${done}/${total}…`, { progress: pct });
      },
    });
    if (imgRep.count > 0) {
      webpNote = fmtUpper === 'WEBP' ? ` [WebP -${imgRep.savedPct}%]` : ` [${fmtUpper} resized]`;
    }
  }
  postStatus('Đang biên dịch & kiểm tra độ khớp Elementor…', { progress: 94 });

  const v3CompileOpts = {
    siteUrl,
    autoUnwrap: autoUnwrap !== false,
    linearBorder: linearBorder !== false,
  };

  if (action === 'clipboard') {
    const clipboardData = compileElementorClipboard(document, v3CompileOpts);
    const rep = clipboardData.fidelityReport || {};
    const healNote = rep.healedCount ? ` [Auto-Healed ${rep.healedCount} điểm lệch]` : ' [Khớp 100%]';
    figma.ui.postMessage({
      type: 'clipboard-ready',
      json: JSON.stringify(clipboardData),
      title: document.title,
      warnings: document.warnings,
      fidelityReport: rep,
    });
    announce(`Đã copy "${document.title}" (${clipboardData.elements.length} sections)${webpNote}${healNote}! Mở Elementor Editor và bấm Ctrl+V.`);
    return;
  }

  if (action === 'download-elementor-v3') {
    const v3Json = compileElementorV3(document, v3CompileOpts);
    figma.ui.postMessage({
      type: 'download-ready',
      filename: `${slugify(document.title)}-elementor-v3.json`,
      json: JSON.stringify(v3Json, null, 2),
      warnings: document.warnings,
      fidelityReport: v3Json.fidelityReport,
    });
    announce('Đã xuất & kiểm tra khớp thiết kế file Elementor v3 Template (.json) thành công!');
    return;
  }

  if (action === 'download-elementor-v4') {
    const v4Json = compileElementorV4(document, { siteUrl });
    figma.ui.postMessage({
      type: 'download-ready',
      filename: `${slugify(document.title)}-elementor-v4-atomic.json`,
      json: JSON.stringify(v4Json, null, 2),
      warnings: document.warnings,
    });
    announce('Đã xuất file Elementor v4 Atomic (.json) thành công!');
    return;
  }

  const v3Compiled = compileElementorV3(document, v3CompileOpts);
  const bundle = {
    kind: 'f2e.bundle',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    document,
    assets: assetPayloads,
    elementorV3: v3Compiled,
    elementorV4: compileElementorV4(document, { siteUrl }),
  };
  figma.ui.postMessage({
    type: 'download-ready',
    filename: `${slugify(document.title)}-bundle.f2e.json`,
    json: JSON.stringify(bundle, null, 2),
    warnings: document.warnings,
    fidelityReport: v3Compiled.fidelityReport,
  });
  announce('Đã xuất gói F2E Bundle đầy đủ (kèm ảnh & SVG) để upload vào WordPress!');
}

async function handleVerifyAndSaveSite(siteConfig) {
  const siteUrl = normalizeSiteUrl(siteConfig.siteUrl);
  const token = String(siteConfig.token || '').trim();
  const label = String(siteConfig.label || siteUrl).trim();
  if (!token) {
    throw new Error('Vui lòng nhập Connection Token từ trang quản trị WordPress (F2E Bridge).');
  }

  postStatus(`Đang kiểm tra kết nối tới ${siteUrl}…`);
  const statusData = await wpRequest(siteUrl, token, '/status');

  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const filtered = Array.isArray(stored) ? stored.filter((s) => s.siteUrl !== siteUrl) : [];
  const entry = {
    siteUrl,
    token,
    label: statusData.siteName || label,
    elementorVersion: statusData.elementorVersion || '3.x',
    hasPro: Boolean(statusData.hasPro),
    lastConnectedAt: new Date().toISOString(),
  };
  const updated = [entry, ...filtered];
  await figma.clientStorage.setAsync(STORAGE_SITES_KEY, updated);

  figma.ui.postMessage({
    type: 'sites-loaded',
    sites: updated,
    activeSiteUrl: siteUrl,
    pages: statusData.pages || [],
    templates: statusData.templates || [],
  });
  announce(`Kết nối thành công tới "${entry.label}"!`);
}

async function handleDeleteSite(siteUrl) {
  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const updated = Array.isArray(stored) ? stored.filter((s) => s.siteUrl !== siteUrl) : [];
  await figma.clientStorage.setAsync(STORAGE_SITES_KEY, updated);
  figma.ui.postMessage({
    type: 'sites-loaded',
    sites: updated,
    activeSiteUrl: (updated[0] && updated[0].siteUrl) || '',
    pages: [],
    templates: [],
  });
  announce('Đã xóa website khỏi danh sách lưu trữ.');
}

async function handleLoadSiteTargets(siteUrl) {
  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const site = Array.isArray(stored) ? stored.find((s) => s.siteUrl === siteUrl) : null;
  if (!site) return;
  const statusData = await wpRequest(site.siteUrl, site.token, '/status');
  figma.ui.postMessage({
    type: 'site-targets',
    siteUrl: site.siteUrl,
    pages: statusData.pages || [],
    templates: statusData.templates || [],
    hasPro: Boolean(statusData.hasPro),
  });
}

export async function handleLivePushToWordPress(payload) {
  const {
    siteUrl,
    targetType = 'page',
    templateType = 'page',
    targetPostId = 0,
    postTitle = '',
    postStatus: wpPostStatus = 'draft',
    pageLayout = 'elementor_canvas',
    importMode = 'resync',
    elementorVersion = 'v3',
    syncGlobalStyles = true,
    imageFormat = 'PNG',
    imageScale = 2,
    webpQuality = 0.82,
    imageMaxWidth = 0,
    customTokens = null,
    autoUnwrap = true,
    linearBorder = true,
    devModeCss = true,
  } = payload;

  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const site = Array.isArray(stored) ? stored.find((s) => s.siteUrl === siteUrl) : null;
  if (!site) {
    throw new Error('Vui lòng chọn hoặc kết nối một website WordPress trước khi Push.');
  }

  const selection = await getActiveSelectionForExtraction();
  postStatus('1/4: Đang quét Design System từ Figma…', { progress: 4 });
  let designTokens = { colors: [], typography: [] };
  if (syncGlobalStyles) {
    try {
      designTokens = customTokens && (Array.isArray(customTokens.colors) || Array.isArray(customTokens.typography))
        ? customTokens
        : await extractLocalDesignSystem(figma, selection);
    } catch (tokenErr) {
      throw new Error(`Lỗi ở bước 1A (Design System): ${tokenErr && tokenErr.message ? tokenErr.message : tokenErr}`);
    }
  }
  let document;
  let assetPayloads;
  try {
    const extracted = await extractDesignSelection(selection, {
      fileKey: figma.fileKey || 'local-file',
      imageFormat,
      imageScale,
      useDevModeCss: devModeCss !== false,
      responsiveFrames: {
        tablet: responsiveState.tablet,
        mobile: responsiveState.mobile,
      },
      designTokens,
      onProgress: (phase, cur, total) => {
        const ratio = total > 0 ? cur / total : 1;
        if (phase === 'nodes') {
          const pct = Math.round(6 + ratio * 32); // 6% -> 38%
          postStatus(`1/4: Đang trích xuất layer Figma (${cur}/${total})…`, { progress: pct });
        } else if (phase === 'assets') {
          const pct = Math.round(38 + ratio * 20); // 38% -> 58%
          postStatus(`1/4: Đang cắt ảnh & SVG (${cur}/${total})…`, { progress: pct });
        }
      },
    });
    document = extracted.document;
    assetPayloads = extracted.assetPayloads;
    const fmtUpper = String(imageFormat || 'PNG').toUpperCase();
    const maxWNum = Number(imageMaxWidth) || 0;
    if (fmtUpper === 'WEBP' || (maxWNum > 0 && (fmtUpper === 'PNG' || fmtUpper === 'JPG'))) {
      postStatus(`1/4: Đang tối ưu ảnh (${fmtUpper}) ngay tại chỗ…`, { progress: 60 });
      await processRasterAssetsInUi(document, assetPayloads, {
        imageFormat: fmtUpper,
        quality: webpQuality,
        maxWidth: maxWNum,
        onBatchProgress: (done, total) => {
          const pct = Math.round(60 + (done / Math.max(1, total)) * 6); // 60% -> 66%
          postStatus(`1/4: Đang xử lý ảnh batch ${done}/${total}…`, { progress: pct });
        },
      });
    }
  } catch (extErr) {
    throw new Error(`Lỗi ở bước 1B (Extract Node): ${extErr && extErr.message ? extErr.message : extErr}`);
  }

  // Step 2: Upload deduplicated assets (SHA-256) with 10MB guard, transient retry & failure aggregation
  const attachmentMap = {};
  const MAX_ASSET_BYTES = 10 * 1024 * 1024;
  try {
    if (assetPayloads.length > 0) {
      const CONCURRENCY = Math.min(4, assetPayloads.length);
      let cursor = 0;
      let completed = 0;
      const failedAssets = [];

      const isTransientError = (err) => {
        if (!err) return false;
        if (err.isTimeout || err.isNetwork) return true;
        if (typeof err.status === 'number') return err.status >= 500 || err.status === 429;
        return /timeout|hết thời gian|network|fetch/i.test(String(err.message || ''));
      };

      const uploadWorker = async () => {
        while (cursor < assetPayloads.length) {
          const idx = cursor;
          cursor += 1;
          const asset = assetPayloads[idx];
          const byteLen = Number(asset.byteLength || 0) || Math.ceil(String(asset.base64 || '').length * 0.75);
          if (byteLen > MAX_ASSET_BYTES) {
            failedAssets.push({
              sha256: asset.sha256,
              error: `${asset.assetId || asset.sha256.slice(0, 8)} vượt quá giới hạn 10MB (${(byteLen / 1048576).toFixed(1)}MB). Hãy bật WebP, độ phân giải 1x hoặc giới hạn rộng tối đa.`,
            });
            completed += 1;
            continue;
          }

          const uploadPct = Math.round(68 + (completed / assetPayloads.length) * 18); // 68% -> 86%
          postStatus(`2/4: Đang đồng bộ tài nguyên ${completed + 1}/${assetPayloads.length} (SHA-256: ${asset.sha256.slice(0, 8)})…`, { progress: uploadPct });

          let lastErr = null;
          let uploaded = null;
          for (let attempt = 0; attempt <= 1; attempt += 1) {
            try {
              uploaded = await wpRequest(site.siteUrl, site.token, '/assets', {
                method: 'POST',
                timeoutMs: 90000,
                body: JSON.stringify({
                  sha256: asset.sha256,
                  mime: asset.mime,
                  kind: asset.kind,
                  base64: asset.base64,
                  name: document.title,
                }),
              });
              lastErr = null;
              break;
            } catch (err) {
              lastErr = err;
              if (attempt === 0 && isTransientError(err)) {
                await new Promise((r) => setTimeout(r, 400));
                continue;
              }
              break;
            }
          }

          if (lastErr) {
            failedAssets.push({
              sha256: asset.sha256,
              error: `${asset.assetId || asset.sha256.slice(0, 8)}: ${lastErr.message || lastErr}`,
            });
          } else if (uploaded && Number(uploaded.id) > 0 && uploaded.url) {
            attachmentMap[asset.sha256] = { id: uploaded.id, url: uploaded.url };
          } else {
            failedAssets.push({
              sha256: asset.sha256,
              error: `${asset.assetId || asset.sha256.slice(0, 8)}: WordPress không trả về id/url hợp lệ.`,
            });
          }
          completed += 1;
        }
      };

      const workers = [];
      for (let w = 0; w < CONCURRENCY; w += 1) {
        workers.push(uploadWorker());
      }
      await Promise.all(workers);

      if (failedAssets.length > 0) {
        const preview = failedAssets.slice(0, 2).map((f) => f.error).join('; ');
        throw new Error(
          `Upload thất bại ${failedAssets.length}/${assetPayloads.length} tài nguyên (đã lưu ${Object.keys(attachmentMap).length}, các file đã lên sẽ được tái sử dụng qua SHA-256 khi thử lại): ${preview}`
        );
      }
    }
  } catch (assetErr) {
    throw new Error(`Lỗi ở bước 2 (Upload Asset): ${assetErr && assetErr.message ? assetErr.message : assetErr}`);
  }

  // Step 3: Optionally sync Global Design System (Colors & Typography)
  try {
    if (syncGlobalStyles && (designTokens.colors.length > 0 || designTokens.typography.length > 0)) {
      postStatus('3/4: Đang đồng bộ Global Colors & Fonts vào Elementor Site Settings…', { progress: 88 });
      await wpRequest(site.siteUrl, site.token, '/design-system', {
        method: 'POST',
        body: JSON.stringify(designTokens),
      });
    }
  } catch (dsErr) {
    throw new Error(`Lỗi ở bước 3 (Sync Globals): ${dsErr && dsErr.message ? dsErr.message : dsErr}`);
  }

  // Step 4: Compile on client with resolved attachmentMap & send compiled elements to WordPress
  let result;
  let fidelityReport = null;
  try {
    postStatus('4/4: Đang kiểm tra độ khớp thiết kế & cập nhật cấu trúc Elementor trên WordPress…', { progress: 94 });
    let compiledElements;
    if (elementorVersion === 'v4') {
      compiledElements = compileElementorV4(document, { siteUrl: site.siteUrl, attachmentMap }).content;
    } else {
      const v3Out = compileElementorV3(document, {
        siteUrl: site.siteUrl,
        attachmentMap,
        autoUnwrap: autoUnwrap !== false,
        linearBorder: linearBorder !== false,
      });
      compiledElements = v3Out.content;
      fidelityReport = v3Out.fidelityReport;
    }

    result = await wpRequest(site.siteUrl, site.token, '/import', {
      method: 'POST',
      timeoutMs: 90000,
      body: JSON.stringify({
        title: postTitle || document.title,
        targetType,
        templateType,
        targetPostId: Number(targetPostId) || 0,
        postStatus: wpPostStatus,
        pageLayout,
        importMode,
        elementorVersion,
        attachmentMap,
        content: compiledElements,
      }),
    });
  } catch (impErr) {
    throw new Error(`Lỗi ở bước 4 (Import WP): ${impErr && impErr.message ? impErr.message : impErr}`);
  }

  figma.ui.postMessage({
    type: 'push-complete',
    result,
    fidelityReport,
  });
  announce(`Đã đẩy thành công lên WordPress! (${result.actionLabel || 'Saved'} — Post #${result.postId})`);
  await handleLoadSiteTargets(site.siteUrl).catch(() => {});
}

async function handleScanDesignSystemPreview() {
  postStatus('Đang quét Color Variables, Text Styles & Theme Styles từ Figma…');
  const tokens = await extractLocalDesignSystem(figma, figma.currentPage.selection);
  figma.ui.postMessage({
    type: 'design-system-preview',
    tokens,
  });
  postStatus(`Đã tìm thấy ${tokens.colors.length} màu, ${tokens.typography.length} font`, { done: true });
}

async function handleSyncDesignSystemOnly(siteUrl, options = {}) {
  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const site = Array.isArray(stored) ? stored.find((s) => s.siteUrl === siteUrl) : null;
  if (!site) {
    throw new Error('Vui lòng kết nối website WordPress trước.');
  }
  postStatus('Đang trích xuất Design System & Theme Styles từ Figma…');
  const tokens = (options && options.customTokens && (Array.isArray(options.customTokens.colors) || Array.isArray(options.customTokens.typography)))
    ? options.customTokens
    : await extractLocalDesignSystem(figma, figma.currentPage.selection);
  if (tokens.colors.length === 0 && tokens.typography.length === 0 && !tokens.themeStyles?.buttons && !tokens.settings?.layout?.containerWidth) {
    throw new Error('Chưa phát hiện màu sắc hoặc kiểu chữ nào. Hãy chọn 1 Frame trên Figma rồi bấm "Quét lại".');
  }

  const payload = {
    colors: options.syncColors !== false ? tokens.colors : [],
    typography: options.syncTypography !== false ? tokens.typography : [],
    themeStyles: options.syncThemeStyles !== false ? tokens.themeStyles : {},
    settings: options.syncLayout !== false ? tokens.settings : {},
  };

  const colorCount = payload.colors.length;
  const typoCount = payload.typography.length;
  const themeItems = Object.keys(payload.themeStyles.typography || {}).length + (payload.themeStyles.buttons ? 1 : 0);

  postStatus(`Đang đẩy ${colorCount} màu, ${typoCount} font, ${themeItems} theme styles vào Site Settings Kit…`);
  const res = await wpRequest(site.siteUrl, site.token, '/design-system', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const rep = (res && res.data) || res || {};
  const newColors = (rep.colors && rep.colors.created && rep.colors.created.length) || 0;
  const newFonts = (rep.typography && rep.typography.created && rep.typography.created.length) || 0;
  const updatedStyles = (rep.themeStyles && rep.themeStyles.updated && rep.themeStyles.updated.join(', ')) || '';
  const updatedSettings = (rep.settings && rep.settings.updated && rep.settings.updated.join(', ')) || '';

  const details = [];
  if (colorCount) details.push(`${colorCount} màu (${newColors} mới)`);
  if (typoCount) details.push(`${typoCount} font (${newFonts} mới)`);
  if (updatedStyles) details.push(`Theme: ${updatedStyles}`);
  if (updatedSettings) details.push(updatedSettings);

  announce(`Đã đồng bộ toàn bộ Site Settings thành công! [${details.join(' | ')}]`);

  figma.ui.postMessage({
    type: 'design-system-preview',
    tokens,
  });
}

function slugify(text) {
  return String(text || 'figma-design')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'figma-design';
}

async function handleRequestAiScanPayload() {
  const selection = figma.currentPage.selection || [];
  if (selection.length === 0) {
    throw new Error('Vui lòng chọn ít nhất 1 Frame trên Figma trước khi quét bằng AI!');
  }
  const root = selection[0];
  postStatus(`Đang chụp ảnh "${root.name}" và trích xuất cấu trúc layer...`);

  let imageBase64 = '';
  if (typeof root.exportAsync === 'function') {
    const maxDim = Math.max(Number(root.width) || 1, Number(root.height) || 1);
    const scale = maxDim > 1600 ? (1200 / maxDim) : 1;
    const pngBytes = await root.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: Math.max(0.4, Math.min(2, scale)) },
    });
    imageBase64 = bytesToBase64(pngBytes);
  }

  function buildAiLayerTree(node, depth = 0) {
    if (!node || depth > 5 || node.visible === false) return null;
    const item = {
      id: node.id,
      name: String(node.name || 'Layer').slice(0, 80),
      type: node.type,
      w: Math.round(Number(node.width) || 0),
      h: Math.round(Number(node.height) || 0),
    };
    if (node.type === 'TEXT') {
      item.text = String(node.characters || '').slice(0, 120);
      if (typeof node.fontSize === 'number') item.fontSize = Math.round(node.fontSize);
    }
    const kids = (node.children || []).filter((c) => c.visible !== false);
    if (kids.length > 0) {
      item.children = kids.map((k) => buildAiLayerTree(k, depth + 1)).filter(Boolean);
    }
    return item;
  }

  const tree = buildAiLayerTree(root);
  figma.ui.postMessage({
    type: 'ai-scan-payload-ready',
    rootId: root.id,
    rootName: root.name,
    imageBase64,
    tree,
  });
}

async function handleApplyAiTags(tags = []) {
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error('AI không tìm thấy nhãn widget nào phù hợp.');
  }
  let applied = 0;
  for (const item of tags) {
    const id = item.id || item.nodeId;
    const widget = item.widget;
    if (!id || !widget || !SUPPORTED_WIDGETS.includes(widget)) continue;
    const node = figma.getNodeByIdAsync ? await figma.getNodeByIdAsync(id) : null;
    if (node && typeof node.setPluginData === 'function') {
      node.setPluginData(WIDGET_PLUGIN_KEY, widget);
      applied += 1;
    }
  }
  sendOutlineToUi();
  figma.ui.postMessage({
    type: 'ai-tags-applied',
    appliedCount: applied,
    totalCount: tags.length,
  });
  announce(`✨ Gemini Flash AI đã tự động gán thẻ thành công ${applied} widget!`);
}

export function createMessageHandler() {
  return async (msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === 'compress-assets-webp-result') {
      const resolver = pendingWebpRequests.get(msg.requestId);
      if (resolver) {
        pendingWebpRequests.delete(msg.requestId);
        resolver(msg.results || []);
      }
      return;
    }
    const busyTypes = [
      'verify-site',
      'live-push',
      'sync-design-system',
      'scan-design-system',
      'export-action',
      'fix-auto-layout',
      'request-ai-scan-payload',
      'apply-ai-tags',
    ];
    const isBusy = busyTypes.includes(msg.type);
    if (isBusy) figma.ui.postMessage({ type: 'busy', busy: true });

    try {
      switch (msg.type) {
        case 'get-outline':
          sendOutlineToUi();
          break;
        case 'inspect-node-css':
          await handleInspectNodeDevMode(msg);
          break;
        case 'set-widget':
          await setLayerWidgetOverride(msg.nodeId, msg.widget);
          break;
        case 'reset-all-widgets':
          await handleResetAllWidgetOverrides();
          break;
        case 'fix-auto-layout':
          handleFixAutoLayout();
          break;
        case 'request-ai-scan-payload':
          await handleRequestAiScanPayload();
          break;
        case 'apply-ai-tags':
          await handleApplyAiTags(msg.tags);
          break;
        case 'save-ai-config':
          await figma.clientStorage.setAsync(STORAGE_AI_KEY, msg.config);
          announce('Đã lưu cấu hình Gemini API Key thành công!');
          break;
        case 'save-prefs':
          await figma.clientStorage.setAsync(STORAGE_PREFS_KEY, msg.prefs || {});
          break;
        case 'capture-responsive':
          handleCaptureResponsive(msg.viewport);
          break;
        case 'clear-responsive':
          handleClearResponsive();
          break;
        case 'verify-site':
          await handleVerifyAndSaveSite(msg.config);
          break;
        case 'delete-site':
          await handleDeleteSite(msg.siteUrl);
          break;
        case 'load-site-targets':
          await handleLoadSiteTargets(msg.siteUrl);
          break;
        case 'live-push':
          await handleLivePushToWordPress(msg.payload);
          break;
        case 'sync-design-system':
          await handleSyncDesignSystemOnly(msg.siteUrl, msg.options || {});
          break;
        case 'scan-design-system':
          await handleScanDesignSystemPreview();
          break;
        case 'export-action':
          await handleCompileForClipboardOrDownload(msg.payload);
          break;
        default:
          break;
      }
    } catch (err) {
      const rawMsg = (err && (err.message || (typeof err.toString === 'function' ? err.toString() : ''))) || String(err) || 'Đã xảy ra lỗi.';
      const fullStack = err && err.stack ? ` [${String(err.stack).replace(/\s+/g, ' ').slice(0, 320)}]` : '';
      const text = `${rawMsg}${fullStack}`;
      announce(text.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]'), true);
    } finally {
      if (isBusy) figma.ui.postMessage({ type: 'busy', busy: false });
    }
  };
}

export function initPluginRuntime() {
  figma.showUI(__html__, { width: 480, height: 680 });
  figma.on('selectionchange', sendOutlineToUi);
  sendOutlineToUi();

  Promise.all([
    figma.clientStorage.getAsync(STORAGE_SITES_KEY),
    figma.clientStorage.getAsync(STORAGE_PREFS_KEY),
    figma.clientStorage.getAsync(STORAGE_AI_KEY),
  ]).then(([sites, prefs, aiConfig]) => {
    const list = Array.isArray(sites) ? sites : [];
    const activeUrl = (list[0] && list[0].siteUrl) || '';
    figma.ui.postMessage({
      type: 'init-state',
      sites: list,
      activeSiteUrl: activeUrl,
      widgetCatalog: WIDGET_CATALOG,
      prefs: prefs || {},
      aiConfig: aiConfig || { apiKey: '', model: 'gemini-3.8-flash' },
    });
    if (activeUrl) {
      handleLoadSiteTargets(activeUrl).catch(() => { });
    }
  });

  figma.ui.onmessage = createMessageHandler();
}

if (typeof figma !== 'undefined' && figma && figma.ui && figma.clientStorage && typeof figma.showUI === 'function') {
  initPluginRuntime();
}
