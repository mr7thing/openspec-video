// ============================================================================
// OpsV v0.8 Dependency Graph
// Circle-centric: builds layers → circle directories + _assets.json + _manifest.json
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
    type?: string;
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
  generatedAt: string;
  circles: ManifestEntry[];
}

export class DependencyGraph {
  private graph: Map<string, Set<string>> = new Map();

  build(documents: ParsedDocument[]): void {
    this.graph.clear();

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

  writeCircleAssets(queueRoot: string, circles: CircleDefinition[]): void {
    const videospecDir = path.join(queueRoot, 'videospec');
    if (!fs.existsSync(videospecDir)) {
      fs.mkdirSync(videospecDir, { recursive: true });
    }

    for (const circle of circles) {
      const circleDir = path.join(videospecDir, circle.name);
      if (!fs.existsSync(circleDir)) {
        fs.mkdirSync(circleDir, { recursive: true });
      }

      const assetsJson = {
        circle: circle.name,
        layer: circle.layer,
        assets: circle.assetIds.map((id) => ({
          id,
          status: this.getAssetStatus(id),
        })),
      };

      fs.writeFileSync(
        path.join(circleDir, '_assets.json'),
        JSON.stringify(assetsJson, null, 2)
      );
    }
  }

  writeManifest(queueRoot: string, circles: CircleDefinition[]): void {
    const manifest: Manifest = {
      version: '0.8.0',
      generatedAt: new Date().toISOString(),
      circles: circles.map((c) => ({
        circle: c.name,
        layer: c.layer,
        assetIds: c.assetIds,
        status: Object.fromEntries(
          c.assetIds.map((id) => [id, this.getAssetStatus(id)])
        ),
      })),
    };

    const videospecDir = path.join(queueRoot, 'videospec');
    if (!fs.existsSync(videospecDir)) {
      fs.mkdirSync(videospecDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(videospecDir, '_manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
  }

  private getAssetStatus(id: string): string {
    const deps = this.graph.get(id);
    if (!deps || deps.size === 0) return 'draft';
    return 'drafting';
  }

  static buildFromProject(projectRoot: string): DependencyGraph {
    const graph = new DependencyGraph();
    const documents: ParsedDocument[] = [];
    const dirs = ['elements', 'scenes'];

    for (const dir of dirs) {
      const standardPath = path.join(projectRoot, 'videospec', dir);
      const dirPath = fs.existsSync(standardPath) ? standardPath : null;
      if (!dirPath || !fs.existsSync(dirPath)) continue;

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

    graph.build(documents);
    return graph;
  }
}
