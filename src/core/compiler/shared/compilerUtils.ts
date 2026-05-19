// ============================================================================
// OpsV Shared Compiler Utilities
// Extracted from duplicated logic across provider compilers
// ============================================================================

import { Job } from '../../../types/Job';
import { ModelConfig } from '../../../utils/configLoader';

/**
 * Resolve the value for a node mapping key using OpsV naming conventions.
 * Shared by ComfyUICompiler and RunningHubCompiler.
 *
 * Resolution order: prompt > negative_prompt > imageN > first_frame > last_frame > extra > defaults
 */
export function resolveNodeMappingValue(
  key: string,
  job: Job,
  refImages: string[],
  modelConfig: ModelConfig,
): any {
  if (key === 'prompt') {
    return job.prompt || job.payload.prompt;
  }
  if (key === 'negative_prompt') {
    return job.payload.extra?.negative_prompt || modelConfig.defaults?.negative_prompt;
  }
  if (/^image\d+$/.test(key)) {
    const idx = parseInt(key.replace('image', ''), 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < refImages.length) {
      return refImages[idx];
    }
    return undefined;
  }
  if (key === 'first_frame') {
    return job.payload.frame_ref?.first;
  }
  if (key === 'last_frame') {
    return job.payload.frame_ref?.last;
  }
  if (job.payload.extra && key in job.payload.extra && key !== 'media_refs') {
    return job.payload.extra[key];
  }
  if (modelConfig.defaults && key in modelConfig.defaults) {
    return (modelConfig.defaults as any)[key];
  }
  return undefined;
}

/**
 * Resolve image size from global settings and model config.
 * Shared by SiliconFlowCompiler and VolcengineCompiler.
 *
 * @param sizeField - Config field to check first: 'image_size' or 'size'
 */
export function resolveSize(
  globalSettings: any,
  modelConfig: ModelConfig,
  sizeField: 'image_size' | 'size' = 'size',
): string {
  if ((modelConfig.defaults as any)?.[sizeField]) {
    return (modelConfig.defaults as any)[sizeField];
  }

  const quality = globalSettings?.quality || 'standard';
  if (modelConfig.quality_map && modelConfig.quality_map[quality]) {
    return modelConfig.quality_map[quality];
  }

  const aspect = globalSettings?.aspect_ratio || '1:1';
  const sizeMap: Record<string, string> = {
    '1:1': '1024x1024',
    '16:9': '1920x1080',
    '9:16': '1080x1920',
    '4:3': '1024x768',
    '3:4': '768x1024',
  };
  return sizeMap[aspect] || '1024x1024';
}

/**
 * Parse and normalize duration value from payload or config defaults.
 * Shared by MinimaxCompiler and VolcengineCompiler.
 */
export function resolveDuration(
  job: Job,
  modelConfig: ModelConfig,
): number | string | undefined {
  const duration = job.payload.duration || modelConfig.defaults?.duration;
  if (duration === undefined || duration === null) return undefined;
  const durationStr = String(duration);
  const durationNum = parseInt(durationStr, 10);
  return isNaN(durationNum) ? duration : durationNum;
}
