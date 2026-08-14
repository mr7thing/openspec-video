// ============================================================================
// Artifact Validator — decides whether an artifact may become an OPSV asset
//
// Validates an artifact against its Artifact Contract. Returns a structured
// result `{ ok, errors }`; it never throws for rule failures (rule failure ≠
// infrastructure failure — the three-state valid/invalid/infrastructure rule).
// Spec: .trellis/spec/canonical-model/artifact-contract.md
// ============================================================================

import { ArtifactContract, loadArtifactContract } from './ArtifactContract';
import { ArtifactValidationResult, MediaInfo } from '../schema';

export interface ValidationRuleError {
  rule: string;
  expected?: unknown;
  actual?: unknown;
}

export interface ValidateArtifactInput {
  contract?: Partial<ArtifactContract>;
  /** The artifact's actual type (video/image/audio/...). */
  type: string;
  /** The task's expected duration in seconds, when known. */
  expectedDuration?: number;
  /** Probed media info; empty when ffprobe is unavailable. */
  mediaInfo?: MediaInfo;
  /** Provenance completeness to check when the contract requires it. */
  provenance?: { actor?: string; capability?: string };
}

/**
 * Validate an artifact against its contract. Returns `{ ok, errors }`.
 *
 * Degradation: when the contract requires `media_info` but no probe result is
 * available, the affected checks fail (fail-closed). When `media_info` is
 * optional, missing probe data downgrades to a warning (fail-open).
 */
export function validateArtifact(input: ValidateArtifactInput): ArtifactValidationResult {
  const contract = loadArtifactContract(input.contract);
  const errors: Array<{ rule: string; expected?: unknown; actual?: unknown }> = [];
  const mediaInfo = input.mediaInfo ?? {};

  // output.type must match (unless the contract wildcards it)
  if (contract.output.type !== '*' && contract.output.type !== input.type) {
    errors.push({ rule: 'type', expected: contract.output.type, actual: input.type });
  }

  // duration tolerance (vs the task's expected duration)
  const durationRule = contract.validation.find((r) => 'duration' in r) as
    | { duration: { tolerance: number } }
    | undefined;
  if (durationRule && input.expectedDuration !== undefined) {
    const actual = mediaInfo.duration;
    if (actual === undefined) {
      if (contract.required.media_info) {
        errors.push({ rule: 'duration', expected: input.expectedDuration, actual: undefined });
      }
    } else if (Math.abs(actual - input.expectedDuration) > durationRule.duration.tolerance) {
      errors.push({ rule: 'duration', expected: input.expectedDuration, actual });
    }
  }

  // codec allowlist
  const codecRule = contract.validation.find((r) => 'codec' in r) as
    | { codec: { allowed: string[] } }
    | undefined;
  if (codecRule) {
    if (mediaInfo.codec === undefined) {
      if (contract.required.media_info) {
        errors.push({ rule: 'codec', expected: codecRule.codec.allowed, actual: undefined });
      }
    } else if (!codecRule.codec.allowed.includes(mediaInfo.codec)) {
      errors.push({ rule: 'codec', expected: codecRule.codec.allowed, actual: mediaInfo.codec });
    }
  }

  // resolution minimum
  const resRule = contract.validation.find((r) => 'resolution' in r) as
    | { resolution: { min: { w: number; h: number } } }
    | undefined;
  if (resRule) {
    const res = mediaInfo.resolution;
    if (res === undefined) {
      if (contract.required.media_info) {
        errors.push({ rule: 'resolution', expected: { min: resRule.resolution.min }, actual: undefined });
      }
    } else if (res.w < resRule.resolution.min.w || res.h < resRule.resolution.min.h) {
      errors.push({ rule: 'resolution', expected: resRule.resolution.min, actual: res });
    }
  }

  // frame rate range (temporal)
  const fpsRule = contract.validation.find((r) => 'frameRate' in r) as
    | { frameRate: { min?: number; max?: number } }
    | undefined;
  if (fpsRule) {
    const actual = mediaInfo.frameRate;
    if (actual === undefined) {
      if (contract.required.media_info) errors.push({ rule: 'frameRate', expected: fpsRule.frameRate, actual: undefined });
    } else if (
      (fpsRule.frameRate.min !== undefined && actual < fpsRule.frameRate.min) ||
      (fpsRule.frameRate.max !== undefined && actual > fpsRule.frameRate.max)
    ) {
      errors.push({ rule: 'frameRate', expected: fpsRule.frameRate, actual });
    }
  }

  // audio track presence
  const audioRule = contract.validation.find((r) => 'hasAudio' in r) as
    | { hasAudio: boolean }
    | undefined;
  if (audioRule) {
    const actual = mediaInfo.hasAudio;
    if (actual === undefined) {
      if (contract.required.media_info) errors.push({ rule: 'hasAudio', expected: audioRule.hasAudio, actual: undefined });
    } else if (actual !== audioRule.hasAudio) {
      errors.push({ rule: 'hasAudio', expected: audioRule.hasAudio, actual });
    }
  }

  // aspect ratio range (composition; w/h)
  const ratioRule = contract.validation.find((r) => 'aspectRatio' in r) as
    | { aspectRatio: { min?: number; max?: number } }
    | undefined;
  if (ratioRule) {
    const res = mediaInfo.resolution;
    const ratio = res && res.h > 0 ? res.w / res.h : undefined;
    if (ratio === undefined) {
      if (contract.required.media_info) errors.push({ rule: 'aspectRatio', expected: ratioRule.aspectRatio, actual: undefined });
    } else if (
      (ratioRule.aspectRatio.min !== undefined && ratio < ratioRule.aspectRatio.min) ||
      (ratioRule.aspectRatio.max !== undefined && ratio > ratioRule.aspectRatio.max)
    ) {
      errors.push({ rule: 'aspectRatio', expected: ratioRule.aspectRatio, actual: ratio });
    }
  }

  // provenance completeness
  if (contract.required.provenance) {
    if (!input.provenance?.actor) {
      errors.push({ rule: 'provenance.actor', expected: 'non-empty string', actual: input.provenance?.actor });
    }
    if (!input.provenance?.capability) {
      errors.push({ rule: 'provenance.capability', expected: 'non-empty string', actual: input.provenance?.capability });
    }
  }

  return { ok: errors.length === 0, errors };
}
