// ============================================================================
// OpsV v0.8 Asset Manager
// Reads assets from videospec/ and _assets.json per circle
// ============================================================================

import path from 'path';
import fs from 'fs';
import { FrontmatterParser } from './FrontmatterParser';
import { ApprovedRefReader, ApprovedRef } from './ApprovedRefReader';
import { logger } from '../utils/logger';

export interface Asset {
  id: string;
  type: string;
  status: string;
  refs: string[];
  description: string;
  approvedRefs: ApprovedRef[];
  filePath: string;
}

export interface CircleAssets {
  circleName: string;
  assets: Asset[];
}

export class AssetManager {
  private projectRoot: string;
  private videospecRoot: string;
  private assets: Map<string, Asset> = new Map();
  private approvedRefReader: ApprovedRefReader;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    this.videospecRoot = path.join(this.projectRoot, 'videospec');
    this.approvedRefReader = new ApprovedRefReader(this.projectRoot);
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

          const asset: Asset = {
            id,
            type: frontmatter.type || 'other',
            status: frontmatter.status || 'drafting',
            refs: frontmatter.refs || [],
            description,
            approvedRefs,
            filePath,
          };

          this.assets.set(id, asset);
          logger.info(`Asset loaded: ${id} (${asset.type}, ${asset.status})`);
        } catch (err) {
          logger.warn(`Asset parse failed ${file}: ${(err as Error).message}`);
        }
      }
    }
  }

  async loadCircleAssets(circleDir: string): Promise<CircleAssets> {
    const assetsJsonPath = path.join(circleDir, '_assets.json');
    const circleName = path.basename(circleDir);

    if (fs.existsSync(assetsJsonPath)) {
      const data = JSON.parse(fs.readFileSync(assetsJsonPath, 'utf-8'));
      return { circleName, assets: data.assets || [] };
    }

    return { circleName, assets: [] };
  }

  getAsset(id: string): Asset | undefined {
    return this.assets.get(id);
  }

  getAllAssets(): Asset[] {
    return Array.from(this.assets.values());
  }

  getAllElements(): Asset[] {
    return this.getAllAssets().filter((a) =>
      ['character', 'prop', 'costume'].includes(a.type)
    );
  }

  getAllScenes(): Asset[] {
    return this.getAllAssets().filter((a) => a.type === 'scene');
  }

  getApprovedImagePath(id: string): string | null {
    const asset = this.assets.get(id);
    if (!asset || asset.approvedRefs.length === 0) return null;
    return asset.approvedRefs[0].filePath;
  }
}
