// ============================================================================
// OpsV Dependency Graph
// Circle-centric: builds layers → {basename}_circle{N}/ flat dirs + _manifest.json
// ============================================================================

import fs from 'fs';
import path from 'path';
import { FrontmatterParser } from './FrontmatterParser';
import { ApprovedRefReader } from './ApprovedRefReader';
import { logger } from '../utils/logger';
import { escapeRegex } from '../utils/string';
import { parseRefKey } from './RefSyntaxParser';

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
    refs?: Record<string, Record<string, string[]>>;
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
  targets?: string[];
  generatedAt: string;
  circles: ManifestEntry[];
  assets: Record<string, { status: string; index: number; category: string }>;
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
        for (const typeMap of Object.values(doc.frontmatter.refs)) {
          if (!typeMap || typeof typeMap !== 'object') continue;
          for (const key of Object.keys(typeMap)) {
            const ref = parseRefKey(key);
            // Local Design References are generation inputs, not Circle dependencies.
            if (!ref || ref.kind !== 'external') continue;
            if (ref.id !== doc.id) deps.add(ref.id);
          }
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

    for (const [index, batch] of batches.entries()) {
      circles.push({ name: ORDINALS[index] ?? `circle.${index}`, index, assetIds: batch });
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

  static resolveTargetBasename(dirPaths: string[]): string {
    // If the default three directories are passed, use 'videospec' as basename
    if (
      dirPaths.length === 3 &&
      dirPaths[0] === 'videospec/scenes' &&
      dirPaths[1] === 'videospec/shots' &&
      dirPaths[2] === 'videospec/elements'
    ) {
      return 'videospec';
    }
    // Otherwise use the first directory's basename
    return path.basename(path.resolve(dirPaths[0]));
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

  static checkNameConflict(queueRoot: string, basename: string, dirPaths: string[]): string | null {
    if (!fs.existsSync(queueRoot)) return null;
    const entries = fs.readdirSync(queueRoot);
    const pattern = new RegExp(`^${escapeRegex(basename)}_circle(\\d+)$`);

    const resolvedDirs = dirPaths.map((d) => path.resolve(d));

    for (const e of entries) {
      const m = e.match(pattern);
      if (!m) continue;

      const manifestPath = path.join(queueRoot, e, '_manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const manifestTargets = getManifestTargets(manifest);
        const resolvedManifest = manifestTargets.map((t: string) => path.resolve(t));

        // If any manifest target is not in the current dirs → conflict
        for (const resolved of resolvedManifest) {
          if (!resolvedDirs.includes(resolved)) {
            return `Target name "${basename}" already used by a different directory (${resolved}). Use --name to specify a different name.`;
          }
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
    targetDirs: string[],
    existingAssets?: Record<string, { status: string; index: number; category: string }>
  ): string {
    const circleDirName = `${basename}_circle${circleN}`;
    const circleDir = path.join(queueRoot, circleDirName);

    fs.mkdirSync(circleDir, { recursive: true });

    const assets: Record<string, { status: string; index: number; category: string }> = {};
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

        const c = this.categoryMap.get(id) || existingAsset?.category || '';
        status[id] = s;
        assets[id] = { status: s, index: circle.index, category: c };
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
      target: targetDirs[0],
      targets: targetDirs,
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

  /**
   * Build dependency graph from project directories.
   *
   * Scans each target directory for .md files and resolves dependencies
   * between documents via frontmatter refs.
   *
   * Also pulls in upstream assets (referenced but not approved) from
   * all subdirectories of the project's videospec root.
   */
  static buildFromDir(projectRoot: string, targetDirs: string[]): DependencyGraph {
    const graph = new DependencyGraph();
    const documents: ParsedDocument[] = [];
    const targetAssetIds = new Set<string>();

    const videospecRoot = path.resolve(projectRoot, 'videospec');

    // Scan each target directory for .md files
    for (const rawDir of targetDirs) {
      const resolvedTarget = path.resolve(projectRoot, rawDir);
      if (!fs.existsSync(resolvedTarget) || !fs.statSync(resolvedTarget).isDirectory()) continue;

      const files = fs.readdirSync(resolvedTarget).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(resolvedTarget, file);
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const { frontmatter } = FrontmatterParser.parseRaw(content);
          const id = file.replace(/^@/, '').replace(/\.md$/, '');
          documents.push({ id, filePath, frontmatter });
          targetAssetIds.add(id);
        } catch (e) {
          logger.warn(`Dependency graph skipped ${file}: ${(e as Error).message}`);
        }
      }
    }

    // Resolve upstream dependencies: scan refs to find referenced assets
    const targetRefs = new Set<string>();

    for (const doc of documents) {
      if (doc.frontmatter.refs) {
        for (const typeMap of Object.values(doc.frontmatter.refs)) {
          if (!typeMap || typeof typeMap !== 'object') continue;
          for (const key of Object.keys(typeMap)) {
            if (!key.startsWith('@') || key.startsWith('@:')) continue;
            let cleanId = key.slice(1);
            const colonIdx = cleanId.indexOf(':');
            if (colonIdx > 0) cleanId = cleanId.slice(0, colonIdx);
            if (!targetAssetIds.has(cleanId)) {
              targetRefs.add(cleanId);
            }
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
    return DependencyGraph.buildFromDir(projectRoot, ['videospec']);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Read the target paths from a manifest, supporting backward compatibility.
 * New manifests store `targets: string[]`; old manifests store `target: string`.
 */
function getManifestTargets(manifest: { targets?: string[]; target?: string }): string[] {
  if (Array.isArray(manifest.targets)) return manifest.targets;
  if (manifest.target) return [manifest.target];
  return [];
}
