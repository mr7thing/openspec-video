/**
 * Cloudflared binary management — auto-download, spawn, and lifecycle.
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import https from 'https';
import chalk from 'chalk';
import { logger } from '../utils/logger';

const CACHE_DIR = path.join(os.homedir(), '.opsv', 'bin');
const DOWNLOAD_TIMEOUT_MS = 60000;

interface PlatformInfo {
  binaryName: string;
  downloadName: string;
}

function getPlatform(): PlatformInfo {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin') {
    return { binaryName: 'cloudflared', downloadName: 'cloudflared-darwin-amd64' };
  }
  if (platform === 'linux') {
    const name = arch === 'arm64' ? 'cloudflared-linux-arm64' : 'cloudflared-linux-amd64';
    return { binaryName: 'cloudflared', downloadName: name };
  }
  if (platform === 'win32') {
    return { binaryName: 'cloudflared.exe', downloadName: 'cloudflared-windows-amd64.exe' };
  }
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

function getBinaryPath(): string {
  const { binaryName } = getPlatform();
  return path.join(CACHE_DIR, binaryName);
}

function getDownloadUrl(): string {
  const { downloadName } = getPlatform();
  return `https://github.com/cloudflare/cloudflared/releases/latest/download/${downloadName}`;
}

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Download timeout'));
    }, DOWNLOAD_TIMEOUT_MS);

    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          clearTimeout(timeout);
          reject(new Error('Redirect without location header'));
          return;
        }
        file.close();
        fs.removeSync(dest);
        downloadFile(redirectUrl, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        clearTimeout(timeout);
        reject(new Error(`Download failed: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        clearTimeout(timeout);
        file.close(() => resolve());
      });
    }).on('error', (err) => {
      clearTimeout(timeout);
      fs.removeSync(dest);
      reject(err);
    });
  });
}

export class CloudflaredManager {
  private process: ChildProcess | null = null;
  private tunnelUrl: string | null = null;
  private urlResolver: ((url: string) => void) | null = null;
  private urlRejecter: ((err: Error) => void) | null = null;

  /**
   * Ensure cloudflared binary is available. Download if missing.
   */
  async ensureBinary(): Promise<string> {
    const binaryPath = getBinaryPath();
    if (await fs.pathExists(binaryPath)) {
      return binaryPath;
    }

    console.log(chalk.cyan('Downloading cloudflared...'));
    fs.ensureDirSync(CACHE_DIR);

    const downloadUrl = getDownloadUrl();
    const tempPath = `${binaryPath}.tmp`;

    try {
      await downloadFile(downloadUrl, tempPath);
      await fs.move(tempPath, binaryPath);
      fs.chmodSync(binaryPath, 0o755);
      console.log(chalk.green('cloudflared downloaded ✓'));
      return binaryPath;
    } catch (err: any) {
      fs.removeSync(tempPath);
      throw new Error(`Failed to download cloudflared: ${err.message}`);
    }
  }

  /**
   * Start cloudflared tunnel pointing to local port.
   * Returns a promise that resolves with the public tunnel URL.
   */
  async start(localPort: number): Promise<string> {
    const binaryPath = await this.ensureBinary();

    return new Promise((resolve, reject) => {
      this.urlResolver = resolve;
      this.urlRejecter = reject;

      this.process = spawn(binaryPath, [
        'tunnel',
        '--url', `http://localhost:${localPort}`,
        '--no-autoupdate',
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
      const timeout = setTimeout(() => {
        this.stop();
        reject(new Error('cloudflared tunnel startup timeout'));
      }, 30000);

      this.process.stdout?.on('data', (data: Buffer) => {
        const line = data.toString();
        const match = line.match(urlRegex);
        if (match && this.urlResolver) {
          clearTimeout(timeout);
          this.tunnelUrl = match[0];
          this.urlResolver(match[0]);
          this.urlResolver = null;
          this.urlRejecter = null;
        }
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const line = data.toString().trim();
        const match = line.match(urlRegex);
        if (match && this.urlResolver) {
          clearTimeout(timeout);
          this.tunnelUrl = match[0];
          this.urlResolver(match[0]);
          this.urlResolver = null;
          this.urlRejecter = null;
        } else if (line) {
          logger.debug(`[cloudflared] ${line}`);
        }
      });

      this.process.on('error', (err) => {
        clearTimeout(timeout);
        if (this.urlRejecter) {
          this.urlRejecter(err);
          this.urlRejecter = null;
        }
      });

      this.process.on('exit', (code) => {
        if (this.urlRejecter) {
          clearTimeout(timeout);
          // Any exit before URL resolution is a failure — code=null (SIGTERM)
          // and code=0 (clean exit without printing URL) both mean the tunnel
          // didn't start, so reject rather than hanging.
          const reason = code === null
            ? 'cloudflared was terminated before tunnel URL was resolved'
            : `cloudflared exited with code ${code} before tunnel URL was resolved`;
          this.urlRejecter(new Error(reason));
          this.urlRejecter = null;
        }
        this.process = null;
      });
    });
  }

  stop(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  getTunnelUrl(): string | null {
    return this.tunnelUrl;
  }
}
