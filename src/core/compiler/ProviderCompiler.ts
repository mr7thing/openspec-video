// ============================================================================
// OpsV v0.8 Provider Compiler Interface
// ============================================================================

import { Job, TaskJson } from '../../types/Job';
import { ModelConfig } from '../../utils/configLoader';

export interface CompileContext {
  job: Job;
  modelConfig: ModelConfig;
  apiKey: string;
  outputDir: string;
  referenceImages?: string[];
  workflowPath?: string;
  workflowDir?: string;
  refCount?: number;
}

export interface ProviderCompiler {
  readonly provider: string;

  compile(ctx: CompileContext): TaskJson;
}
