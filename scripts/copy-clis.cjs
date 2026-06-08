#!/usr/bin/env node
/**
 * copy-clis.cjs
 *
 * Copies site CLI adapters from the OpenCLI submodule (vendor/opencli/clis/)
 * into dist/clis/ so they are bundled in the published npm package.
 *
 * Bundled sites:
 *   - gemini/  → opencli gemini image
 *   - qwen/    → opencli qwen image
 *   - jimeng/  → opencli jimeng generate
 *
 * Run after `tsc` during `npm run build`.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'vendor', 'opencli', 'clis');
const DST = path.join(ROOT, 'dist', 'clis');

const SITES = ['gemini', 'qwen', 'jimeng'];

function copyRecursive(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      // Skip test files and node_modules
      if (
        entry.name.endsWith('.test.js') ||
        entry.name.endsWith('.test.ts') ||
        entry.name === 'node_modules'
      ) {
        continue;
      }
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// Copy each site
for (const site of SITES) {
  const srcDir = path.join(SRC, site);
  const dstDir = path.join(DST, site);

  if (!fs.existsSync(srcDir)) {
    console.warn(`[copy-clis] WARNING: source not found: ${srcDir}`);
    continue;
  }

  copyRecursive(srcDir, dstDir);
  console.log(`[copy-clis] Copied ${site}/ → ${path.relative(ROOT, dstDir)}`);
}

// Also copy cli-manifest.json if it exists (for completion/metadata)
const manifestSrc = path.join(ROOT, 'vendor', 'opencli', 'cli-manifest.json');
const manifestDst = path.join(ROOT, 'dist', 'cli-manifest.json');
if (fs.existsSync(manifestSrc)) {
  fs.copyFileSync(manifestSrc, manifestDst);
  console.log(`[copy-clis] Copied cli-manifest.json → dist/`);
}

console.log('[copy-clis] Done.');
