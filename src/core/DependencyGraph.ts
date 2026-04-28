// ============================================================================
// OpsV v0.8.2 Dependency Graph
// Circle-centric: builds layers → {basename}.circle{N}/ flat dirs + _manifest.json
// ============================================================================

import fs from 'fs';
import path from 'path';
import { FrontmatterParser } from './FrontmatterParser';
import { ApprovedRefReader } from './ApprovedRefReader';
import { logger } from '../utils/logger';

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
  layer: number;
  assetIds: string[];
}

export interface ManifestEntry {
  circle: string;
  layer: number;
  assetIds: string[];
  status: Record<string, string>;
}

export interface Manifest {
  version: string;
  target: string;
  generatedAt: string;
  circles: ManifestEntry[];
  assets: Record<string, { status: string; layer: number }>;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class DependencyGraph {
  private graph: Map<string, Set<string>> = new Map();
  private statusMap: Map<string, string> = new Map();

  build(documents: ParsedDocument[]): void {
    this.graph.clear();
    this.statusMap.clear();

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
        cycles.push(...remaining.keys());
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

  getCircles(): CircleDefinition[] {
    const { batches } = this.topologicalSort();
    const circles: CircleDefinition[] = [];

    for (const [layerIdx, batch] of batches.entries()) {
      const layer = layerIdx + 1;
      let name: string;

      if (layer === 1) {
        name = 'zerocircle';
      } else if (layerIdx === batches.length - 1 && batches.length > 2) {
        name = 'endcircle';
      } else if (layerIdx === batches.length - 1 && batches.length === 2) {
        name = 'firstcircle';
      } else if (batches.length === 1) {
        name = 'zerocircle';
      } else {
        name = `circle${layer - 1}`;
      }

      circles.push({ name, layer, assetIds: batch });
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

  // --- v0.8.2: flat .circleN directory + merged _manifest.json ---

  static resolveTargetBasename(dirPath: string): string {
    return path.basename(path.resolve(dirPath));
  }

  static detectCircleN(queueRoot: string, basename: string): number {
    if (!fs.existsSync(queueRoot)) return 1;
    const entries = fs.readdirSync(queueRoot);
    const pattern = new RegExp(`^${escapeRegex(basename)}\\.circle(\\d+)$`);
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
    const pattern = new RegExp(`^${escapeRegex(basename)}\\.circle(\\d+)$`);
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
    const pattern = new RegExp(`^${escapeRegex(basename)}\\.circle(\\d+)$`);

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
      } catch {
        // Skip unreadable manifests
      }
    }

    return null;
  }

  writeCircleDir(
    queueRoot: string,
    basename: string,
    circleN: number,
    circles: CircleDefinition[],
    targetDir: string
  ): string {
    const circleDirName = `${basename}.circle${circleN}`;
    const circleDir = path.join(queueRoot, circleDirName);

    if (!fs.existsSync(circleDir)) {
      fs.mkdirSync(circleDir, { recursive: true });
    }

    const assets: Record<string, { status: string; layer: number }> = {};
    const circlesData: ManifestEntry[] = [];

    for (const circle of circles) {
      const status: Record<string, string> = {};
      for (const id of circle.assetIds) {
        const s = this.statusMap.get(id) || 'drafting';
        status[id] = s;
        assets[id] = { status: s, layer: circle.layer };
      }

      circlesData.push({
        circle: circle.name,
        layer: circle.layer,
        assetIds: circle.assetIds,
        status,
      });
    }

    const manifest: Manifest = {
      version: '0.8.2',
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

  // Deprecated: kept for transition, no longer used by commands
  writeCircleAssets(_queueRoot: string, _circles: CircleDefinition[]): void {
    throw new Error('writeCircleAssets is deprecated in v0.8.2. Use writeCircleDir() instead.');
  }

  // Deprecated: kept for transition, no longer used by commands
  writeManifest(_queueRoot: string, _circles: CircleDefinition[]): void {
    throw new Error('writeManifest is deprecated in v0.8.2. Use writeCircleDir() instead.');
  }

  private getAssetStatus(id: string): string {
    return this.statusMap.get(id) || 'drafting';
  }

  static buildFromDir(projectRoot: string, targetDir: string): DependencyGraph {
    const graph = new DependencyGraph();
    const documents: ParsedDocument[] = [];

    const resolvedTarget = path.resolve(projectRoot, targetDir);

    if (!fs.existsSync(resolvedTarget)) {
      logger.warn(`Target directory not found: ${resolvedTarget}`);
      graph.build(documents);
      return graph;
    }

    // Scan target directory for .md files
    if (fs.statSync(resolvedTarget).isDirectory()) {
      const files = fs.readdirSync(resolvedTarget).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(resolvedTarget, file);
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

    // Resolve upstream dependencies: scan elements/ and scenes/ for referenced assets
    const upstreamDirs = ['elements', 'scenes'];
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
    if (targetRefs.size > 0) {
      for (const dir of upstreamDirs) {
        const dirPath = path.join(projectRoot, 'videospec', dir);
        if (!fs.existsSync(dirPath)) continue;

        const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));
        for (const file of files) {
          const id = file.replace(/^@/, '').replace(/\.md$/, '');
          if (!targetRefs.has(id) || targetAssetIds.has(id)) continue;

          const filePath = path.join(dirPath, file);
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const { frontmatter } = FrontmatterParser.parseRaw(content);
            // Only pull upstream if not approved
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

    graph.build(documents);
    return graph;
  }

  static buildFromProject(projectRoot: string): DependencyGraph {
    return DependencyGraph.buildFromDir(projectRoot, 'videospec');
  }
}
