/**
 * CLI credential management — read/write ~/.opsv/credentials.json
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export interface Credentials {
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO timestamp
  plan: string;
}

const OPSV_DIR = path.join(os.homedir(), '.opsv');
const CREDENTIALS_FILE = path.join(OPSV_DIR, 'credentials.json');

export class CredentialManager {
  static getCredentials(): Credentials | null {
    if (!fs.existsSync(CREDENTIALS_FILE)) return null;
    try {
      return fs.readJsonSync(CREDENTIALS_FILE) as Credentials;
    } catch {
      return null;
    }
  }

  static saveCredentials(creds: Credentials): void {
    fs.ensureDirSync(OPSV_DIR);
    fs.writeJsonSync(CREDENTIALS_FILE, creds, { spaces: 2 });
    fs.chmodSync(CREDENTIALS_FILE, 0o600); // user read/write only
  }

  static clearCredentials(): void {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      fs.removeSync(CREDENTIALS_FILE);
    }
  }

  static isTokenExpired(creds: Credentials, bufferMs: number = 5 * 60 * 1000): boolean {
    const expiresAt = new Date(creds.expiresAt).getTime();
    return Date.now() + bufferMs >= expiresAt;
  }

  static getAuthHeader(): string | null {
    const creds = this.getCredentials();
    if (!creds) return null;
    return `Bearer ${creds.accessToken}`;
  }
}
