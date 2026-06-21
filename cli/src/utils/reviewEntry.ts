// ============================================================================
// OpsV Review Entry Formatting
// ============================================================================

import { ReviewEntry } from '../types/ManifestSchema';

export function formatReviewEntry(entry: ReviewEntry): string {
  const files = entry.outputFiles && entry.outputFiles.length > 0
    ? entry.outputFiles.join(', ')
    : (entry.outputFile || '');
  let line = `${entry.timestamp} ${entry.action} output: ${files}`;
  if (entry.modifiedTaskPath) {
    line += ` | modified_task: ${entry.modifiedTaskPath}`;
  }
  if (entry.note) {
    const oneLine = entry.note.replace(/\s+/g, ' ').trim();
    line += ` | note: ${oneLine}`;
  }
  return line;
}
