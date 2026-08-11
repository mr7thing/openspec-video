import { RhCliError } from '../rh-runner/index';

export type RhExecutionPhase = 'probe' | 'compile' | 'before-spawn' | 'after-spawn' | 'completed' | 'recovery-query';
export type Retryability = 'none' | 'safe' | 'manual';
export type Fallbackability = 'none' | 'safe' | 'manual';

export interface ProviderFailureDecision {
  retryability: Retryability;
  fallbackability: Fallbackability;
  reason: string;
}

/**
 * Classifies only what OPSV can know. In particular, a subprocess that has
 * started but did not expose a real RunningHub task id is never treated as a
 * safe retry/fallback: the upstream task may already be billable.
 */
export class ProviderFailurePolicy {
  classify(phase: RhExecutionPhase, error?: Error): ProviderFailureDecision {
    if (phase === 'probe' || phase === 'compile' || phase === 'before-spawn') {
      return { retryability: 'safe', fallbackability: 'safe', reason: 'No RH CLI subprocess was started.' };
    }
    if (phase === 'after-spawn') {
      if (error instanceof RhCliError && ['auth', 'balance', 'queue-limit', 'remote-failed'].includes(error.kind)) {
        return {
          retryability: 'safe',
          fallbackability: 'safe',
          reason: `RH CLI reported a terminal/safe failure before a new submission is needed (${error.kind}).`,
        };
      }
      return {
        retryability: 'manual',
        fallbackability: 'manual',
        reason: 'RH CLI was started but no verified remote task id is available; re-submission could double-charge.',
      };
    }
    if (phase === 'recovery-query') {
      return { retryability: 'manual', fallbackability: 'manual', reason: 'Remote task state could not be verified.' };
    }
    return { retryability: 'none', fallbackability: 'none', reason: 'The task has already completed locally.' };
  }
}
