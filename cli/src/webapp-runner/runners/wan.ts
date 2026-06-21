/**
 * WAN/万相 Runner (Placeholder)
 *
 * TODO: Implement WAN automation
 */

import { TaskInfo } from '../core/task';
import { RunnerResult } from '../core/types';

function log(msg: string, level = 'INFO'): void {
  console.log(`[${level}] [wan] ${msg}`);
}

export function run(taskInfo: TaskInfo): RunnerResult {
  log(`WAN runner requested for shot '${taskInfo.shotId}'`, 'WARN');

  return {
    status: 'failed',
    images: [],
    error: 'WAN runner not yet implemented — add it at src/webapp-runner/runners/wan.ts',
  };
}
