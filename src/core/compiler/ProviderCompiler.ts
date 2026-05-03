// ============================================================================
// OpsV v0.8 Provider Compiler Interface
// ============================================================================

import { Job, TaskJson } from '../../types/Job';
import { ModelConfig } from '../../utils/configLoader';

export interface CompileContext {
  job: Job;
  modelKey: string;
  modelConfig: ModelConfig;
  apiKey: string;
  outputDir: string;
  projectRoot?: string;
  referenceImages?: string[];
  referenceVideos?: string[];
  referenceAudios?: string[];
  workflowPath?: string;
  workflowDir?: string;
  refCount?: number;
}

export interface ProviderCompiler {
  readonly provider: string;

  compile(ctx: CompileContext): TaskJson;
}
