// ============================================================================
// PolicyLattice — the single owner of policy level ranking and merge
// semantics. Projects may only TIGHTEN pack policy, never loosen it (F7).
// `delete: never` is a Core invariant at every layer.
// ============================================================================

import { PolicyLevel } from '../types/PackSchemas';

export const POLICY_LEVELS = ['auto', 'ask', 'human'] as const;

export type PolicyAction = 'draft' | 'compile' | 'execute' | 'approve' | 'sync' | 'delete';
export type PolicyMap = Partial<Record<PolicyAction, string | null | undefined>>;

export const POLICY_DEFAULTS: Record<PolicyAction, string> = {
  draft: 'auto',
  compile: 'auto',
  execute: 'ask',
  approve: 'human',
  sync: 'auto',
  delete: 'never',
};

const RANK: Record<PolicyLevel, number> = { auto: 0, ask: 1, human: 2 };

export function rank(level: PolicyLevel): number {
  return RANK[level];
}

export function stricter(a: PolicyLevel, b: PolicyLevel): PolicyLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

export interface PolicyIssue {
  code: 'PROJECT_POLICY_LOOSENS_PACK' | 'PROJECT_POLICY_UNKNOWN_KEY';
  severity: 'error' | 'warning';
  message: string;
  action?: string;
  pack?: string;
  project?: string;
  effective?: string;
}

export interface PolicyMergeResult {
  effective: Record<string, string>;
  issues: PolicyIssue[];
}

function isPolicyLevel(value: unknown): value is PolicyLevel {
  return value === 'auto' || value === 'ask' || value === 'human';
}

/**
 * The effective floor for an action *without* a project override: the stricter
 * of defaults and the pack value, falling back to the built-in safety default
 * only when neither declares the action. The pack is trusted and may go looser
 * than the default; the project may never go below this floor.
 */
function packFloor(defaults: PolicyMap, packPolicy: PolicyMap | undefined, action: PolicyAction): PolicyLevel {
  const layers = [defaults[action], packPolicy?.[action]]
    .filter((v): v is string => typeof v === 'string')
    .filter(isPolicyLevel);
  return (layers.length ? layers.reduce(stricter) : POLICY_DEFAULTS[action]) as PolicyLevel;
}

/**
 * Merge defaults ← pack ← project, taking the stricter value per action.
 * The pack is trusted content: it may declare values looser than the built-in
 * safety default (POLICY_DEFAULTS only serves as the fallback when the pack
 * does not declare an action). A project value looser than the effective
 * floor does NOT apply; it produces a PROJECT_POLICY_LOOSENS_PACK issue
 * instead (config defect, fail closed).
 */
export function mergePolicies(
  defaults: PolicyMap,
  packPolicy: PolicyMap | undefined,
  projectPolicy: PolicyMap | undefined,
): PolicyMergeResult {
  const effective: Record<string, string> = {};
  const issues: PolicyIssue[] = [];
  const actions = new Set<PolicyAction>([...Object.keys(POLICY_DEFAULTS)] as PolicyAction[]);
  for (const key of Object.keys(defaults)) actions.add(key as PolicyAction);

  for (const action of actions) {
    if (action === 'delete') {
      effective.delete = 'never'; // Core invariant; schema validation rejects other values upstream.
      continue;
    }
    // Pack is trusted content: the pack-side floor is the stricter of defaults
    // and the pack's own value, falling back to the built-in safety default
    // only when the pack does not declare the action. The project may only
    // TIGHTEN that floor (F7); if it tries to loosen below it, the floor holds.
    const floor = packFloor(defaults, packPolicy, action);
    const projectValue = projectPolicy?.[action];
    effective[action] = (projectValue != null && isPolicyLevel(projectValue))
      ? stricter(floor, projectValue)
      : floor;
  }

  for (const [key, value] of Object.entries(projectPolicy || {})) {
    if (!(key in POLICY_DEFAULTS)) {
      issues.push({
        code: 'PROJECT_POLICY_UNKNOWN_KEY',
        severity: 'warning',
        message: `Unknown project policy action "${key}" is ignored`,
        action: key,
      });
      continue;
    }
    if (key === 'delete' || value == null) continue;
    if (!isPolicyLevel(value)) continue;
    // The floor is what the action resolves to without the project override —
    // the stricter of defaults and the pack value, falling back to the built-in
    // safety default when the pack does not declare it. A project may never
    // loosen below it; if it tries, the floor holds.
    const floor = packFloor(defaults, packPolicy, key as PolicyAction);
    if (RANK[value] < RANK[floor]) {
      issues.push({
        code: 'PROJECT_POLICY_LOOSENS_PACK',
        severity: 'error',
        message: `Project policy "${key}: ${value}" would loosen below the effective floor "${key}: ${floor}"; effective value stays "${floor}". Remove or tighten the project override.`,
        action: key,
        pack: floor,
        project: value,
        effective: floor,
      });
    }
  }

  return { effective, issues };
}
