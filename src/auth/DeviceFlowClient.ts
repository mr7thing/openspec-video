/**
 * OAuth 2.0 Device Flow client for CLI.
 *
 * Handles device-code request, browser open, polling, and token refresh.
 */

import axios from 'axios';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { CredentialManager } from './CredentialManager';
import { logger } from '../utils/logger';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // 10 minutes

export interface DeviceCodeResponse {
  device_code: string;
  verification_url: string;
  expires_in: number;
}

export interface DeviceTokenResponse {
  token: string;
  refresh_token: string;
  expires_at: string;
  tier: string;
}

export class DeviceFlowClient {
  constructor(private cloudUrl: string) {}

  async login(): Promise<{ email: string; tier: string }> {
    // 1. Request device code
    const deviceCode = await this.requestDeviceCode();
    console.log(chalk.cyan('正在打开浏览器进行登录验证...'));
    console.log(chalk.gray(`如果浏览器没有自动打开，请访问: ${deviceCode.verification_url}`));

    // 2. Open browser
    this.openBrowser(deviceCode.verification_url);

    // 3. Poll for token
    const token = await this.pollForToken(deviceCode.device_code);

    // 4. Decode JWT to get email
    const payload = this.decodeJwtPayload(token.token);
    const email = payload.email || 'unknown';

    // 5. Save credentials
    CredentialManager.saveCredentials({
      email,
      token: token.token,
      refresh_token: token.refresh_token,
      expires_at: token.expires_at,
      tier: token.tier,
    });

    return { email, tier: token.tier };
  }

  async refreshIfNeeded(): Promise<string | null> {
    const creds = CredentialManager.getCredentials();
    if (!creds) return null;

    if (!CredentialManager.isTokenExpired(creds)) {
      return creds.token;
    }

    // Token expired or about to expire — refresh
    logger.info('Token expired, refreshing...');
    try {
      const response = await axios.post(
        `${this.cloudUrl}/auth/refresh`,
        { refresh_token: creds.refresh_token },
        { timeout: 15000 }
      );
      const data = response.data?.data || response.data;
      const newToken = data.token;
      const newExpiresAt = data.expires_at;

      CredentialManager.saveCredentials({
        ...creds,
        token: newToken,
        expires_at: newExpiresAt,
      });

      return newToken;
    } catch (err: any) {
      logger.error(`Failed to refresh token: ${err.message}`);
      CredentialManager.clearCredentials();
      return null;
    }
  }

  private async requestDeviceCode(): Promise<DeviceCodeResponse> {
    try {
      const response = await axios.post(
        `${this.cloudUrl}/auth/device-code`,
        {},
        { timeout: 15000 }
      );
      const data = response.data?.data || response.data;
      return {
        device_code: data.device_code,
        verification_url: data.verification_url,
        expires_in: data.expires_in,
      };
    } catch (err: any) {
      throw new Error(`Failed to request device code: ${err.message}`);
    }
  }

  private async pollForToken(deviceCode: string): Promise<DeviceTokenResponse> {
    console.log(chalk.gray('等待登录完成...'));

    for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
      await this.sleep(POLL_INTERVAL_MS);

      try {
        const response = await axios.post(
          `${this.cloudUrl}/auth/device-token`,
          { device_code: deviceCode },
          { timeout: 15000 }
        );
        const data = response.data?.data || response.data;
        return {
          token: data.token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
          tier: data.tier,
        };
      } catch (err: any) {
        const errorCode = err.response?.data?.code || err.response?.data?.error;
        if (errorCode === 'AUTHORIZATION_PENDING') {
          process.stdout.write('.');
          continue;
        }
        if (errorCode === 'EXPIRED_TOKEN') {
          throw new Error('登录码已过期，请重新运行 opsv login');
        }
        throw new Error(`Polling failed: ${err.message}`);
      }
    }

    throw new Error('登录超时，请重新运行 opsv login');
  }

  private openBrowser(url: string): void {
    const platform = process.platform;
    const cmd = platform === 'darwin' ? 'open' :
                platform === 'win32' ? 'start' :
                'xdg-open';
    try {
      spawn(cmd, [url], { detached: true, stdio: 'ignore' });
    } catch {
      // Browser open failed — user will manually navigate
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private decodeJwtPayload(token: string): any {
    try {
      const base64 = token.split('.')[1];
      const json = Buffer.from(base64, 'base64url').toString('utf-8');
      return JSON.parse(json);
    } catch {
      return {};
    }
  }
}
