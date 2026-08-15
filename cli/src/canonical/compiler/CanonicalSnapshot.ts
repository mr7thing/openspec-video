import crypto from 'crypto';
import type { CanonicalAsset } from '../schema';
import type { JobType, PromptPayload } from '../../types/Job';
import { canonicalDigest } from './CanonicalDigest';
import type { ArtifactContract } from '../artifacts/ArtifactContract';
import type { InputSlot } from '../../types/PackSchemas';

export interface CanonicalSnapshotContract {
  schema: 'opsv.production-contract';
  version: 1;
  pack: { id: string; version: string; contentDigest: string };
  category: string;
  profile: {
    id: string;
    kind: 'workflow' | 'production';
    capability?: string;
    digest: string;
  };
  capability?: { declared: string; id: string };
  boundModel?: string;
  outputs: string[];
  inputSlots: InputSlot[];
  policy: Record<string, string>;
  promptContract?: { id: string; version: string; digest: string };
  taskContract?: { id: string; version: string; digest: string };
  artifactContract: {
    source: 'profile' | 'builtin';
    value: ArtifactContract;
    digest: string;
  };
  digest: string;
}

export type CanonicalResolvedInputKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'frame:first'
  | 'frame:last'
  | 'workflow';

export interface CanonicalResolvedInput {
  kind: CanonicalResolvedInputKind;
  uri: string;
  digest: string;
}

export interface CanonicalProductionInput {
  type: JobType;
  prompt: string;
  payload: PromptPayload;
  references: {
    image: string[];
    video: string[];
    audio: string[];
  };
  workflow?: string;
  workflowId?: string;
  workflowPath?: string;
}

export interface CanonicalSnapshot {
  schema: 'opsv.canonical-snapshot';
  version: 1;
  source: {
    path: string;
    digest: string;
  };
  asset: CanonicalAsset;
  contract: CanonicalSnapshotContract;
  references: CanonicalResolvedInput[];
  production: CanonicalProductionInput;
  digest: string;
}

export type CanonicalSnapshotDraft = Omit<CanonicalSnapshot, 'digest'>;

export function digestSource(content: string | Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;
}

export function createCanonicalSnapshot(draft: CanonicalSnapshotDraft): CanonicalSnapshot {
  const semanticSnapshot = {
    ...draft,
    source: { path: draft.source.path },
    asset: semanticAssetProjection(draft.asset),
  };
  const snapshot: CanonicalSnapshot = {
    ...draft,
    digest: canonicalDigest(semanticSnapshot, 'canonical-snapshot', draft.version),
  };
  return deepFreeze(snapshot);
}

function semanticAssetProjection(asset: CanonicalAsset): unknown {
  return omitFidelityFields(asset);
}

function omitFidelityFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitFidelityFields);
  if (!value || typeof value !== 'object') return value;

  const projected: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'raw' || key === 'bodyRaw' || key === 'approvedRefSection' || key === 'designRefSection') {
      continue;
    }
    projected[key] = omitFidelityFields(child);
  }
  return projected;
}

export function isSnapshotStale(snapshot: CanonicalSnapshot, currentSource: string | Buffer): boolean {
  return snapshot.source.digest !== digestSource(currentSource);
}

export function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}
