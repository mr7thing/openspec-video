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

function serveFile(filePath: string, res: Response): void {
  if (!fs.existsSync(filePath)) {
    res.status(404).send('File not found');
    return;
  }
  const stat = fs.statSync(filePath);
  const mimeType = getMimeType(filePath);
  res.writeHead(200, {
    'Content-Type': mimeType,
    'Content-Length': stat.size,
  });
  fs.createReadStream(filePath).pipe(res);
}

export function createFileController(queueRoot: string, projectRoot: string) {
  return {
    serve(req: Request, res: Response): void {
      const raw = req.params['filePath'];
      if (!raw) {
        res.status(400).send('Bad request');
        return;
      }
      // Normalise backslashes to forward slashes for Windows compatibility,
      // then split into individual path segments for security validation.
      const normalised = Array.isArray(raw) ? raw : raw.replace(/\\/g, '/').split('/');
      const filePath = resolveWithin(queueRoot, ...normalised);
      if (!filePath) {
        res.status(403).send('Forbidden');
        return;
      }
      serveFile(filePath, res);
    },

    /**
     * Resolve an image path relative to a document and serve the file.
     *
     * Query params:
     *   docPath   — absolute path to the .md document
     *   imagePath — relative path from the markdown, e.g. "../../opsv-queue/c/file.png"
     *
     * Used by renderMarkdown in the review UI to display inline markdown images
     * that are stored as filesystem-relative paths (for VSCode/GitHub preview).
     */
    resolve(req: Request, res: Response): void {
      const docPath = req.query.docPath as string | undefined;
      const imagePath = req.query.imagePath as string | undefined;

      if (!docPath || !imagePath) {
        res.status(400).send('Missing docPath or imagePath');
        return;
      }

      // Resolve the image path relative to the document's directory
      const absProjectRoot = path.resolve(projectRoot);
      const resolved = path.resolve(path.dirname(docPath), imagePath);
      const normalised = path.normalize(resolved);

      // Security: must be within the project root
      const prefix = absProjectRoot.endsWith(path.sep) ? absProjectRoot : absProjectRoot + path.sep;
      if (!normalised.startsWith(prefix)) {
        res.status(403).send('Forbidden');
        return;
      }

      serveFile(normalised, res);
    },
  };
}
