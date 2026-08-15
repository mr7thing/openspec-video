// ============================================================================
// OpsV Review Preview Controller
// Serves signed local preview resources with HTTP Range support.
// ============================================================================

import fs from 'fs';
import { Request, Response } from 'express';
import { ArtifactPreviewAdapter } from '../ArtifactPreviewAdapter';

export function createPreviewController(adapter: ArtifactPreviewAdapter) {
  return {
    serve(req: Request, res: Response): void {
      const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
      if (!token) {
        res.status(400).json({ error: 'Preview token required' });
        return;
      }

      const resource = adapter.resolveToken(token);
      if (!resource) {
        res.status(404).json({ error: 'Preview not found' });
        return;
      }

      const range = parseRange(req.headers.range, resource.size);
      if (range === 'invalid') {
        res.status(416).set('Content-Range', `bytes */${resource.size}`).end();
        return;
      }

      res.set({
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=300',
        'Content-Type': resource.mimeType,
        ETag: `W/"${resource.size.toString(16)}-${Math.floor(resource.modifiedAtMs).toString(16)}"`,
      });

      if (!range) {
        res.set('Content-Length', String(resource.size));
        if (req.method === 'HEAD') {
          res.status(200).end();
          return;
        }
        fs.createReadStream(resource.absolutePath).pipe(res);
        return;
      }

      const length = range.end - range.start + 1;
      res.status(206).set({
        'Content-Length': String(length),
        'Content-Range': `bytes ${range.start}-${range.end}/${resource.size}`,
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(resource.absolutePath, { start: range.start, end: range.end }).pipe(res);
    },
  };
}

function parseRange(value: string | undefined, size: number): { start: number; end: number } | null | 'invalid' {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim());
  if (!match) return 'invalid';

  const startText = match[1];
  const endText = match[2];
  if (!startText && !endText) return 'invalid';

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return 'invalid';
    const start = Math.max(size - suffixLength, 0);
    return { start, end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) {
    return 'invalid';
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}
