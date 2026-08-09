// ============================================================================
// Execution Record path layout
//
//   .opsv/execution/<execution-id>/   (Git-trackable — the durable record)
//     plan.json                       (input plan snapshot)
//     events.jsonl                    (append-only source of truth)
//     state.json                      (reducer projection — derivable)
//     contexts/  receipts/
//   .opsv/runtime/execution/<execution-id>/   (Git-ignored — runtime artifacts)
//     events.lock                     (advisory lock file)
//     events.seq                      (last committed seq sidecar)
// ============================================================================

import path from 'path';
import { ValidationError, OpsVErrorCode } from '../../errors/OpsVError';

const EXECUTION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Guard against path traversal / unusable ids. */
export function assertValidExecutionId(executionId: string): void {
  if (!EXECUTION_ID_PATTERN.test(executionId)) {
    throw new ValidationError(
      OpsVErrorCode.VALIDATION_TYPE_ERROR,
      `Invalid execution id '${executionId}' (allowed: [A-Za-z0-9._-], 1-128 chars, no path separators)`,
      { executionId },
    );
  }
}

export function executionRoot(projectRoot: string): string {
  return path.join(projectRoot, '.opsv', 'execution');
}

export function executionDir(projectRoot: string, executionId: string): string {
  return path.join(executionRoot(projectRoot), executionId);
}

export function eventsPath(projectRoot: string, executionId: string): string {
  return path.join(executionDir(projectRoot, executionId), 'events.jsonl');
}

export function planPath(projectRoot: string, executionId: string): string {
  return path.join(executionDir(projectRoot, executionId), 'plan.json');
}

export function statePath(projectRoot: string, executionId: string): string {
  return path.join(executionDir(projectRoot, executionId), 'state.json');
}

export function contextsDir(projectRoot: string, executionId: string): string {
  return path.join(executionDir(projectRoot, executionId), 'contexts');
}

export function receiptsDir(projectRoot: string, executionId: string): string {
  return path.join(executionDir(projectRoot, executionId), 'receipts');
}

export function runtimeDir(projectRoot: string, executionId: string): string {
  return path.join(projectRoot, '.opsv', 'runtime', 'execution', executionId);
}

export function lockPath(projectRoot: string, executionId: string): string {
  return path.join(runtimeDir(projectRoot, executionId), 'events.lock');
}

export function seqSidecarPath(projectRoot: string, executionId: string): string {
  return path.join(runtimeDir(projectRoot, executionId), 'events.seq');
}
