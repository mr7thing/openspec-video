// ============================================================================
// OpsV Provider Compiler Interface (v0.10.0)
// ============================================================================

import { Job, BaseTaskJson } from '../../types/Job';
import { ModelConfig } from '../../utils/configLoader';
import { ResolvedRef } from '../../types/FrontmatterSchema';
import { PromptCompileMode } from '../../types/Refs';

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
  /** Bound refs from frontmatter (v0.10.0) */
  resolvedRefs?: ResolvedRef[];
  /** Type-grouped paths derived from resolvedRefs */
  groupedInputs?: Record<string, string[]>;
  /** Override prompt compilation mode */
  promptCompileMode?: PromptCompileMode;
}

export interface ProviderCompiler {
  readonly provider: string;
  compile(ctx: CompileContext): BaseTaskJson<unknown>;
}
