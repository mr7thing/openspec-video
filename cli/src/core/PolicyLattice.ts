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
 * Merge defaults ← pack ← project, taking the stricter value per action.
 * A project value looser than the pack value does NOT apply; it produces a
 * PROJECT_POLICY_LOOSENS_PACK issue instead (config defect, fail closed).
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
    const layers = [defaults[action], packPolicy?.[action], projectPolicy?.[action]]
      .filter((v): v is string => typeof v === 'string')
      .filter(isPolicyLevel);
    effective[action] = layers.length ? layers.reduce(stricter) : POLICY_DEFAULTS[action];
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
    const packValue = packPolicy?.[key as PolicyAction];
    if (isPolicyLevel(value) && isPolicyLevel(packValue) && RANK[value] < RANK[packValue]) {
      issues.push({
        code: 'PROJECT_POLICY_LOOSENS_PACK',
        severity: 'error',
        message: `Project policy "${key}: ${value}" would loosen Pack policy "${key}: ${packValue}"; effective value stays "${packValue}". Remove or tighten the project override.`,
        action: key,
        pack: packValue,
        project: value,
        effective: packValue,
      });
    }
  }

  return { effective, issues };
}
