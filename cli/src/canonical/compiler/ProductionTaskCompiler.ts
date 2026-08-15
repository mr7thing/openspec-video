import { z } from 'zod';
import { deepFreeze } from './CanonicalSnapshot';
import type {
  CanonicalProductionInput,
  CanonicalResolvedInput,
  CanonicalSnapshot,
  CanonicalSnapshotContract,
} from './CanonicalSnapshot';
import { canonicalDigest } from './CanonicalDigest';
import { ArtifactContractSchema } from '../artifacts/ArtifactContract';
import { InputSlotSchema } from '../../types/PackSchemas';

export const PRODUCTION_TASK_COMPILER = {
  id: 'opsv.production-task-compiler',
  version: 1,
} as const;

const sha256Digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const nonEmptyString = z.string().min(1);

const CanonicalSnapshotContractSchema = z.object({
  schema: z.literal('opsv.production-contract'),
  version: z.literal(1),
  pack: z.object({
    id: nonEmptyString,
    version: nonEmptyString,
    contentDigest: sha256Digest,
  }).strict(),
  category: nonEmptyString,
  profile: z.object({
    id: nonEmptyString,
    kind: z.enum(['workflow', 'production']),
    capability: nonEmptyString.optional(),
    digest: sha256Digest,
  }).strict(),
  capability: z.object({
    declared: nonEmptyString,
    id: nonEmptyString,
  }).strict().optional(),
  boundModel: nonEmptyString.optional(),
  outputs: z.array(nonEmptyString),
  inputSlots: z.array(InputSlotSchema),
  policy: z.record(nonEmptyString),
  promptContract: z.object({
    id: nonEmptyString,
    version: nonEmptyString,
    digest: sha256Digest,
  }).strict().optional(),
  taskContract: z.object({
    id: nonEmptyString,
    version: nonEmptyString,
    digest: sha256Digest,
  }).strict().optional(),
  artifactContract: z.object({
    source: z.enum(['profile', 'builtin']),
    value: ArtifactContractSchema,
    digest: sha256Digest,
  }).strict(),
  digest: sha256Digest,
}).strict();

const CanonicalResolvedInputSchema = z.object({
  kind: z.enum(['image', 'video', 'audio', 'frame:first', 'frame:last', 'workflow']),
  uri: nonEmptyString,
  digest: sha256Digest,
}).strict();

const CanonicalProductionInputSchema = z.object({
  type: z.enum(['imagen', 'video', 'audio', 'comfy', 'webapp', 'produce']),
  prompt: z.string(),
  payload: z.object({
    prompt: z.string().optional(),
    global_settings: z.object({
      aspect_ratio: z.string(),
      quality: z.string(),
    }).strict(),
    camera: z.object({ type: z.string(), motion: z.string() }).strict().optional(),
    duration: z.string().optional(),
    frame_ref: z.object({ first: z.string().nullable(), last: z.string().nullable() }).strict().optional(),
    extra: z.object({
      media_refs: z.array(z.string()),
      negative_prompt: z.string().optional(),
    }).passthrough().optional(),
  }).strict(),
  references: z.object({
    image: z.array(z.string()),
    video: z.array(z.string()),
    audio: z.array(z.string()),
  }).strict(),
  workflow: z.string().optional(),
  workflowId: z.string().optional(),
  workflowPath: z.string().optional(),
}).strict();

/** Complete durable schema for a provider-neutral immutable Task envelope. */
export const ProductionTaskSchema = z.object({
  schema: z.literal('opsv.production-task'),
  version: z.literal(1),
  id: nonEmptyString,
  revision: sha256Digest,
  digest: sha256Digest,
  snapshotDigest: sha256Digest,
  source: z.object({ path: nonEmptyString, digest: sha256Digest }).strict(),
  contract: CanonicalSnapshotContractSchema,
  capability: nonEmptyString.optional(),
  boundModel: nonEmptyString.optional(),
  outputs: z.array(nonEmptyString),
  references: z.array(CanonicalResolvedInputSchema),
  production: CanonicalProductionInputSchema,
  compiler: z.object({
    id: nonEmptyString,
    version: z.number().int().positive(),
    digest: sha256Digest,
  }).strict(),
}).strict();

export interface ProductionTask {
  schema: 'opsv.production-task';
  version: 1;
  id: string;
  revision: string;
  digest: string;
  snapshotDigest: string;
  source: { path: string; digest: string };
  /** Complete resolved Pack/Profile/contract/model binding, not a re-readable lookup. */
  contract: CanonicalSnapshotContract;
  /** Compatibility projections for the existing TaskBuilder/provider seam. */
  capability?: string;
  boundModel?: string;
  outputs: string[];
  references: CanonicalResolvedInput[];
  production: CanonicalProductionInput;
  compiler: { id: string; version: number; digest: string };
}

export type ProductionTaskIdentity = Omit<ProductionTask, 'revision' | 'digest'>;

export function productionTaskIdentity(task: ProductionTask): ProductionTaskIdentity {
  const { revision: _revision, digest: _digest, ...identity } = task;
  return identity;
}

export function digestProductionTask(task: ProductionTask): string {
  const identity = productionTaskIdentity(task);
  return canonicalDigest({ ...identity, source: { path: identity.source.path } }, 'production-task', task.version);
}

/** Reject malformed or tampered stored envelopes before they enter execution/ingress. */
export function assertProductionTask(task: unknown): asserts task is ProductionTask {
  const parsed = ProductionTaskSchema.safeParse(task);
  if (!parsed.success) {
    throw new TypeError(`TASK_SCHEMA_INVALID: ${parsed.error.issues[0]?.message ?? 'Unsupported ProductionTask schema'}`);
  }
  if (parsed.data.digest !== parsed.data.revision) {
    throw new TypeError('TASK_SCHEMA_INVALID: ProductionTask revision must equal digest');
  }
  const digest = digestProductionTask(parsed.data);
  if (digest !== parsed.data.digest) {
    throw new TypeError(`TASK_DIGEST_MISMATCH: Expected ${digest}, received ${parsed.data.digest}`);
  }
}

export function compileProductionTask(snapshot: CanonicalSnapshot): ProductionTask {
  const compiler = {
    ...PRODUCTION_TASK_COMPILER,
    digest: canonicalDigest(PRODUCTION_TASK_COMPILER, 'production-task-compiler', PRODUCTION_TASK_COMPILER.version),
  };
  const identity: ProductionTaskIdentity = {
    schema: 'opsv.production-task',
    version: 1,
    id: snapshot.asset.id,
    snapshotDigest: snapshot.digest,
    source: { ...snapshot.source },
    contract: structuredClone(snapshot.contract),
    capability: snapshot.contract.profile.capability,
    boundModel: snapshot.contract.boundModel,
    outputs: [...snapshot.contract.outputs],
    references: snapshot.references.map((reference) => ({ ...reference })),
    production: {
      ...snapshot.production,
      payload: structuredClone(snapshot.production.payload),
      references: {
        image: [...snapshot.production.references.image],
        video: [...snapshot.production.references.video],
        audio: [...snapshot.production.references.audio],
      },
    },
    compiler,
  };
  const digest = digestProductionTask({ ...identity, revision: '', digest: '' });
  return deepFreeze({ ...identity, revision: digest, digest });
}
