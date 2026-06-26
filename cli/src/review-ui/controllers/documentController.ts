// ============================================================================
// OpsV Review UI Document Controller
// ============================================================================

import { Request, Response } from 'express';
import * as fs from 'fs';
import { ReviewStrategy } from '../../core/ReviewStrategy';
import { FrontmatterParser } from '../../core/FrontmatterParser';

export function createDocumentController(strategy: ReviewStrategy) {
  return {
    listDocuments(_req: Request, res: Response): void {
      res.json(strategy.listDocuments());
    },

    // GET /api/documents/by-id/:docId — find by docId alone, return with content
    getDocumentById(req: Request, res: Response): void {
      const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
      const doc = strategy.findDocumentById(docId);
      if (!doc) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      res.json(doc);
    },

    // PATCH /api/documents/by-id/:docId — update frontmatter fields (status, etc.)
    updateDocumentById(req: Request, res: Response): void {
      const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
      const doc = strategy.findDocumentById(docId);
      if (!doc) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      if (!doc.content) {
        res.status(500).json({ error: 'Document content not available' });
        return;
      }
      const body = req.body || {};
      let updated = doc.content;
      if (body.status) {
        updated = FrontmatterParser.updateField(updated, 'status', body.status);
      }
      if (body.title) {
        updated = FrontmatterParser.updateField(updated, 'title', body.title);
      }
      if (body.refs) {
        updated = FrontmatterParser.updateField(updated, 'refs', body.refs);
      }
      if (body.bodyReplacements && Array.isArray(body.bodyReplacements)) {
        for (const r of body.bodyReplacements) {
          if (r.search) updated = updated.replace(r.search, r.replace ?? '');
        }
      }
      if (body.appendComment) {
        const date = new Date().toISOString().slice(0, 10);
        const commitLine = `- ${date}: ${body.appendComment}`;
        // Check if ## Commit section already exists
        if (/^## Commit$/m.test(updated)) {
          // Append to existing section
          updated = updated.replace(/(## Commit\n+)/, `$1${commitLine}\n`);
        } else {
          // Create new section at end
          updated = updated.replace(/\s*$/, '') + `\n\n## Commit\n\n${commitLine}\n`;
        }
      }
      fs.writeFileSync(doc.docPath, updated, 'utf-8');
      res.json({ success: true, docId, updatedFields: Object.keys(body) });
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
