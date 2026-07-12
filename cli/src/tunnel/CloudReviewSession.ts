// ============================================================================
// OpsV CloudReviewSession — Encapsulates cloud review lifecycle
// ============================================================================
//
// Manages the complete cloud review session:
//   1. Resolve auth (OAuth or API key)
//   2. Create cloud session
//   3. Start cloudflared tunnel
//   4. Connect WebSocket relay
//   5. Mount auth middleware
//   6. Display QR code
//   7. Graceful cleanup on shutdown
//
// Usage:
//   const session = new CloudReviewSession(cloudUrl, authToken);
//   await session.start(port);
//   // ... server runs ...
//   await session.stop();
// ============================================================================

import fs from 'fs';
import path from 'path';
import { Application } from 'express';
import qrcode from 'qrcode-terminal';
import chalk from 'chalk';
import { CloudClient } from './CloudClient';
import { TunnelClient } from './TunnelClient';
import { CloudflaredManager } from './CloudflaredManager';
import { createAuthMiddleware } from '../review-ui/middleware/auth';
import { DeviceFlowClient } from '../auth/DeviceFlowClient';
import { CredentialManager } from '../auth/CredentialManager';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface CloudSessionConfig {
  cloudUrl: string;
  authToken: string;
}

export interface CloudSessionInfo {
  sessionId: string;
  reviewUrl: string;
  tunnelUrl?: string;
}

// ============================================================================
// CloudReviewSession
// ============================================================================

export class CloudReviewSession {
  private cloudClient: CloudClient | null = null;
  private tunnelClient: TunnelClient | null = null;
  private cloudflaredManager: CloudflaredManager | null = null;
  private sessionId: string | null = null;
  private sessionToken: string | null = null;
  private reviewUrl: string | null = null;
  private cleanedUp = false;

  constructor(
    private cloudUrl: string,
    private authToken: string,
  ) {}

  /**
   * Start the cloud session: create session, start tunnel, connect relay.
   * Returns the session info (URLs, session ID).
   */
  async start(localPort: number, app: Application): Promise<CloudSessionInfo> {
    this.cloudClient = new CloudClient(this.cloudUrl, this.authToken);

    // 1. Create cloud session
    const session = await this.cloudClient.createSession();
    this.sessionId = session.sessionId;
    this.sessionToken = session.sessionToken;
    this.reviewUrl = session.reviewUrl;

    // 2. Mount auth middleware
    app.use(createAuthMiddleware({ sessionToken: session.sessionToken }));

    // 3. Start cloudflared tunnel
    this.cloudflaredManager = new CloudflaredManager();
    const tunnelUrl = await this.cloudflaredManager.start(localPort);
    logger.info(`Cloudflared tunnel: ${tunnelUrl}`);

    // 4. Report tunnel URL to cloud
    await this.cloudClient.updateTunnelUrl(session.sessionId, tunnelUrl);

    // 5. Connect WebSocket relay
    this.tunnelClient = new TunnelClient(
      this.cloudUrl,
      session.sessionToken,
      localPort,
      session.sessionId,
    );
    await this.tunnelClient.connect();

    // 6. Save URL to file
    const urlFile = path.join(process.cwd(), '.opsv-review-url');
    fs.writeFileSync(urlFile, session.reviewUrl, 'utf-8');

    // 7. Display QR code
    console.log(chalk.green(`Cloud review URL: ${session.reviewUrl}`));
    console.log(chalk.gray(`Cloud session: ${session.sessionId}`));
    console.log(chalk.cyan('Full URL saved to:'), chalk.yellow(urlFile));
    console.log(chalk.cyan('Scan QR code to open on mobile:'));
    qrcode.generate(session.reviewUrl, { small: true });

    // 8. Expose relay control endpoints
    this.mountControlEndpoints(app, session.sessionId);

    return {
      sessionId: session.sessionId,
      reviewUrl: session.reviewUrl,
      tunnelUrl,
    };
  }

  /**
   * Gracefully stop the cloud session: close relay, tunnel, and cloud session.
   */
  async stop(): Promise<void> {
    if (this.cleanedUp) return;
    this.cleanedUp = true;

    this.tunnelClient?.close();
    this.cloudflaredManager?.stop();

    if (this.cloudClient && this.sessionId) {
      try {
        await this.cloudClient.closeSession(this.sessionId);
        console.log(chalk.gray(`Cloud session closed: ${this.sessionId}`));
      } catch (err: any) {
        logger.warn(`Failed to close cloud session: ${err.message}`);
      }
    }
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getReviewUrl(): string | null {
    return this.reviewUrl;
  }

  // ==========================================================================
  // Internal
  // ==========================================================================

  private mountControlEndpoints(app: Application, sessionId: string): void {
    app.get('/api/session-info', async (_req, res) => {
      try {
        const info = await this.cloudClient!.getSession(sessionId);
        res.json(info);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    app.post('/api/enable-relay', async (_req, res) => {
      try {
        const result = await this.cloudClient!.enableRelay(sessionId);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });
  }
}

// ============================================================================
// Static helpers
// ============================================================================

/**
 * Resolve cloud configuration from options or environment.
 * Returns null if not in cloud mode.
 */
export async function resolveCloudConfig(opts: {
  cloud?: boolean;
  cloudUrl?: string;
  cloudApiKey?: string;
}): Promise<CloudSessionConfig | null> {
  if (!opts.cloud) return null;

  const cloudUrl = opts.cloudUrl || process.env.OPSV_CLOUD_URL;
  if (!cloudUrl) {
    throw new Error('Cloud review requires --cloud-url/OPSV_CLOUD_URL.');
  }

  const normalizedUrl = cloudUrl.replace(/\/+$/, '');

  // Try OAuth first
  const deviceFlow = new DeviceFlowClient(normalizedUrl);
  let authToken = await deviceFlow.refreshIfNeeded();

  // Fallback to API key
  if (!authToken) {
    const apiKey = opts.cloudApiKey || process.env.OPSV_CLOUD_API_KEY;
    if (apiKey) {
      authToken = `Bearer ${apiKey}`;
    }
  }

  if (!authToken) {
    throw new Error('未登录。请先运行 opsv login，或设置 OPSV_CLOUD_API_KEY。');
  }

  return { cloudUrl: normalizedUrl, authToken };
}

/**
 * Execute a cloud lifecycle command (status / rotate / close) without starting a server.
 */
export async function executeCloudCommand(
  config: CloudSessionConfig,
  command: 'status' | 'rotate' | 'close',
  sessionId: string,
): Promise<void> {
  const client = new CloudClient(config.cloudUrl, config.authToken);

  switch (command) {
    case 'status': {
      const info = await client.getSession(sessionId);
      console.log(chalk.cyan(`Session: ${sessionId}`));
      console.log(JSON.stringify(info, null, 2));
      break;
    }
    case 'rotate': {
      const result = await client.rotateReviewToken(sessionId);
      console.log(chalk.green(`Review token rotated: ${sessionId}`));
      console.log(chalk.green(`Review URL: ${result.reviewUrl}`));
      break;
    }
    case 'close': {
      await client.closeSession(sessionId);
      console.log(chalk.green(`Session closed: ${sessionId}`));
      break;
    }
  }
}
