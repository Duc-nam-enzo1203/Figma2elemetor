import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const DEFAULT_WP_URL = 'https://thecanopyresident.local';
export const DEFAULT_WP_PATH = 'C:\\Users\\ADMIN\\Local Sites\\thecanopyresident\\app\\public';

export function redactToken(token) {
  if (!token || typeof token !== 'string') return '(none)';
  const trimmed = token.trim();
  if (trimmed.length <= 12) return '****';
  return `${trimmed.slice(0, 9)}****${trimmed.slice(-4)}`;
}

export function stripUtf8Bom(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/^\uFEFF/, '');
}

function compareSemverDesc(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pb[i] || 0) - (pa[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function findPhpBinary(lightningDir, preferredVersion = '') {
  if (!lightningDir || !fs.existsSync(lightningDir)) return null;
  const dirs = fs.readdirSync(lightningDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('php-'))
    .map((d) => d.name);

  if (preferredVersion) {
    const exactMatches = dirs.filter((d) => d.startsWith(`php-${preferredVersion}`));
    for (const dirName of exactMatches) {
      const candidate = path.join(lightningDir, dirName, 'bin', 'win64', 'php.exe');
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  const sorted = dirs.sort((a, b) => {
    const va = a.replace(/^php-/, '').split('+')[0];
    const vb = b.replace(/^php-/, '').split('+')[0];
    return compareSemverDesc(va, vb);
  });
  for (const dirName of sorted) {
    const candidate = path.join(lightningDir, dirName, 'bin', 'win64', 'php.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolves LocalWP environment from `%APPDATA%\Local\sites.json` using target hostname
 * (never naive `run\*` globbing that could hit stopped sites).
 */
export function resolveLocalWpEnv(options = {}) {
  const siteUrl = (options.siteUrl || process.env.F2E_WP_URL || DEFAULT_WP_URL).replace(/\/+$/, '');
  let hostname = 'thecanopyresident.local';
  try {
    hostname = new URL(siteUrl).hostname.toLowerCase();
  } catch {
    // keep default
  }

  const appData = options.appDataDir || process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const localDir = path.join(appData, 'Local');
  const sitesJsonPath = options.sitesJsonPath || path.join(localDir, 'sites.json');

  let matchedSite = null;
  if (fs.existsSync(sitesJsonPath)) {
    try {
      const rawSites = stripUtf8Bom(fs.readFileSync(sitesJsonPath, 'utf8'));
      const parsed = JSON.parse(rawSites);
      const entries = Array.isArray(parsed) ? parsed : Object.values(parsed || {});
      const targetSiteId = options.siteId || process.env.F2E_LOCALWP_SITE_ID || '';
      matchedSite = entries.find((s) => {
        if (!s || typeof s !== 'object') return false;
        if (targetSiteId && s.id === targetSiteId) return true;
        if (typeof s.domain === 'string' && s.domain.toLowerCase() === hostname) return true;
        if (Array.isArray(s.domains) && s.domains.some((d) => String(d).toLowerCase() === hostname)) return true;
        return false;
      }) || null;
    } catch {
      matchedSite = null;
    }
  }

  const siteId = matchedSite?.id || options.siteId || process.env.F2E_LOCALWP_SITE_ID || null;
  const phpVersion = matchedSite?.services?.php?.version || '';

  let wpPath = options.wpPath || process.env.F2E_WP_PATH || '';
  if (!wpPath && matchedSite?.path) {
    const resolvedSiteRoot = String(matchedSite.path).replace(/^~(?=[\\/]|$)/, os.homedir());
    wpPath = path.join(resolvedSiteRoot, 'app', 'public');
  }
  if (!wpPath) {
    wpPath = DEFAULT_WP_PATH;
  }

  let phpIni = options.phpIni || process.env.F2E_PHP_INI || '';
  if (!phpIni && siteId) {
    const candidateIni = path.join(localDir, 'run', siteId, 'conf', 'php', 'php.ini');
    if (fs.existsSync(candidateIni)) {
      phpIni = candidateIni;
    }
  }

  let phpBin = options.phpBin || process.env.F2E_PHP_BIN || '';
  if (!phpBin) {
    phpBin = findPhpBinary(path.join(localDir, 'lightning-services'), phpVersion) || 'php';
  }

  let wpCli = options.wpCli || process.env.F2E_WP_CLI || '';
  if (!wpCli) {
    const candidates = [
      'C:\\Program Files (x86)\\Local\\resources\\extraResources\\bin\\wp-cli\\wp-cli.phar',
      'C:\\Program Files\\Local\\resources\\extraResources\\bin\\wp-cli\\wp-cli.phar',
    ];
    wpCli = candidates.find((p) => fs.existsSync(p)) || 'wp';
  }

  return {
    siteUrl,
    hostname,
    siteId,
    siteName: matchedSite?.name || 'Thecanopyresident',
    phpVersion,
    wpPath,
    phpIni,
    phpBin,
    wpCli,
    sitesJsonPath,
    hasWpConfig: fs.existsSync(path.join(wpPath, 'wp-config.php')),
  };
}

export function buildPhpArgs(env, extraArgs = []) {
  const args = [];
  if (env.phpIni && fs.existsSync(env.phpIni)) {
    args.push('-c', env.phpIni);
  }
  args.push('-d', 'display_startup_errors=0');
  args.push(...extraArgs);
  return args;
}

/**
 * Executes a WP-CLI command against the resolved LocalWP site, stripping UTF-8 BOM.
 */
export function wp(env, ...wpArgs) {
  const flatArgs = wpArgs.flat().map((a) => String(a));
  const usePhar = env.wpCli && env.wpCli.toLowerCase().endsWith('.phar');
  const bin = usePhar ? env.phpBin : env.wpCli;
  const args = usePhar
    ? buildPhpArgs(env, [env.wpCli, `--path=${env.wpPath}`, ...flatArgs])
    : [`--path=${env.wpPath}`, ...flatArgs];

  const stdout = execFileSync(bin, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return stripUtf8Bom(stdout).trim();
}

export function wpJson(env, ...wpArgs) {
  const raw = wp(env, ...wpArgs);
  if (!raw) return null;
  return JSON.parse(raw);
}

export function phpEvalStdin(env, phpCode) {
  const args = buildPhpArgs(env, ['-r', phpCode]);
  const stdout = execFileSync(env.phpBin, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return stripUtf8Bom(stdout).trim();
}

export function phpLintFile(env, filePath) {
  const args = buildPhpArgs(env, ['-l', filePath]);
  const stdout = execFileSync(env.phpBin, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return stripUtf8Bom(stdout).trim();
}

export function phpRunFile(env, filePath) {
  const args = buildPhpArgs(env, [filePath]);
  const stdout = execFileSync(env.phpBin, args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return stripUtf8Bom(stdout).trim();
}

/**
 * Resolves the Bearer connection token from `F2E_WP_TOKEN` or WP-CLI option.
 */
export function resolveWpToken(env) {
  const fromEnv = process.env.F2E_WP_TOKEN?.trim();
  if (fromEnv) {
    if (!/^f2e_live_[a-f0-9]+$/i.test(fromEnv)) {
      throw new Error(`F2E_WP_TOKEN has invalid format (${redactToken(fromEnv)}). Expected f2e_live_<hex>.`);
    }
    return fromEnv;
  }

  const fromWp = wp(env, 'option', 'get', 'f2e_bridge_connection_token');
  if (!fromWp || !/^f2e_live_[a-f0-9]+$/i.test(fromWp)) {
    throw new Error(
      `Could not resolve valid f2e_bridge_connection_token from WordPress (${redactToken(fromWp)}). Ensure F2E Bridge plugin is active or set F2E_WP_TOKEN.`
    );
  }
  return fromWp;
}
