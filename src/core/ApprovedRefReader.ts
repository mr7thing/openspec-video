// ============================================================================
// OpsV v0.8 Approved References Reader
// ============================================================================

import path from 'path';
import fs from 'fs';
import { FileUtils } from '../utils/FileUtils';

export interface ApprovedRef {
  variant: string;
  filePath: string;
}

export class ApprovedRefReader {
  constructor(private projectRoot: string) {}

  async getVariant(docPath: string, variant: string): Promise<string | null> {
    const refs = await this.parseApprovedRefs(docPath);
    return refs.get(variant) || null;
  }

  async getFirst(docPath: string): Promise<string | null> {
    const refs = await this.parseApprovedRefs(docPath);
    const first = refs.entries().next();
    return first.done ? null : first.value[1];
  }

  async getAll(docPath: string): Promise<ApprovedRef[]> {
    const refs = await this.parseApprovedRefs(docPath);
    return Array.from(refs.entries()).map(([variant, filePath]) => ({ variant, filePath }));
  }

  async hasAnyApproved(assetId: string): Promise<boolean> {
    const docPath = await this.findDocPath(assetId);
    if (!docPath) return false;
    const refs = await this.parseApprovedRefs(docPath);
    return refs.size > 0;
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

  private async parseApprovedRefs(docPath: string): Promise<Map<string, string>> {
    const refs = new Map<string, string>();
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

      refs.set(variant, absPath);
    }
    return refs;
  }

  private async findDocPath(assetId: string): Promise<string | null> {
    const prefixes = ['@', ''];
    const videospecDir = path.join(this.projectRoot, 'videospec');

    if (!fs.existsSync(videospecDir)) return null;

    const entries = fs.readdirSync(videospecDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        for (const prefix of prefixes) {
          const p = path.join(videospecDir, entry.name, `${prefix}${assetId}.md`);
          if (await FileUtils.exists(p)) return p;
        }
      }
    }
    return null;
  }
}
