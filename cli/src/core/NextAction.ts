// ============================================================================
// NextAction — the structured, versioned "what happens next" contract.
// Source of truth for Work Packet consumers (CLI renderer, future Hook
// adapters, AgentRouter). The rendered shell command is a derived display
// only; never parse it for routing decisions.
// ============================================================================

export const WORK_PACKET_CONTRACT_VERSION = 2;

export type NextAction =
  | { kind: 'draft'; asset: string; skill: string }
  | { kind: 'materialize'; asset: string; profile: string; dryRunSupported: true }
  | { kind: 'circle'; asset: string; sourceDir: string }
  | { kind: 'compile'; asset: string; manifest: string }
  | { kind: 'sync'; asset: string }
  | { kind: 'blocked'; issueCodes: string[] };

export interface NextActionIssue {
  code: string;
  message: string;
}

export interface NextActionContext {
  asset: string;
  status: string;
  profileKind: 'workflow' | 'production';
  profileName: string;
  profileHasMaterialize: boolean;
  /** Export key the Profile points at (or the profile name fallback). */
  skillName: string;
  /** Raw `action` from the Skill manifest, when the manifest was found. */
  skillAction?: string;
  /** False when the Profile's Skill is not exported or its file is missing. */
  skillFound: boolean;
  /** Absolute manifest paths of circles containing this asset. */
  circleManifests: string[];
  /** Project-root-relative directory of the asset document (for circle creation). */
  sourceDirRelative: string;
  /** Project-root-relative manifest paths (forward slashes) for compile actions. */
  circleManifestsRelative: string[];
  /** Issue codes already collected on the packet. */
  issueCodes: string[];
}

export interface NextActionResult {
  action?: NextAction;
  issues: NextActionIssue[];
}

/**
 * Derive the single next action. Evaluation order:
 *   sync (status) → workflow skill presence → circle ambiguity → existing issues →
 *   workflow (skill action is source of truth) → production (circle/compile).
 */
export function buildNextAction(ctx: NextActionContext): NextActionResult {
  if (ctx.status === 'syncing') {
    return { action: { kind: 'sync', asset: ctx.asset }, issues: [] };
  }

  const issues: NextActionIssue[] = [];
  // Skill/gates are load-bearing only for workflow profiles, where the skill
  // action is the source of truth for the next step. Production next-actions
  // derive from circle manifests alone, so a missing (optional) skill must not
  // block the production circle/compile path.
  if (ctx.profileKind === 'workflow' && !ctx.skillFound) {
    issues.push({
      code: 'PACK_PROFILE_SKILL_MISSING',
      message: `Profile "${ctx.profileName}" Skill "${ctx.skillName}" is not exported or its manifest is missing; refusing to continue with empty gates`,
    });
  }
  if (ctx.circleManifests.length > 1) {
    const listing = ctx.circleManifestsRelative.join(', ');
    issues.push({
      code: 'CIRCLE_AMBIGUOUS',
      message: `Asset "${ctx.asset}" appears in multiple Circles: ${listing}. Resolve to a single Circle before compiling.`,
    });
  }

  const issueCodes = [...ctx.issueCodes, ...issues.map(i => i.code)];
  if (issueCodes.length > 0) {
    return { action: { kind: 'blocked', issueCodes }, issues };
  }

  if (ctx.profileKind === 'workflow') {
    if (ctx.skillAction === 'draft') {
      return { action: { kind: 'draft', asset: ctx.asset, skill: ctx.skillName }, issues };
    }
    if (ctx.skillAction === 'materialize' && ctx.profileHasMaterialize) {
      return { action: { kind: 'materialize', asset: ctx.asset, profile: ctx.profileName, dryRunSupported: true }, issues };
    }
    const reason = ctx.skillAction === 'materialize'
      ? `Profile "${ctx.profileName}" does not declare materialize rules`
      : `Skill "${ctx.skillName}" action "${ctx.skillAction ?? '(missing)'}" is not supported for a workflow Profile`;
    issues.push({ code: 'SKILL_ACTION_UNSUPPORTED', message: reason });
    return { action: { kind: 'blocked', issueCodes: ['SKILL_ACTION_UNSUPPORTED'] }, issues };
  }

  // production
  if (ctx.circleManifests.length === 0) {
    return { action: { kind: 'circle', asset: ctx.asset, sourceDir: ctx.sourceDirRelative }, issues };
  }
  return { action: { kind: 'compile', asset: ctx.asset, manifest: ctx.circleManifestsRelative[0] }, issues };
}

/** Derived display string. Returns undefined for actions with no CLI form. */
export function renderNextActionCommand(action: NextAction | undefined): string | undefined {
  if (!action) return undefined;
  switch (action.kind) {
    case 'materialize': return `opsv materialize ${action.asset}`;
    case 'circle': return `opsv circle create --dir ${action.sourceDir}`;
    case 'compile': return `opsv produce --manifest ${action.manifest} --file ${action.asset}`;
    case 'sync': return `opsv sync ${action.asset}`;
    case 'draft':
    case 'blocked': return undefined;
  }
}
