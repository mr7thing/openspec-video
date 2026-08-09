// ============================================================================
// Execution EventStore — append-only JSONL with lock + monotonic seq +
// idempotencyKey dedup.
//
// Mechanism borrowed from Trellis channel store (withLock / seqSidecarPath /
// appendEvent / reconcileSeq), reimplemented for OPSV's own event domain.
// Standalone: never reads `.trellis/`.
//
// Layout (see paths.ts): durable record under `.opsv/execution/<id>/`
// (Git-trackable), runtime artifacts (lock + seq sidecar) under
// `.opsv/runtime/execution/<id>/` (Git-ignored).
// ============================================================================

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ExecutionError, ValidationError, OpsVErrorCode } from '../../errors/OpsVError';
import {
  ExecutionEvent,
  ExecutionEventDraft,
  ExecutionEventDraftSchema,
  ExecutionEventSchema,
  ExecutionPlan,
  ExecutionPlanSchema,
  ExecutionState,
  ExecutionStateSchema,
} from '../../types/ExecutionRecord';
import { withLock } from './lock';
import {
  assertValidExecutionId,
  contextsDir,
  eventsPath,
  executionDir,
  lockPath,
  planPath,
  receiptsDir,
  runtimeDir,
  seqSidecarPath,
  statePath,
} from './paths';
import { reconcileSeq, dropTornTail, writeSidecar } from './seq';
import { createInitialState, reduceEvents } from './reducer';

export class EventStore {
  readonly projectRoot: string;
  readonly executionId: string;

  constructor(projectRoot: string, executionId: string) {
    assertValidExecutionId(executionId);
    this.projectRoot = projectRoot;
    this.executionId = executionId;
  }

  get dir(): string {
    return executionDir(this.projectRoot, this.executionId);
  }

  /** Create the execution dir layout and write plan.json. Fails if already initialized. */
  async init(plan: ExecutionPlan): Promise<void> {
    const parsed = ExecutionPlanSchema.safeParse(plan);
    if (!parsed.success) {
      throw new ValidationError(
        OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH,
        `Invalid execution plan: ${parsed.error.message}`,
        { issues: parsed.error.issues },
      );
    }
    if (fs.existsSync(eventsPath(this.projectRoot, this.executionId))) {
      throw new ExecutionError(
        OpsVErrorCode.EXECUTION_ALREADY_INITIALIZED,
        `Execution '${this.executionId}' is already initialized (events.jsonl exists)`,
      );
    }
    await fsp.mkdir(contextsDir(this.projectRoot, this.executionId), { recursive: true });
    await fsp.mkdir(receiptsDir(this.projectRoot, this.executionId), { recursive: true });
    await fsp.mkdir(runtimeDir(this.projectRoot, this.executionId), { recursive: true });
    await writeJsonAtomic(planPath(this.projectRoot, this.executionId), parsed.data);
  }

  /**
   * Append an event atomically under the execution lock.
   *
   * - Validates the draft against the per-kind schema BEFORE taking the lock
   *   (reference-only payloads; body-carrying keys are rejected here).
   * - Same idempotencyKey + same kind → returns the existing event unchanged.
   * - Same idempotencyKey + different kind → EXECUTION_IDEMPOTENCY_CONFLICT.
   * - seq is assigned by reconciling the sidecar against the JSONL tail, so
   *   an interrupted writer repairs instead of leaving holes.
   */
  async append(draft: ExecutionEventDraft): Promise<ExecutionEvent> {
    const parsed = ExecutionEventDraftSchema.safeParse(draft);
    if (!parsed.success) {
      throw new ValidationError(
        OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH,
        `Invalid execution event: ${parsed.error.message}`,
        { issues: parsed.error.issues },
      );
    }
    const valid = parsed.data;

    const jsonl = eventsPath(this.projectRoot, this.executionId);
    const sidecar = seqSidecarPath(this.projectRoot, this.executionId);
    return withLock(lockPath(this.projectRoot, this.executionId), async () => {
      const existing = this.findIdempotentEvent(valid);
      if (existing !== undefined) return existing;

      await dropTornTail(jsonl);
      const lastSeq = await reconcileSeq(jsonl, sidecar);
      const event = {
        ...valid,
        seq: lastSeq + 1,
        ts: valid.ts ?? new Date().toISOString(),
      } as ExecutionEvent;
      // Paranoid full-envelope validation before the event becomes fact.
      const full = ExecutionEventSchema.safeParse(event);
      if (!full.success) {
        throw new ValidationError(
          OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH,
          `Invalid execution event envelope: ${full.error.message}`,
          { issues: full.error.issues },
        );
      }
      await fsp.appendFile(jsonl, JSON.stringify(full.data) + '\n', 'utf-8');
      await writeSidecar(sidecar, full.data.seq);
      return full.data;
    });
  }

  /** Read all events in seq order. Unparseable lines are skipped (tail-torn writes); JSON lines that fail schema validation are corruption and throw. */
  async readEvents(afterSeq?: number): Promise<ExecutionEvent[]> {
    const all = this.readAllEvents();
    if (afterSeq === undefined) return all;
    return all.filter((ev) => ev.seq > afterSeq);
  }

  /** Last committed seq via the reconcile path (never a stale sidecar). */
  async readLastSeq(): Promise<number> {
    const jsonl = eventsPath(this.projectRoot, this.executionId);
    if (!fs.existsSync(jsonl)) return 0;
    return reconcileSeq(jsonl, seqSidecarPath(this.projectRoot, this.executionId));
  }

  /** Replay events → projection → persist state.json (atomic). */
  async projectState(): Promise<ExecutionState> {
    const events = this.readAllEvents();
    const state = reduceEvents(events, createInitialState(this.executionId));
    await writeJsonAtomic(statePath(this.projectRoot, this.executionId), state);
    return state;
  }

  async readState(): Promise<ExecutionState | null> {
    const file = statePath(this.projectRoot, this.executionId);
    if (!fs.existsSync(file)) return null;
    const parsed = ExecutionStateSchema.safeParse(JSON.parse(await fsp.readFile(file, 'utf-8')));
    if (!parsed.success) {
      throw new ValidationError(
        OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH,
        `Corrupt state.json for execution '${this.executionId}': ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  async readPlan(): Promise<ExecutionPlan | null> {
    const file = planPath(this.projectRoot, this.executionId);
    if (!fs.existsSync(file)) return null;
    const parsed = ExecutionPlanSchema.safeParse(JSON.parse(await fsp.readFile(file, 'utf-8')));
    if (!parsed.success) {
      throw new ValidationError(
        OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH,
        `Corrupt plan.json for execution '${this.executionId}': ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  private findIdempotentEvent(draft: ExecutionEventDraft): ExecutionEvent | undefined {
    const key = draft.idempotencyKey;
    if (key === undefined) return undefined;
    for (const ev of this.readAllEvents()) {
      if (ev.idempotencyKey !== key) continue;
      if (ev.kind !== draft.kind) {
        throw new ExecutionError(
          OpsVErrorCode.EXECUTION_IDEMPOTENCY_CONFLICT,
          `Idempotency key '${key}' was already used for kind '${ev.kind}'; cannot reuse it for '${draft.kind}'`,
        );
      }
      return ev;
    }
    return undefined;
  }

  private readAllEvents(): ExecutionEvent[] {
    const file = eventsPath(this.projectRoot, this.executionId);
    if (!fs.existsSync(file)) return [];
    const text = fs.readFileSync(file, 'utf-8');
    const events: ExecutionEvent[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        // Torn tail write (interrupted append): skip; reconcileSeq owns recovery.
        continue;
      }
      const parsed = ExecutionEventSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ValidationError(
          OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH,
          `Corrupt event in ${file}: ${parsed.error.message}`,
          { issues: parsed.error.issues },
        );
      }
      events.push(parsed.data);
    }
    return events;
  }
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  await fsp.rename(tmp, file);
}
