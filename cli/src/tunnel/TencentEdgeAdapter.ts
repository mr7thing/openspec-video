/**
 * Tencent Cloud Edge Tunnel Adapter
 *
 * Connects to a Tencent Cloud Edge Function via WebSocket.
 * The Edge Function provides:
 * - Stable URL (custom domain)
 * - Global CDN acceleration
 * - HTTP request proxying through WebSocket
 *
 * Architecture:
 *   Reviewer → Edge CDN → Edge Function → WebSocket → CLI → Local Express
 */

import WebSocket from 'ws';
import { logger } from '../utils/logger';
import { TunnelAdapter, TunnelAdapterConfig, TunnelStartResult } from './TunnelAdapter';

// Edge Function frame types (mirrors CLI protocol)
enum EdgeFrameType {
  HTTP_REQ = 1,
  HTTP_RES = 2,
  PING = 3,
  PONG = 4,
  ERROR = 5,
  CLOSE = 6,
  AUTH = 10,
  AUTH_OK = 11,
}

interface EdgeConnection {
  ws: WebSocket;
  pendingRequests: Map<number, { resolve: (data: any) => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }>;
  nextReqId: number;
  authenticated: boolean;
}

export class TencentEdgeAdapter implements TunnelAdapter {
  readonly provider = 'tencent-edge';

  private connection: EdgeConnection | null = null;
  private tunnelUrl: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private localPort: number = 0;
  private config: TunnelAdapterConfig | null = null;

  constructor(private options: {
    edgeFunctionUrl: string;
    reconnectIntervalMs?: number;
    requestTimeoutMs?: number;
  }) {
    this.options.reconnectIntervalMs = options.reconnectIntervalMs || 5000;
    this.options.requestTimeoutMs = options.requestTimeoutMs || 30000;
  }

  /**
   * Connect to the Edge Function and start tunneling.
   */
  async start(localPort: number): Promise<TunnelStartResult> {
    this.localPort = localPort;

    return new Promise((resolve, reject) => {
      const edgeUrl = this.options.edgeFunctionUrl;

      logger.info(`[TencentEdge] Connecting to ${edgeUrl}`);

      const ws = new WebSocket(edgeUrl, {
        headers: {
          'X-Session-Id': this.config?.sessionId || '',
          'X-Session-Token': this.config?.sessionToken || '',
        },
      });

      const authTimeout = setTimeout(() => {
        ws.close();
        reject(new Error('Edge connection timeout'));
      }, 10000);

      ws.on('open', () => {
        logger.info('[TencentEdge] WebSocket connected, waiting for auth...');
      });

      ws.on('message', (data: Buffer) => {
        if (data.length < 2) return;

        const type = data[0] as EdgeFrameType;

        if (type === EdgeFrameType.AUTH_OK) {
          clearTimeout(authTimeout);

          // Parse stable URL from auth response
          const payload = data.subarray(2).toString('utf-8');
          try {
            const { url } = JSON.parse(payload);
            this.tunnelUrl = url;
            this.connection = {
              ws,
              pendingRequests: new Map(),
              nextReqId: 0,
              authenticated: true,
            };

            this.startHeartbeat();
            logger.info(`[TencentEdge] Authenticated, stable URL: ${url}`);
            resolve({ url, stable: true, provider: 'tencent-edge' });
          } catch (err) {
            ws.close();
            reject(new Error('Invalid auth response'));
          }
          return;
        }

        if (type === EdgeFrameType.ERROR) {
          clearTimeout(authTimeout);
          const msg = data.subarray(2).toString('utf-8');
          ws.close();
          reject(new Error(`Edge error: ${msg}`));
          return;
        }

        // Handle HTTP responses
        this.handleResponse(data);
      });

      ws.on('error', (err) => {
        clearTimeout(authTimeout);
        logger.error(`[TencentEdge] WebSocket error: ${err.message}`);
        reject(err);
      });

      ws.on('close', (code, reason) => {
        clearTimeout(authTimeout);
        logger.info(`[TencentEdge] WebSocket closed: ${code} ${reason}`);
        this.handleDisconnect();
      });
    });
  }

  /**
   * Stop the tunnel and clean up.
   */
  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.connection) {
      this.connection.ws.close(1000, 'Client disconnect');
      this.connection = null;
    }

    this.tunnelUrl = null;
  }

  getTunnelUrl(): string | null {
    return this.tunnelUrl;
  }

  isConnected(): boolean {
    return this.connection?.authenticated === true &&
           this.connection.ws.readyState === WebSocket.OPEN;
  }

  // ─── Internal Methods ──────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.connection?.ws.readyState === WebSocket.OPEN) {
        const frame = Buffer.alloc(2);
        frame[0] = EdgeFrameType.PING;
        frame[1] = 0;
        this.connection.ws.send(frame);
      }
    }, 30000);
  }

  private handleResponse(data: Buffer): void {
    if (!this.connection || data.length < 13) return;

    const type = data[0] as EdgeFrameType;
    const reqId = data.readUInt32BE(1);

    if (type === EdgeFrameType.HTTP_RES) {
      const pending = this.connection.pendingRequests.get(reqId);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.connection.pendingRequests.delete(reqId);

      // Parse response
      const payload = data.subarray(13);
      pending.resolve(payload);
    } else if (type === EdgeFrameType.PONG) {
      // Heartbeat acknowledged
    }
  }

  private handleDisconnect(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Reject all pending requests
    if (this.connection) {
      for (const [, pending] of this.connection.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Edge connection lost'));
      }
      this.connection.pendingRequests.clear();
      this.connection = null;
    }

    // Auto-reconnect after delay
    if (this.localPort > 0) {
      logger.info('[TencentEdge] Reconnecting in 5s...');
      this.reconnectTimer = setTimeout(() => {
        this.start(this.localPort).catch((err) => {
          logger.error(`[TencentEdge] Reconnect failed: ${err.message}`);
        });
      }, this.options.reconnectIntervalMs);
    }
  }

  /**
   * Proxy an HTTP request through the Edge tunnel.
   * Called by the local Express server to forward requests.
   */
  async proxyRequest(req: any, res: any): Promise<void> {
    if (!this.connection || !this.connection.authenticated) {
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Edge tunnel not connected' }));
      return;
    }

    const reqId = this.connection.nextReqId++;

    // Build request frame
    const meta = JSON.stringify({
      method: req.method,
      path: req.url,
      headers: req.headers,
    });
    const metaBuf = Buffer.from(meta, 'utf-8');
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(metaBuf.length, 0);

    const parts: Buffer[] = [lengthBuf, metaBuf];
    if (req.body && req.body.length > 0) {
      parts.push(req.body);
    }
    const payload = Buffer.concat(parts);

    const frame = Buffer.alloc(13 + payload.length);
    frame[0] = EdgeFrameType.HTTP_REQ;
    frame.writeUInt32BE(reqId, 1);
    frame.writeUInt32BE(payload.length, 5);
    frame.writeUInt16BE(0, 9);  // chunkIndex
    frame.writeUInt16BE(1, 11); // totalChunks
    payload.copy(frame, 13);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connection?.pendingRequests.delete(reqId);
        if (!res.headersSent) {
          res.writeHead(504);
          res.end(JSON.stringify({ error: 'Edge request timeout' }));
        }
        reject(new Error('Request timeout'));
      }, this.options.requestTimeoutMs);

      this.connection!.pendingRequests.set(reqId, {
        resolve: (data: Buffer) => {
          // Forward response to Express
          try {
            const metaLength = data.readUInt32BE(0);
            const metaStr = data.subarray(4, 4 + metaLength).toString('utf-8');
            const { status, headers } = JSON.parse(metaStr);
            const bodyChunk = data.subarray(4 + metaLength);

            res.writeHead(status, headers);
            if (bodyChunk.length > 0) {
              res.write(bodyChunk);
            }
            res.end();
            resolve();
          } catch (err) {
            reject(err as Error);
          }
        },
        reject: (err) => {
          if (!res.headersSent) {
            res.writeHead(502);
            res.end(JSON.stringify({ error: err.message }));
          }
          reject(err);
        },
        timeout,
      });

      this.connection!.ws.send(frame);
    });
  }
}
