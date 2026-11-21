/**
 * F2E Bridge — Figma Plugin Main Thread (Sandbox)
 * Runs inside Figma Desktop (100% Free, Zero REST API limits).
 */

import { bytesToBase64 } from './utils/crypto.js';
import {
  WIDGET_PLUGIN_KEY,
  WIDGET_CATALOG,
  SUPPORTED_WIDGETS,
  resolveWidget,
  visibleChildren,
  isAtomicLeafWidget,
  isContainerWidget,
} from './tagging/widget-resolver.js';
import { fixAndOptimizeCanvasSelection } from './optimizer/auto-layout-fixer.js';
import {
  extractDesignSelection,
  extractLocalDesignSystem,
  captureResponsiveTree,
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

figma.showUI(__html__, { width: 480, height: 680 });

function postStatus(message, extra = {}) {
  figma.ui.postMessage({ type: 'status', message, ...extra });
}

function announce(message, isError = false) {
  postStatus(message, { done: true, error: isError });
  try {
    figma.notify(message, { error: isError, timeout: isError ? 5500 : 3500 });
  } catch (e) { }
}

function normalizeSiteUrl(rawUrl) {
  const cleaned = String(rawUrl || '').trim().replace(/\/+$/, '');
  const match = /^(https?:)\/\/([^/?#]+)(\/[^?#]*)?$/i.exec(cleaned);
  if (!match) {
    throw new Error('Vui lòng nhập URL WordPress hợp lệ (ví dụ: https://example.com hoặc http://localhost:10040).');
  }
  return `${match[1].toLowerCase()}//${match[2]}${(match[3] || '').replace(/\/+$/, '')}`;
}

async function wpRequest(siteUrl, token, endpoint, init = {}) {
  const baseUrl = normalizeSiteUrl(siteUrl);
  const url = `${baseUrl}/index.php?rest_route=/f2e-bridge/v1${endpoint}`;

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

  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (err) {
    const detail = err && err.message ? `: ${err.message}` : '';
    const isHttpCustomLocal = /^http:\/\/(?!localhost|127\.0\.0\.1|\[::1\])/i.test(baseUrl);
    const localHint = isHttpCustomLocal
      ? ' (Lưu ý: Figma chặn HTTP thường với tên miền .local do Mixed Content — hãy dùng http://localhost:PORT của LocalWP, ví dụ http://localhost:10040, hoặc bật Trust SSL trong LocalWP để dùng https://)'
      : '';
    throw new Error(`Không thể kết nối tới WordPress${detail}${localHint}.`);
  }

  let body;
  try {
    if (typeof response.json === 'function') {
      body = await response.json();
    } else if (typeof response.text === 'function') {
      const txt = await response.text();
      body = JSON.parse(txt);
    } else {
      throw new Error('Response object has neither json() nor text()');
    }
  } catch (e) {
    throw new Error(`WordPress trả về dữ liệu không phải JSON (HTTP ${response.status}): ${e && e.message ? e.message : e}`);
  }

  if (!response.ok || !body || body.success === false) {
    const errMsg = (body && (body.message || (body.data && body.data.message))) || `WordPress trả về lỗi HTTP ${response.status}.`;
    throw new Error(errMsg);
  }
  return body.data !== undefined ? body.data : body;
}

/** Build flat indented outline of current selection for the Widget Tagging UI */
function buildSelectionOutline(selection) {
  const items = [];
  const walk = (node, depth, isTopRoot = false) => {
    if (!node || node.visible === false || items.length >= 250) return;
    const resolved = resolveWidget(node);
    const hasAutoLayout = Boolean(node.layoutMode && node.layoutMode !== 'NONE');
    items.push({
      nodeId: node.id,
      name: String(node.name || 'Unnamed').slice(0, 64),
      type: node.type,
      depth,
      widget: resolved.widget,
      source: resolved.source,
      hasAutoLayout,
      childCount: visibleChildren(node).length,
    });
    // Do not expand internal layers/vectors of atomic leaf widgets (icons, logos, buttons, images, etc.)
    // or layers marked "skip", so the outline matches Elementor's actual widget hierarchy!
    if (isAtomicLeafWidget(resolved.widget)) {
      return;
    }
    for (const child of visibleChildren(node)) {
      walk(child, depth + 1, false);
    }
  };
  for (const root of selection) {
    walk(root, 0, true);
  }
  return items;
}

function sendOutlineToUi() {
  const selection = figma.currentPage.selection || [];
  figma.ui.postMessage({
    type: 'outline',
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
    throw new Error('Hãy chọn ít nhất 1 Frame hoặc Group trên Figma trước khi tối ưu Auto-Layout.');
  }
  const result = fixAndOptimizeCanvasSelection(selection);
  sendOutlineToUi();
  announce(
    `Đã tối ưu xong! Chuyển đổi ${result.convertedFrames} Frame sang Auto-Layout và gom ${result.taggedIcons} nhóm Vector thành Icon.`
  );
}

async function getActiveSelectionForExtraction() {
  if (responsiveState.desktop && responsiveState.desktop.nodeId && typeof figma.getNodeByIdAsync === 'function') {
    const desktopNode = await figma.getNodeByIdAsync(responsiveState.desktop.nodeId);
    if (desktopNode && !desktopNode.removed) {
      return [desktopNode];
    }
  }
  const selection = figma.currentPage.selection || [];
  if (selection.length === 0) {
    throw new Error('Vui lòng chọn ít nhất 1 Frame hoặc Component trên Figma!');
  }
  return selection;
}

async function handleCompileForClipboardOrDownload(payload = {}) {
  const {
    action = 'clipboard',
    imageFormat = 'PNG',
    imageScale = 2,
    siteUrl = '',
  } = payload;

  const selection = await getActiveSelectionForExtraction();
  postStatus('Đang trích xuất cây thiết kế & hình ảnh/SVG từ Figma…');
  const designTokens = await extractLocalDesignSystem(figma);
  const { document, assetPayloads } = await extractDesignSelection(selection, {
    fileKey: figma.fileKey || 'local-file',
    imageFormat,
    imageScale,
    responsiveFrames: {
      tablet: responsiveState.tablet,
      mobile: responsiveState.mobile,
    },
    designTokens,
  });

  if (action === 'clipboard') {
    const clipboardData = compileElementorClipboard(document, { siteUrl });
    figma.ui.postMessage({
      type: 'clipboard-ready',
      json: JSON.stringify(clipboardData),
      title: document.title,
      warnings: document.warnings,
    });
    announce(`Đã copy "${document.title}" (${clipboardData.elements.length} sections)! Mở Elementor Editor và bấm Ctrl+V.`);
    return;
  }

  if (action === 'download-elementor-v3') {
    const v3Json = compileElementorV3(document, { siteUrl });
    figma.ui.postMessage({
      type: 'download-ready',
      filename: `${slugify(document.title)}-elementor-v3.json`,
      json: JSON.stringify(v3Json, null, 2),
      warnings: document.warnings,
    });
    announce('Đã xuất file Elementor v3 Template (.json) thành công!');
    return;
  }

  if (action === 'download-elementor-v4') {
    const v4Json = compileElementorV4(document);
    figma.ui.postMessage({
      type: 'download-ready',
      filename: `${slugify(document.title)}-elementor-v4-atomic.json`,
      json: JSON.stringify(v4Json, null, 2),
      warnings: document.warnings,
    });
    announce('Đã xuất file Elementor v4 Atomic (.json) thành công!');
    return;
  }

  const bundle = {
    kind: 'f2e.bundle',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    document,
    assets: assetPayloads,
    elementorV3: compileElementorV3(document, { siteUrl }),
    elementorV4: compileElementorV4(document),
  };
  figma.ui.postMessage({
    type: 'download-ready',
    filename: `${slugify(document.title)}-bundle.f2e.json`,
    json: JSON.stringify(bundle, null, 2),
    warnings: document.warnings,
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

async function handleLivePushToWordPress(payload) {
  const {
    siteUrl,
    targetType = 'page',
    templateType = 'page',
    targetPostId = 0,
    postTitle = '',
    postStatus = 'draft',
    importMode = 'resync',
    elementorVersion = 'v3',
    syncGlobalStyles = true,
    imageFormat = 'PNG',
    imageScale = 2,
  } = payload;

  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const site = Array.isArray(stored) ? stored.find((s) => s.siteUrl === siteUrl) : null;
  if (!site) {
    throw new Error('Vui lòng chọn hoặc kết nối một website WordPress trước khi Push.');
  }

  const selection = await getActiveSelectionForExtraction();
  postStatus('1/4: Đang trích xuất thiết kế & tài nguyên từ Figma…');
  let designTokens = { colors: [], typography: [] };
  if (syncGlobalStyles) {
    try {
      designTokens = await extractLocalDesignSystem(figma);
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
      responsiveFrames: {
        tablet: responsiveState.tablet,
        mobile: responsiveState.mobile,
      },
      designTokens,
    });
    document = extracted.document;
    assetPayloads = extracted.assetPayloads;
  } catch (extErr) {
    throw new Error(`Lỗi ở bước 1B (Extract Node): ${extErr && extErr.message ? extErr.message : extErr}`);
  }

  // Step 2: Upload deduplicated assets (SHA-256)
  const attachmentMap = {};
  try {
    if (assetPayloads.length > 0) {
      for (let i = 0; i < assetPayloads.length; i += 1) {
        const asset = assetPayloads[i];
        postStatus(`2/4: Đang đồng bộ tài nguyên ${i + 1}/${assetPayloads.length} (SHA-256: ${asset.sha256.slice(0, 8)})…`);
        const uploaded = await wpRequest(site.siteUrl, site.token, '/assets', {
          method: 'POST',
          body: JSON.stringify({
            sha256: asset.sha256,
            mime: asset.mime,
            kind: asset.kind,
            base64: asset.base64,
            name: document.title,
          }),
        });
        if (uploaded && uploaded.id) {
          attachmentMap[asset.sha256] = { id: uploaded.id, url: uploaded.url };
        }
      }
    }
  } catch (assetErr) {
    throw new Error(`Lỗi ở bước 2 (Upload Asset): ${assetErr && assetErr.message ? assetErr.message : assetErr}`);
  }

  // Step 3: Optionally sync Global Design System (Colors & Typography)
  try {
    if (syncGlobalStyles && (designTokens.colors.length > 0 || designTokens.typography.length > 0)) {
      postStatus('3/4: Đang đồng bộ Global Colors & Fonts vào Elementor Site Settings…');
      await wpRequest(site.siteUrl, site.token, '/design-system', {
        method: 'POST',
        body: JSON.stringify(designTokens),
      });
    }
  } catch (dsErr) {
    throw new Error(`Lỗi ở bước 3 (Sync Globals): ${dsErr && dsErr.message ? dsErr.message : dsErr}`);
  }

  // Step 4: Compile on client with resolved attachmentMap AND send both IR + compiled elements to WordPress
  let result;
  try {
    postStatus('4/4: Đang tạo/cập nhật cấu trúc Elementor trên WordPress…');
    const compiledElements = elementorVersion === 'v4'
      ? compileElementorV4(document).content
      : compileElementorV3(document, { siteUrl: site.siteUrl, attachmentMap }).content;

    result = await wpRequest(site.siteUrl, site.token, '/import', {
      method: 'POST',
      body: JSON.stringify({
        title: postTitle || document.title,
        targetType,
        templateType,
        targetPostId: Number(targetPostId) || 0,
        postStatus,
        importMode,
        elementorVersion,
        attachmentMap,
        content: compiledElements,
        document,
      }),
    });
  } catch (impErr) {
    throw new Error(`Lỗi ở bước 4 (Import WP): ${impErr && impErr.message ? impErr.message : impErr}`);
  }

  figma.ui.postMessage({
    type: 'push-complete',
    result,
  });
  announce(`Đã đẩy thành công lên WordPress! (${result.actionLabel || 'Saved'} — Post #${result.postId})`);
  await handleLoadSiteTargets(site.siteUrl);
}

async function handleSyncDesignSystemOnly(siteUrl) {
  const stored = (await figma.clientStorage.getAsync(STORAGE_SITES_KEY)) || [];
  const site = Array.isArray(stored) ? stored.find((s) => s.siteUrl === siteUrl) : null;
  if (!site) {
    throw new Error('Vui lòng kết nối website WordPress trước.');
  }
  postStatus('Đang đọc Color Variables & Text Styles từ Figma…');
  const tokens = await extractLocalDesignSystem(figma);
  if (tokens.colors.length === 0 && tokens.typography.length === 0) {
    throw new Error('File Figma này chưa khai báo Local Color Variables hoặc Text Styles.');
  }
  postStatus(`Đang đồng bộ ${tokens.colors.length} màu và ${tokens.typography.length} kiểu chữ…`);
  const res = await wpRequest(site.siteUrl, site.token, '/design-system', {
    method: 'POST',
    body: JSON.stringify(tokens),
  });
  const newColors = (res && res.colors && res.colors.created && res.colors.created.length) || 0;
  const newFonts = (res && res.typography && res.typography.created && res.typography.created.length) || 0;
  announce(`Đã đồng bộ Design System! (Màu mới: ${newColors}, Font mới: ${newFonts})`);
}

function slugify(text) {
  return String(text || 'figma-design')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'figma-design';
}

figma.on('selectionchange', sendOutlineToUi);
sendOutlineToUi();

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

figma.ui.onmessage = async (msg) => {
  if (!msg || !msg.type) return;
  const busyTypes = [
    'verify-site',
    'live-push',
    'sync-design-system',
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
        await handleSyncDesignSystemOnly(msg.siteUrl);
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
