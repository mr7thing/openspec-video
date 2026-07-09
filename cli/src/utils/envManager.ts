// ============================================================================
// OpsV .env File Manager
// Read, write, update .env entries with comment preservation.
// Automatically handles encrypted .env (AES-256-GCM via master.key)
// when ~/.opsv/master.key exists.
// ============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import { decryptEnvFile, encryptEnvText, hasMasterKey } from './envCipher';

export interface EnvEntry {
  key: string;
  value: string;
}

/**
 * Parse KEY=VALUE text into a record, skipping comments and blank lines.
 */
export function parseDotenvText(content: string): Record<string, string> {
  const result: Record<string, string> = {};
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
 * Read a .env file and return a map of key → value.
 * Automatically decrypts if the file is in encrypted format.
 * Skips comments and blank lines.
 */
export function readEnvFile(envPath: string): Record<string, string> {
  const content = decryptEnvFile(envPath);
  if (content === null) return {};
  return parseDotenvText(content);
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
 * Get the user-level .env path (~/.opsv/.env).
 */
export function resolveUserEnvPath(): string {
  return path.join(os.homedir(), '.opsv', '.env');
}

/**
 * Set (update or append) a single KEY=VALUE in a .env file.
 * Preserves comments, blank lines, and ordering of other keys.
 * If the key already exists, its value is replaced in-place.
 * If the key doesn't exist, it's appended at the end.
 *
 * When master.key exists, the file is transparently encrypted on write
 * and automatically migrated from plaintext to encrypted format.
 */
export function setEnvKey(envPath: string, key: string, value: string): void {
  const line = `${key}=${value}`;

  if (!fs.existsSync(envPath)) {
    // New file
    const output = line + '\n';
    if (hasMasterKey()) {
      fs.writeFileSync(envPath, encryptEnvText(output) + '\n');
    } else {
      fs.writeFileSync(envPath, output);
    }
    return;
  }

  // Read existing content (automatically decrypts if encrypted)
  const existing = decryptEnvFile(envPath) || '';
  const lines = existing.split('\n');

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

  const output = lines.join('\n');
  if (hasMasterKey()) {
    fs.writeFileSync(envPath, encryptEnvText(output) + '\n');
  } else {
    fs.writeFileSync(envPath, output);
  }
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

// Re-export cipher utilities for convenience
export { hasMasterKey, ensureMasterKey, getMasterKeyPath, migrateEnvToEncrypted } from './envCipher';
