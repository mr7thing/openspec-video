// ============================================================================
// OpsV Review Projection Controller
// Exposes shared read projections to Timeline and Canvas modes.
// ============================================================================

import { Request, Response } from 'express';
import { ReviewReadProjectionService } from '../ReviewReadProjection';

export function createReviewProjectionController(service: ReviewReadProjectionService) {
  return {
    getWorkspace(_req: Request, res: Response): void {
      res.json(service.getWorkspace());
    },

    async getFocus(req: Request, res: Response): Promise<void> {
      const assetId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!assetId) {
        res.status(400).json({ error: 'Asset id required' });
        return;
      }
      const probe = req.query.probe === '1' || req.query.probe === 'true';
      const projection = await service.getFocus(assetId, { probe });
      if (!projection) {
        res.status(404).json({ error: 'Asset not found' });
        return;
      }
      res.json(projection);
    },
  };
}
