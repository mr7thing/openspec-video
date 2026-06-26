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
import { DesignRefReader } from '../../core/DesignRefReader';
import { ReviewEntry } from '../../types/ManifestSchema';
import { parseOutputFilename } from '../../executor/naming';
import { ValidationError, OpsVErrorCode } from '../../errors/OpsVError';

export type ReviewAction = 'approve' | 'design_feedback' | 'revise_prompt';

const VALID_ACTIONS: ReviewAction[] = ['approve', 'design_feedback', 'revise_prompt'];

interface ReviewApproveRequest {
  docPath: string;        // absolute path to source document
  outputFiles: string[];  // full queue-relative paths, e.g. "videospec_circle1/minimax.img01_003/dragon_pearl_1.png"
  action: ReviewAction;
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

function validateOutputFiles(values: unknown, fieldName: string, action: string): string[] {
  if (!Array.isArray(values)) {
    throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `${fieldName} must be an array`);
  }
  // Only approve and design_feedback require output files
  if ((action === 'approve' || action === 'design_feedback') && values.length === 0) {
    throw new ValidationError(OpsVErrorCode.VALIDATION_TYPE_ERROR, `${fieldName} must be a non-empty array for ${action}`);
  }
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
      status: 'approved' | 'drafting' | 'syncing' | 'feedback' | 'revised';
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
  const designRefReader = new DesignRefReader(projectRoot);

  return {
    async execute(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as ReviewApproveRequest;
        const docPath = validateAbsolutePath(body.docPath, 'docPath', projectRoot);
        const action: ReviewAction = body.action || 'approve';
        const outputFiles = validateOutputFiles(body.outputFiles, 'outputFiles', action);

        if (!VALID_ACTIONS.includes(action)) {
          throw new ValidationError(
            OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH,
            `Invalid action: ${action}. Must be one of: ${VALID_ACTIONS.join(', ')}`
          );
        }

        // approve and design_feedback require outputFiles
        if ((action === 'approve' || action === 'design_feedback') && outputFiles.length === 0) {
          throw new ValidationError(
            OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH,
            `${action} requires at least one output file`
          );
        }

        // Resolve docPath to projectRoot-relative key for review-state
        const relDocPath = path.relative(projectRoot, docPath);
        // Derive docId from filename: e.g. "videospec/elements/dragon_pearl.md" → "dragon_pearl"
        const docId = path.basename(docPath, path.extname(docPath));

        // Determine newStatus
        let newStatus: 'approved' | 'drafting' | 'syncing';
        if (action === 'approve') {
          const firstOutput = outputFiles[0];
          const parsed = parseOutputFilename(firstOutput);
          newStatus = parsed.isModified ? 'syncing' : 'approved';
        } else {
          newStatus = 'drafting';
        }

        const now = new Date().toISOString();
        const entryAction = action === 'approve'
          ? (newStatus === 'syncing' ? 'syncing' as const : 'approved' as const)
          : action === 'design_feedback' ? 'design_feedback' as const
          : 'revise_prompt' as const;

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
        if (action === 'approve') {
          for (const queueRelPath of outputFiles) {
            const absPath = path.join(queueRoot, queueRelPath);
            if (fs.existsSync(absPath)) {
              const variant = path.basename(queueRelPath, path.extname(queueRelPath));
              await approvedRefReader.appendApprovedRef(docPath, variant, absPath);
            }
          }
        }

        if (action === 'design_feedback') {
          for (const queueRelPath of outputFiles) {
            const absPath = path.join(queueRoot, queueRelPath);
            if (fs.existsSync(absPath)) {
              const variant = path.basename(queueRelPath, path.extname(queueRelPath));
              await designRefReader.appendDesignRef(docPath, variant, absPath);
            }
          }
        }

        // 3. Update .review-state.json
        const state = readReviewState(projectRoot);
        if (!state[relDocPath]) state[relDocPath] = {};
        state[relDocPath][docId] = {
          status: action === 'approve' ? newStatus : (action === 'design_feedback' ? 'feedback' : 'revised'),
          action,
          outputFiles,
          note: body.note,
          approvedAt: now,
        };
        writeReviewState(projectRoot, state);

        const descriptions: Record<ReviewAction, string> = {
          approve: newStatus === 'syncing'
            ? `Approved (modified task) ${outputFiles.length} output(s) — syncing required`
            : `Approved ${outputFiles.length} output(s)`,
          design_feedback: `Design feedback on ${outputFiles.length} output(s)`,
          revise_prompt: `Prompt revision requested`,
        };

        res.json({ success: true, status: newStatus, note: descriptions[action] });
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
