// ============================================================================
// OpsV Review UI Approve Controller
// ============================================================================

import { Request, Response } from 'express';
import { ManifestReader } from '../../core/ManifestReader';
import { ApproveService } from '../../core/ApproveService';

export function createApproveController(projectRoot: string, queueRoot: string, manifestReader: ManifestReader) {
  const approveService = new ApproveService(projectRoot, queueRoot, manifestReader);

  return {
    execute(req: Request, res: Response): void {
      try {
        const result = approveService.execute({
          circle: Array.isArray(req.params.circle) ? req.params.circle[0] : req.params.circle,
          assetId: Array.isArray(req.params.assetId) ? req.params.assetId[0] : req.params.assetId,
          outputFile: req.body?.outputFile,
          taskJsonPath: req.body?.taskJsonPath,
        });
        res.json(result);
      } catch (err: any) {
        const status = err.message === 'Invalid circle or assetId' ? 400
          : err.message === 'Forbidden' ? 403 : 500;
        res.status(status).json({ error: err.message });
      }
    },
  };
}
