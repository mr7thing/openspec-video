import fs from 'fs';
import path from 'path';
import { AssetManager } from './AssetManager';
import { DesignRefReader } from './DesignRefReader';
import { FrontmatterParser } from './FrontmatterParser';
import { getProjectDir } from '../utils/configLoader';
import { parseOutputFilename } from '../executor/naming';
import { ReviewEntry } from '../types/ManifestSchema';
import { ValidationError, InfrastructureError, OpsVErrorCode } from '../errors/OpsVError';

/** Records review decisions without changing an Asset's approval lifecycle. */
export class ReviewService {
  private designRefs: DesignRefReader;

  constructor(private projectRoot: string) {
    this.designRefs = new DesignRefReader(projectRoot);
  }

  async feedback(outputFilePath: string, note: string): Promise<{ assetId: string; documentPath: string }> {
    if (!note.trim()) {
      throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, 'Review feedback requires a non-empty note');
    }
    const { assetId, documentPath } = this.resolveOutputDocument(outputFilePath);
    const filename = path.basename(outputFilePath);
    const entry: ReviewEntry = {
      timestamp: new Date().toISOString(),
      action: 'design_feedback',
      outputFile: filename,
      outputFiles: [filename],
      note,
    };
    const content = fs.readFileSync(documentPath, 'utf-8');
    fs.writeFileSync(documentPath, FrontmatterParser.appendReview(content, entry));
    await this.designRefs.appendDesignRef(
      documentPath,
      path.basename(filename, path.extname(filename)),
      outputFilePath,
    );
    return { assetId, documentPath };
  }

  revise(assetId: string, note: string): string {
    if (!note.trim()) {
      throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, 'Review revision requires a non-empty note');
    }
    const documentPath = this.resolveAssetDocument(assetId);
    const entry: ReviewEntry = {
      timestamp: new Date().toISOString(),
      action: 'revise_prompt',
      note,
    };
    const content = fs.readFileSync(documentPath, 'utf-8');
    fs.writeFileSync(documentPath, FrontmatterParser.appendReview(content, entry));
    return documentPath;
  }

  private resolveOutputDocument(outputFilePath: string): { assetId: string; documentPath: string } {
    if (!fs.existsSync(outputFilePath) || !fs.statSync(outputFilePath).isFile()) {
      throw new InfrastructureError(OpsVErrorCode.INFRA_FILE_NOT_FOUND, `Output file not found: ${outputFilePath}`);
    }
    const filename = path.basename(outputFilePath);
    const parsed = parseOutputFilename(filename);
    const taskPath = path.join(path.dirname(outputFilePath), parsed.taskJsonName);
    if (!fs.existsSync(taskPath)) {
      throw new InfrastructureError(OpsVErrorCode.INFRA_FILE_NOT_FOUND, `Task JSON not found: ${taskPath}`);
    }
    const task = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
    const assetId = task._opsv?.shotId;
    if (!assetId || typeof assetId !== 'string') {
      throw new ValidationError(OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH, `Task JSON missing _opsv.shotId: ${taskPath}`);
    }
    return { assetId, documentPath: this.resolveAssetDocument(assetId) };
  }

  private resolveAssetDocument(assetId: string): string {
    const videospec = getProjectDir(this.projectRoot, 'videospec');
    const documentPath = AssetManager.findAssetFilePathUnder(videospec, assetId);
    if (!documentPath) {
      throw new InfrastructureError(OpsVErrorCode.INFRA_FILE_NOT_FOUND, `Document not found: ${assetId}`);
    }
    return documentPath;
  }
}
