/**
 * opencli-path.ts
 *
 * Resolves the OpenCLI binary path. Tries:
 *   1. Node.js require.resolve to find the locally installed package
 *   2. Global `opencli` command as fallback
 *
 * Returns the command string to use with execSync.
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export function findOpenCLI(): string {
  // Strategy 1: Resolve from node_modules
  try {
    // Use require.resolve to find the package.json of the installed package
    const pkgJsonPath = require.resolve('@jackwener/opencli/package.json');
    const pkgDir = path.dirname(pkgJsonPath);
    // bin field: { "opencli": "dist/src/main.js" }
    const mainJs = path.join(pkgDir, 'dist', 'src', 'main.js');
    if (fs.existsSync(mainJs)) {
      return `node ${JSON.stringify(mainJs)}`;
    }
  } catch {
    // Not found via require.resolve
  }

  // Strategy 2: Check local node_modules/.bin
  try {
    const localBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'opencli');
    if (fs.existsSync(localBin)) {
      return localBin;
    }
  } catch {
    // Not found
  }

  // Strategy 3: Try global npm root
  try {
    const npmRoot = execSync('npm root -g', { encoding: 'utf-8', timeout: 3000 }).trim();
    if (npmRoot) {
      const mainJs = path.join(npmRoot, '@jackwener', 'opencli', 'dist', 'src', 'main.js');
      if (fs.existsSync(mainJs)) {
        return `node ${JSON.stringify(mainJs)}`;
      }
    }
  } catch {
    // Not found globally
  }

  // Fallback: hope opencli is in PATH (e.g. global install or npx)
  return 'opencli';
}
