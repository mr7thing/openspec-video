/**
 * Shared types for the webapp runner system.
 */

export interface RunnerResult {
  status: 'success' | 'failed';
  images: string[];
  error: string | null;
}
