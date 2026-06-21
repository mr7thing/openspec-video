// ============================================================================
// OpsV Review Strategy
// Strategy pattern for dual-mode review: manifest-driven (--circle) and global
// ============================================================================

import path from 'path';
import fs from 'fs';
import { ManifestReader } from './ManifestReader';
import { AssetManager } from './AssetManager';
import { FrontmatterParser } from './FrontmatterParser';
import {
  ManifestInfo,
  ManifestAssetEntry,
  DocumentInfo,
  DocumentOutput,
  CircleSummary,
  CircleAssetsResult,
} from '../types/ManifestSchema';
import { getProjectDir } from '../utils/configLoader';
import { sanitizePathComponent } from '../utils/pathSecurity';
import { logger } from '../utils/logger';

export interface ReviewStrategy {
  listCircles(): CircleSummary[];
  listDocuments(): DocumentInfo[];
  findDocument(circle: string, docId: string): DocumentInfo | null;
  findDocumentById(docId: string): DocumentInfo | null;
  listCircleAssets(circleName: string): CircleAssetsResult;
}

// ============================================================================
// Recursive output file scanner (shared by both strategies)
// Provider dirs may be flat or nested (e.g. minimax.img01/minimax.img01_019/)
// ============================================================================

function collectOutputsFromDir(
  dirPath: string,
  circleName: string,
  providerTop: string,
  relPrefix: string,
  assetId: string | null,
  results: DocumentOutput[] | string[],
  isDocOutput: boolean,
): void {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectOutputsFromDir(
        fullPath, circleName, providerTop,
        path.join(relPrefix, entry.name),
        assetId, results, isDocOutput,
      );
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.json') || entry.name.endsWith('.log')) continue;
      if (assetId && !entry.name.startsWith(assetId)) continue;

      const relPath = path.join(relPrefix, entry.name);
      if (isDocOutput) {
        (results as DocumentOutput[]).push({
          circle: circleName,
          provider: providerTop,
          filename: entry.name,
          path: path.join(circleName, relPath),
        });
      } else {
        (results as string[]).push(relPath);
      }
    }
  }
}

function scanOutputsRecursive(
  circleDir: string,
  circleName: string,
  assetId: string | null,
): DocumentOutput[] {
  const outputs: DocumentOutput[] = [];
  if (!fs.existsSync(circleDir)) return outputs;

  const providerDirs = fs.readdirSync(circleDir).filter(d => !d.startsWith('_') && sanitizePathComponent(d));
  for (const providerDir of providerDirs) {
    const providerPath = path.join(circleDir, providerDir);
    if (!fs.statSync(providerPath).isDirectory()) continue;
    collectOutputsFromDir(
      providerPath, circleName, providerDir, providerDir,
      assetId, outputs, true,
    );
  }
  return outputs;
}

function scanOutputPathsRecursive(
  circleDir: string,
  assetId: string,
): string[] {
  const outputs: string[] = [];
  if (!fs.existsSync(circleDir)) return outputs;

  const providerDirs = fs.readdirSync(circleDir).filter(d => !d.startsWith('_') && sanitizePathComponent(d));
  for (const providerDir of providerDirs) {
    const providerPath = path.join(circleDir, providerDir);
    if (!fs.statSync(providerPath).isDirectory()) continue;
    collectOutputsFromDir(
      providerPath, '', providerDir, providerDir,
      assetId, outputs, false,
    );
  }
  return outputs;
}

/** Read category and status from document frontmatter (single source of truth). */
function readDocFrontmatter(docPath: string): { category: string; status: string } {
  try {
    const content = fs.readFileSync(docPath, 'utf-8');
    const { frontmatter } = FrontmatterParser.parseRaw(content);
    return {
      category: frontmatter.category || 'other',
      status: frontmatter.status || 'drafting',
    };
  } catch (err: any) {
    logger.warn(`Failed to read frontmatter from ${docPath}: ${err?.message}`);
    return { category: 'other', status: 'drafting' };
  }
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
    const indices = new Set(Object.values(assets).map(a => a.index)).size;
    return [{ name: circleName, target: manifest.target || '', assetCount, indexCount: indices }];
  }

  listDocuments(): DocumentInfo[] {
    const { manifestInfo, projectRoot } = this;
    const { circleDir, circleName, manifest } = manifestInfo;
    const assetsMap: Record<string, { status?: string; index?: number; category?: string }> = manifest.assets || {};
    const targetRoot = path.resolve(projectRoot, manifest.target || getProjectDir(projectRoot, 'videospec'));

    const docs: DocumentInfo[] = [];

    for (const [id, info] of Object.entries(assetsMap)) {
      const docPath = AssetManager.findAssetFilePathUnder(targetRoot, id);
      if (!docPath) continue;

      const fm = readDocFrontmatter(docPath);
      const outputs = scanOutputsRecursive(circleDir, circleName, id);

      docs.push({
        docId: id,
        docPath,
        circle: circleName,
        category: fm.category,
        status: fm.status,
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

    const fm = readDocFrontmatter(docPath);
    const outputs = scanOutputsRecursive(circleDir, circleName, docId);

    const doc: DocumentInfo = {
      docId,
      docPath,
      circle: circleName,
      category: fm.category,
      status: fm.status,
      outputs,
    };

    if (fs.existsSync(docPath)) {
      doc.content = fs.readFileSync(docPath, 'utf-8');
    }
    return doc;
  }

  findDocumentById(docId: string): DocumentInfo | null {
    const docs = this.listDocuments();
    const found = docs.find(d => d.docId === docId);
    if (!found) return null;
    if (!found.content && fs.existsSync(found.docPath)) {
      found.content = fs.readFileSync(found.docPath, 'utf-8');
    }
    return found;
  }

  listCircleAssets(circleName: string): CircleAssetsResult {
    const { circleDir, manifest } = this.manifestInfo;
    const assetsMap: Record<string, ManifestAssetEntry> = manifest.assets || {};

    const enriched = Object.entries(assetsMap).map(([id, info]) => {
      const outputs = scanOutputPathsRecursive(circleDir, id);
      return { id, status: info.status, index: info.index, category: info.category, outputs };
    });

    return { circle: circleName, assets: enriched };
  }
}

// ============================================================================
// Global strategy (no --circle flag)
// Document frontmatter is the single source of truth for category/status.
// Manifest is used only to discover output files across all circles.
// ============================================================================

export class GlobalReviewStrategy implements ReviewStrategy {
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
  }

  listCircles(): CircleSummary[] {
    const circles: CircleSummary[] = [];

    if (!fs.existsSync(this.queueRoot)) return circles;

    const entries = fs.readdirSync(this.queueRoot).filter(d => {
      const fullPath = path.join(this.queueRoot, d);
      return fs.statSync(fullPath).isDirectory() && /_circle\d+$/.test(d);
    });

    for (const name of entries) {
      const manifestPath = path.join(this.queueRoot, name, '_manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = this.manifestReader.read(manifestPath);
        const assets = manifest.assets || {};
        const assetCount = Object.keys(assets).length;
        const indices = new Set(Object.values(assets).map(a => a.index)).size;
        circles.push({ name, target: manifest.target || '', assetCount, indexCount: indices });
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

    // 1. Collect all docIds from manifests (manifest declares what assets exist)
    const allDocIds = new Set<string>();
    if (fs.existsSync(this.queueRoot)) {
      const circleDirs = fs.readdirSync(this.queueRoot).filter(d => /_circle\d+$/.test(d));
      for (const circleDir of circleDirs) {
        const manifestPath = path.join(this.queueRoot, circleDir, '_manifest.json');
        if (fs.existsSync(manifestPath)) {
          const manifest = this.manifestReader.read(manifestPath);
          const assetsMap = manifest.assets || {};
          for (const id of Object.keys(assetsMap)) {
            allDocIds.add(id);
          }
        }
      }
    }

    // 2. Build output index: for each docId, find outputs across all circles
    //    docId is the source of truth — output files are matched by docId prefix
    const outputIndex: Record<string, DocumentOutput[]> = {};
    if (fs.existsSync(this.queueRoot)) {
      const circleDirs = fs.readdirSync(this.queueRoot).filter(d => /_circle\d+$/.test(d));
      for (const circleDir of circleDirs) {
        const circlePath = path.join(this.queueRoot, circleDir);
        for (const docId of allDocIds) {
          const outputs = scanOutputsRecursive(circlePath, circleDir, docId);
          if (outputs.length > 0) {
            if (!outputIndex[docId]) outputIndex[docId] = [];
            outputIndex[docId].push(...outputs);
          }
        }
      }
    }

    // 3. Scan documents — category/status from document frontmatter (single source of truth)
    if (fs.existsSync(this.targetDir)) {
      const rootFiles = fs.readdirSync(this.targetDir).filter(f => f.endsWith('.md'));
      for (const file of rootFiles) {
        const docId = file.replace(/^@/, '').replace(/\.md$/, '');
        const docPath = path.join(this.targetDir, file);
        const fm = readDocFrontmatter(docPath);
        docs.push({
          docId,
          docPath,
          circle: 'root',
          category: fm.category,
          status: fm.status,
          outputs: outputIndex[docId] || [],
        });
      }
    }

    // 4. Scan subdirectories
    const subdirs = fs.readdirSync(this.targetDir, { withFileTypes: true });
    for (const subdir of subdirs) {
      if (!subdir.isDirectory()) continue;
      if (!sanitizePathComponent(subdir.name)) continue;

      const dirPath = path.join(this.targetDir, subdir.name);
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const docId = file.replace(/^@/, '').replace(/\.md$/, '');
        const docPath = path.join(dirPath, file);
        const fm = readDocFrontmatter(docPath);

        docs.push({
          docId,
          docPath,
          circle: subdir.name,
          category: fm.category,
          status: fm.status,
          outputs: outputIndex[docId] || [],
        });
      }
    }

    return docs;
  }

  findDocument(circle: string, docId: string): DocumentInfo | null {
    const dirPath = path.join(this.targetDir, circle);
    const prefixes = ['@', ''];

    let docPath: string | undefined;
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

    const fm = readDocFrontmatter(docPath);

    // Collect outputs from all circles (recursive scan)
    const outputs: DocumentOutput[] = [];
    if (fs.existsSync(this.queueRoot)) {
      const circleDirs = fs.readdirSync(this.queueRoot).filter(d => /_circle\d+$/.test(d));
      for (const circleDir of circleDirs) {
        const circlePath = path.join(this.queueRoot, circleDir);
        const circleOutputs = scanOutputsRecursive(circlePath, circleDir, docId);
        outputs.push(...circleOutputs);
      }
    }

    const doc: DocumentInfo = { docId, docPath, circle, category: fm.category, status: fm.status, outputs };
    if (fs.existsSync(docPath)) {
      doc.content = fs.readFileSync(docPath, 'utf-8');
    }
    return doc;
  }

  findDocumentById(docId: string): DocumentInfo | null {
    const docs = this.listDocuments();
    const found = docs.find(d => d.docId === docId);
    if (!found) return null;
    if (!found.content && fs.existsSync(found.docPath)) {
      found.content = fs.readFileSync(found.docPath, 'utf-8');
    }
    return found;
  }

  listCircleAssets(circleName: string): CircleAssetsResult {
    const circleDir = path.join(this.queueRoot, circleName);
    const manifestPath = path.join(circleDir, '_manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return { circle: circleName, assets: [] };
    }

    const manifest = this.manifestReader.read(manifestPath);
    const assetsMap: Record<string, ManifestAssetEntry> = manifest.assets || {};

    const enriched = Object.entries(assetsMap).map(([id, info]) => {
      const outputs = scanOutputPathsRecursive(circleDir, id);
      return { id, status: info.status, index: info.index, category: info.category, outputs };
    });

    return { circle: circleName, assets: enriched };
  }
}
