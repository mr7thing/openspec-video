// ============================================================================
// OpsV Shared --dir option utility
// Standardised --dir <paths...> option for commands (circle create, validate, etc.)
// ============================================================================

import { Command } from 'commander';
import path from 'path';
import fs from 'fs';

export const DEFAULT_SCAN_DIRS = ['videospec/scenes', 'videospec/shots', 'videospec/elements'];

/**
 * Add a standardised --dir <paths...> option to a command.
 */
export function addDirOption(
  cmd: Command,
  opts?: { defaultDirs?: string[]; description?: string },
): Command {
  const dirs = opts?.defaultDirs ?? DEFAULT_SCAN_DIRS;
  const desc = opts?.description ?? `Target directories to scan (default: ${dirs.join(' ')})`;
  return cmd.option('--dir <paths...>', desc);
}

/**
 * Resolve the --dir option value: use provided dirs or fall back to defaults.
 * Filters out non-existent or non-directory paths with a warning via the optional log callback.
 *
 * Returns the resolved list of project-relative directory paths.
 * If none of the input dirs exist, falls back to DEFAULT_SCAN_DIRS.
 */
export function resolveDirs(
  dirs: string[] | undefined,
  projectRoot: string,
  opts?: { log?: (msg: string) => void },
): string[] {
  const raw = dirs ?? DEFAULT_SCAN_DIRS;
  const resolved: string[] = [];
  for (const d of raw) {
    const fullPath = path.resolve(projectRoot, d);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
      resolved.push(d);
    } else {
      opts?.log?.(`Directory not found, skipping: ${d}`);
    }
  }
  return resolved.length > 0 ? resolved : DEFAULT_SCAN_DIRS;
}
