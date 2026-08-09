// ============================================================================
// Execution Record — `.opsv/execution/` event store + state projection
// ============================================================================

export { EventStore } from './EventStore';
export { reduceEvents, createInitialState } from './reducer';
export { withLock, acquireLock, releaseLock } from './lock';
export { reconcileSeq, dropTornTail, writeSidecar } from './seq';
export {
  assertValidExecutionId,
  executionRoot,
  executionDir,
  eventsPath,
  planPath,
  statePath,
  contextsDir,
  receiptsDir,
  runtimeDir,
  lockPath,
  seqSidecarPath,
} from './paths';
