// ============================================================================
// OpsV Execution Record Schema
// `.opsv/execution/<execution-id>/{plan.json, events.jsonl, state.json}`
//
// Hard constraint (plan §3 B1): events REFERENCE assets/tasks/artifacts by
// id/path/hash only. They must never carry document bodies. This is enforced
// at the schema layer: every payload object is `.strict()` (unknown keys such
// as `content`/`body`/`markdown` are rejected) and free-text annotation
// fields are capped at SHORT_TEXT_MAX characters.
// ============================================================================

import { z } from 'zod';

/** Cap for short human annotations (notes/reasons). Document bodies exceed this. */
export const SHORT_TEXT_MAX = 280;
/** Cap for identifier-like fields (ids, relative paths, hashes). */
export const REF_STRING_MAX = 512;

const refString = z.string().min(1).max(REF_STRING_MAX);
const shortText = z.string().min(1).max(SHORT_TEXT_MAX);

// ---------------------------------------------------------------------------
// Event kinds (minimal set, analysis §8.3)
// ---------------------------------------------------------------------------

export const ExecutionEventKindEnum = z.enum([
  'execution',
  'plan',
  'stage',
  'step',
  'role',
  'context',
  'produce_run',
  'artifact',
  'gate',
  'review',
  'syncing',
  'next_action',
  'plan_revision',
]);
export type ExecutionEventKind = z.infer<typeof ExecutionEventKindEnum>;

export const EXECUTION_EVENT_KINDS: readonly ExecutionEventKind[] = ExecutionEventKindEnum.options;

// ---------------------------------------------------------------------------
// Per-kind payloads (reference-only; strict objects reject body-carrying keys)
// ---------------------------------------------------------------------------

const ExecutionLifecyclePayloadSchema = z
  .object({
    action: z.enum(['create', 'start', 'complete', 'block', 'fail']),
    reason: shortText.optional(),
  })
  .strict();

const PlanPayloadSchema = z
  .object({
    action: z.literal('set'),
    planVersion: z.number().int().min(1),
    /** Path of plan.json relative to the execution dir. */
    planPath: refString,
    title: shortText.optional(),
  })
  .strict();

const PlanRevisionPayloadSchema = z
  .object({
    fromVersion: z.number().int().min(1),
    toVersion: z.number().int().min(1),
    planPath: refString,
    reason: shortText.optional(),
    affectedStages: z.array(refString).optional(),
    reopenedStages: z.array(refString).optional(),
  })
  .strict();

const StagePayloadSchema = z
  .object({
    stageId: refString,
    action: z.enum(['open', 'start', 'complete', 'reopen', 'block']),
    label: shortText.optional(),
  })
  .strict();

const StepPayloadSchema = z
  .object({
    stageId: refString,
    stepId: refString,
    action: z.enum(['start', 'complete', 'fail', 'skip', 'reopen']),
    attempt: z.number().int().min(1).optional(),
  })
  .strict();

const RolePayloadSchema = z
  .object({
    role: refString,
    action: z.enum(['assign', 'start', 'complete']),
    stageId: refString.optional(),
    stepId: refString.optional(),
  })
  .strict();

const ContextPayloadSchema = z
  .object({
    contextId: refString,
    action: z.enum(['attach', 'detach']),
    /** Path of the context file relative to the execution dir (contexts/). */
    path: refString,
    hash: refString.optional(),
    stageId: refString.optional(),
  })
  .strict();

const ProduceRunPayloadSchema = z
  .object({
    runId: refString,
    status: z.enum(['submitted', 'succeeded', 'failed']),
    attempt: z.number().int().min(1).optional(),
    stageId: refString.optional(),
    stepId: refString.optional(),
    taskId: refString.optional(),
    /** Path of the Task JSON, not its content. */
    taskPath: refString.optional(),
    provider: refString.optional(),
    outputIds: z.array(refString).optional(),
  })
  .strict();

const ArtifactPayloadSchema = z
  .object({
    artifactId: refString,
    action: z.enum(['register', 'supersede']),
    path: refString,
    hash: refString.optional(),
    supersedes: refString.optional(),
    producedBy: refString.optional(),
  })
  .strict();

const GatePayloadSchema = z
  .object({
    gateId: refString,
    result: z.enum(['pass', 'fail', 'waive']),
    stageId: refString.optional(),
    stepId: refString.optional(),
    note: shortText.optional(),
  })
  .strict();

const ReviewPayloadSchema = z
  .object({
    action: z.enum(['approved', 'syncing', 'rejected', 'design_feedback', 'revise_prompt']),
    assetId: refString.optional(),
    artifactId: refString.optional(),
    outputRefs: z.array(refString).optional(),
    note: shortText.optional(),
  })
  .strict();

const SyncingPayloadSchema = z
  .object({
    action: z.enum(['mark', 'confirm', 'revert']),
    assetId: refString.optional(),
    variant: refString.optional(),
    refs: z.array(refString).optional(),
  })
  .strict();

const NextActionItemSchema = z
  .object({
    kind: refString,
    assetId: refString.optional(),
    taskId: refString.optional(),
    stageId: refString.optional(),
    stepId: refString.optional(),
    reason: shortText.optional(),
  })
  .strict();

const NextActionPayloadSchema = z
  .object({
    actions: z.array(NextActionItemSchema),
  })
  .strict();

// ---------------------------------------------------------------------------
// Event envelope (discriminated union on `kind`)
// ---------------------------------------------------------------------------

const EventBaseFields = {
  seq: z.number().int().min(1),
  ts: z.string().min(1),
  by: z.string().min(1).max(128),
  idempotencyKey: z.string().min(1).max(REF_STRING_MAX).optional(),
};

export const ExecutionEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...EventBaseFields, kind: z.literal('execution'), payload: ExecutionLifecyclePayloadSchema }).strict(),
  z.object({ ...EventBaseFields, kind: z.literal('plan'), payload: PlanPayloadSchema }).strict(),
  z.object({ ...EventBaseFields, kind: z.literal('stage'), payload: StagePayloadSchema }).strict(),
  z.object({ ...EventBaseFields, kind: z.literal('step'), payload: StepPayloadSchema }).strict(),
  z.object({ ...EventBaseFields, kind: z.literal('role'), payload: RolePayloadSchema }).strict(),
  z.object({ ...EventBaseFields, kind: z.literal('context'), payload: ContextPayloadSchema }).strict(),
  z.object({ ...EventBaseFields, kind: z.literal('produce_run'), payload: ProduceRunPayloadSchema }).strict(),
  z.object({ ...EventBaseFields, kind: z.literal('artifact'), payload: ArtifactPayloadSchema }).strict(),
  z.object({ ...EventBaseFields, kind: z.literal('gate'), payload: GatePayloadSchema }).strict(),
  z.object({ ...EventBaseFields, kind: z.literal('review'), payload: ReviewPayloadSchema }).strict(),
  z.object({ ...EventBaseFields, kind: z.literal('syncing'), payload: SyncingPayloadSchema }).strict(),
  z.object({ ...EventBaseFields, kind: z.literal('next_action'), payload: NextActionPayloadSchema }).strict(),
  z.object({ ...EventBaseFields, kind: z.literal('plan_revision'), payload: PlanRevisionPayloadSchema }).strict(),
]);
export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;

/** Draft event as accepted by the store: seq/ts are assigned on append. */
export const ExecutionEventDraftSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('execution'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: ExecutionLifecyclePayloadSchema }).strict(),
  z.object({ kind: z.literal('plan'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: PlanPayloadSchema }).strict(),
  z.object({ kind: z.literal('stage'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: StagePayloadSchema }).strict(),
  z.object({ kind: z.literal('step'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: StepPayloadSchema }).strict(),
  z.object({ kind: z.literal('role'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: RolePayloadSchema }).strict(),
  z.object({ kind: z.literal('context'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: ContextPayloadSchema }).strict(),
  z.object({ kind: z.literal('produce_run'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: ProduceRunPayloadSchema }).strict(),
  z.object({ kind: z.literal('artifact'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: ArtifactPayloadSchema }).strict(),
  z.object({ kind: z.literal('gate'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: GatePayloadSchema }).strict(),
  z.object({ kind: z.literal('review'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: ReviewPayloadSchema }).strict(),
  z.object({ kind: z.literal('syncing'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: SyncingPayloadSchema }).strict(),
  z.object({ kind: z.literal('next_action'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: NextActionPayloadSchema }).strict(),
  z.object({ kind: z.literal('plan_revision'), by: EventBaseFields.by, idempotencyKey: EventBaseFields.idempotencyKey, ts: EventBaseFields.ts.optional(), payload: PlanRevisionPayloadSchema }).strict(),
]);
export type ExecutionEventDraft = z.infer<typeof ExecutionEventDraftSchema>;

// ---------------------------------------------------------------------------
// plan.json (minimal; B3 owns the plan lifecycle extensions)
// ---------------------------------------------------------------------------

export const ExecutionPlanStepSchema = z
  .object({
    id: refString,
    label: shortText.optional(),
    role: refString.optional(),
    refs: z.array(refString).optional(),
  })
  .strict();
export type ExecutionPlanStep = z.infer<typeof ExecutionPlanStepSchema>;

export const ExecutionPlanStageSchema = z
  .object({
    id: refString,
    label: shortText.optional(),
    steps: z.array(ExecutionPlanStepSchema).default([]),
    roles: z.array(refString).optional(),
    gates: z.array(refString).optional(),
    dependsOn: z.array(refString).optional(),
  })
  .strict();
export type ExecutionPlanStage = z.infer<typeof ExecutionPlanStageSchema>;

export const ExecutionPlanSchema = z
  .object({
    version: z.number().int().min(1),
    executionId: refString,
    title: shortText.optional(),
    createdAt: z.string().min(1),
    stages: z.array(ExecutionPlanStageSchema).default([]),
    refs: z.array(refString).optional(),
  })
  .strict();
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

// ---------------------------------------------------------------------------
// state.json (reducer projection — derivable, never the source of truth)
// ---------------------------------------------------------------------------

export const ExecutionStatusEnum = z.enum(['planning', 'running', 'completed', 'blocked', 'failed']);
export type ExecutionStatus = z.infer<typeof ExecutionStatusEnum>;

export const StageStatusEnum = z.enum(['open', 'running', 'completed', 'blocked']);
export type StageStatus = z.infer<typeof StageStatusEnum>;

export const StepStatusEnum = z.enum(['pending', 'running', 'completed', 'failed', 'skipped']);
export type StepStatus = z.infer<typeof StepStatusEnum>;

export const StepStateSchema = z
  .object({
    status: StepStatusEnum,
    attempt: z.number().int().min(0),
  })
  .strict();
export type StepState = z.infer<typeof StepStateSchema>;

export const StageStateSchema = z
  .object({
    status: StageStatusEnum,
    label: shortText.optional(),
    steps: z.record(StepStateSchema),
  })
  .strict();
export type StageState = z.infer<typeof StageStateSchema>;

export const RoleStateSchema = z
  .object({
    status: z.enum(['assigned', 'running', 'completed']),
    stageId: refString.optional(),
    stepId: refString.optional(),
  })
  .strict();
export type RoleState = z.infer<typeof RoleStateSchema>;

export const ContextStateSchema = z
  .object({
    path: refString,
    hash: refString.optional(),
    attached: z.boolean(),
    stageId: refString.optional(),
  })
  .strict();
export type ContextState = z.infer<typeof ContextStateSchema>;

export const RunStateSchema = z
  .object({
    status: z.enum(['submitted', 'succeeded', 'failed']),
    attempt: z.number().int().min(0),
    stageId: refString.optional(),
    stepId: refString.optional(),
    taskId: refString.optional(),
    taskPath: refString.optional(),
    provider: refString.optional(),
    outputIds: z.array(refString).optional(),
  })
  .strict();
export type RunState = z.infer<typeof RunStateSchema>;

export const ArtifactStateSchema = z
  .object({
    path: refString,
    hash: refString.optional(),
    producedBy: refString.optional(),
    supersededBy: refString.optional(),
  })
  .strict();
export type ArtifactState = z.infer<typeof ArtifactStateSchema>;

export const GateStateSchema = z
  .object({
    result: z.enum(['pass', 'fail', 'waive']),
    stageId: refString.optional(),
    stepId: refString.optional(),
    ts: z.string().min(1),
  })
  .strict();
export type GateState = z.infer<typeof GateStateSchema>;

export const ReviewRecordSchema = z
  .object({
    action: z.enum(['approved', 'syncing', 'rejected', 'design_feedback', 'revise_prompt']),
    assetId: refString.optional(),
    artifactId: refString.optional(),
    ts: z.string().min(1),
  })
  .strict();
export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;

export const SyncingRecordSchema = z
  .object({
    action: z.enum(['mark', 'confirm', 'revert']),
    assetId: refString.optional(),
    variant: refString.optional(),
    ts: z.string().min(1),
  })
  .strict();
export type SyncingRecord = z.infer<typeof SyncingRecordSchema>;

export const PlanRevisionRecordSchema = z
  .object({
    fromVersion: z.number().int().min(1),
    toVersion: z.number().int().min(1),
    ts: z.string().min(1),
  })
  .strict();
export type PlanRevisionRecord = z.infer<typeof PlanRevisionRecordSchema>;

export const ExecutionStateSchema = z
  .object({
    executionId: refString,
    status: ExecutionStatusEnum,
    planVersion: z.number().int().min(1).nullable(),
    planPath: refString.optional(),
    revisions: z.array(PlanRevisionRecordSchema),
    stages: z.record(StageStateSchema),
    roles: z.record(RoleStateSchema),
    contexts: z.record(ContextStateSchema),
    runs: z.record(RunStateSchema),
    artifacts: z.record(ArtifactStateSchema),
    gates: z.record(GateStateSchema),
    reviews: z.array(ReviewRecordSchema),
    syncings: z.array(SyncingRecordSchema),
    nextActions: z.array(NextActionItemSchema).nullable(),
    lastSeq: z.number().int().min(0),
    counts: z.record(z.number().int().min(0)),
  })
  .strict();
export type ExecutionState = z.infer<typeof ExecutionStateSchema>;
