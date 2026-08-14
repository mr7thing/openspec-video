// ============================================================================
// Transition Store — append-only Transition Log for the Asset State Machine
//
// Layout:
//   .opsv/state/<assetId>.jsonl      (git-trackable — the durable log)
//   .opsv/runtime/state/<assetId>.lock  (git-ignored — advisory lock)
//
// Reuses the execution lock primitive; no third concurrency mechanism.
// The log is the artifact-side truth: only recorded transitions are legal.
// Spec: .trellis/spec/canonical-model/asset-state-machine.md
// ============================================================================

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { AssetStateEnum, AssetState } from '../schema';
import { assertValidTransition, reachablePath } from './AssetStateMachine';
import { withLock } from '../../core/execution/lock';
import { ValidationError, OpsVErrorCode } from '../../errors/OpsVError';

/** Q3: generation lineage attached to a transition (provider/model/seed/parents). */
export const TransitionProvenanceSchema = z.object({
  provider: z.string().optional(),
  model: z.string().optional(),
  seed: z.number().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  parentAssets: z.array(z.string()).optional(),
});
export type TransitionProvenance = z.infer<typeof TransitionProvenanceSchema>;

export const AssetTransitionSchema = z.object({
  asset: z.string().min(1),
  artifact: z.string().optional(),
  from: AssetStateEnum,
  to: AssetStateEnum,
  actor: z.object({ type: z.enum(['human', 'agent', 'system']), id: z.string() }),
  reason: z.string().optional(),
  review: z.string().optional(),
  timestamp: z.string(),
  /** Q3: full lineage — provider/model/seed/parameters/parent assets. Optional, backward compatible. */
  provenance: TransitionProvenanceSchema.optional(),
});
export type AssetTransition = z.infer<typeof AssetTransitionSchema>;

const ASSET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function assertValidAssetId(asset: string): void {
  if (!ASSET_ID_PATTERN.test(asset)) {
    throw new ValidationError(
      OpsVErrorCode.VALIDATION_TYPE_ERROR,
      `Invalid asset id '${asset}' for transition log (allowed: [A-Za-z0-9._-], 1-128 chars)`,
      { asset },
    );
  }
}

export function stateDir(projectRoot: string): string {
  return path.join(projectRoot, '.opsv', 'state');
}

export function stateLogPath(projectRoot: string, assetId: string): string {
  return path.join(stateDir(projectRoot), `${assetId}.jsonl`);
}

export function stateLockPath(projectRoot: string, assetId: string): string {
  return path.join(projectRoot, '.opsv', 'runtime', 'state', `${assetId}.lock`);
}

/**
 * Append a transition to the log. Validates schema, asset id, and the
 * state-transition matrix (fail-closed) before anything is written.
 * Append-only: existing entries are never edited or removed.
 */
export async function appendTransition(
  projectRoot: string,
  transition: AssetTransition,
): Promise<AssetTransition> {
  const parsed = AssetTransitionSchema.safeParse(transition);
  if (!parsed.success) {
    throw new ValidationError(
      OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH,
      `Invalid asset transition: ${parsed.error.message}`,
      { issues: parsed.error.issues },
    );
  }
  const valid = parsed.data;
  assertValidAssetId(valid.asset);
  assertValidTransition(valid.from, valid.to);

  const logPath = stateLogPath(projectRoot, valid.asset);
  await withLock(stateLockPath(projectRoot, valid.asset), async () => {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    await dropTornTail(logPath);
    await fsp.appendFile(logPath, JSON.stringify(valid) + '\n', 'utf-8');
  });
  return valid;
}

/** Read every recorded transition for an asset, in append order. */
export async function readTransitions(
  projectRoot: string,
  assetId: string,
): Promise<AssetTransition[]> {
  assertValidAssetId(assetId);
  const logPath = stateLogPath(projectRoot, assetId);
  if (!fs.existsSync(logPath)) return [];
  const raw = await fsp.readFile(logPath, 'utf-8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parsed = AssetTransitionSchema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        // Corruption of a recorded fact must not be silently ignored.
        throw new ValidationError(
          OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH,
          `Corrupt transition log entry in ${logPath}: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    });
}

/**
 * Pure projection of a transition list into the current state.
 * No transitions → `draft` (the implicit initial state of a new artifact).
 */
export function projectState(transitions: readonly AssetTransition[]): AssetTransition['to'] {
  const last = transitions[transitions.length - 1];
  return last ? last.to : 'draft';
}

/** Convenience: read + project the current asset state. */
export async function currentState(
  projectRoot: string,
  assetId: string,
): Promise<{ state: AssetTransition['to']; transitions: AssetTransition[] }> {
  const transitions = await readTransitions(projectRoot, assetId);
  return { state: projectState(transitions), transitions };
}

/**
 * Synchronous variant for hot paths that cannot await (e.g. buildWorkPacket).
 * Torn tails are skipped (a crash mid-append leaves a partial final line).
 * Missing log → `draft` with no transitions.
 */
export function currentStateSync(
  projectRoot: string,
  assetId: string,
): { state: AssetTransition['to']; transitions: AssetTransition[] } {
  assertValidAssetId(assetId);
  const logPath = stateLogPath(projectRoot, assetId);
  let raw = '';
  try {
    raw = fs.readFileSync(logPath, 'utf-8');
  } catch {
    return { state: 'draft', transitions: [] };
  }
  const transitions: AssetTransition[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = AssetTransitionSchema.parse(JSON.parse(line));
      transitions.push(parsed);
    } catch {
      // Torn tail or corrupt line during a read-only projection — skip.
      continue;
    }
  }
  return { state: projectState(transitions), transitions };
}

export type TransitionBase = Omit<AssetTransition, 'from' | 'to'>;

/**
 * Advance an asset to `target` along the shortest legal path from its current
 * state, appending every intermediate edge. Returns the appended transitions.
 *
 * Used to normalize legacy approvals into the state machine: an artifact with
 * no prior log starts at `draft` and is walked through candidate → review →
 * approved in one call. Throws `E1005` when `target` is unreachable.
 */
export async function transitionToState(
  projectRoot: string,
  base: TransitionBase,
  target: AssetState,
): Promise<AssetTransition[]> {
  const { state: current } = await currentState(projectRoot, base.asset);
  if (current === target) return [];

  const path = reachablePath(current, target);
  if (!path) {
    throw new ValidationError(
      OpsVErrorCode.ASSET_STATE_INVALID_TRANSITION,
      `No legal state path from ${current} to ${target} for asset ${base.asset}`,
      { assetState: { from: current, to: target } },
    );
  }

  const appended: AssetTransition[] = [];
  let from: AssetState = current;
  for (const to of path) {
    appended.push(await appendTransition(projectRoot, { ...base, from, to }));
    from = to;
  }
  return appended;
}

/** Drop a torn tail (a final line without a newline) left by a crash mid-append. */
async function dropTornTail(jsonl: string): Promise<void> {
  if (!fs.existsSync(jsonl)) return;
  const content = await fsp.readFile(jsonl, 'utf-8');
  if (content.length === 0) return;
  if (!content.endsWith('\n')) {
    const lastNewline = content.lastIndexOf('\n');
    await fsp.writeFile(jsonl, lastNewline >= 0 ? content.slice(0, lastNewline + 1) : '', 'utf-8');
  }
}
