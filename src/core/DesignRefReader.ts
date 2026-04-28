// ============================================================================
// OpsV v0.8.3 Design References Reader
// Reads ## Design References section (internal references, own document)
// ============================================================================

import fs from 'fs';
import path from 'path';

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
