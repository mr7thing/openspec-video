// ============================================================================
// OpsV Review UI Error Handler
// Maps OpsVError → HTTP status codes
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { OpsVError } from '../../errors/OpsVError';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof OpsVError) {
    const code = err.code;
    let status = 500;

    if (code.startsWith('E1')) status = 400;
    else if (code.startsWith('E2')) status = 400;
    else if (code.startsWith('E3')) status = 400;
    else if (code.startsWith('E4')) status = 502;
    else if (code.startsWith('E5')) status = 500;
    else if (code.startsWith('E6')) status = 400;
    else if (code.startsWith('E7')) status = 409;

    res.status(status).json({
      error: err.message,
      code: err.code,
      details: err.details,
    });
    return;
  }

  if (err.message === 'Invalid circle or assetId' || (err as any).code === 'E7001') {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err.message === 'Forbidden' || (err as any).code === 'E5003') {
    res.status(403).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: err.message || 'Internal server error' });
}
