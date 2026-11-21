/**
 * Zero-dependency bundler for F2E Bridge Figma Plugin.
 * 1. Bundles `dist/code.js` for the Figma Plugin QuickJS Sandbox.
 * 2. Injects the 89 official Elementor SVG `eicons` and 86 Widget Catalog into `src/ui/index.html`.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const distDir = resolve(rootDir, 'dist');

await mkdir(distDir, { recursive: true });

const moduleOrder = [
  'src/utils/crypto.js',
  'src/tagging/widget-resolver.js',
  'src/optimizer/auto-layout-fixer.js',
  'src/extraction/extractor.js',
  'src/exporters/elementor-compiler.js',
  'src/code.js',
];

let combined = '(() => {\n  "use strict";\n';
for (const relPath of moduleOrder) {
  const fullPath = resolve(rootDir, relPath);
  let source = await readFile(fullPath, 'utf8');
  source = source.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  source = source.replace(/^\s*export\s+(async\s+function|function|const|let|class)\s+/gm, '$1 ');
  combined += `\n  // ── Module: ${relPath} ──\n${source}\n`;
}
combined += '\n})();\n';

const outCodePath = resolve(distDir, 'code.js');
await writeFile(outCodePath, combined, 'utf8');
console.log(`✅ Built Figma plugin sandbox bundle: ${outCodePath} (${combined.length} bytes)`);

// Build UI HTML with embedded official Elementor eicons SVG data & widget catalog
const { ELEMENTOR_EICONS } = await import('../src/ui/eicons-data.js');
const { WIDGET_CATALOG } = await import('../src/tagging/widget-resolver.js');
const uiTemplate = await readFile(resolve(rootDir, 'src/ui/template.html'), 'utf8');

const injectedScript = `<script>window.ELEMENTOR_EICONS = ${JSON.stringify(ELEMENTOR_EICONS)}; window.F2E_WIDGET_CATALOG = ${JSON.stringify(WIDGET_CATALOG)};</script>`;
const finalHtml = uiTemplate.replace('<!-- EICONS_AND_CATALOG_INJECTION -->', injectedScript);

const outUiPath = resolve(rootDir, 'src/ui/index.html');
await writeFile(outUiPath, finalHtml, 'utf8');
console.log(`✅ Built Figma plugin UI with official Elementor SVG icons: ${outUiPath} (${finalHtml.length} bytes)`);
