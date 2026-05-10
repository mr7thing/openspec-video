// ============================================================================
// OpsV v0.8 Review Strategy
// Strategy pattern to eliminate dual-mode (legacy / manifest-driven) branching
// ============================================================================

import path from 'path';
import fs from 'fs';
import { ManifestReader } from './ManifestReader';
import { AssetManager } from './AssetManager';
import {
  ManifestInfo,
  DocumentInfo,
  DocumentOutput,
  CircleSummary,
  CircleAssetsResult,
} from '../types/ManifestSchema';
import { getProjectDir } from '../utils/configLoader';
import { sanitizePathComponent } from '../utils/pathSecurity';

export interface ReviewStrategy {
  listCircles(): CircleSummary[];
  listDocuments(): DocumentInfo[];
  findDocument(circle: string, docId: string): DocumentInfo | null;
  listCircleAssets(circleName: string): CircleAssetsResult;
}

// ============================================================================
// Manifest-driven strategy (--circle mode)
// ============================================================================

export class ManifestReviewStrategy implements ReviewStrategy {
  constructor(
    private manifestInfo: ManifestInfo,
    private manifestReader: ManifestReader,
    private projectRoot: string,
  ) {}

  listCircles(): CircleSummary[] {
    const { manifest, circleName } = this.manifestInfo;
    const assets = manifest.assets || {};
    const assetCount = Object.keys(assets).length;
    const layers = new Set(Object.values(assets).map(a => a.layer)).size;
    return [{ name: circleName, target: manifest.target || '', assetCount, layers }];
  }

  listDocuments(): DocumentInfo[] {
    const { manifestInfo, manifestReader, projectRoot } = this;
    const { manifestPath, circleDir, circleName, manifest } = manifestInfo;
    const assetsMap: Record<string, any> = manifest.assets || {};
    const targetRoot = path.resolve(projectRoot, manifest.target || getProjectDir(projectRoot, 'videospec'));

    const docs: DocumentInfo[] = [];

    for (const [id, info] of Object.entries(assetsMap)) {
      const docPath = AssetManager.findAssetFilePathUnder(targetRoot, id);
      if (!docPath) continue;

      const outputs = this.collectOutputs(circleDir, circleName, id);

      docs.push({
        docId: id,
        docPath,
        circle: circleName,
        category: (info as any).category || 'other',
        status: (info as any).status || 'drafting',
        outputs,
      });
    }

    return docs;
  }

  findDocument(circle: string, docId: string): DocumentInfo | null {
    const { manifest, circleDir, circleName } = this.manifestInfo;
    const assetsMap = manifest.assets || {};

    if (!assetsMap[docId]) return null;

    const targetRoot = path.resolve(
      this.projectRoot,
      manifest.target || getProjectDir(this.projectRoot, 'videospec')
    );
    const docPath = AssetManager.findAssetFilePathUnder(targetRoot, docId);
    if (!docPath) return null;

    const info = assetsMap[docId];
    const outputs = this.collectOutputs(circleDir, circleName, docId);

    const doc: DocumentInfo = {
      docId,
      docPath,
      circle: circleName,
      category: info.category || 'other',
      status: info.status || 'drafting',
      outputs,
    };

    if (fs.existsSync(docPath)) {
      doc.content = fs.readFileSync(docPath, 'utf-8');
    }
    return doc;
  }

  listCircleAssets(circleName: string): CircleAssetsResult {
    const { circleDir, manifest } = this.manifestInfo;
    const assetsMap: Record<string, any> = manifest.assets || {};

    const enriched = Object.entries(assetsMap).map(([id, info]: [string, any]) => {
      const outputs: string[] = [];
      const dirs = fs.readdirSync(circleDir).filter(d => !d.startsWith('_'));

      for (const providerDir of dirs) {
        const providerPath = path.join(circleDir, providerDir);
        if (!fs.statSync(providerPath).isDirectory()) continue;

        const files = fs.readdirSync(providerPath);
        const matches = files.filter(
          f => f.startsWith(id) && !f.endsWith('.json') && !f.endsWith('.log')
        );
        for (const f of matches) {
          outputs.push(path.join(providerDir, f));
        }
      }

      return { id, status: info.status, layer: info.layer, category: info.category, outputs };
    });

    return { circle: circleName, assets: enriched };
  }

  private collectOutputs(circleDir: string, circleName: string, assetId: string): DocumentOutput[] {
    const outputs: DocumentOutput[] = [];
    const dirs = fs.readdirSync(circleDir).filter(d => !d.startsWith('_') && sanitizePathComponent(d));

    for (const providerDir of dirs) {
      const providerPath = path.join(circleDir, providerDir);
      if (!fs.statSync(providerPath).isDirectory()) continue;

      const files = fs.readdirSync(providerPath).filter(f => !f.endsWith('.json') && !f.endsWith('.log'));
      const matches = files.filter(f => f.startsWith(assetId));
      for (const f of matches) {
        outputs.push({
          circle: circleName,
          provider: providerDir,
          filename: f,
          path: path.join(circleName, providerDir, f),
        });
      }
    }
    return outputs;
  }
}

// ============================================================================
// Legacy strategy (no --circle flag) — DEPRECATED
// ============================================================================

/** @deprecated Use --circle for manifest-driven review instead. */
export class LegacyReviewStrategy implements ReviewStrategy {
  private queueRoot: string;
  private targetDir: string;

  constructor(
    private projectRoot: string,
    queueRoot: string,
    private options: { latest?: boolean; all?: boolean },
    private manifestReader: ManifestReader,
  ) {
    this.queueRoot = queueRoot;
    this.targetDir = getProjectDir(projectRoot, 'videospec');
    console.warn('[opsv] Legacy review mode is deprecated. Use --circle for manifest-driven review.');
  }

  listCircles(): CircleSummary[] {
    const circles: CircleSummary[] = [];

    if (!fs.existsSync(this.queueRoot)) return circles;

    const entries = fs.readdirSync(this.queueRoot).filter(d => {
      const fullPath = path.join(this.queueRoot, d);
      return fs.statSync(fullPath).isDirectory() && /\.circle\d+$/.test(d);
    });

    for (const name of entries) {
      const manifestPath = path.join(this.queueRoot, name, '_manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = this.manifestReader.read(manifestPath);
        const assets = manifest.assets || {};
        const assetCount = Object.keys(assets).length;
        const layers = new Set(Object.values(assets).map(a => a.layer)).size;
        circles.push({ name, target: manifest.target || '', assetCount, layers });
      }
    }

    if (this.options.latest && circles.length > 0) {
      return [circles[circles.length - 1]];
    }

    return circles;
  }

  listDocuments(): DocumentInfo[] {
    const docs: DocumentInfo[] = [];

    if (!fs.existsSync(this.targetDir)) return docs;

    // 1. Read all manifests to build asset info and output index
    const assetInfoMap: Record<string, { category: string; status: string }> = {};
    const outputIndex: Record<string, Array<{ circle: string; provider: string; filename: string }>> = {};

    if (fs.existsSync(this.queueRoot)) {
      const circleDirs = fs.readdirSync(this.queueRoot).filter(d => /\.circle\d+$/.test(d));
      for (const circleDir of circleDirs) {
        const circlePath = path.join(this.queueRoot, circleDir);
        const manifestPath = path.join(circlePath, '_manifest.json');

        if (fs.existsSync(manifestPath)) {
          const manifest = this.manifestReader.read(manifestPath);
          const assetsMap = manifest.assets || {};
          for (const [id, info] of Object.entries(assetsMap)) {
            assetInfoMap[id] = {
              category: (info as any).category || 'other',
              status: (info as any).status || 'drafting',
            };
          }
        }

        const providerDirs = fs.readdirSync(circlePath).filter(d => !d.startsWith('_') && sanitizePathComponent(d));
        for (const providerDir of providerDirs) {
          const providerPath = path.join(circlePath, providerDir);
          if (!fs.statSync(providerPath).isDirectory()) continue;

          const files = fs.readdirSync(providerPath).filter(f => !f.endsWith('.json') && !f.endsWith('.log'));
          for (const file of files) {
            const docId = file.replace(/(_\d+)+(\.[^.]+)$/, '');
            if (!outputIndex[docId]) outputIndex[docId] = [];
            outputIndex[docId].push({ circle: circleDir, provider: providerDir, filename: file });
          }
        }
      }
    }

    // 2. Check targetDir root itself
    if (fs.existsSync(this.targetDir)) {
      const rootFiles = fs.readdirSync(this.targetDir).filter(f => f.endsWith('.md'));
      for (const file of rootFiles) {
        const docId = file.replace(/^@/, '').replace(/\.md$/, '');
        const info = assetInfoMap[docId];
        docs.push({
          docId,
          docPath: path.join(this.targetDir, file),
          circle: 'root',
          category: info?.category || 'root',
          status: info?.status || 'drafting',
          outputs: (outputIndex[docId] || []).map(o => ({
            circle: o.circle,
            provider: o.provider,
            filename: o.filename,
            path: path.join(o.circle, o.provider, o.filename),
          })),
        });
      }
    }

    // 3. Scan subdirectories
    const subdirs = fs.readdirSync(this.targetDir, { withFileTypes: true });
    for (const subdir of subdirs) {
      if (!subdir.isDirectory()) continue;
      if (!sanitizePathComponent(subdir.name)) continue;

      const dirPath = path.join(this.targetDir, subdir.name);
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const docId = file.replace(/^@/, '').replace(/\.md$/, '');
        const info = assetInfoMap[docId];

        docs.push({
          docId,
          docPath: path.join(dirPath, file),
          circle: subdir.name,
          category: info?.category || subdir.name,
          status: info?.status || 'drafting',
          outputs: (outputIndex[docId] || []).map(o => ({
            circle: o.circle,
            provider: o.provider,
            filename: o.filename,
            path: path.join(o.circle, o.provider, o.filename),
          })),
        });
      }
    }

    return docs;
  }

  findDocument(circle: string, docId: string): DocumentInfo | null {
    // Direct lookup: find doc by circle name and docId without scanning all
    const dirPath = path.join(this.targetDir, circle);
    const prefixes = ['@', ''];

    let docPath: string | undefined;
    // Check targetDir root (circle === 'root')
    if (circle === 'root') {
      for (const prefix of prefixes) {
        const p = path.join(this.targetDir, `${prefix}${docId}.md`);
        if (fs.existsSync(p)) { docPath = p; break; }
      }
    } else if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      for (const prefix of prefixes) {
        const p = path.join(dirPath, `${prefix}${docId}.md`);
        if (fs.existsSync(p)) { docPath = p; break; }
      }
    }

    if (!docPath) return null;

    // Get status/category from manifest
    const manifestPath = path.join(this.queueRoot, circle, '_manifest.json');
    let status = 'drafting';
    let category = circle;
    if (fs.existsSync(manifestPath)) {
      const manifest = this.manifestReader.read(manifestPath);
      const assetsMap = manifest.assets || {};
      if (assetsMap[docId]) {
        status = assetsMap[docId].status || 'drafting';
        category = assetsMap[docId].category || circle;
      }
    }

    // Collect outputs
    const outputs: DocumentOutput[] = [];
    if (fs.existsSync(this.queueRoot)) {
      const circleDirs = fs.readdirSync(this.queueRoot).filter(d => /\.circle\d+$/.test(d));
      for (const circleDir of circleDirs) {
        const circlePath = path.join(this.queueRoot, circleDir);
        const providerDirs = fs.readdirSync(circlePath).filter(d => !d.startsWith('_') && sanitizePathComponent(d));
        for (const providerDir of providerDirs) {
          const providerPath = path.join(circlePath, providerDir);
          if (!fs.statSync(providerPath).isDirectory()) continue;
          const files = fs.readdirSync(providerPath).filter(
            f => f.startsWith(docId) && !f.endsWith('.json') && !f.endsWith('.log')
          );
          for (const f of files) {
            outputs.push({
              circle: circleDir,
              provider: providerDir,
              filename: f,
              path: path.join(circleDir, providerDir, f),
            });
          }
        }
      }
    }

    const doc: DocumentInfo = { docId, docPath, circle, category, status, outputs };
    if (fs.existsSync(docPath)) {
      doc.content = fs.readFileSync(docPath, 'utf-8');
    }
    return doc;
  }

  listCircleAssets(circleName: string): CircleAssetsResult {
    const circleDir = path.join(this.queueRoot, circleName);
    const manifestPath = path.join(circleDir, '_manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return { circle: circleName, assets: [] };
    }

    const manifest = this.manifestReader.read(manifestPath);
    const assetsMap: Record<string, any> = manifest.assets || {};

    const enriched = Object.entries(assetsMap).map(([id, info]: [string, any]) => {
      const outputs: string[] = [];
      const dirs = fs.readdirSync(circleDir).filter(d => !d.startsWith('_'));

      for (const providerDir of dirs) {
        const providerPath = path.join(circleDir, providerDir);
        if (!fs.statSync(providerPath).isDirectory()) continue;

        const files = fs.readdirSync(providerPath);
        const matches = files.filter(
          f => f.startsWith(id) && !f.endsWith('.json') && !f.endsWith('.log')
        );
        for (const f of matches) {
          outputs.push(path.join(providerDir, f));
        }
      }

      return { id, status: info.status, layer: info.layer, category: info.category, outputs };
    });

    return { circle: circleName, assets: enriched };
  }
}
