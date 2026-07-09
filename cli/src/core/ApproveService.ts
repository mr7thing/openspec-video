// ============================================================================
// OpsV Approve Service
// Three review actions: approve, design_feedback, revise_prompt
// Every action always writes a review entry (with file paths recorded).
// Approved images → ## Approved References
// Design feedback images → ## Design References
// ============================================================================

import path from 'path';
import fs from 'fs';
import { ManifestReader } from './ManifestReader';
import { AssetManager } from './AssetManager';
import { FrontmatterParser } from './FrontmatterParser';
import { ReviewEntry } from '../types/ManifestSchema';
import { resolveWithin, sanitizePathComponent } from '../utils/pathSecurity';
import { parseOutputFilename } from '../executor/naming';
import { getProjectDir } from '../utils/configLoader';
import { formatReviewEntry } from '../utils/reviewEntry';
import { ApprovedRefReader } from './ApprovedRefReader';
import { DesignRefReader } from './DesignRefReader';
import { buildAssetDocIndex } from './AssetDocIndex';
import { ValidationError, InfrastructureError, OpsVErrorCode } from '../errors/OpsVError';

export type ReviewAction = 'approve' | 'design_feedback' | 'revise_prompt';

export interface ApproveRequest {
  circle: string;
  assetId: string;
  action: ReviewAction;
  outputFiles?: string[];
  taskJsonPath?: string;
  note?: string;
}

export interface ApproveResult {
  success: boolean;
  status: 'approved' | 'drafting' | 'syncing';
  note: string;
}

export class ApproveService {
  private approvedRefReader: ApprovedRefReader;
  private designRefReader: DesignRefReader;

  constructor(
    private projectRoot: string,
    private queueRoot: string,
    private manifestReader: ManifestReader,
  ) {
    this.approvedRefReader = new ApprovedRefReader(projectRoot);
    this.designRefReader = new DesignRefReader(projectRoot);
    // Build shared index for ref resolution
    const videospecDir = getProjectDir(projectRoot, 'videospec');
    const assetIndex = buildAssetDocIndex(videospecDir);
    this.approvedRefReader.setAssetIndex(assetIndex);
  }

  validateRequest(req: ApproveRequest): void {
    if (!sanitizePathComponent(req.circle) || !sanitizePathComponent(req.assetId)) {
      throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, 'Invalid circle or assetId');
    }
    if (!['approve', 'design_feedback', 'revise_prompt'].includes(req.action)) {
      throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, `Invalid action: ${req.action}`);
    }
    // approve and design_feedback require at least one output file
    if ((req.action === 'approve' || req.action === 'design_feedback') &&
        (!req.outputFiles || req.outputFiles.length === 0)) {
      throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, `${req.action} requires at least one output file`);
    }
  }

  buildReviewEntry(req: ApproveRequest): {
    newStatus: 'approved' | 'drafting' | 'syncing';
    reviewEntry: ReviewEntry;
  } {
    const now = new Date().toISOString();

    // Determine newStatus based on action + modified-task detection
    let newStatus: 'approved' | 'drafting' | 'syncing';
    if (req.action === 'approve') {
      // If the output came from a modified task (filename has _mN pattern),
      // status = syncing (provisionally approved, need to sync changes back to source doc)
      const firstOutput = req.outputFiles?.[0];
      const parsed = firstOutput ? parseOutputFilename(firstOutput) : { isModified: false };
      newStatus = parsed.isModified ? 'syncing' : 'approved';
    } else {
      newStatus = 'drafting';
    }

    // Map UI action to ReviewEntry action enum
    const entryAction = req.action === 'approve'
      ? (newStatus === 'syncing' ? 'syncing' as const : 'approved' as const)
      : req.action === 'design_feedback' ? 'design_feedback' as const
      : 'revise_prompt' as const;
    const reviewEntry: ReviewEntry = {
      timestamp: now,
      action: entryAction,
      outputFile: req.outputFiles?.[0],
      outputFiles: req.outputFiles,
      modifiedTaskPath: req.taskJsonPath,
      note: req.note || undefined,
    };
    return { newStatus, reviewEntry };
  }

  resolveTargetRoot(circle: string): string {
    const circleDir = resolveWithin(this.queueRoot, circle);
    if (!circleDir) throw new InfrastructureError(OpsVErrorCode.INFRA_PATH_FORBIDDEN, 'Forbidden');

    const circleManifestPath = path.join(circleDir, '_manifest.json');
    let targetRoot = getProjectDir(this.projectRoot, 'videospec');

    if (fs.existsSync(circleManifestPath)) {
      const manifest = this.manifestReader.read(circleManifestPath);
      if (manifest.target) {
        const resolvedTarget = resolveWithin(this.projectRoot, manifest.target);
        if (resolvedTarget) targetRoot = resolvedTarget;
      }
    }

    return targetRoot;
  }

  /**
   * Resolve an output filename to its absolute path on disk.
   * The file lives in the queue directory, e.g. <queueRoot>/<circle>/<provider>_NNN>/<assetId>_<N>.png
   */
  private resolveOutputAbsPath(circle: string, filename: string): string | null {
    const circleDir = resolveWithin(this.queueRoot, circle);
    if (!circleDir) return null;

    // Walk the circle dir to find the file
    const found = this.findFileRecursive(circleDir, filename);
    return found;
  }

  private findFileRecursive(dir: string, filename: string): string | null {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = this.findFileRecursive(fullPath, filename);
        if (found) return found;
      } else if (entry.name === filename) {
        return fullPath;
      }
    }
    return null;
  }

  async execute(req: ApproveRequest): Promise<ApproveResult> {
    this.validateRequest(req);
    const { newStatus, reviewEntry } = this.buildReviewEntry(req);
    const targetRoot = this.resolveTargetRoot(req.circle);
    const sourceDocPath = AssetManager.findAssetFilePathUnder(targetRoot, req.assetId);

    if (!sourceDocPath) {
      throw new InfrastructureError(OpsVErrorCode.INFRA_FILE_NOT_FOUND, `Document not found: ${req.assetId} in target ${targetRoot}`);
    }

    // 1. Always write review entry to frontmatter
    const content = fs.readFileSync(sourceDocPath, 'utf-8');
    const updated = FrontmatterParser.appendReview(content, reviewEntry);
    const finalContent = FrontmatterParser.updateField(updated, 'status', newStatus);
    fs.writeFileSync(sourceDocPath, finalContent);

    // 2. Write references to the document body based on action
    if (req.action === 'approve' && req.outputFiles) {
      for (const filename of req.outputFiles) {
        const absPath = this.resolveOutputAbsPath(req.circle, filename);
        if (absPath) {
          const variant = path.basename(filename, path.extname(filename));
          await this.approvedRefReader.appendApprovedRef(sourceDocPath, variant, absPath);
        }
      }
    }

    if (req.action === 'design_feedback' && req.outputFiles) {
      for (const filename of req.outputFiles) {
        const absPath = this.resolveOutputAbsPath(req.circle, filename);
        if (absPath) {
          const variant = path.basename(filename, path.extname(filename));
          await this.designRefReader.appendDesignRef(sourceDocPath, variant, absPath);
        }
      }
    }

    // revise_prompt: no image written to document body, only review entry

    // 3. Update manifest status
    this.updateManifestStatus(req.circle, req.assetId, newStatus);

    const actionDescriptions: Record<ReviewAction, string> = {
      approve: newStatus === 'syncing'
        ? `Approved (modified task) ${req.outputFiles?.length || 0} output(s) — syncing required`
        : `Approved ${req.outputFiles?.length || 0} output(s)`,
      design_feedback: `Design feedback on ${req.outputFiles?.length || 0} output(s) — status stays drafting`,
      revise_prompt: `Prompt revision requested — status stays drafting`,
    };

    return { success: true, status: newStatus, note: actionDescriptions[req.action] };
  }

  /**
   * Approve a single output file by tracing it back to its source document.
   *
   * Pipeline:
   *   1. Parse output filename → derive task JSON name (via parseOutputFilename)
   *   2. Read task JSON from the same directory → extract _opsv.shotId
   *   3. shotId → AssetManager → source .md document
   *   4. Write review entry + status to frontmatter
   *   5. Append the output file reference to ## Approved References (or ## Design References)
   *   6. Update _manifest.json status
   *
   * This is the single-file analogue of execute() — designed for `opsv approve <file>`.
   */
  async executeFile(
    outputFilePath: string,
    circle: string,
    action: ReviewAction,
    note?: string,
  ): Promise<ApproveResult> {
    const filename = path.basename(outputFilePath);

    // 1. Parse output filename → task JSON identity
    const parsed = parseOutputFilename(filename);
    const taskJsonPath = path.join(path.dirname(outputFilePath), parsed.taskJsonName);
    if (!fs.existsSync(taskJsonPath)) {
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_FILE_NOT_FOUND,
        `Task JSON not found: ${taskJsonPath}`,
      );
    }

    // 2. Read task JSON → shotId
    let taskJson: any;
    try {
      taskJson = JSON.parse(fs.readFileSync(taskJsonPath, 'utf-8'));
    } catch (e: any) {
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_FILE_NOT_FOUND,
        `Failed to parse task JSON: ${e.message}`,
      );
    }
    const shotId: string | undefined = taskJson._opsv?.shotId;
    if (!shotId) {
      throw new ValidationError(
        OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH,
        `Task JSON missing _opsv.shotId: ${taskJsonPath}`,
      );
    }

    // 3. Trace back to source document
    const targetRoot = this.resolveTargetRoot(circle);
    const sourceDocPath = AssetManager.findAssetFilePathUnder(targetRoot, shotId);
    if (!sourceDocPath) {
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_FILE_NOT_FOUND,
        `Source document not found for asset "${shotId}"`,
      );
    }

    // 4. Build review entry
    const now = new Date().toISOString();
    let newStatus: 'approved' | 'drafting' | 'syncing';
    if (action === 'approve') {
      newStatus = parsed.isModified ? 'syncing' : 'approved';
    } else {
      newStatus = 'drafting';
    }

    const entryAction = action === 'approve'
      ? (newStatus === 'syncing' ? 'syncing' as const : 'approved' as const)
      : action === 'design_feedback' ? 'design_feedback' as const
      : 'revise_prompt' as const;

    const reviewEntry: ReviewEntry = {
      timestamp: now,
      action: entryAction,
      outputFile: filename,
      outputFiles: [filename],
      modifiedTaskPath: parsed.isModified ? taskJsonPath : undefined,
      note: note || undefined,
    };

    // 5. Write review entry + status to document frontmatter
    const content = fs.readFileSync(sourceDocPath, 'utf-8');
    let updated = FrontmatterParser.appendReview(content, reviewEntry);
    updated = FrontmatterParser.updateField(updated, 'status', newStatus);
    fs.writeFileSync(sourceDocPath, updated);

    // 6. Write reference to document body
    if (action === 'approve' || action === 'design_feedback') {
      const variant = path.basename(filename, path.extname(filename));
      if (action === 'approve') {
        await this.approvedRefReader.appendApprovedRef(sourceDocPath, variant, outputFilePath);
      } else {
        await this.designRefReader.appendDesignRef(sourceDocPath, variant, outputFilePath);
      }
    }

    // 7. Update manifest status
    this.updateManifestStatus(circle, shotId, newStatus);

    const desc = newStatus === 'syncing'
      ? `Approved (modified task) — ${filename} — syncing required`
      : action === 'approve' ? `Approved: ${filename}`
      : action === 'design_feedback' ? `Design feedback: ${filename}`
      : `Prompt revision requested`;

    return { success: true, status: newStatus, note: desc };
  }

  updateManifestStatus(circle: string, assetId: string, newStatus: string): void {
    const circleDir = resolveWithin(this.queueRoot, circle);
    if (!circleDir) return;

    const manifestPath = path.join(circleDir, '_manifest.json');
    if (!fs.existsSync(manifestPath)) return;

    const manifest = this.manifestReader.read(manifestPath);
    if (manifest.assets && manifest.assets[assetId]) {
      manifest.assets[assetId].status = newStatus as 'drafting' | 'syncing' | 'approved';
    }
    for (const c of manifest.circles || []) {
      if (c.status && c.status[assetId]) {
        c.status[assetId] = newStatus as 'drafting' | 'syncing' | 'approved';
      }
    }
    this.manifestReader.write(manifestPath, manifest);
  }
}
