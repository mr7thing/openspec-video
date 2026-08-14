// ============================================================================
// Build Plan — testable core of `opsv build`
//
// Computes the incremental rebuild plan: given a changed asset, the transitive
// affected set with semantic dependency types, classified as production (in a
// circle manifest) vs workflow. Analysis: 项目意义与改进建议.md §7 / §18 P2.
// ============================================================================

import fs from 'node:fs';
import { buildImpactGraph, impactOf, DependencyType } from './ImpactGraph';

export type BuildKind = 'production' | 'workflow' | 'unknown';

export interface BuildAffected {
  asset: string;
  category: string;
  depType: DependencyType;
  kind: BuildKind;
}

export interface BuildPlan {
  changed: string;
  affected: BuildAffected[];
  /** True when the classification had no manifest to consult. */
  unclassified: boolean;
}

function kindOf(manifestPath: string | null, asset: string): BuildKind {
  if (!manifestPath) return 'unknown';
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest.assets?.[asset] ? 'production' : 'workflow';
  } catch {
    return 'unknown';
  }
}

/**
 * Compute the incremental build plan for a changed asset.
 *
 * @param manifestPath optional circle `_manifest.json` used to classify
 *   affected assets as production (compilable) vs workflow.
 */
export function computeBuildPlan(
  projectRoot: string,
  changed: string,
  manifestPath: string | null = null,
): BuildPlan {
  const graph = buildImpactGraph(projectRoot);
  const affected = impactOf(graph, changed).map((a) => ({
    asset: a.asset,
    category: a.category,
    depType: a.depType,
    kind: kindOf(manifestPath, a.asset),
  }));
  return { changed, affected, unclassified: manifestPath === null };
}
