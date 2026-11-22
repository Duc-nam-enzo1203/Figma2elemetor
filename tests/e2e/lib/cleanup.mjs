import fs from 'node:fs';
import path from 'node:path';
import { wp, wpJson } from './localwp.mjs';

export const HARD_PROTECTED_IDS = [237, 3, 7];

export function capturePreRunBaseline(env) {
  const rows = wpJson(
    env,
    'post', 'list',
    '--post_type=page,elementor_library,attachment',
    '--post_status=any',
    '--fields=ID,post_type,post_title',
    '--format=json'
  ) || [];

  const kitIdRaw = wp(env, 'option', 'get', 'elementor_active_kit');
  const kitId = parseInt(kitIdRaw, 10) || 7;

  const kitSnapshotB64 = wp(
    env,
    'eval',
    '$k=(int)get_option("elementor_active_kit"); echo base64_encode(serialize(get_post_meta($k, "_elementor_page_settings", true)));'
  );

  const protectedIds = new Set(HARD_PROTECTED_IDS);
  protectedIds.add(kitId);
  const baselinePages = [];
  const baselineTemplates = [];
  const baselineAttachments = [];

  for (const row of rows) {
    const id = Number(row.ID);
    if (!Number.isFinite(id) || id <= 0) continue;
    // Never treat leftover [F2E-E2E] orphans from a prior crashed run as protected baseline
    if (String(row.post_title || '').startsWith('[F2E-E2E')) continue;
    protectedIds.add(id);
    if (row.post_type === 'page') baselinePages.push(id);
    else if (row.post_type === 'elementor_library') baselineTemplates.push(id);
    else if (row.post_type === 'attachment') baselineAttachments.push(id);
  }

  return {
    kitId,
    kitSnapshotB64,
    protectedPostIds: [...protectedIds].sort((a, b) => a - b),
    baselinePages: baselinePages.sort((a, b) => a - b),
    baselineTemplates: baselineTemplates.sort((a, b) => a - b),
    baselineAttachments: baselineAttachments.sort((a, b) => a - b),
  };
}

export function createRunLedger(runId, ledgerDir, baseline) {
  const ledgerPath = path.join(ledgerDir, `.e2e-ledger-${runId}.json`);
  const ledger = {
    runId,
    startedAt: new Date().toISOString(),
    ledgerPath,
    kitId: baseline.kitId,
    kitSnapshotB64: baseline.kitSnapshotB64,
    protectedPostIds: [...baseline.protectedPostIds],
    createdPostIds: [],
    createdAttachmentIds: [],
  };
  flushLedger(ledger);
  return ledger;
}

export function flushLedger(ledger) {
  if (!ledger || !ledger.ledgerPath) return;
  const serializable = {
    runId: ledger.runId,
    startedAt: ledger.startedAt,
    kitId: ledger.kitId,
    kitSnapshotB64: ledger.kitSnapshotB64,
    protectedPostIds: ledger.protectedPostIds,
    createdPostIds: [...new Set(ledger.createdPostIds)],
    createdAttachmentIds: [...new Set(ledger.createdAttachmentIds)],
  };
  fs.writeFileSync(ledger.ledgerPath, JSON.stringify(serializable, null, 2), 'utf8');
}

export function isProtectedId(id, protectedPostIds) {
  const num = Number(id);
  if (!Number.isFinite(num) || num <= 0) return true;
  if (HARD_PROTECTED_IDS.includes(num)) return true;
  if (protectedPostIds instanceof Set) return protectedPostIds.has(num);
  if (Array.isArray(protectedPostIds)) return protectedPostIds.includes(num);
  return false;
}

export function recordCreatedPost(ledger, postId) {
  const id = Number(postId);
  if (!Number.isFinite(id) || id <= 0) return;
  if (isProtectedId(id, ledger.protectedPostIds)) return;
  if (!ledger.createdPostIds.includes(id)) {
    ledger.createdPostIds.push(id);
    flushLedger(ledger);
  }
}

export function recordCreatedAttachment(ledger, attachmentId, reused = false) {
  if (reused) return;
  const id = Number(attachmentId);
  if (!Number.isFinite(id) || id <= 0) return;
  if (isProtectedId(id, ledger.protectedPostIds)) return;
  if (!ledger.createdAttachmentIds.includes(id)) {
    ledger.createdAttachmentIds.push(id);
    flushLedger(ledger);
  }
}

export function extractAttachmentIdsFromElementorTree(elements) {
  const found = new Set();
  const visitMedia = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    const id = Number(obj.id);
    if (Number.isFinite(id) && id > 0 && typeof obj.url === 'string' && obj.url.startsWith('http')) {
      found.add(id);
    }
  };
  const walk = (list) => {
    if (!Array.isArray(list)) return;
    for (const el of list) {
      if (!el || typeof el !== 'object') continue;
      const s = el.settings || {};
      for (const k of [
        'image', 'background_image', '_background_image',
        'background_overlay_image', 'background_hover_image',
        'custom_image', 'bg_image', 'testimonial_image',
      ]) {
        if (s[k] && typeof s[k] === 'object') {
          if (s[k].$$type === 'image' && s[k].value && typeof s[k].value === 'object') {
            visitMedia(s[k].value);
          } else {
            visitMedia(s[k]);
          }
        }
      }
      if (s.selected_icon && s.selected_icon.library === 'svg' && s.selected_icon.value && typeof s.selected_icon.value === 'object') {
        visitMedia(s.selected_icon.value);
      }
      for (const listKey of ['slides', 'gallery', 'wp_gallery', 'carousel']) {
        if (Array.isArray(s[listKey])) {
          for (const item of s[listKey]) {
            if (!item || typeof item !== 'object') continue;
            if (item.background_image) visitMedia(item.background_image);
            else visitMedia(item);
          }
        }
      }
      if (Array.isArray(el.elements)) walk(el.elements);
    }
  };
  walk(elements);
  return [...found];
}

export function collectInlineHydratedAttachments(env, postId, ledger) {
  try {
    const raw = wp(env, 'post', 'meta', 'get', String(postId), '_elementor_data');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const ids = extractAttachmentIdsFromElementorTree(parsed);
    for (const id of ids) {
      recordCreatedAttachment(ledger, id, false);
    }
  } catch {
    // ignore missing/empty meta
  }
}

export function safeForceDeletePost(env, id, protectedPostIds) {
  const num = Number(id);
  if (isProtectedId(num, protectedPostIds)) {
    throw new Error(`SAFETY GUARD: Refusing to delete protected post ID ${id}`);
  }
  const exists = wp(env, 'post', 'list', `--post__in=${num}`, '--post_type=any', '--post_status=any', '--format=ids');
  if (!exists) return false;
  wp(env, 'post', 'delete', String(num), '--force');
  return true;
}

export function restoreActiveKit(env, kitId, kitSnapshotB64) {
  if (!kitId || !kitSnapshotB64) return { restored: false, verified: false };
  const safeB64 = String(kitSnapshotB64).replace(/[^A-Za-z0-9+/=]/g, '');
  const php = [
    `$k = ${(intVal(kitId))};`,
    `$raw = base64_decode('${safeB64}', true);`,
    'if ($raw === false) { fwrite(STDERR, "Invalid snapshot b64"); exit(1); }',
    '$val = unserialize($raw);',
    'update_post_meta($k, "_elementor_page_settings", $val);',
    'if (class_exists("\\\\Elementor\\\\Plugin") && isset(\\Elementor\\Plugin::$instance->files_manager)) {',
    '  \\Elementor\\Plugin::$instance->files_manager->clear_cache();',
    '}',
    'echo base64_encode(serialize(get_post_meta($k, "_elementor_page_settings", true)));',
  ].join(' ');
  const currentB64 = wp(env, 'eval', php);
  return {
    restored: true,
    verified: currentB64 === safeB64,
    currentB64,
  };
}

function intVal(v) {
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid integer kitId: ${v}`);
  return n;
}

export function cleanupLedger(env, ledger, { keepOnFail = false, failed = false } = {}) {
  const errors = [];
  let kitVerify = { restored: false, verified: true };

  if (ledger.kitId && ledger.kitSnapshotB64) {
    try {
      kitVerify = restoreActiveKit(env, ledger.kitId, ledger.kitSnapshotB64);
      if (!kitVerify.verified) {
        errors.push(`Active Kit ${ledger.kitId} settings mismatch after restore`);
      }
    } catch (err) {
      errors.push(`Active Kit restore failed: ${err.message}`);
    }
  }

  if (keepOnFail && failed) {
    return { skippedDeletes: true, kitVerify, errors };
  }

  // Gather any inline attachments referenced in created posts before deleting posts
  for (const postId of [...ledger.createdPostIds]) {
    collectInlineHydratedAttachments(env, postId, ledger);
  }

  // Also search WP for any attachments/posts tagged with this run's [F2E-E2E <runId>] prefix
  if (ledger.runId) {
    try {
      const taggedRows = wpJson(
        env,
        'post', 'list',
        '--post_type=page,elementor_library,attachment',
        '--post_status=any',
        `--s=[F2E-E2E ${ledger.runId}]`,
        '--fields=ID,post_type,post_title',
        '--format=json'
      ) || [];
      for (const row of taggedRows) {
        const rid = Number(row.ID);
        if (isProtectedId(rid, ledger.protectedPostIds)) continue;
        if (!String(row.post_title || '').startsWith(`[F2E-E2E ${ledger.runId}]`)) continue;
        if (row.post_type === 'attachment') recordCreatedAttachment(ledger, rid, false);
        else recordCreatedPost(ledger, rid);
      }
    } catch (err) {
      errors.push(`Tagged search failed: ${err.message}`);
    }
  }

  const allIds = [...new Set([...ledger.createdPostIds, ...ledger.createdAttachmentIds])];
  for (const id of allIds) {
    try {
      safeForceDeletePost(env, id, ledger.protectedPostIds);
    } catch (err) {
      errors.push(`Delete ID ${id} failed: ${err.message}`);
    }
  }

  if (allIds.length > 0) {
    try {
      const remaining = wp(
        env,
        'post', 'list',
        `--post__in=${allIds.join(',')}`,
        '--post_type=any',
        '--post_status=any',
        '--format=ids'
      );
      if (remaining) {
        errors.push(`Some created IDs remained after cleanup: ${remaining}`);
      }
    } catch (err) {
      errors.push(`Post-delete verification failed: ${err.message}`);
    }
  }

  if (ledger.ledgerPath && fs.existsSync(ledger.ledgerPath) && errors.length === 0) {
    fs.unlinkSync(ledger.ledgerPath);
  }

  return { skippedDeletes: false, deletedIds: allIds, kitVerify, errors };
}

export function sweepOrphanE2eArtifacts(env, ledgerDir) {
  const summary = {
    ledgersProcessed: 0,
    orphansDeleted: [],
    errors: [],
  };

  if (fs.existsSync(ledgerDir)) {
    const files = fs.readdirSync(ledgerDir).filter((f) => /^\.e2e-ledger-.*\.json$/.test(f));
    for (const file of files) {
      const fullPath = path.join(ledgerDir, file);
      try {
        const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        raw.ledgerPath = fullPath;
        const res = cleanupLedger(env, raw, { keepOnFail: false, failed: false });
        summary.ledgersProcessed += 1;
        if (res.deletedIds) summary.orphansDeleted.push(...res.deletedIds);
        summary.errors.push(...res.errors);
      } catch (err) {
        summary.errors.push(`Failed sweeping ledger ${file}: ${err.message}`);
      }
    }
  }

  // Sweep any remaining [F2E-E2E posts/attachments in DB
  try {
    const kitId = parseInt(wp(env, 'option', 'get', 'elementor_active_kit'), 10) || 7;
    const protectedSet = new Set([...HARD_PROTECTED_IDS, kitId]);
    const rows = wpJson(
      env,
      'post', 'list',
      '--post_type=page,elementor_library,attachment',
      '--post_status=any',
      '--s=[F2E-E2E',
      '--fields=ID,post_type,post_title',
      '--format=json'
    ) || [];
    for (const row of rows) {
      const id = Number(row.ID);
      if (!Number.isFinite(id) || protectedSet.has(id)) continue;
      if (!String(row.post_title || '').startsWith('[F2E-E2E')) continue;
      safeForceDeletePost(env, id, protectedSet);
      summary.orphansDeleted.push(id);
    }
  } catch (err) {
    summary.errors.push(`Orphan title sweep failed: ${err.message}`);
  }

  summary.orphansDeleted = [...new Set(summary.orphansDeleted)];
  return summary;
}

export function verifyPostCleanupInvariants(env, baseline = null) {
  const e2eCountStr = wp(
    env,
    'post', 'list',
    '--post_type=page,elementor_library,attachment',
    '--post_status=any',
    '--s=[F2E-E2E',
    '--format=count'
  );
  const e2eCount = parseInt(e2eCountStr, 10) || 0;

  const protectedIdsStr = wp(
    env,
    'post', 'list',
    `--post__in=${HARD_PROTECTED_IDS.join(',')}`,
    '--post_type=any',
    '--post_status=any',
    '--format=ids'
  );
  const presentProtected = protectedIdsStr
    ? protectedIdsStr.split(/\s+/).map((x) => Number(x)).filter(Boolean)
    : [];

  const missingProtected = HARD_PROTECTED_IDS.filter((id) => !presentProtected.includes(id));

  let kitMatches = true;
  if (baseline && baseline.kitId && baseline.kitSnapshotB64) {
    const currentKitB64 = wp(
      env,
      'eval',
      `$k=${intVal(baseline.kitId)}; echo base64_encode(serialize(get_post_meta($k, "_elementor_page_settings", true)));`
    );
    kitMatches = currentKitB64 === baseline.kitSnapshotB64;
  }

  return {
    ok: e2eCount === 0 && missingProtected.length === 0 && kitMatches,
    e2eCount,
    missingProtected,
    kitMatches,
  };
}
