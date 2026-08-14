// ============================================================================
// Commit Service — the Commit Boundary
//
// External artifact → validate against Artifact Contract → accept (transition
// draft→candidate) or reject (structured errors). Shared by `opsv commit`
// and `opsv import`. Spec: .trellis/spec/canonical-model/artifact-contract.md
// ============================================================================

import path from 'node:path';
import fs from 'node:fs';
import { validateArtifact, ValidationRuleError } from './ArtifactValidator';
import { ArtifactContract, loadArtifactContract } from './ArtifactContract';
import { probeMedia } from './mediaProbe';
import { appendTransition, AssetTransition } from '../state/TransitionStore';
import { AssetState } from '../schema';

export interface CommitInput {
  /** Project root for the `.opsv/state/` transition log. */
  projectRoot: string;
  artifactPath: string;
  /** Artifact type (video/image/audio/composite/...). */
  type: string;
  /** Task id this artifact was produced for. */
  task?: string;
  /** Variant name (defaults to the filename base). */
  variant?: string;
  /** Expected duration in seconds for tolerance validation. */
  expectedDuration?: number;
  /** Optional contract override; falls back to the built-in default. */
  contract?: Partial<ArtifactContract>;
  actor?: { type: 'human' | 'agent' | 'system'; id: string };
  capability?: string;
  provider?: string;
  model?: string;
  /** Generation seed, when known. */
  seed?: number;
  /** Parent asset references (e.g. '@alice:v3') this artifact was produced from. */
  parentAssets?: string[];
  reason?: string;
}

export interface CommitResult {
  ok: boolean;
  /** The asset id keying the transition log. */
  asset: string;
  /** The artifact id recorded in the transition. */
  artifact: string;
  state: AssetState;
  errors: ValidationRuleError[];
  transition?: AssetTransition;
  degradedProbe?: boolean;
}

/**
 * Validate and commit an external artifact into the OPSV asset state machine.
 * On accept, appends a `draft → candidate` transition.
 */
export async function commitArtifact(input: CommitInput): Promise<CommitResult> {
  const absPath = path.resolve(input.projectRoot, input.artifactPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Artifact not found: ${input.artifactPath}`);
  }

  const { mediaInfo, degraded } = await probeMedia(absPath);
  const contract = loadArtifactContract(input.contract);
  const actor = input.actor ?? { type: 'human', id: 'cli' };
  const capability = input.capability ?? 'external.import';

  const result = validateArtifact({
    contract,
    type: input.type,
    expectedDuration: input.expectedDuration,
    mediaInfo,
    provenance: { actor: actor.id, capability },
  });

  const asset = input.task ?? path.basename(absPath, path.extname(absPath));
  const variant = input.variant ?? path.basename(absPath, path.extname(absPath));
  const artifact = `${asset}:${variant}`;

  if (!result.ok) {
    return { ok: false, asset, artifact, state: 'draft', errors: result.errors, degradedProbe: degraded };
  }

  const transition = await appendTransition(input.projectRoot, {
    asset,
    artifact,
    from: 'draft',
    to: 'candidate',
    actor,
    reason: input.reason ?? `committed artifact ${absPath}`,
    timestamp: new Date().toISOString(),
    provenance:
      input.provider || input.model || input.seed !== undefined || input.parentAssets?.length
        ? {
            provider: input.provider,
            model: input.model,
            seed: input.seed,
            parentAssets: input.parentAssets,
          }
        : undefined,
  });

  return {
    ok: true,
    asset,
    artifact,
    state: 'candidate',
    errors: [],
    transition,
    degradedProbe: degraded,
  };
}
