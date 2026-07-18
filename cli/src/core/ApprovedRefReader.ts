// ============================================================================
// OpsV Approved References Reader
// ============================================================================

import path from 'path';
import fs from 'fs';
import { FileUtils } from '../utils/FileUtils';
import { getProjectDir } from '../utils/configLoader';
import { AssetDocIndex, buildAssetDocIndex, AssetDocEntry } from './AssetDocIndex';

export interface ApprovedRef {
  variant: string;
  filePath: string;
}

export class ApprovedRefReader {
  private projectRoot: string;
  private assetIndex: AssetDocIndex | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  setAssetIndex(index: AssetDocIndex): void {
    this.assetIndex = index;
  }

  private getAssetIndex(): AssetDocIndex {
    if (!this.assetIndex) {
      const videospecDir = getProjectDir(this.projectRoot, 'videospec');
      this.assetIndex = buildAssetDocIndex(videospecDir);
    }
    return this.assetIndex;
  }

  async getVariant(docPath: string, variant: string): Promise<string | null> {
    const refs = await this.parseApprovedRefs(docPath);
    const matches = refs.filter((ref) => ref.variant === variant);
    return matches.length === 1 ? matches[0].filePath : null;
  }

  async getFirst(docPath: string): Promise<string | null> {
    const refs = await this.parseApprovedRefs(docPath);
    return refs.length === 1 ? refs[0].filePath : null;
  }

  async getAll(docPath: string): Promise<ApprovedRef[]> {
    return this.parseApprovedRefs(docPath);
  }

  async getDuplicateVariants(docPath: string): Promise<string[]> {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const { variant } of await this.parseApprovedRefs(docPath)) {
      if (seen.has(variant)) duplicates.add(variant);
      seen.add(variant);
    }
    return [...duplicates];
  }

  async hasAnyApproved(assetId: string): Promise<boolean> {
    const docPath = await this.findDocPath(assetId);
    if (!docPath) return false;
    const refs = await this.parseApprovedRefs(docPath);
    return refs.length > 0;
  }

  async appendApprovedRef(docPath: string, variant: string, imagePath: string): Promise<void> {
    const exists = await FileUtils.exists(docPath);
    if (!exists) return;

    let content = await FileUtils.readFile(docPath);
    const relPath = path.relative(path.dirname(docPath), imagePath).replace(/\\/g, '/');
    const newEntry = `![${variant}](${relPath})`;

    const sectionRegex = /^(##\s*Approved\s+References\s*\n)/im;
    const match = content.match(sectionRegex);

    if (match && match.index !== undefined) {
      const insertIdx = match.index + match[0].length;
      content = content.slice(0, insertIdx) + `\n${newEntry}\n` + content.slice(insertIdx);
    } else {
      content += `\n\n## Approved References\n\n${newEntry}\n`;
    }

    await FileUtils.writeFile(docPath, content);
  }

  private async parseApprovedRefs(docPath: string): Promise<ApprovedRef[]> {
    const refs: ApprovedRef[] = [];
    if (!docPath) return refs;

    const exists = await FileUtils.exists(docPath);
    if (!exists) return refs;

    const content = await FileUtils.readFile(docPath);

    const sectionMatch = content.match(
      /##\s*Approved\s+References\s*\n([\s\S]*?)(?=\n##\s|$)/i
    );
    if (!sectionMatch) return refs;

    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = imgRegex.exec(sectionMatch[1])) !== null) {
      const [, variant, filePath] = match;
      if (!variant || !filePath) continue;

      const absPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(path.dirname(docPath), filePath);

      refs.push({ variant, filePath: absPath });
    }
    return refs;
  }

  private async findDocPath(assetId: string): Promise<string | null> {
    const entry = this.getAssetIndex().entries.get(assetId);
    return entry ? entry.filePath : null;
  }
}
