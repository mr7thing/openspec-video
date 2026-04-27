// ============================================================================
// OpsV v0.8 Browser Executor Provider
// Chrome extension automation via WebSocket daemon
// ============================================================================

import { TaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { logger } from '../../utils/logger';

export class BrowserProvider {
  name = 'browser';

  async execute(task: TaskJson, taskPath: string): Promise<ProviderResult> {
    // TODO: Implement WebSocket communication with daemon
    // 1. Connect to daemon WebSocket
    // 2. Send task to Chrome extension
    // 3. Monitor execution progress
    // 4. Download results

    return {
      taskPath,
      shotId: task._opsv.shotId,
      provider: 'browser',
      success: false,
      error: 'BrowserProvider not yet implemented',
    };
  }
}
