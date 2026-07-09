// ============================================================================
// OpsV .env Encrypt / Decrypt
// AES-256-GCM with master.key at ~/.opsv/master.key
// ============================================================================

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

export interface EncryptedEnv {
  _opsv_env: 1;
  iv: string;
  tag: string;
  data: string;
}

// ── master.key management ──

export function getMasterKeyPath(): string {
  return path.join(os.homedir(), '.opsv', 'master.key');
}

export function hasMasterKey(): boolean {
  return fs.existsSync(getMasterKeyPath());
}

export function ensureMasterKey(): void {
  if (hasMasterKey()) return;
  const dir = path.dirname(getMasterKeyPath());
  fs.mkdirSync(dir, { recursive: true });
  const key = crypto.randomBytes(KEY_LENGTH).toString('hex');
  // mode is only effective on Linux/macOS; on Windows it is silently ignored
  fs.writeFileSync(getMasterKeyPath(), key + '\n', { mode: 0o600 });
}

function loadMasterKey(): Buffer {
  const hex = fs.readFileSync(getMasterKeyPath(), 'utf-8').trim();
  return Buffer.from(hex, 'hex');
}

// ── encrypt / decrypt ──

export function encryptEnvText(plaintext: string): string {
  const key = loadMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf-8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();

  const payload: EncryptedEnv = {
    _opsv_env: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Read and optionally decrypt an env file.
 * Returns the plaintext KEY=VALUE content, or null if the file doesn't exist.
 * For plaintext files (not starting with '{'), returns the content as-is.
 * For encrypted files, decrypts using master.key (returns null if no master.key).
 */
export function decryptEnvFile(envPath: string): string | null {
  if (!fs.existsSync(envPath)) return null;
  const content = fs.readFileSync(envPath, 'utf-8').trim();
  if (!content.startsWith('{')) return content; // plaintext

  // Encrypted format — require master.key
  if (!hasMasterKey()) return null;
  const key = loadMasterKey();
  let payload: EncryptedEnv;
  try {
    payload = JSON.parse(content);
  } catch {
    return null;
  }
  if (payload._opsv_env !== 1) return null;

  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(payload.data, 'base64', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

function isEncryptedFile(envPath: string): boolean {
  if (!fs.existsSync(envPath)) return false;
  const content = fs.readFileSync(envPath, 'utf-8').trim();
  return content.startsWith('{');
}

/**
 * Migrate a plaintext .env file to encrypted format (in-place).
 * No-op if master.key does not exist, file doesn't exist, or already encrypted.
 */
export function migrateEnvToEncrypted(envPath: string): void {
  if (!hasMasterKey()) return;
  if (!fs.existsSync(envPath)) return;
  if (isEncryptedFile(envPath)) return;
  const plaintext = fs.readFileSync(envPath, 'utf-8');
  const encrypted = encryptEnvText(plaintext);
  fs.writeFileSync(envPath, encrypted + '\n');
}

/**
 * Decrypt an env file content that has already been read into memory.
 * Useful for env.ts load command.
 */
export function decryptEnvContent(content: string): string | null {
  if (!content.trim().startsWith('{')) return content; // plaintext
  if (!hasMasterKey()) return null;
  const key = loadMasterKey();
  let payload: EncryptedEnv;
  try {
    payload = JSON.parse(content);
  } catch {
    return null;
  }
  if (payload._opsv_env !== 1) return null;

  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(payload.data, 'base64', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}
