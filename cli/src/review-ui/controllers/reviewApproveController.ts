// ============================================================================
// OpsV Review UI Approve Controller (Manifest-free)
// For merged review sessions across multiple circles.
// Each approve action writes to:
//   1. The source document frontmatter (status + review entry)
//   2. The approved/design reference section in the document body
//   3. .review-state.json (lightweight persistent state, no manifest involved)
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { Request, Response } from 'express';
import { FrontmatterParser } from '../../core/FrontmatterParser';
import { ApprovedRefReader } from '../../core/ApprovedRefReader';
import { ReviewEntry } from '../../types/ManifestSchema';
import { parseOutputFilename } from '../../executor/naming';
import { ValidationError, OpsVErrorCode } from '../../errors/OpsVError';

export type ReviewAction = 'approve';

interface ReviewApproveRequest {
  docPath: string;        // absolute path to source document
  outputFiles: string[];  // full queue-relative paths, e.g. "videospec_circle1/minimax.img01_003/dragon_pearl_1.png"
  action?: ReviewAction;
  variant: string;
  note?: string;
}

function validateAbsolutePath(value: string, fieldName: string, projectRoot: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `Invalid ${fieldName}: must be a non-empty string`);
  }
  // Must be an absolute path under projectRoot
  if (!path.isAbsolute(value)) {
    throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, `${fieldName} must be an absolute path`);
  }
  const resolved = path.resolve(value);
  const normalized = path.normalize(resolved);
  const absProjectRoot = path.resolve(projectRoot);
  const prefix = absProjectRoot.endsWith(path.sep) ? absProjectRoot : absProjectRoot + path.sep;
  if (normalized !== absProjectRoot && !normalized.startsWith(prefix)) {
    throw new ValidationError(OpsVErrorCode.INFRA_PATH_FORBIDDEN, `Access forbidden: ${fieldName} must be inside the project root`);
  }
  return normalized;
}

function validateOutputFiles(values: unknown, fieldName: string): string[] {
  if (!Array.isArray(values)) {
    throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `${fieldName} must be an array`);
  }
  if (values.length !== 1) throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `${fieldName} must contain exactly one output for approval`);
  return values.map((v: any) => {
    if (typeof v !== 'string') {
      throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `${fieldName} items must be strings`);
    }
    // queue-relative path: no absolute, no traversal
    if (path.isAbsolute(v)) {
      throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, `${fieldName} items must be queue-relative paths, not absolute`);
    }
    const normalized = path.normalize(v);
    if (normalized.includes('..')) {
      throw new ValidationError(OpsVErrorCode.INFRA_PATH_FORBIDDEN, `${fieldName}: path traversal detected`);
    }
    return normalized;
  });
}

interface ReviewState {
  [docId: string]: {
    [assetId: string]: {
      status: 'approved' | 'syncing';
      action: string;
      outputFiles: string[];
      note?: string;
      approvedAt: string;
    };
  };
}

function readReviewState(projectRoot: string): ReviewState {
  const statePath = path.join(projectRoot, '.review-state.json');
  if (!fs.existsSync(statePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeReviewState(projectRoot: string, state: ReviewState): void {
  const statePath = path.join(projectRoot, '.review-state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

export function createReviewApproveController(projectRoot: string, queueRoot: string) {
  const approvedRefReader = new ApprovedRefReader(projectRoot);

  return {
    async execute(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as ReviewApproveRequest;
        const docPath = validateAbsolutePath(body.docPath, 'docPath', projectRoot);
        if (body.action && body.action !== 'approve') throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, 'Approval endpoint accepts only action: approve');
        const outputFiles = validateOutputFiles(body.outputFiles, 'outputFiles');
        if (typeof body.variant !== 'string' || !body.variant.trim()) throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, 'Approval requires a non-empty variant');

        // Resolve docPath to projectRoot-relative key for review-state
        const relDocPath = path.relative(projectRoot, docPath);
        // Derive docId from filename: e.g. "videospec/elements/dragon_pearl.md" → "dragon_pearl"
        const docId = path.basename(docPath, path.extname(docPath));

        // Determine newStatus
        let newStatus: 'approved' | 'drafting' | 'syncing';
        const firstOutput = outputFiles[0];
        const parsed = parseOutputFilename(firstOutput);
        newStatus = parsed.isModified ? 'syncing' : 'approved';

        const now = new Date().toISOString();
        const entryAction = newStatus === 'syncing' ? 'syncing' as const : 'approved' as const;

        const reviewEntry: ReviewEntry = {
          timestamp: now,
          action: entryAction,
          outputFile: outputFiles[0],
          outputFiles: outputFiles,
          note: body.note || undefined,
        };

        // 1. Write review entry + status to document frontmatter
        const content = fs.readFileSync(docPath, 'utf-8');
        let updated = FrontmatterParser.appendReview(content, reviewEntry);
        updated = FrontmatterParser.updateField(updated, 'status', newStatus);
        fs.writeFileSync(docPath, updated);

        // 2. Write approved/design references to document body
        for (const queueRelPath of outputFiles) {
          const absPath = path.join(queueRoot, queueRelPath);
          if (fs.existsSync(absPath)) await approvedRefReader.appendApprovedRef(docPath, body.variant.trim(), absPath);
        }

        // 3. Update .review-state.json
        const state = readReviewState(projectRoot);
        if (!state[relDocPath]) state[relDocPath] = {};
        state[relDocPath][docId] = {
          status: newStatus,
          action: 'approve',
          outputFiles,
          note: body.note,
          approvedAt: now,
        };
        writeReviewState(projectRoot, state);

        res.json({ success: true, status: newStatus, note: newStatus === 'syncing' ? 'Approved modified task - syncing required' : 'Approved' });
      } catch (err: any) {
        const status =
          err.code === 'E6001' || err.code === 'E6002' ? 400
          : err.code === 'E5003' ? 403
          : err.message?.includes('Invalid') || err.message?.includes('must be') ? 400
          : err.message === 'Forbidden' ? 403
          : 500;
        res.status(status).json({ error: err.message });
      }
    },
  };
}
