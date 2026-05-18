// ============================================================================
// OpsV @ Ref Resolver
// ============================================================================

import fs from 'fs';
import path from 'path';
import { ApprovedRefReader } from './ApprovedRefReader';
import { getProjectDir } from '../utils/configLoader';
import { AssetDocIndex, buildAssetDocIndex, AssetDocEntry } from './AssetDocIndex';
import { CompilationError, OpsVErrorCode } from '../errors/OpsVError';

export interface RefResult {
  type: 'asset' | 'frame';
  assetId: string;
  variant?: string;
  label: string;
  targetDoc: string;
  resolvedImagePath?: string;
}

export class RefResolver {
  private assetIndex: AssetDocIndex | null = null;

  constructor(
    private projectRoot: string,
    private approvedRefReader: ApprovedRefReader
  ) {}

  private getAssetIndex(): AssetDocIndex {
    if (!this.assetIndex) {
      const videospecDir = getProjectDir(this.projectRoot, 'videospec');
      this.assetIndex = buildAssetDocIndex(videospecDir);
    }
    return this.assetIndex;
  }

  async parseAll(markdown: string): Promise<RefResult[]> {
    const results: RefResult[] = [];
    const refRegex = /(?:\()?@([a-zA-Z0-9_:.\-]+)(?:\))?\s+([^\n@]*)/g;

    let match;
    while ((match = refRegex.exec(markdown)) !== null) {
      const [, identifier, label] = match;
      const trimmedLabel = label.trim();
      if (!trimmedLabel) continue;
      results.push(await this.resolve(identifier, trimmedLabel));
    }

    return results;
  }

  async resolve(identifier: string, label: string = ''): Promise<RefResult> {
    if (identifier.startsWith('FRAME:')) {
      return this.resolveFrame(identifier, label);
    }

    const colonIdx = identifier.indexOf(':');
    const assetId = colonIdx > 0 ? identifier.slice(0, colonIdx) : identifier;
    const variant = colonIdx > 0 ? identifier.slice(colonIdx + 1) : undefined;

    const targetDoc = this.findAssetDoc(assetId);
    let resolvedImagePath: string | undefined;

    if (targetDoc) {
      resolvedImagePath = variant
        ? (await this.approvedRefReader.getVariant(targetDoc, variant)) || undefined
        : (await this.approvedRefReader.getFirst(targetDoc)) || undefined;
    }

    return {
      type: 'asset',
      assetId,
      variant,
      label,
      targetDoc: targetDoc || '',
      resolvedImagePath,
    };
  }

  expandRefsInText(
    markdown: string,
    refs: RefResult[]
  ): { expandedText: string; attachments: string[] } {
    let text = markdown;
    const attachments: string[] = [];

    for (const ref of refs) {
      const refIdentifier = ref.variant ? `${ref.assetId}:${ref.variant}` : ref.assetId;
      const refPatternNoBracket = `@${refIdentifier} ${ref.label}`;
      const refPatternWithBracket = `(@${refIdentifier}) ${ref.label}`;

      const targetPattern = text.includes(refPatternWithBracket)
        ? refPatternWithBracket
        : refPatternNoBracket;

      if (ref.resolvedImagePath && fs.existsSync(ref.resolvedImagePath)) {
        attachments.push(ref.resolvedImagePath);
        const imageIndex = attachments.length;
        text = text.replace(targetPattern, `${ref.label} [ref ${imageIndex}]`);
      } else {
        text = text.replace(targetPattern, ref.label);
      }
    }

    return { expandedText: text, attachments };
  }

  private resolveFrame(identifier: string, label: string): RefResult {
    const FRAME_PREFIX = 'FRAME:';
    const framePart = identifier.slice(FRAME_PREFIX.length);
    const lastUnderscoreIdx = framePart.lastIndexOf('_');
    if (lastUnderscoreIdx <= 0) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_INVALID_REF, `Invalid FRAME identifier "${identifier}": expected FRAME:<shotId>_<frameType>`);
    }
    const shotId = framePart.slice(0, lastUnderscoreIdx);
    const frameType = framePart.slice(lastUnderscoreIdx + 1);
    if (!shotId || !frameType) {
      throw new CompilationError(OpsVErrorCode.COMPILATION_INVALID_REF, `Invalid FRAME identifier "${identifier}": shotId and frameType must not be empty`);
    }

    // Search .circleN/ directories for the frame file
    const queueRoot = getProjectDir(this.projectRoot, 'queue');
    let framePath: string | undefined;

    if (fs.existsSync(queueRoot)) {
      const circleDirs = fs.readdirSync(queueRoot).filter((d) => /_circle\d+$/.test(d));
      for (const circleDir of circleDirs) {
        const circlePath = path.join(queueRoot, circleDir);
        let stats;
        try { stats = fs.statSync(circlePath); } catch { continue; }
        if (!stats.isDirectory()) continue;

        // Scan provider.model/ subdirectories for matching frame file
        let providerDirs: string[];
        try { providerDirs = fs.readdirSync(circlePath).filter((d) => !d.startsWith('_')); } catch { continue; }
        for (const providerDir of providerDirs) {
          const providerPath = path.join(circlePath, providerDir);
          let pstats;
          try { pstats = fs.statSync(providerPath); } catch { continue; }
          if (!pstats.isDirectory()) continue;

          const candidate = path.join(providerPath, `${shotId}_${frameType}.png`);
          if (fs.existsSync(candidate)) {
            framePath = candidate;
            break;
          }
        }
        if (framePath) break;
      }
    }

    return {
      type: 'frame',
      assetId: framePart,
      label,
      targetDoc: '',
      resolvedImagePath: framePath,
    };
  }

  private findAssetDoc(assetId: string): string | null {
    const entry = this.getAssetIndex().entries.get(assetId);
    return entry ? entry.filePath : null;
  }
}
