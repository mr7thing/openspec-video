import { z } from 'zod';

// ============================================================================
// OpsV v0.8 Job Type
// ============================================================================

export type JobType = 'imagen' | 'video' | 'audio' | 'comfy' | 'webapp';

export interface FrameRef {
  first: string | null;
  last: string | null;
}

export interface GlobalSettings {
  aspect_ratio: string;
  quality: string;
}

export interface PromptPayload {
  prompt?: string;
  global_settings: GlobalSettings;
  camera?: { type: string; motion: string };
  duration?: string;
  frame_ref?: FrameRef;
  extra?: { media_refs: string[] };
}

export interface Job {
  id: string;
  type: JobType;
  prompt_en?: string;
  payload: PromptPayload;
  reference_images?: string[];
  reference_videos?: string[];
  reference_audios?: string[];
  output_path?: string;
  seed?: number;
  _meta?: JobMeta;
}

export interface JobMeta {
  circle: string;
  source: string;
  batch?: number;
}

export interface TaskJson {
  [key: string]: any;
  _opsv: {
    provider: string;
    modelKey: string;
    type: JobType;
    shotId: string;
    api_url: string;
    api_status_url?: string;
    references?: string[];
    workflowFile?: string;
    compiledAt: string;
  };
}
