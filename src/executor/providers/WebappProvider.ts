// ============================================================================
// OpsV Webapp Executor Provider (Browser automation via Gemini)
// ============================================================================

import { BaseTaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { ProviderExecutor } from '../../container/Container';
import { OpsVContext } from '../../container/OpsVContext';
import { logger } from '../../utils/logger';
import { ExecutionError, OpsVErrorCode } from '../../errors/OpsVError';

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
      const apiKey = ctx.configLoader.getResolvedApiKey(meta.modelKey);
      const modelConfig = ctx.configLoader.getModelConfig(meta.modelKey);

      logger.info(`[Webapp] Executing ${shotId} via Gemini/browser automation`);

      // Webapp execution is provider-specific and does not fit the submit/poll/download pattern.
      // Concrete implementation depends on the browser extension integration.
      // Placeholder for actual implementation:
      const payload = { ...task.payload };

      // TODO: integrate with tunnel/CloudClient for browser automation
      logger.warn(`[Webapp] Provider execute is a placeholder. Payload: ${JSON.stringify(payload).slice(0, 200)}`);

      return {
        taskPath,
        shotId,
        provider: this.name,
        success: true,
        outputPath: taskPath.replace('.json', '_output.txt'),
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
