// ============================================================================
// Asset State Machine — the artifact-side lifecycle
//
// Enforces "OPSV controls what becomes an asset": a state change is legal only
// when it matches the transition matrix AND is recorded in the Transition Log.
// Spec: .trellis/spec/canonical-model/asset-state-machine.md
// ============================================================================

import { AssetState, AssetStateEnum } from '../schema';
import { ValidationError, OpsVErrorCode } from '../../errors/OpsVError';

/** The seven asset states (same enum as the canonical schema). */
export const ASSET_STATES = AssetStateEnum.options;

/**
 * Legal transition matrix (v1).
 *
 *   draft      → candidate            (commit accepted)
 *   candidate  → review               (submitted for review)
 *   review     → approved | rejected  (approve / review reject)
 *   rejected   → candidate            (iterate or re-commit)
 *   approved   → superseded | released
 *   released   → (terminal)
 *   superseded → (terminal)
 *
 * Notably illegal: approved → review (must supersede first), any → generating,
 * released/superseded → anything.
 */
export const ASSET_TRANSITIONS: Readonly<Record<AssetState, readonly AssetState[]>> = {
  draft: ['candidate'],
  candidate: ['review'],
  review: ['approved', 'rejected'],
  rejected: ['candidate'],
  approved: ['superseded', 'released'],
  released: [],
  superseded: [],
};

/** True when the from→to edge exists in the transition matrix. Unknown states are false. */
export function isValidTransition(from: AssetState, to: AssetState): boolean {
  return ASSET_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Throw a fail-closed `E1005` when the transition is illegal.
 * Used by the Transition Store before any append.
 */
export function assertValidTransition(from: AssetState, to: AssetState): void {
  if (!isValidTransition(from, to)) {
    throw new ValidationError(
      OpsVErrorCode.ASSET_STATE_INVALID_TRANSITION,
      `Illegal asset state transition: ${from} → ${to}`,
      { assetState: { from, to } },
    );
  }
}

/**
 * Shortest legal path of intermediate states from `from` to `to`
 * (BFS over the transition graph). Returns `[to]` when `from === to`,
 * `null` when unreachable.
 *
 * Used by the approve dual-write to normalize a legacy approval into the
 * state machine (e.g. `draft → candidate → review → approved`).
 */
export function reachablePath(from: AssetState, to: AssetState): AssetState[] | null {
  if (from === to) return [to];
  const queue: AssetState[] = [from];
  const prev = new Map<AssetState, AssetState>([[from, from]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of ASSET_TRANSITIONS[current]) {
      if (prev.has(next)) continue;
      prev.set(next, current);
      if (next === to) {
        // Reconstruct the path from from → to.
        const path: AssetState[] = [];
        let node: AssetState = next;
        while (node !== from) {
          path.unshift(node);
          node = prev.get(node)!;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}
