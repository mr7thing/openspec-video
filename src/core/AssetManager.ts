// ============================================================================
// OpsV v0.8.3 Asset Manager
// Reads assets from videospec/ and _manifest.json per .circleN/
// ============================================================================

import path from 'path';
import fs from 'fs';
import { FrontmatterParser } from './FrontmatterParser';
import { ApprovedRefReader, ApprovedRef } from './ApprovedRefReader';
import { DesignRefReader, DesignRef } from './DesignRefReader';
import { logger } from '../utils/logger';

export interface Asset {
  id: string;
  category: string;
  status: string;
  refs: string[];
  description: string;
  approvedRefs: ApprovedRef[];
  designRefs: DesignRef[];
  filePath: string;
}

export interface CircleAssetEntry {
  id: string;
  status: string;
  category?: string;
  filePath?: string;
}

export interface CircleAssets {
  circleName: string;
  assets: CircleAssetEntry[];
  circles?: Array<{ circle: string; layer: number; assetIds: string[] }>;
}

export class AssetManager {
  private projectRoot: string;
  private videospecRoot: string;
  private assets: Map<string, Asset> = new Map();
  private approvedRefReader: ApprovedRefReader;
  private designRefReader: DesignRefReader;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    this.videospecRoot = path.join(this.projectRoot, 'videospec');
    this.approvedRefReader = new ApprovedRefReader(this.projectRoot);
    this.designRefReader = new DesignRefReader(this.projectRoot);
  }

  async loadFromVideospec(): Promise<void> {
    this.assets.clear();
    const dirs = ['elements', 'scenes'];

    for (const dir of dirs) {
      const dirPath = path.join(this.videospecRoot, dir);
      if (!fs.existsSync(dirPath)) continue;

      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const { frontmatter, body } = FrontmatterParser.parseRaw(content);
          const id = file.replace(/^@/, '').replace(/\.md$/, '');
          const description =
            frontmatter.visual_brief || FrontmatterParser.extractFirstParagraph(body);
          const approvedRefs = await this.approvedRefReader.getAll(filePath);
          const designRefs = await this.designRefReader.getAll(filePath);

          const asset: Asset = {
            id,
            category: frontmatter.category || 'other',
            status: frontmatter.status || 'drafting',
            refs: frontmatter.refs || [],
            description,
            approvedRefs,
            designRefs,
            filePath,
          };

          this.assets.set(id, asset);
          logger.info(`Asset loaded: ${id} (${asset.category}, ${asset.status})`);
        } catch (err) {
          logger.warn(`Asset parse failed ${file}: ${(err as Error).message}`);
        }
      }
    }
  }

  async loadCircleAssets(circleDir: string): Promise<CircleAssets> {
    const manifestPath = path.join(circleDir, '_manifest.json');
    const circleName = path.basename(circleDir);

    if (fs.existsSync(manifestPath)) {
      const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      // v0.8.2+: assets from merged manifest (includes category)
      if (data.assets) {
        const assets: CircleAssetEntry[] = Object.entries(data.assets).map(([id, info]: [string, any]) => ({
          id,
          status: info.status || 'drafting',
          category: info.category,
          filePath: this.findAssetFilePath(id),
        }));
        return { circleName, assets, circles: data.circles };
      }
      // Fallback: circles[].status (old format without category)
      const assets: CircleAssetEntry[] = [];
      for (const circle of data.circles || []) {
        for (const [id, status] of Object.entries(circle.status || {})) {
          assets.push({ id, status: status as string, filePath: this.findAssetFilePath(id) });
        }
      }
      return { circleName, assets, circles: data.circles };
    }

    return { circleName, assets: [], circles: [] };
  }

  getAsset(id: string): Asset | undefined {
    return this.assets.get(id);
  }

  getAllAssets(): Asset[] {
    return Array.from(this.assets.values());
  }

  getByCategory(category: string): Asset[] {
    return this.getAllAssets().filter((a) => a.category === category);
  }

  getApprovedImagePath(id: string): string | null {
    const asset = this.assets.get(id);
    if (!asset || asset.approvedRefs.length === 0) return null;
    return asset.approvedRefs[0].filePath;
  }

  findAssetFilePath(assetId: string): string | undefined {
    const prefixes = ['@', ''];

    // 1. Check videospecRoot itself
    for (const prefix of prefixes) {
      const p = path.join(this.videospecRoot, `${prefix}${assetId}.md`);
      if (fs.existsSync(p)) return p;
    }

    // 2. Scan all subdirectories under videospecRoot
    if (fs.existsSync(this.videospecRoot)) {
      const entries = fs.readdirSync(this.videospecRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          for (const prefix of prefixes) {
            const p = path.join(this.videospecRoot, entry.name, `${prefix}${assetId}.md`);
            if (fs.existsSync(p)) return p;
          }
        }
      }
    }

    return undefined;
  }
}
