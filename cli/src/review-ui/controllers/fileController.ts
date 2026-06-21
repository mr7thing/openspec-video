// ============================================================================
// OpsV Review UI File Controller
// ============================================================================

import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { resolveWithin } from '../../utils/pathSecurity';

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.json': 'application/json',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

export function createFileController(queueRoot: string) {
  return {
    serve(req: Request, res: Response): void {
      const raw = req.params['filePath'];
      if (!raw) {
        res.status(400).send('Bad request');
        return;
      }
      const segments = Array.isArray(raw) ? raw : raw.split('/');
      const filePath = resolveWithin(queueRoot, ...segments);
      if (!filePath) {
        res.status(403).send('Forbidden');
        return;
      }
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        const mimeType = getMimeType(filePath);
        res.writeHead(200, {
          'Content-Type': mimeType,
          'Content-Length': stat.size,
        });
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.status(404).send('File not found');
      }
    },
  };
}
