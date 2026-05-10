// ============================================================================
// OpsV v0.8 Review Entry Formatting
// ============================================================================

import { ReviewEntry } from '../types/ManifestSchema';

export function formatReviewEntry(entry: ReviewEntry): string {
  let line = `${entry.timestamp} ${entry.action} output: ${entry.outputFile || ''}`;
  if (entry.modifiedTaskPath) {
    line += ` | modified_task: ${entry.modifiedTaskPath}`;
  }
  return line;
}
