// ============================================================================
// OpsV .env File Manager
// Read, write, update .env entries with comment preservation.
// ============================================================================

import fs from 'fs';
import path from 'path';

export interface EnvEntry {
  key: string;
  value: string;
}

/**
 * Read a .env file and return a map of key → value.
 * Skips comments and blank lines.
 */
export function readEnvFile(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) return {};

  const result: Record<string, string> = {};
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

/**
 * Check which required env vars are missing from a .env file.
 * Returns the list of missing variable names.
 */
export function getMissingEnvKeys(requiredVars: string[], envPath: string): string[] {
  const existing = readEnvFile(envPath);
  return requiredVars.filter((v) => !existing[v]);
}

/**
 * Set (update or append) a single KEY=VALUE in a .env file.
 * Preserves comments, blank lines, and ordering of other keys.
 * If the key already exists, its value is replaced in-place.
 * If the key doesn't exist, it's appended at the end.
 */
export function setEnvKey(envPath: string, key: string, value: string): void {
  const line = `${key}=${value}`;
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, line + '\n');
    return;
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  const lines = content.split('\n');

  const keyPrefix = `${key}=`;
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith(keyPrefix)) continue;
    // Preserve surrounding whitespace but replace value
    const indent = lines[i].match(/^\s*/)?.[0] || '';
    lines[i] = `${indent}${line}`;
    found = true;
    break;
  }

  if (!found) {
    lines.push(line);
  }

  fs.writeFileSync(envPath, lines.join('\n'));
}

/**
 * Batch set multiple keys in a .env file.
 * Keys are set one at a time via setEnvKey.
 */
export function setEnvKeys(envPath: string, entries: EnvEntry[]): void {
  for (const { key, value } of entries) {
    setEnvKey(envPath, key, value);
  }
}

/**
 * Get the .env file path for a project root.
 * Prefers <projectRoot>/.env, falls back to <projectRoot>/.opsv/.env.
 */
export function resolveEnvPath(projectRoot: string): string {
  const rootEnv = path.join(projectRoot, '.env');
  if (fs.existsSync(rootEnv)) return rootEnv;
  const opsvEnv = path.join(projectRoot, '.opsv', '.env');
  if (fs.existsSync(opsvEnv)) return opsvEnv;
  return rootEnv; // default to project root .env
}
