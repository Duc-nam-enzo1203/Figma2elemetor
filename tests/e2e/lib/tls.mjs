import { spawnSync } from 'node:child_process';

/**
 * Ensures Node.js is running with `--use-system-ca` when targeting HTTPS LocalWP.
 * If missing, transparently relaunches the current script with `--use-system-ca`.
 */
export function hasSystemCaFlag() {
  if (process.execArgv.includes('--use-system-ca')) {
    return true;
  }
  const nodeOpts = process.env.NODE_OPTIONS || '';
  return nodeOpts.split(/\s+/).includes('--use-system-ca');
}

export function ensureSystemCa({ baseUrl = 'https://thecanopyresident.local', required = true } = {}) {
  if (!required) return;
  let isHttps = false;
  try {
    isHttps = new URL(baseUrl).protocol === 'https:';
  } catch {
    isHttps = baseUrl.startsWith('https://');
  }
  if (!isHttps) return;
  if (hasSystemCaFlag()) return;
  if (process.env.F2E_E2E_RELAUNCHED === '1') {
    throw new Error('Failed to enable --use-system-ca after relaunch.');
  }

  const result = spawnSync(
    process.execPath,
    ['--use-system-ca', ...process.argv.slice(1)],
    {
      stdio: 'inherit',
      env: { ...process.env, F2E_E2E_RELAUNCHED: '1' },
    }
  );
  process.exit(result.status ?? 1);
}
