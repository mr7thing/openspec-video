// ============================================================================
// OpsV v0.8 Approve Service
// Decomposed approve flow from review.ts into testable steps
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

export interface ApproveRequest {
  circle: string;
  assetId: string;
  outputFile?: string;
  taskJsonPath?: string;
}

export interface ApproveResult {
  success: boolean;
  status: 'approved' | 'syncing';
  note: string;
}

export class ApproveService {
  constructor(
    private projectRoot: string,
    private queueRoot: string,
    private manifestReader: ManifestReader,
  ) {}

  validateRequest(req: ApproveRequest): void {
    if (!sanitizePathComponent(req.circle) || !sanitizePathComponent(req.assetId)) {
      throw new Error('Invalid circle or assetId');
    }
  }

  buildReviewEntry(outputFile: string | undefined, taskJsonPath: string | undefined): {
    newStatus: 'approved' | 'syncing';
    reviewEntry: ReviewEntry;
  } {
    const now = new Date().toISOString();
    const parsed = outputFile ? parseOutputFilename(outputFile) : { isModified: false };
    const newStatus = parsed.isModified ? 'syncing' : 'approved';
    const reviewEntry: ReviewEntry = {
      timestamp: now,
      action: newStatus,
      outputFile,
      modifiedTaskPath: parsed.isModified && taskJsonPath ? taskJsonPath : undefined,
    };
    return { newStatus, reviewEntry };
  }

  resolveTargetRoot(circle: string): string {
    const circleDir = resolveWithin(this.queueRoot, circle);
    if (!circleDir) throw new Error('Forbidden');

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

  applyReviewToDocument(sourceDocPath: string, reviewEntry: ReviewEntry, newStatus: string): void {
    const content = fs.readFileSync(sourceDocPath, 'utf-8');
    const reviewLine = formatReviewEntry(reviewEntry);
    const updated = FrontmatterParser.appendReview(content, reviewLine);
    const finalContent = FrontmatterParser.updateField(updated, 'status', newStatus);
    fs.writeFileSync(sourceDocPath, finalContent);
  }

  updateManifestStatus(circle: string, assetId: string, newStatus: string): void {
    const circleDir = resolveWithin(this.queueRoot, circle);
    if (!circleDir) return;

    const manifestPath = path.join(circleDir, '_manifest.json');
    if (!fs.existsSync(manifestPath)) return;

    const manifest = this.manifestReader.read(manifestPath);
    if (manifest.assets && manifest.assets[assetId]) {
      manifest.assets[assetId].status = newStatus as any;
    }
    for (const c of manifest.circles || []) {
      if (c.status && c.status[assetId]) {
        c.status[assetId] = newStatus as any;
      }
    }
    this.manifestReader.write(manifestPath, manifest);
  }

  execute(req: ApproveRequest): ApproveResult {
    this.validateRequest(req);
    const { newStatus, reviewEntry } = this.buildReviewEntry(req.outputFile, req.taskJsonPath);
    const targetRoot = this.resolveTargetRoot(req.circle);
    const sourceDocPath = AssetManager.findAssetFilePathUnder(targetRoot, req.assetId);

    if (!sourceDocPath) {
      throw new Error(`Document not found: ${req.assetId} in target ${targetRoot}`);
    }

    this.applyReviewToDocument(sourceDocPath, reviewEntry, newStatus);
    this.updateManifestStatus(req.circle, req.assetId, newStatus);

    const note = newStatus === 'syncing'
      ? 'Modified task — agent must align fields before setting approved'
      : 'Original task — directly approved';

    return { success: true, status: newStatus, note };
  }
}
