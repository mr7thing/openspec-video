// ============================================================================
// OpsV v0.8 @ Ref Resolver
// ============================================================================

import fs from 'fs';
import path from 'path';
import { ApprovedRefReader } from './ApprovedRefReader';

export interface RefResult {
  type: 'asset' | 'frame';
  assetId: string;
  variant?: string;
  label: string;
  targetDoc: string;
  resolvedImagePath?: string;
}

export class RefResolver {
  constructor(
    private projectRoot: string,
    private approvedRefReader: ApprovedRefReader
  ) {}

  async parseAll(markdown: string): Promise<RefResult[]> {
    const results: RefResult[] = [];
    const refRegex = /(?:\()?@([a-zA-Z0-9_:]+)(?:\))?\s+([^\n@]*)/g;

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
    const framePart = identifier.slice(6);
    const lastUnderscoreIdx = framePart.lastIndexOf('_');
    const shotId = framePart.slice(0, lastUnderscoreIdx);
    const frameType = framePart.slice(lastUnderscoreIdx + 1);

    // Search .circleN/ directories for the frame file
    const queueRoot = path.join(this.projectRoot, 'opsv-queue');
    let framePath: string | undefined;

    if (fs.existsSync(queueRoot)) {
      const circleDirs = fs.readdirSync(queueRoot).filter((d) => d.includes('.circle'));
      for (const circleDir of circleDirs) {
        const circlePath = path.join(queueRoot, circleDir);
        if (!fs.statSync(circlePath).isDirectory()) continue;

        // Scan provider.model/ subdirectories for matching frame file
        const providerDirs = fs.readdirSync(circlePath).filter((d) => !d.startsWith('_'));
        for (const providerDir of providerDirs) {
          const providerPath = path.join(circlePath, providerDir);
          if (!fs.statSync(providerPath).isDirectory()) continue;

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
    const dirs = ['elements', 'scenes'];
    const prefixes = ['@', ''];

    for (const dir of dirs) {
      for (const prefix of prefixes) {
        const p = path.join(this.projectRoot, 'videospec', dir, `${prefix}${assetId}.md`);
        if (fs.existsSync(p)) return p;
      }
    }
    return null;
  }
}
