import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { wp, wpJson } from './localwp.mjs';
import { importPluginApi } from './figma-mocks.mjs';
import { recordCreatedAttachment } from './cleanup.mjs';

function checkMagicBytes(buf, expectedMime) {
  if (!buf || buf.length < 4) return false;
  if (expectedMime === 'image/png') {
    return buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (expectedMime === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (expectedMime === 'image/webp') {
    return buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (expectedMime === 'image/gif') {
    const hdr = buf.subarray(0, 6).toString('ascii');
    return hdr === 'GIF87a' || hdr === 'GIF89a';
  }
  if (expectedMime === 'image/svg+xml') {
    return buf.toString('utf8').toLowerCase().includes('<svg');
  }
  return true;
}

/**
 * Verifies a WordPress attachment across REST `/wp/v2/media/<id>`, WP-CLI `_wp_attachment_metadata`,
 * disk file + generated thumbnails, SHA-256 postmeta, and HTTP 200 GET on main + thumbnail URLs.
 */
export async function verifyMediaAttachment(env, wpClient, attachmentId, expectedMime, opts = {}) {
  const {
    expectedSha256 = '',
    expectedWidth = 0,
    expectedHeight = 0,
    expectThumbnails = false,
  } = opts;

  assert.ok(Number(attachmentId) > 0, `Attachment ID must be > 0, got ${attachmentId}`);

  // 1. REST /wp/v2/media/<id>
  const mediaRes = await wpClient.getWpMedia(attachmentId);
  assert.equal(mediaRes.status, 200, `GET /wp/v2/media/${attachmentId} returned ${mediaRes.status}`);
  assert.equal(mediaRes.json?.mime_type, expectedMime, `WP REST mime_type mismatch for #${attachmentId}`);
  assert.ok(mediaRes.json?.source_url, `WP REST source_url missing for #${attachmentId}`);
  const details = mediaRes.json?.media_details;
  assert.ok(details && typeof details === 'object' && Object.keys(details).length > 0, `media_details is empty for #${attachmentId}`);
  assert.ok(Number(details.width) > 0 && Number(details.height) > 0, `media_details missing width/height for #${attachmentId}: ${JSON.stringify(details)}`);
  if (expectedWidth > 0) assert.equal(Number(details.width), expectedWidth, `width mismatch for #${attachmentId}`);
  if (expectedHeight > 0) assert.equal(Number(details.height), expectedHeight, `height mismatch for #${attachmentId}`);

  // 2. WP-CLI _wp_attachment_metadata, _f2e_sha256 & disk file
  const wpInfo = wpJson(
    env,
    'eval',
    `$id=${Number(attachmentId)}; $f=get_attached_file($id); $m=get_post_meta($id,"_wp_attachment_metadata",true); $h=get_post_meta($id,"_f2e_sha256",true); echo wp_json_encode(["file"=>$f,"meta"=>$m,"sha256"=>$h,"mime"=>get_post_mime_type($id)]);`
  );
  assert.ok(wpInfo && wpInfo.file && fs.existsSync(wpInfo.file), `Attached disk file missing for #${attachmentId}: ${wpInfo?.file}`);
  const diskBytes = fs.readFileSync(wpInfo.file);
  assert.ok(diskBytes.length > 0, `Attached disk file empty for #${attachmentId}`);
  assert.ok(checkMagicBytes(diskBytes, expectedMime), `Disk file magic bytes mismatch for #${attachmentId} (${expectedMime})`);

  if (expectedSha256) {
    assert.equal(wpInfo.sha256, expectedSha256, `_f2e_sha256 mismatch for #${attachmentId}`);
  }
  assert.ok(wpInfo.meta && typeof wpInfo.meta === 'object', `_wp_attachment_metadata missing for #${attachmentId}`);
  assert.ok(Number(wpInfo.meta.width) > 0 && Number(wpInfo.meta.height) > 0, `_wp_attachment_metadata missing dimensions for #${attachmentId}`);

  const urlsToCheck = new Set([mediaRes.json.source_url]);
  if (expectThumbnails) {
    assert.ok(wpInfo.meta.sizes && typeof wpInfo.meta.sizes === 'object', `Expected thumbnail sizes in _wp_attachment_metadata for #${attachmentId}`);
    assert.ok(wpInfo.meta.sizes.thumbnail?.file, `Missing thumbnail size for #${attachmentId}`);
    assert.ok(wpInfo.meta.sizes.medium?.file, `Missing medium size for #${attachmentId}`);
    const dir = path.dirname(wpInfo.file);
    for (const [sizeName, sizeInfo] of Object.entries(wpInfo.meta.sizes)) {
      const thumbPath = path.join(dir, sizeInfo.file);
      assert.ok(fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0, `Thumbnail file ${sizeName} missing on disk: ${thumbPath}`);
    }
    if (details.sizes?.thumbnail?.source_url) urlsToCheck.add(details.sizes.thumbnail.source_url);
    if (details.sizes?.medium?.source_url) urlsToCheck.add(details.sizes.medium.source_url);
  }

  // 3. Live HTTP 200 fetch for main + thumbnail URLs
  for (const rawUrl of urlsToCheck) {
    const targetUrl = wpClient.toTargetOriginUrl(rawUrl);
    const getRes = await wpClient.fetchUrl(targetUrl);
    assert.equal(getRes.status, 200, `GET ${targetUrl} failed with ${getRes.status}`);
    assert.ok(getRes.buffer.length > 0, `GET ${targetUrl} returned empty body`);
    const ct = (getRes.headers.get('content-type') || '').toLowerCase();
    assert.ok(
      ct.includes(expectedMime) || (expectedMime.startsWith('image/') && ct.includes('image/')),
      `Unexpected Content-Type "${ct}" for ${targetUrl} (expected ${expectedMime})`
    );
  }

  return { wpInfo, media: mediaRes.json, checkedUrls: [...urlsToCheck] };
}

/**
 * Recursively walks an Elementor v3/v4 tree to find unresolved URIs, `<path-to-image>`,
 * malformed `selected_icon`, and collect all referenced media objects.
 */
export function inspectElementorMediaTree(elements) {
  const unresolvedDataUris = [];
  const placeholderLeaks = [];
  const invalidIconValues = [];
  const mediaRefs = [];

  const scanStrings = (val, pathStr) => {
    if (typeof val === 'string') {
      if (val.includes('data:image/')) {
        unresolvedDataUris.push({ path: pathStr, sample: val.slice(0, 80) });
      }
      if (val.includes('<path-to-image>')) {
        placeholderLeaks.push({ path: pathStr, sample: val.slice(0, 120) });
      }
      return;
    }
    if (Array.isArray(val)) {
      val.forEach((item, idx) => scanStrings(item, `${pathStr}[${idx}]`));
      return;
    }
    if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        scanStrings(v, `${pathStr}.${k}`);
      }
    }
  };

  const recordMedia = (obj, pathStr) => {
    if (!obj || typeof obj !== 'object') return;
    if (typeof obj.url === 'string' && obj.url !== '') {
      mediaRefs.push({ path: pathStr, id: Number(obj.id) || 0, url: obj.url });
    }
  };

  const walk = (list, basePath = 'elements') => {
    if (!Array.isArray(list)) return;
    list.forEach((el, idx) => {
      if (!el || typeof el !== 'object') return;
      const p = `${basePath}[${idx}]`;
      const s = el.settings || {};
      scanStrings(s, `${p}.settings`);

      for (const k of [
        'image', 'background_image', '_background_image',
        'background_overlay_image', 'background_hover_image',
        'custom_image', 'bg_image', 'testimonial_image',
      ]) {
        if (s[k] && typeof s[k] === 'object') {
          if (s[k].$$type === 'image' && s[k].value && typeof s[k].value === 'object') {
            recordMedia(s[k].value, `${p}.settings.${k}.value`);
          } else {
            recordMedia(s[k], `${p}.settings.${k}`);
          }
        }
      }

      if (s.selected_icon && s.selected_icon.library === 'svg') {
        const val = s.selected_icon.value;
        if (!val || typeof val !== 'object' || !(Number(val.id) > 0) || !val.url) {
          invalidIconValues.push({ path: `${p}.settings.selected_icon`, value: val });
        } else {
          recordMedia(val, `${p}.settings.selected_icon.value`);
        }
      }

      for (const listKey of ['slides', 'gallery', 'wp_gallery', 'carousel']) {
        if (Array.isArray(s[listKey])) {
          s[listKey].forEach((item, j) => {
            if (!item || typeof item !== 'object') return;
            if (item.background_image) recordMedia(item.background_image, `${p}.settings.${listKey}[${j}].background_image`);
            else recordMedia(item, `${p}.settings.${listKey}[${j}]`);
          });
        }
      }

      if (Array.isArray(el.elements)) {
        walk(el.elements, `${p}.elements`);
      }
    });
  };

  walk(elements);
  return {
    unresolvedDataUris,
    placeholderLeaks,
    invalidIconValues,
    mediaRefs,
  };
}

/**
 * Shared Live Verification Gate for imported Elementor documents.
 */
export async function verifyImportedDocument(env, wpClient, postId, opts = {}) {
  const {
    expectedVersion = 'v3',
    expectPublished = false,
    expectedText = '',
    ledger = null,
    minMediaRefs = 0,
  } = opts;

  const api = await importPluginApi();
  const editMode = wp(env, 'post', 'meta', 'get', String(postId), '_elementor_edit_mode');
  assert.equal(editMode, 'builder', `Post #${postId} _elementor_edit_mode must be 'builder', got '${editMode}'`);

  const rawData = wp(env, 'post', 'meta', 'get', String(postId), '_elementor_data');
  assert.ok(rawData && rawData.length > 2, `Post #${postId} _elementor_data is empty`);
  const parsed = JSON.parse(rawData);
  assert.ok(Array.isArray(parsed) && parsed.length > 0, `Post #${postId} _elementor_data must be non-empty array`);

  if (expectedVersion === 'v4') {
    const v4Check = api.validateElementorV4Tree(parsed);
    assert.equal(v4Check.valid, true, `Elementor v4 schema errors on #${postId}: ${JSON.stringify(v4Check.errors)}`);
  } else {
    const v3Check = api.validateElementorV3Tree(parsed);
    assert.equal(v3Check.valid, true, `Elementor v3 schema errors on #${postId}: ${JSON.stringify(v3Check.errors)}`);
  }

  const audit = inspectElementorMediaTree(parsed);
  assert.equal(audit.unresolvedDataUris.length, 0, `Unresolved data:image/ URIs in #${postId}: ${JSON.stringify(audit.unresolvedDataUris)}`);
  assert.equal(audit.placeholderLeaks.length, 0, `<path-to-image> leaks in #${postId}: ${JSON.stringify(audit.placeholderLeaks)}`);
  assert.equal(audit.invalidIconValues.length, 0, `Invalid selected_icon SVG objects in #${postId}: ${JSON.stringify(audit.invalidIconValues)}`);
  assert.ok(audit.mediaRefs.length >= minMediaRefs, `Expected >= ${minMediaRefs} hydrated media refs on #${postId}, found ${audit.mediaRefs.length}`);

  const checkedUrls = new Set();
  for (const ref of audit.mediaRefs) {
    assert.ok(ref.id > 0, `Media ref at ${ref.path} has missing/zero id (${ref.id}) for url ${ref.url}`);
    assert.ok(/^https?:\/\//i.test(ref.url), `Media ref at ${ref.path} has invalid url: ${ref.url}`);
    if (ledger) recordCreatedAttachment(ledger, ref.id, false);
    const targetUrl = wpClient.toTargetOriginUrl(ref.url);
    if (!checkedUrls.has(targetUrl)) {
      checkedUrls.add(targetUrl);
      const res = await wpClient.fetchUrl(targetUrl);
      assert.equal(res.status, 200, `Referenced media ${targetUrl} (${ref.path}) returned HTTP ${res.status}`);
      assert.ok(res.buffer.length > 0, `Referenced media ${targetUrl} returned empty body`);
    }
  }

  if (expectPublished) {
    const pageRes = await wpClient.getFrontendPost(postId);
    assert.equal(pageRes.status, 200, `Frontend GET /?p=${postId} returned HTTP ${pageRes.status}`);
    assert.ok(!/Fatal error:|Uncaught Error:|Parse error:/i.test(pageRes.text), `Frontend HTML for #${postId} contains PHP fatal error`);
    assert.ok(!/src=["']data:image\//i.test(pageRes.text), `Frontend HTML for #${postId} contains inline data:image/ <img src>`);
    if (expectedText) {
      assert.ok(pageRes.text.includes(expectedText), `Frontend HTML for #${postId} missing expected text "${expectedText}"`);
    }
  }

  return { parsed, audit, checkedUrls: [...checkedUrls] };
}
