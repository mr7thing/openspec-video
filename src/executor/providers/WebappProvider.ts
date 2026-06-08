// ============================================================================
// OpsV Webapp Executor Provider (Browser automation via Gemini)
// ============================================================================

import path from 'path';
import { BaseTaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { ProviderExecutor } from '../../container/Container';
import { OpsVContext } from '../../container/OpsVContext';
import { logger } from '../../utils/logger';
import { executeTask } from '../../webapp-runner/index';

interface WebappPayload {
  prompt?: string;
  url?: string;
  [key: string]: any;
}

export class WebappProvider implements ProviderExecutor {
  readonly name = 'webapp';

  async execute(task: BaseTaskJson<WebappPayload>, taskPath: string, ctx: OpsVContext): Promise<ProviderResult> {
    const meta = task._opsv;
    const shotId = meta.shotId;

    try {
      logger.info(`[Webapp] Executing ${shotId} via Gemini/browser automation`);

      // Delegate to webapp-runner which handles site-specific runners
      const queueDir = path.resolve(taskPath, '..');
      const result = executeTask(taskPath, queueDir, true);

      if (result.status === 'completed' && result.outputPaths.length > 0) {
        return {
          taskPath,
          shotId,
          provider: this.name,
          success: true,
          outputPaths: result.outputPaths,
          error: undefined,
        };
      }

      return {
        taskPath,
        shotId,
        provider: this.name,
        success: false,
        error: result.error || 'Webapp runner failed',
      };
    } catch (err: any) {
      return {
        taskPath,
        shotId,
        provider: this.name,
        success: false,
        error: err.message,
      };
    }
  }
}
