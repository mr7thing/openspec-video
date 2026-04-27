// ============================================================================
// OpsV v0.8 WebSocket Daemon
// For Chrome extension browser automation (app command)
// ============================================================================

import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { logger } from '../utils/logger';

export interface DaemonMessage {
  type: 'task' | 'status' | 'result' | 'error' | 'ping' | 'pong';
  payload?: any;
}

export class Daemon {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private port: number;

  constructor(port: number = 8765) {
    this.port = port;
  }

  async start(): Promise<void> {
    const app = express();
    app.use(express.json());

    this.server = http.createServer(app);

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      logger.info(`[Daemon] Client connected (${this.clients.size} total)`);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as DaemonMessage;

          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          if (msg.type === 'result' || msg.type === 'error') {
            logger.info(`[Daemon] Received ${msg.type}: ${JSON.stringify(msg.payload)}`);
            // TODO: Handle results from Chrome extension
          }
        } catch (err) {
          logger.warn(`[Daemon] Invalid message: ${(err as Error).message}`);
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info(`[Daemon] Client disconnected (${this.clients.size} total)`);
      });
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, () => {
        logger.info(`[Daemon] WebSocket server started on port ${this.port}`);
        resolve();
      });

      this.server!.on('error', reject);
    });
  }

  sendTask(task: any): void {
    const msg: DaemonMessage = { type: 'task', payload: task };
    const data = JSON.stringify(msg);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  async stop(): Promise<void> {
    if (this.wss) {
      this.wss.close();
    }

    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          logger.info('[Daemon] Server stopped');
          resolve();
        });
      });
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  isRunning(): boolean {
    return this.server?.listening ?? false;
  }
}
