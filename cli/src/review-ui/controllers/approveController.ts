// ============================================================================
// OpsV Review UI Approve Controller
// Supports three review actions: approve, design_feedback, revise_prompt
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

function validateBodyPaths(values: unknown, fieldName: string): string[] | undefined {
  if (values === undefined || values === null) return undefined;
  if (!Array.isArray(values)) return undefined;
  return values.map((v: any) => {
    if (typeof v !== 'string') {
      throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `Invalid ${fieldName}: expected string array`);
    }
    const parts = v.split('/');
    for (const part of parts) {
      if (sanitizePathComponent(part) === null) {
        throw new ValidationError(OpsVErrorCode.INFRA_PATH_FORBIDDEN, `Invalid ${fieldName}: path traversal detected`);
      }
    }
    return v;
  });
}

export function createApproveController(projectRoot: string, queueRoot: string, manifestReader: ManifestReader) {
  const approveService = new ApproveService(projectRoot, queueRoot, manifestReader);

  return {
    async execute(req: Request, res: Response): Promise<void> {
      try {
        const circle = Array.isArray(req.params.circle) ? req.params.circle[0] : req.params.circle;
        const assetId = Array.isArray(req.params.assetId) ? req.params.assetId[0] : req.params.assetId;
        const body = req.body || {};
        if (body.action && body.action !== 'approve') throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, 'Approval endpoint accepts only action: approve; use opsv review for feedback or revision');

        // outputFiles (new) takes priority; fall back to single outputFile (legacy)
        const outputFiles = validateBodyPaths(body.outputFiles, 'outputFiles')
          || (body.outputFile ? [validateBodyPath(body.outputFile, 'outputFile')!] : undefined);
        const taskJsonPath = validateBodyPath(body.taskJsonPath, 'taskJsonPath');
        const note = typeof body.note === 'string' ? body.note.trim() : undefined;
        if (!Array.isArray(outputFiles) || outputFiles.length !== 1) throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, 'Approval requires exactly one output file');
        if (typeof body.variant !== 'string' || !body.variant.trim()) throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, 'Approval requires a non-empty variant');

        const result = await approveService.execute({
          circle: Array.isArray(req.params.circle) ? req.params.circle[0] : req.params.circle,
          assetId: Array.isArray(req.params.assetId) ? req.params.assetId[0] : req.params.assetId,
          action: 'approve',
          outputFiles,
          taskJsonPath,
          note,
          variant: body.variant.trim(),
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
