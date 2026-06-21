// ============================================================================
// OpsV Job Type
// ============================================================================

import { z } from 'zod';

export type JobType = 'imagen' | 'video' | 'audio' | 'comfy' | 'webapp';

export interface FrameRef {
  first: string | null;
  last: string | null;
}

export interface VideoSettings {
  aspect_ratio: string;
  quality: string;
}

export interface PromptExtra {
  media_refs: string[];
  negative_prompt?: string;
  [key: string]: unknown;
}

export interface PromptPayload {
  prompt?: string;
  global_settings: VideoSettings;
  camera?: { type: string; motion: string };
  duration?: string;
  frame_ref?: FrameRef;
  extra?: PromptExtra;
}

export interface Job {
  id: string;
  type: JobType;
  prompt?: string;
  payload: PromptPayload;
  reference_images?: string[];
  reference_videos?: string[];
  reference_audios?: string[];
  output_path?: string;
  seed?: number;
  workflow?: string;
  workflow_id?: string;
  workflow_path?: string;
  node_mapping?: Record<string, { nodeId: string; fieldName: string }>;
  _meta?: JobMeta;
}

export interface JobMeta {
  circle: string;
  source: string;
  batch?: number;
}

export interface TaskMeta {
  provider: string;
  modelKey: string;
  type: JobType;
  shotId: string;
  api_url: string;
  api_status_url?: string;
  references?: string[];
  workflowId?: string;
  workflowFile?: string;
  compiledAt: string;
}

export interface BaseTaskJson<TPayload = unknown> {
  payload: TPayload;
  _opsv: TaskMeta;
}

// Legacy alias for gradual migration (tests will use BaseTaskJson)
export type TaskJson = BaseTaskJson<Record<string, unknown>>;
