import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { AssetManager } from './AssetManager';
import { FrontmatterParser } from './FrontmatterParser';
import { getProjectDir } from '../utils/configLoader';
import { InfrastructureError, ValidationError, OpsVErrorCode } from '../errors/OpsVError';

/** Finalizes a freely reconciled syncing document and preserves document-only Git history. */
export class SyncService {
  constructor(private projectRoot: string) {}

  sync(assetId: string): { documentPath: string; snapshotCreated: boolean; commitCreated: boolean } {
    const documentPath = this.resolveDocument(assetId);
    const content = fs.readFileSync(documentPath, 'utf-8');
    const { frontmatter } = FrontmatterParser.parseRaw(content);
    if (frontmatter.status !== 'syncing') {
      throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, `Asset is not syncing: ${assetId}`);
    }

    const snapshotCreated = this.commitDocument(documentPath, `opsv: pre-sync snapshot ${assetId}`);
    const reconciled = FrontmatterParser.updateField(content, 'status', 'approved');
    // Parsing after the Agent's free-form edit is the only sync content gate.
    FrontmatterParser.parse(reconciled);
    fs.writeFileSync(documentPath, reconciled);
    const commitCreated = this.commitDocument(documentPath, `opsv: sync ${assetId}`);
    return { documentPath, snapshotCreated, commitCreated };
  }

  private resolveDocument(assetId: string): string {
    const documentPath = AssetManager.findAssetFilePathUnder(getProjectDir(this.projectRoot, 'videospec'), assetId);
    if (!documentPath) {
      throw new InfrastructureError(OpsVErrorCode.INFRA_FILE_NOT_FOUND, `Document not found: ${assetId}`);
    }
    return documentPath;
  }

  private commitDocument(documentPath: string, message: string): boolean {
    const relativePath = path.relative(this.projectRoot, documentPath);
    try {
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: this.projectRoot, stdio: 'ignore' });
      execFileSync('git', ['add', '--', relativePath], { cwd: this.projectRoot, stdio: 'ignore' });
      execFileSync('git', ['diff', '--cached', '--quiet', '--', relativePath], { cwd: this.projectRoot, stdio: 'ignore' });
      return false;
    } catch {
      try {
        execFileSync('git', ['commit', '-m', message, '--', relativePath], { cwd: this.projectRoot, stdio: 'ignore' });
        return true;
      } catch (error: any) {
        throw new InfrastructureError(OpsVErrorCode.INFRA_FILE_NOT_FOUND, `Could not commit document history: ${error.message}`);
      }
    }
  }
}
