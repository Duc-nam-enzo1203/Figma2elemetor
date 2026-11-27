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
  'src/extraction/primitives.js',
  'src/extraction/devmode-css.js',
  'src/extraction/design-system.js',
  'src/extraction/extractor.js',
  'src/exporters/compiler-helpers.js',
  'src/exporters/fidelity-verifier.js',
  'src/exporters/elementor-v4.js',
  'src/exporters/basic-widgets.js',
  'src/exporters/general-widgets.js',
  'src/exporters/nested-widgets.js',
  'src/exporters/pro-widgets.js',
  'src/exporters/elementor-compiler.js',
  'src/code.js',
];

const seenTopLevelDecls = new Map();
let combined = '(() => {\n  "use strict";\n';
for (const relPath of moduleOrder) {
  const fullPath = resolve(rootDir, relPath);
  let source = await readFile(fullPath, 'utf8');
  source = source.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '');
  source = source.replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '');
  source = source.replace(/^\s*export\s*\{[\s\S]*?\}\s*(?:from\s+['"][^'"]+['"])?;?\s*$/gm, '');
  source = source.replace(/^\s*export\s+default\s+/gm, '');
  source = source.replace(/^\s*export\s+(async\s+function|function|const|let|var|class)\s+/gm, '$1 ');

  // Verify no unstripped import/export statements remain at top level
  const leftoverModSyntax = /^\s*(?:import|export)\s+/m.exec(source);
  if (leftoverModSyntax) {
    throw new Error(`Build error in ${relPath}: unstripped module statement near "${leftoverModSyntax[0].trim()}"`);
  }

  // Verify no duplicate top-level identifier declarations across bundled modules
  const lines = source.split(/\r?\n/);
  for (const line of lines) {
    const m = /^(?:async\s+function|function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (m) {
      const ident = m[1];
      if (seenTopLevelDecls.has(ident)) {
        throw new Error(`Build error: duplicate top-level identifier "${ident}" in ${relPath} (already declared in ${seenTopLevelDecls.get(ident)})`);
      }
      seenTopLevelDecls.set(ident, relPath);
    }
  }

  combined += `\n  // ── Module: ${relPath} ──\n${source}\n`;
}
combined += '\n})();\n';

const outCodePath = resolve(distDir, 'code.js');
await writeFile(outCodePath, combined, 'utf8');
console.log(`✅ Built Figma plugin sandbox bundle: ${outCodePath} (${combined.length} bytes, ${seenTopLevelDecls.size} unique top-level declarations)`);

// Build UI HTML with embedded official Elementor eicons SVG data, widget catalog, CSS & JS
const { ELEMENTOR_EICONS } = await import('../src/ui/eicons-data.js');
const { WIDGET_CATALOG } = await import('../src/tagging/widget-resolver.js');
const uiTemplate = await readFile(resolve(rootDir, 'src/ui/template.html'), 'utf8');
const uiStyles = await readFile(resolve(rootDir, 'src/ui/styles.css'), 'utf8');
const uiScript = await readFile(resolve(rootDir, 'src/ui/app.js'), 'utf8');

const injectedScript = `<script>window.ELEMENTOR_EICONS = ${JSON.stringify(ELEMENTOR_EICONS)}; window.F2E_WIDGET_CATALOG = ${JSON.stringify(WIDGET_CATALOG)};</script>`;
const finalHtml = uiTemplate
  .replace('<!-- UI_STYLES_INJECTION -->', () => `<style>\n${uiStyles}</style>`)
  .replace('<!-- EICONS_AND_CATALOG_INJECTION -->', () => injectedScript)
  .replace('<!-- UI_SCRIPT_INJECTION -->', () => `<script>\n${uiScript}</script>`);

const outUiPath = resolve(rootDir, 'src/ui/index.html');
await writeFile(outUiPath, finalHtml, 'utf8');
console.log(`✅ Built Figma plugin UI with official Elementor SVG icons: ${outUiPath} (${finalHtml.length} bytes)`);
