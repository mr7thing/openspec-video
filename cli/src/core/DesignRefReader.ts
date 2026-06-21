// ============================================================================
// OpsV Design References Reader
// Reads ## Design References section (internal references, own document)
// ============================================================================

import fs from 'fs';
import path from 'path';
import { FileUtils } from '../utils/FileUtils';

export interface DesignRef {
  variant: string;
  filePath: string;
}

export class DesignRefReader {
  constructor(private projectRoot: string) {}

  async getAll(docPath: string): Promise<DesignRef[]> {
    const refs = await this.parseDesignRefs(docPath);
    return Array.from(refs.entries()).map(([variant, filePath]) => ({ variant, filePath }));
  }

  /**
   * Append an image entry to the document's `## Design References` section.
   * Creates the section at end-of-document if it doesn't exist.
   * Idempotent at the relpath level: never deletes prior entries.
   */
  async appendDesignRef(docPath: string, variant: string, imagePath: string): Promise<void> {
    const exists = await FileUtils.exists(docPath);
    if (!exists) return;

    let content = await FileUtils.readFile(docPath);
    const relPath = path.relative(path.dirname(docPath), imagePath).replace(/\\/g, '/');
    const newEntry = `![${variant}](${relPath})`;

    const sectionRegex = /^(##\s*Design\s+References\s*\n)/im;
    const match = content.match(sectionRegex);

    if (match && match.index !== undefined) {
      const insertIdx = match.index + match[0].length;
      content = content.slice(0, insertIdx) + `\n${newEntry}\n` + content.slice(insertIdx);
    } else {
      content += `\n\n## Design References\n\n${newEntry}\n`;
    }

    await FileUtils.writeFile(docPath, content);
  }

  private async parseDesignRefs(docPath: string): Promise<Map<string, string>> {
    const refs = new Map<string, string>();
    if (!docPath || !fs.existsSync(docPath)) return refs;

    const content = fs.readFileSync(docPath, 'utf-8');

    const sectionMatch = content.match(
      /##\s*Design\s+References\s*\n([\s\S]*?)(?=\n##\s|$)/i
    );
    if (!sectionMatch) return refs;

    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = imgRegex.exec(sectionMatch[1])) !== null) {
      const [, variant, filePath] = match;
      if (!filePath) continue;

      const absPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(path.dirname(docPath), filePath);

      if (!fs.existsSync(absPath)) continue;

      if (variant) {
        refs.set(variant, absPath);
      } else {
        // No alt text — use filename as key
        const key = path.basename(filePath, path.extname(filePath));
        refs.set(key, absPath);
      }
    }
    return refs;
  }
}
