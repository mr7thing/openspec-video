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
  deviceCode: string;
  verificationUrl: string;
  expiresIn: number;
}

export interface DeviceTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  plan: string;
}

export class DeviceFlowClient {
  constructor(private cloudUrl: string) {}

  async login(): Promise<{ email: string; plan: string }> {
    // 1. Request device code
    const deviceCode = await this.requestDeviceCode();
    console.log(chalk.cyan('正在打开浏览器进行登录验证...'));
    console.log(chalk.gray(`如果浏览器没有自动打开，请访问: ${deviceCode.verificationUrl}`));

    // 2. Open browser
    this.openBrowser(deviceCode.verificationUrl);

    // 3. Poll for token
    const token = await this.pollForToken(deviceCode.deviceCode);

    // 4. Decode JWT to get email
    const payload = this.decodeJwtPayload(token.accessToken);
    const email = payload.email || 'unknown';

    // 5. Save credentials
    CredentialManager.saveCredentials({
      email,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      plan: token.plan,
    });

    return { email, plan: token.plan };
  }

  async refreshIfNeeded(): Promise<string | null> {
    const creds = CredentialManager.getCredentials();
    if (!creds) return null;

    if (!CredentialManager.isTokenExpired(creds)) {
      return creds.accessToken;
    }

    // Token expired or about to expire — refresh
    logger.info('Access token expired, refreshing...');
    try {
      const response = await axios.post(
        `${this.cloudUrl}/auth/refresh-token`,
        { refreshToken: creds.refreshToken },
        { timeout: 15000 }
      );
      const data = response.data?.data || response.data;
      const newAccessToken = data.accessToken;
      const newExpiresAt = data.expiresAt;

      CredentialManager.saveCredentials({
        ...creds,
        accessToken: newAccessToken,
        expiresAt: newExpiresAt,
      });

      return newAccessToken;
    } catch (err: any) {
      logger.error(`Failed to refresh access token: ${err.message}`);
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
        deviceCode: data.deviceCode,
        verificationUrl: data.verificationUrl,
        expiresIn: data.expiresIn,
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
          { deviceCode },
          { timeout: 15000 }
        );
        const data = response.data?.data || response.data;
        return {
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
          plan: data.plan,
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
