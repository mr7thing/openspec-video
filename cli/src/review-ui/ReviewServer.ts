// ============================================================================
// OpsV Review Server Factory
// ============================================================================

import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { ReviewOptions } from '../types/ManifestSchema';
import { ReviewStrategy } from '../core/ReviewStrategy';
import { ManifestReader } from '../core/ManifestReader';
import { errorHandler } from './middleware/errorHandler';
import { createDocumentController } from './controllers/documentController';
import { createCircleController } from './controllers/circleController';
import { createApproveController } from './controllers/approveController';
import { createReviewApproveController } from './controllers/reviewApproveController';
import { createFileController } from './controllers/fileController';

export interface ReviewServerDeps {
  projectRoot: string;
  queueRoot: string;
  opts: ReviewOptions;
  strategy: ReviewStrategy;
  manifestReader: ManifestReader;
}

export function createReviewApp(deps: ReviewServerDeps): express.Application {
  const { projectRoot, queueRoot, strategy, manifestReader } = deps;
  const app = express();

  const docCtrl = createDocumentController(strategy);
  const circleCtrl = createCircleController(strategy);
  const approveCtrl = createApproveController(projectRoot, queueRoot, manifestReader);
  const reviewApproveCtrl = createReviewApproveController(projectRoot, queueRoot);
  const fileCtrl = createFileController(queueRoot);

  app.get('/api/documents', docCtrl.listDocuments);
  app.get('/api/documents/by-id/:docId', docCtrl.getDocumentById);
  app.patch('/api/documents/by-id/:docId', express.json(), docCtrl.updateDocumentById);
  app.get('/api/documents/:circle/:docId', docCtrl.getDocument);
  app.get('/api/circles', circleCtrl.listCircles);
  app.get('/api/circles/:name/assets', circleCtrl.listCircleAssets);
  app.get('/api/files/*filePath', fileCtrl.serve);
  app.post('/api/review/approve', express.json(), reviewApproveCtrl.execute);
  app.post('/api/approve/:circle/:assetId', express.json(), approveCtrl.execute);

  // Serve static review UI from templates/review-ui/
  const publicDir = path.join(__dirname, '..', '..', 'templates', 'review-ui');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  } else {
    app.get('/', (_req, res) => {
      res.send(`
        <html><body>
        <h1>OpsV Review</h1>
        <p>Review UI not built. Use the API endpoints:</p>
        <ul>
          <li>GET /api/circles</li>
          <li>GET /api/circles/:name/assets</li>
          <li>GET /api/files/*</li>
          <li>POST /api/review/approve</li>
          <li>POST /api/approve/:circle/:assetId (legacy)</li>
        </ul>
        </body></html>
      `);
    });
  }

  app.use(errorHandler);
  return app;
}

export function setupTtlShutdown(server: http.Server, ttl: number): void {
  if (ttl <= 0) return;
  let idleTimer: NodeJS.Timeout;

  const resetTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      console.log(`Idle for ${ttl}s, shutting down...`);
      server.close();
    }, ttl * 1000);
  };

  resetTimer();
  server.on('request', resetTimer);
}
