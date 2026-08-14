// ============================================================================
// Typed Dependency Graph + Impact Analysis (Q1)
//
// Upgrades the reference DAG from "@ref grouped by input type" to a typed
// dependency graph whose edges carry a semantic role (visual/environment/
// cinematography/audio/temporal). `impactOf` computes the transitive set of
// assets affected by changing one asset — the core of `opsv build` (Q2).
//
// Analysis: 项目意义与改进建议.md §8 / §18 P0. Pure projection, read-only.
// ============================================================================

import fs from 'node:fs';
import { buildAssetDocIndex } from '../../core/AssetDocIndex';
import { FrontmatterParser } from '../../core/FrontmatterParser';
import { getProjectDir } from '../../utils/configLoader';
import { fromRefsMap } from '../schema/convert';

export type DependencyType =
  | 'visual'
  | 'environment'
  | 'cinematography'
  | 'audio'
  | 'temporal'
  | 'dependency';

export interface ImpactNode {
  id: string;
  category: string;
  filePath: string;
}

export interface ImpactEdge {
  /** Consumer asset id — depends on `to`. */
  from: string;
  /** Dependency asset id — the thing being depended on. */
  to: string;
  /** Semantic role of the dependency, classified from the target category. */
  depType: DependencyType;
}

export interface ImpactGraph {
  nodes: Map<string, ImpactNode>;
  edges: ImpactEdge[];
}

const CATEGORY_KEYWORDS: Array<[RegExp, DependencyType]> = [
  [/character/i, 'visual'],
  [/scene/i, 'environment'],
  [/camera/i, 'cinematography'],
  [/audio|music|voice|sound/i, 'audio'],
  [/shot|clip|segment|timeline/i, 'temporal'],
];

/** Classify an asset category into a semantic dependency type. */
export function classifyDependencyType(category: string): DependencyType {
  for (const [re, type] of CATEGORY_KEYWORDS) {
    if (re.test(category)) return type;
  }
  return 'dependency';
}

/**
 * Build the typed dependency graph for a project.
 * Nodes come from the asset index; edges derive from external `@ref` targets,
 * with the edge type classified from the dependency's own category.
 * Pure projection — never writes files.
 */
export function buildImpactGraph(projectRoot: string): ImpactGraph {
  const videospec = getProjectDir(projectRoot, 'videospec');
  const index = buildAssetDocIndex(videospec);
  const nodes = new Map<string, ImpactNode>();
  const categoryById = new Map<string, string>();

  for (const [id, entry] of index.entries) {
    nodes.set(id, { id, category: readCategory(entry.filePath), filePath: entry.filePath });
  }
  for (const [id, node] of nodes) categoryById.set(id, node.category);

  const edges: ImpactEdge[] = [];
  for (const [consumerId, node] of nodes) {
    const { frontmatter } = FrontmatterParser.parseRaw(fs.readFileSync(node.filePath, 'utf-8'));
    const { external } = fromRefsMap(frontmatter.refs as never);
    for (const ref of external) {
      const targetCategory = categoryById.get(ref.id);
      if (!targetCategory) continue; // missing target doc — no edge
      edges.push({
        from: consumerId,
        to: ref.id,
        depType: classifyDependencyType(targetCategory),
      });
    }
  }

  return { nodes, edges };
}

/**
 * Transitive set of assets affected by changing `assetId` (reverse BFS over
 * the dependency edges). Each entry carries how that asset depends on the
 * changed one.
 */
export function impactOf(
  graph: ImpactGraph,
  assetId: string,
): Array<{ asset: string; category: string; depType: DependencyType }> {
  if (!graph.nodes.has(assetId)) return [];

  // dependents[dep] = consumers that depend on dep.
  const dependents = new Map<string, Map<string, DependencyType>>();
  for (const edge of graph.edges) {
    if (!dependents.has(edge.to)) dependents.set(edge.to, new Map());
    dependents.get(edge.to)!.set(edge.from, edge.depType);
  }

  const visited = new Set<string>();
  const queue: string[] = [assetId];
  const affected: Array<{ asset: string; category: string; depType: DependencyType }> = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const direct = dependents.get(current);
    if (!direct) continue;
    for (const [consumer, depType] of direct) {
      if (visited.has(consumer)) continue;
      visited.add(consumer);
      const node = graph.nodes.get(consumer);
      affected.push({
        asset: consumer,
        category: node?.category ?? '',
        depType,
      });
      queue.push(consumer);
    }
  }
  return affected;
}

function readCategory(filePath: string): string {
  try {
    const { frontmatter } = FrontmatterParser.parseRaw(fs.readFileSync(filePath, 'utf-8'));
    return String(frontmatter.category ?? '');
  } catch {
    return '';
  }
}
