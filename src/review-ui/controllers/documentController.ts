// ============================================================================
// OpsV Review UI Document Controller
// ============================================================================

import { Request, Response } from 'express';
import { ReviewStrategy } from '../../core/ReviewStrategy';

export function createDocumentController(strategy: ReviewStrategy) {
  return {
    listDocuments(_req: Request, res: Response): void {
      res.json(strategy.listDocuments());
    },

    getDocument(req: Request, res: Response): void {
      const doc = strategy.findDocument(
        Array.isArray(req.params.circle) ? req.params.circle[0] : req.params.circle,
        Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId,
      );
      if (!doc) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      res.json(doc);
    },
  };
}
