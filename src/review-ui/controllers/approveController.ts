// ============================================================================
// OpsV Review UI Approve Controller
// ============================================================================

import { Request, Response } from 'express';
import { ManifestReader } from '../../core/ManifestReader';
import { ApproveService } from '../../core/ApproveService';
import { sanitizePathComponent } from '../../utils/pathSecurity';
import { ValidationError, OpsVErrorCode } from '../../errors/OpsVError';

function validateBodyPath(value: string | undefined, fieldName: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `Invalid ${fieldName}: expected string`);
  }
  const parts = value.split('/');
  for (const part of parts) {
    if (sanitizePathComponent(part) === null) {
      throw new ValidationError(OpsVErrorCode.INFRA_PATH_FORBIDDEN, `Invalid ${fieldName}: path traversal detected`);
    }
  }
  return value;
}

export function createApproveController(projectRoot: string, queueRoot: string, manifestReader: ManifestReader) {
  const approveService = new ApproveService(projectRoot, queueRoot, manifestReader);

  return {
    execute(req: Request, res: Response): void {
      try {
        const outputFile = validateBodyPath(req.body?.outputFile, 'outputFile');
        const taskJsonPath = validateBodyPath(req.body?.taskJsonPath, 'taskJsonPath');

        const result = approveService.execute({
          circle: Array.isArray(req.params.circle) ? req.params.circle[0] : req.params.circle,
          assetId: Array.isArray(req.params.assetId) ? req.params.assetId[0] : req.params.assetId,
          outputFile,
          taskJsonPath,
        });
        res.json(result);
      } catch (err: any) {
        const status = err.code === 'E6001' || err.code === 'E6002' ? 400
          : err.code === 'E5003' ? 403
          : err.message === 'Invalid circle or assetId' ? 400
          : err.message === 'Forbidden' ? 403
          : 500;
        res.status(status).json({ error: err.message });
      }
    },
  };
}
