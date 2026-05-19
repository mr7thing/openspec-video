// ============================================================================
// OpsV Dependency Graph
// Circle-centric: builds layers → {basename}_circle{N}/ flat dirs + _manifest.json
// ============================================================================

import fs from 'fs';
import path from 'path';
import { FrontmatterParser } from './FrontmatterParser';
import { ApprovedRefReader } from './ApprovedRefReader';
import { logger } from '../utils/logger';
import { getProjectDir } from '../utils/configLoader';
import { escapeRegex } from '../utils/string';

// Read version from package.json
const pkgPath = path.join(__dirname, '../../package.json');
let pkg: { version: string };
try {
  pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : { version: '0.9.0' };
} catch {
  pkg = { version: '0.9.0' };
}
const MANIFEST_VERSION = pkg.version;

export interface ParsedDocument {
  id: string;
  filePath: string;
  frontmatter: {
    category?: string;
    refs?: string[];
    status?: string;
  };
}

export interface DependencyAnalysis {
  batches: string[][];
  cycles: string[];
}

export interface CircleDefinition {
  name: string;
  index: number;
  assetIds: string[];
}

export interface ManifestEntry {
  circle: string;
  index: number;
  assetIds: string[];
  status: Record<string, string>;
}

export interface Manifest {
  version: string;
  target: string;
  generatedAt: string;
  circles: ManifestEntry[];
  assets: Record<string, { status: string; index: number; category?: string }>;
}

const ORDINALS = ['zerocircle', 'firstcircle', 'secondcircle', 'thirdcircle', 'fourthcircle', 'fifthcircle', 'sixthcircle', 'seventhcircle', 'eighthcircle', 'ninthcircle'];

export class DependencyGraph {
  private graph: Map<string, Set<string>> = new Map();
  private statusMap: Map<string, string> = new Map();
  private categoryMap: Map<string, string> = new Map();
  private documents: ParsedDocument[] = [];

  build(documents: ParsedDocument[]): void {
    this.graph.clear();
    this.statusMap.clear();
    this.categoryMap.clear();

    for (const doc of documents) {
      const deps = new Set<string>();

      if (doc.frontmatter.refs) {
        for (const ref of doc.frontmatter.refs) {
          let cleanId = ref.startsWith('@') ? ref.slice(1) : ref;
          const colonIdx = cleanId.indexOf(':');
          if (colonIdx > 0) {
            cleanId = cleanId.slice(0, colonIdx);
          }
          if (cleanId !== doc.id) deps.add(cleanId);
        }
      }

      this.graph.set(doc.id, deps);
      if (doc.frontmatter.status) {
        this.statusMap.set(doc.id, doc.frontmatter.status);
      }
      if (doc.frontmatter.category) {
        this.categoryMap.set(doc.id, doc.frontmatter.category);
      }
    }
  }

  topologicalSort(): DependencyAnalysis {
    const batches: string[][] = [];
    const resolved = new Set<string>();
    const remaining = new Map(this.graph);
    const cycles: string[] = [];

    while (remaining.size > 0) {
      const batch: string[] = [];

      for (const [node, deps] of remaining) {
        const unresolvedDeps = [...deps].filter(
          (d) => remaining.has(d) && !resolved.has(d)
        );
        if (unresolvedDeps.length === 0) {
          batch.push(node);
        }
      }

      if (batch.length === 0) {
        const cycleNodes = this.findCycleNodes(remaining);
        cycles.push(...cycleNodes);
        break;
      }

      for (const node of batch) {
        remaining.delete(node);
        resolved.add(node);
      }
      batches.push(batch);
    }

    return { batches, cycles };
  }

  getCircles(_documents?: ParsedDocument[]): CircleDefinition[] {
    const { batches } = this.topologicalSort();
    const circles: CircleDefinition[] = [];

    const lastBatchHasShotList = (batch: string[]): boolean => batch.includes('shotlist');

    for (const [index, batch] of batches.entries()) {
      const isLastLayer = index === batches.length - 1;
      const hasShotList = lastBatchHasShotList(batch);

      let name: string;
      if (isLastLayer && hasShotList) {
        name = 'end_circle';
      } else {
        name = ORDINALS[index] ?? `circle.${index}`;
      }

      circles.push({ name, index, assetIds: batch });
    }

    return circles;
  }

  async filterExecutable<T extends { id: string }>(
    allJobs: T[],
    approvedRefReader: ApprovedRefReader
  ): Promise<{
    executable: T[];
    blocked: T[];
    reasons: Map<string, string>;
  }> {
    const approved = new Set<string>();
    const executable: T[] = [];
    const blocked: T[] = [];
    const reasons = new Map<string, string>();

    for (const id of this.graph.keys()) {
      if (await approvedRefReader.hasAnyApproved(id)) {
        approved.add(id);
      }
    }

    for (const job of allJobs) {
      const deps = this.graph.get(job.id);
      if (!deps || deps.size === 0) {
        executable.push(job);
        continue;
      }

      const unresolved = [...deps].filter((d) => !approved.has(d));
      if (unresolved.length === 0) {
        executable.push(job);
      } else {
        blocked.push(job);
        reasons.set(job.id, `Blocked by: ${unresolved.join(', ')}`);
      }
    }

    return { executable, blocked, reasons };
  }

  getDependencies(nodeId: string): string[] {
    const deps = this.graph.get(nodeId);
    return deps ? [...deps] : [];
  }

  // --- flat .circleN directory + merged _manifest.json ---

  static resolveTargetBasename(dirPath: string): string {
    return path.basename(path.resolve(dirPath));
  }

  static detectCircleN(queueRoot: string, basename: string): number {
    if (!fs.existsSync(queueRoot)) return 1;
    const entries = fs.readdirSync(queueRoot);
    const pattern = new RegExp(`^${escapeRegex(basename)}_circle(\\d+)$`);
    let maxN = 0;
    for (const e of entries) {
      const m = e.match(pattern);
      if (m) maxN = Math.max(maxN, parseInt(m[1]));
    }
    return maxN + 1;
  }

  static findLatestCircleN(queueRoot: string, basename: string): number {
    if (!fs.existsSync(queueRoot)) return 0;
    const entries = fs.readdirSync(queueRoot);
    const pattern = new RegExp(`^${escapeRegex(basename)}_circle(\\d+)$`);
    let maxN = 0;
    for (const e of entries) {
      const m = e.match(pattern);
      if (m) maxN = Math.max(maxN, parseInt(m[1]));
    }
    return maxN;
  }

  static checkNameConflict(queueRoot: string, basename: string, dirPath: string): string | null {
    if (!fs.existsSync(queueRoot)) return null;
    const entries = fs.readdirSync(queueRoot);
    const pattern = new RegExp(`^${escapeRegex(basename)}_circle(\\d+)$`);

    const resolvedDir = path.resolve(dirPath);

    for (const e of entries) {
      const m = e.match(pattern);
      if (!m) continue;

      const manifestPath = path.join(queueRoot, e, '_manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (manifest.target && path.resolve(manifest.target) !== resolvedDir) {
          return `Target name "${basename}" already used by a different directory (${manifest.target}). Use --name to specify a different name.`;
        }
      } catch (err: any) {
        logger.warn(`Skipped unreadable manifest: ${manifestPath} — ${err.message}`);
      }
    }

    return null;
  }

  writeCircleDir(
    queueRoot: string,
    basename: string,
    circleN: number,
    circles: CircleDefinition[],
    targetDir: string,
    existingAssets?: Record<string, { status: string; index: number; category?: string }>
  ): string {
    const circleDirName = `${basename}_circle${circleN}`;
    const circleDir = path.join(queueRoot, circleDirName);

    fs.mkdirSync(circleDir, { recursive: true });

    const assets: Record<string, { status: string; index: number; category?: string }> = {};
    const circlesData: ManifestEntry[] = [];

    for (const circle of circles) {
      const status: Record<string, string> = {};
      for (const id of circle.assetIds) {
        // Frontmatter status is authoritative; manifest old value is fallback only
        const frontmatterStatus = this.statusMap.get(id);
        const existingAsset = existingAssets?.[id];
        const existingStatus = existingAsset?.status;

        // If frontmatter has a status (not just default 'drafting'), use it
        // Otherwise fallback to existing manifest status
        const s = (frontmatterStatus && frontmatterStatus !== 'drafting')
          ? frontmatterStatus
          : (existingStatus || 'drafting');

        const c = this.categoryMap.get(id) || existingAsset?.category;
        status[id] = s;
        assets[id] = { status: s, index: circle.index, ...(c && { category: c }) };
      }

      circlesData.push({
        circle: circle.name,
        index: circle.index,
        assetIds: circle.assetIds,
        status,
      });
    }

    const manifest: Manifest = {
      version: MANIFEST_VERSION,
      target: targetDir,
      generatedAt: new Date().toISOString(),
      circles: circlesData,
      assets,
    };

    fs.writeFileSync(
      path.join(circleDir, '_manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    return circleDir;
  }

  private getAssetStatus(id: string): string {
    return this.statusMap.get(id) || 'drafting';
  }

  private static readonly DEFAULT_SCAN_SUBDIRS = ['elements', 'scenes', 'shots'];

  /**
   * Build dependency graph from a project directory.
   *
   * Two scan modes:
   * - Default (targetDir='videospec'): Scans elements/, scenes/, shots/ under videospec/ as one graph.
   * - Explicit --dir: Scans that exact directory only, no recursion.
   */
  static buildFromDir(projectRoot: string, targetDir: string): DependencyGraph {
    const graph = new DependencyGraph();
    const documents: ParsedDocument[] = [];

    const resolvedTarget = path.resolve(projectRoot, targetDir);
    const videospecRoot = path.resolve(projectRoot, 'videospec');
    const isDefaultMode = targetDir === 'videospec';

    // Determine which directories to scan
    let scanDirs: string[] = [];

    if (isDefaultMode) {
      // Default: scan elements/, scenes/, shots/ under videospec/
      const videospecExists = fs.existsSync(videospecRoot);
      if (videospecExists) {
        scanDirs = fs.readdirSync(videospecRoot, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .filter((name) => this.DEFAULT_SCAN_SUBDIRS.includes(name))
          .map((name) => path.join(videospecRoot, name));
      }
    } else {
      // Explicit --dir: scan exactly that directory, no recursion
      if (fs.existsSync(resolvedTarget) && fs.statSync(resolvedTarget).isDirectory()) {
        scanDirs = [resolvedTarget];
      }
    }

    // Scan collected directories for .md files
    for (const dirPath of scanDirs) {
      if (!fs.existsSync(dirPath)) continue;
      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const { frontmatter } = FrontmatterParser.parseRaw(content);
          const id = file.replace(/^@/, '').replace(/\.md$/, '');
          documents.push({ id, filePath, frontmatter });
        } catch (e) {
          logger.warn(`Dependency graph skipped ${file}: ${(e as Error).message}`);
        }
      }
    }

    // Resolve upstream dependencies: scan same search roots
    const targetAssetIds = new Set(documents.map((d) => d.id));
    const targetRefs = new Set<string>();

    for (const doc of documents) {
      if (doc.frontmatter.refs) {
        for (const ref of doc.frontmatter.refs) {
          let cleanId = ref.startsWith('@') ? ref.slice(1) : ref;
          const colonIdx = cleanId.indexOf(':');
          if (colonIdx > 0) cleanId = cleanId.slice(0, colonIdx);
          if (!targetAssetIds.has(cleanId)) {
            targetRefs.add(cleanId);
          }
        }
      }
    }

    // Pull in upstream assets that are not yet approved
    // Always search all subdirectories of videospecRoot (elements, scenes, shots, or any custom subdir)
    if (targetRefs.size > 0 && fs.existsSync(videospecRoot)) {
      const entries = fs.readdirSync(videospecRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const dirPath = path.join(videospecRoot, entry.name);
        const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));
        for (const file of files) {
          const id = file.replace(/^@/, '').replace(/\.md$/, '');
          if (!targetRefs.has(id) || targetAssetIds.has(id)) continue;

          const filePath = path.join(dirPath, file);
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const { frontmatter } = FrontmatterParser.parseRaw(content);
            if (frontmatter.status !== 'approved') {
              documents.push({ id, filePath, frontmatter });
              targetAssetIds.add(id);
            }
          } catch (e) {
            logger.warn(`Dependency graph skipped upstream ${file}: ${(e as Error).message}`);
          }
        }
      }
    }

    graph.documents = documents;
    graph.build(documents);
    return graph;
  }

  private findCycleNodes(remaining: Map<string, Set<string>>): string[] {
    const cycleNodes = new Set<string>();
    const visited = new Set<string>();

    const dfs = (node: string, path: string[]) => {
      visited.add(node);
      path.push(node);
      const deps = remaining.get(node) || new Set();
      for (const dep of deps) {
        if (!remaining.has(dep)) continue;
        if (!visited.has(dep)) {
          dfs(dep, path);
        } else if (path.includes(dep)) {
          const idx = path.indexOf(dep);
          for (let i = idx; i < path.length; i++) {
            cycleNodes.add(path[i]);
          }
        }
      }
      path.pop();
    };

    for (const node of remaining.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return [...cycleNodes];
  }

  static buildFromProject(projectRoot: string): DependencyGraph {
    return DependencyGraph.buildFromDir(projectRoot, getProjectDir(projectRoot, 'videospec'));
  }
}