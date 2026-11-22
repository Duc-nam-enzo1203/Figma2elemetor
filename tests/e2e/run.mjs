#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSystemCa } from './lib/tls.mjs';
import { resolveLocalWpEnv, resolveWpToken, redactToken } from './lib/localwp.mjs';
import { createWpClient } from './lib/wp-client.mjs';
import {
  capturePreRunBaseline,
  createRunLedger,
  cleanupLedger,
  sweepOrphanE2eArtifacts,
  verifyPostCleanupInvariants,
} from './lib/cleanup.mjs';
import { getTier1Tests } from './suites/tier1-features.mjs';
import { getTier2Tests } from './suites/tier2-boundaries.mjs';
import { getTier3Tests } from './suites/tier3-combinations.mjs';
import { getTier4Tests } from './suites/tier4-scenarios.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    tiers: new Set(['1', '2', '3', '4']),
    features: null,
    cleanupOnly: false,
    keepOnFail: false,
    verbose: false,
  };

  for (const arg of argv) {
    if (arg === '--cleanup') {
      opts.cleanupOnly = true;
    } else if (arg === '--keep-on-fail') {
      opts.keepOnFail = true;
    } else if (arg === '--verbose' || arg === '-v') {
      opts.verbose = true;
    } else if (arg.startsWith('--tier=')) {
      const val = arg.slice('--tier='.length).trim().toLowerCase();
      if (val === 'all') {
        opts.tiers = new Set(['1', '2', '3', '4']);
      } else {
        opts.tiers = new Set(val.split(',').map((t) => t.trim()).filter(Boolean));
      }
    } else if (arg.startsWith('--feature=')) {
      const val = arg.slice('--feature='.length).trim().toUpperCase();
      opts.features = new Set(val.split(',').map((f) => f.trim()).filter(Boolean));
    }
  }
  return opts;
}

function matchesFeature(test, featureSet) {
  if (!featureSet || featureSet.size === 0) return true;
  const testFeatures = String(test.feature || '').split(',').map((f) => f.trim().toUpperCase());
  return testFeatures.some((f) => featureSet.has(f));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const env = resolveLocalWpEnv();

  // Auto-relaunch with --use-system-ca when targeting HTTPS LocalWP
  ensureSystemCa({ baseUrl: env.siteUrl, required: true });

  if (opts.cleanupOnly) {
    console.log(`[F2E-E2E] Running orphan cleanup on ${env.siteUrl} (${env.siteId || 'unknown'})...`);
    const sweep = sweepOrphanE2eArtifacts(env, __dirname);
    const inv = verifyPostCleanupInvariants(env, null);
    console.log(JSON.stringify({ sweep, invariants: inv }, null, 2));
    if (sweep.errors.length > 0 || !inv.ok) {
      process.exitCode = 1;
    }
    return;
  }

  const allTests = [
    ...getTier1Tests(),
    ...getTier2Tests(),
    ...getTier3Tests(),
    ...getTier4Tests(),
  ];

  const selectedTests = allTests.filter(
    (t) => opts.tiers.has(String(t.tier)) && matchesFeature(t, opts.features)
  );

  if (selectedTests.length === 0) {
    console.error('[F2E-E2E] No tests matched the specified --tier / --feature filters.');
    process.exitCode = 1;
    return;
  }

  const needsLiveWp = selectedTests.some((t) => t.tier >= 2 || t.id === 'F5-T1-06');
  let token = '';
  try {
    token = resolveWpToken(env);
  } catch (err) {
    if (needsLiveWp && selectedTests.some((t) => t.tier >= 2)) {
      throw err;
    }
  }

  const wpClient = createWpClient({ baseUrl: env.siteUrl, token });
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;

  const usesMutation = selectedTests.some((t) => t.tier >= 2);
  let baseline = null;
  let ledger = null;
  let abortedSignal = null;

  if (usesMutation) {
    baseline = capturePreRunBaseline(env);
    ledger = createRunLedger(runId, __dirname, baseline);
  }

  const handleInterrupt = (sig) => {
    abortedSignal = sig;
    if (ledger) {
      try {
        cleanupLedger(env, ledger, { keepOnFail: false, failed: true });
      } catch {
        // best effort
      }
    }
    process.exit(130);
  };
  process.on('SIGINT', () => handleInterrupt('SIGINT'));
  process.on('SIGTERM', () => handleInterrupt('SIGTERM'));

  console.log(`[F2E-E2E] Run ${runId}`);
  console.log(`[F2E-E2E] Target: ${env.siteUrl} (siteId=${env.siteId}, php=${env.phpVersion}, token=${redactToken(token)})`);
  console.log(`[F2E-E2E] Executing ${selectedTests.length} test(s) across tiers=[${[...opts.tiers].sort().join(',')}]...\n`);

  const results = [];
  let hasFailures = false;

  try {
    for (const test of selectedTests) {
      const start = performance.now();
      let status = 'PASS';
      let reason = '';
      let skippedReason = null;

      const ctx = {
        env,
        wpClient,
        token,
        ledger,
        runId,
        verbose: opts.verbose,
        skip: (msg) => { skippedReason = msg || 'Skipped'; },
      };

      try {
        await test.run(ctx);
        if (skippedReason !== null) {
          status = 'SKIP';
          reason = skippedReason;
        }
      } catch (err) {
        status = 'FAIL';
        hasFailures = true;
        reason = err && err.message ? err.message : String(err);
        if (opts.verbose && err && err.stack) {
          reason = `${reason}\n${err.stack}`;
        }
      }

      const durationMs = Math.round(performance.now() - start);
      results.push({ id: test.id, tier: test.tier, feature: test.feature, name: test.name, status, durationMs, reason });

      const tag = status === 'PASS' ? 'PASS' : (status === 'SKIP' ? 'SKIP' : 'FAIL');
      console.log(`[${tag}] [T${test.tier}] ${test.id} (${durationMs}ms) — ${test.name}`);
      if (status === 'FAIL') {
        console.log(`       Reason: ${reason}`);
      } else if (status === 'SKIP') {
        console.log(`       Reason: ${reason}`);
      }
    }
  } finally {
    if (ledger && !abortedSignal) {
      const cleanRes = cleanupLedger(env, ledger, { keepOnFail: opts.keepOnFail, failed: hasFailures });
      if (cleanRes.errors.length > 0) {
        console.error(`\n[F2E-E2E] Cleanup errors:\n  - ${cleanRes.errors.join('\n  - ')}`);
        hasFailures = true;
      } else if (!cleanRes.skippedDeletes) {
        const inv = verifyPostCleanupInvariants(env, baseline);
        if (!inv.ok) {
          console.error(`\n[F2E-E2E] Post-cleanup invariant failure: ${JSON.stringify(inv)}`);
          hasFailures = true;
        } else if (opts.verbose) {
          console.log(`\n[F2E-E2E] Cleanup verified: deleted ${cleanRes.deletedIds.length} artifact(s), [F2E-E2E count=0, Kit restored=${inv.kitMatches}`);
        }
      }
    }
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  console.log('\n── Summary ───────────────────────────────────────────');
  for (const t of ['1', '2', '3', '4']) {
    const sub = results.filter((r) => String(r.tier) === t);
    if (sub.length === 0) continue;
    const p = sub.filter((r) => r.status === 'PASS').length;
    const f = sub.filter((r) => r.status === 'FAIL').length;
    const s = sub.filter((r) => r.status === 'SKIP').length;
    console.log(`Tier ${t}: total=${sub.length} pass=${p} fail=${f} skip=${s}`);
  }
  console.log(`TOTAL : total=${results.length} pass=${passed} fail=${failed} skip=${skipped}`);

  process.exitCode = hasFailures ? 1 : 0;
}

main().catch((err) => {
  console.error('[F2E-E2E] Fatal runner error:', err);
  process.exitCode = 1;
});
