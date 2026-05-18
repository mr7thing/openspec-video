// ============================================================================
// OpsV Review UI Circle Controller
// ============================================================================

import { Request, Response } from 'express';
import { ReviewStrategy } from '../../core/ReviewStrategy';

export function createCircleController(strategy: ReviewStrategy) {
  return {
    listCircles(_req: Request, res: Response): void {
      res.json(strategy.listCircles());
    },

    listCircleAssets(req: Request, res: Response): void {
      const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
      res.json(strategy.listCircleAssets(name));
    },
  };
}
