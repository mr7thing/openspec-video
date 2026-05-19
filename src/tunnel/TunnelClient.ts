import WebSocket from 'ws';
import http from 'http';
import chalk from 'chalk';
import { logger } from '../utils/logger';

const CHUNK_SIZE = 512 * 1024; // 512KB per frame

export class TunnelClient {
  private ws: WebSocket | null = null;
  private localPort: number;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private isIntentionalClose = false;

  constructor(private cloudUrl: string, private sessionToken: string, localPort: number) {
    this.localPort = localPort;
  }

  async connect(): Promise<void> {
    this.isIntentionalClose = false;
    const wsUrl = this.cloudUrl
      .replace('https://', 'wss://')
      .replace('http://', 'ws://');

    this.ws = new WebSocket(`${wsUrl}/tunnel?token=${this.sessionToken}`);
    this.ws.binaryType = 'nodebuffer';

    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      console.log(chalk.green('  Tunnel connected ✓'));
    });

    this.ws.on('message', (data: Buffer) => this.handleFrame(data));
    this.ws.on('close', () => this.handleDisconnect());
    this.ws.on('error', (err) => {
      // Don't log ECONNREFUSED repeatedly as an error if we are reconnecting
      if ((err as any).code !== 'ECONNREFUSED' || this.reconnectAttempts === 0) {
        logger.error(`Tunnel error: ${err.message}`);
      }
    });
  }

  close(): void {
    this.isIntentionalClose = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private async handleFrame(data: Buffer) {
    if (data.length < 13) return; // Invalid frame

    const type = data[0];
    const reqId = data.readUInt32BE(1);
    const payloadLength = data.readUInt32BE(5);
    // bytes 9-10: chunk index
    // bytes 11-12: total chunks

    if (type === 1) { // HTTP_REQ
      const payload = data.subarray(13, 13 + payloadLength);
      const { method, path, headers, body } = this.deserializeRequest(payload);

      // Forward to local Express
      const localReq = http.request({
        hostname: '127.0.0.1',
        port: this.localPort,
        method,
        path,
        headers,
      }, (localRes) => {
        const chunks: Buffer[] = [];
        localRes.on('data', (chunk) => chunks.push(chunk));
        localRes.on('end', () => {
          const resBody = Buffer.concat(chunks);
          this.sendChunkedResponse(reqId, localRes.statusCode || 200, localRes.headers, resBody);
        });
      });

      localReq.on('error', (err) => {
        logger.error(`Local proxy error: ${err.message}`);
        this.sendChunkedResponse(reqId, 502, {}, Buffer.from('Bad Gateway'));
      });

      if (body && body.length > 0) {
        localReq.write(body);
      }
      localReq.end();
    } else if (type === 3) { // PING
      this.ws?.send(this.buildFrame(4, 0, 0, 1, Buffer.alloc(0))); // PONG
    }
  }

  private handleDisconnect() {
    if (this.isIntentionalClose) return;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      this.reconnectAttempts++;
      console.log(chalk.yellow(`  Tunnel disconnected, reconnecting in ${delay / 1000}s...`));
      setTimeout(() => this.connect(), delay);
    } else {
      console.log(chalk.red('  Tunnel connection failed permanently after maximum retries.'));
    }
  }

  private sendChunkedResponse(reqId: number, status: number, headers: any, body: Buffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    if (body.length === 0) {
      // Empty body
      const payload = this.serializeHeaders(status, headers);
      this.ws.send(this.buildFrame(2, reqId, 0, 1, payload));
      return;
    }

    const totalChunks = Math.ceil(body.length / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const chunk = body.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      
      let payload: Buffer;
      if (i === 0) {
        // First chunk includes headers
        const headerBuf = this.serializeHeaders(status, headers);
        payload = Buffer.concat([headerBuf, chunk]);
      } else {
        payload = chunk;
      }

      this.ws.send(this.buildFrame(2, reqId, i, totalChunks, payload));
    }
  }

  private buildFrame(type: number, reqId: number, chunkIndex: number, totalChunks: number, payload: Buffer): Buffer {
    const header = Buffer.alloc(13);
    header[0] = type;
    header.writeUInt32BE(reqId, 1);
    header.writeUInt32BE(payload.length, 5);
    header.writeUInt16BE(chunkIndex, 9);
    header.writeUInt16BE(totalChunks, 11);
    return Buffer.concat([header, payload]);
  }

  private serializeHeaders(status: number, headers: any): Buffer {
    const meta = JSON.stringify({ status, headers });
    const metaBuf = Buffer.from(meta, 'utf-8');
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(metaBuf.length, 0);
    return Buffer.concat([lengthBuf, metaBuf]);
  }

  private deserializeRequest(payload: Buffer): { method: string, path: string, headers: Record<string, string>, body: Buffer } {
    const metaLength = payload.readUInt32BE(0);
    let meta: Record<string, unknown>;
    try {
      meta = JSON.parse(payload.subarray(4, 4 + metaLength).toString('utf-8'));
    } catch (parseErr: any) {
      logger.warn('[TunnelClient] Failed to parse meta JSON:', parseErr?.message);
      meta = {};
    }
    const body = payload.subarray(4 + metaLength);
    return {
      method: String(meta.method || 'GET'),
      path: String(meta.path || '/'),
      headers: (meta.headers || {}) as Record<string, string>,
      body,
    };
  }
}
