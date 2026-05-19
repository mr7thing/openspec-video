// ============================================================================
// OpsV Provider Compiler Interface
// ============================================================================

import { Job, BaseTaskJson } from '../../types/Job';
import { ModelConfig } from '../../utils/configLoader';
import { ResolvedRef, TypedSectionRef } from '../../types/FrontmatterSchema';

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
  nodeMapping?: Record<string, { nodeId: string; fieldName: string }>;
  forceApiMapping?: boolean;
  resolvedRefs?: ResolvedRef[];
  typedSectionRefs?: TypedSectionRef[];
  groupedInputs?: Record<string, string[]>;
}

export interface ProviderCompiler {
  readonly provider: string;
  compile(ctx: CompileContext): BaseTaskJson<unknown>;
}
