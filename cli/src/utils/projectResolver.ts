// ============================================================================
// OpsV — Project Root Resolver
// Walks up from cwd until finding .opsv/api_config.yaml.
// ============================================================================

import path from 'path';
import fs from 'fs';

/**
 * Resolve the project root by walking up from cwd until finding .opsv/api_config.yaml.
 * Falls back to cwd if no marker is found.
 */
export function resolveProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.opsv', 'api_config.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}
