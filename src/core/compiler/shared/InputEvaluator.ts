// ============================================================================
// OpsV InputEvaluator — Evaluate api_config inputs → resolved values
// Replaces resolveNodeMappingValue() with configurable source paths
// ============================================================================

import { Job } from '../../../types/Job';
import { ModelConfig, InputBinding } from '../../../utils/configLoader';
import { logger } from '../../../utils/logger';

export interface InputEvalContext {
  job: Job;
  modelConfig: ModelConfig;
  referenceImages?: string[];
  referenceVideos?: string[];
  referenceAudios?: string[];
}

// ============================================================================
// evaluateSource: resolve a single source shortcut path → value
// ============================================================================

export function evaluateSource(source: string, ctx: InputEvalContext): unknown {
  const { job, modelConfig } = ctx;

  // Shorthand shortcuts (no dot separator)
  if (source === 'prompt') {
    return job.prompt || job.payload.prompt;
  }
  if (source === 'negative_prompt') {
    return job.payload.extra?.negative_prompt || modelConfig.defaults?.negative_prompt;
  }
  if (source === 'first_frame') {
    return job.payload.frame_ref?.first;
  }
  if (source === 'last_frame') {
    return job.payload.frame_ref?.last;
  }

  // reference_images[N] or reference_images
  if (source === 'reference_images') {
    return ctx.referenceImages || job.reference_images || [];
  }
  const refImgMatch = source.match(/^reference_images\[(\d+)\]$/);
  if (refImgMatch) {
    const idx = parseInt(refImgMatch[1], 10);
    const imgs = ctx.referenceImages || job.reference_images || [];
    return idx < imgs.length ? imgs[idx] : undefined;
  }

  // reference_videos[N] or reference_videos
  if (source === 'reference_videos') {
    return ctx.referenceVideos || job.reference_videos || [];
  }
  const refVidMatch = source.match(/^reference_videos\[(\d+)\]$/);
  if (refVidMatch) {
    const idx = parseInt(refVidMatch[1], 10);
    const vids = ctx.referenceVideos || job.reference_videos || [];
    return idx < vids.length ? vids[idx] : undefined;
  }

  // reference_audios[N] or reference_audios
  if (source === 'reference_audios') {
    return ctx.referenceAudios || job.reference_audios || [];
  }
  const refAudMatch = source.match(/^reference_audios\[(\d+)\]$/);
  if (refAudMatch) {
    const idx = parseInt(refAudMatch[1], 10);
    const auds = ctx.referenceAudios || job.reference_audios || [];
    return idx < auds.length ? auds[idx] : undefined;
  }

  // job.payload.X — dot-path into payload
  if (source.startsWith('job.payload.')) {
    return resolveDotPath(job, source.slice('job.'.length));
  }

  // job.payload.extra.X
  if (source.startsWith('job.payload.extra.')) {
    return job.payload.extra?.[source.slice('job.payload.extra.'.length)];
  }

  // job.payload.frame_ref.first / last
  if (source === 'job.payload.frame_ref.first') {
    return job.payload.frame_ref?.first;
  }
  if (source === 'job.payload.frame_ref.last') {
    return job.payload.frame_ref?.last;
  }

  // default.X — model config defaults
  if (source.startsWith('default.')) {
    return modelConfig.defaults?.[source.slice('default.'.length)];
  }

  logger.warn(`InputEvaluator: unknown source path "${source}"`);
  return undefined;
}

// ============================================================================
// evaluateInputs: evaluate all inputs config → Record<string, unknown>
// ============================================================================

export function evaluateInputs(
  inputs: Record<string, InputBinding>,
  ctx: InputEvalContext,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const [key, binding] of Object.entries(inputs)) {
    const value = evaluateSource(binding.source, ctx);
    if (value !== undefined && value !== null) {
      values[key] = value;
    }
  }

  return values;
}

// ============================================================================
// applyToPayload: inject evaluated values into API payload by target path
// For non-node-mapping compilers (Volcengine, SiliconFlow, Minimax)
// ============================================================================

export function applyToPayload(
  values: Record<string, unknown>,
  inputs: Record<string, InputBinding>,
  payload: Record<string, any>,
): void {
  for (const [key, value] of Object.entries(values)) {
    const target = inputs[key]?.target;
    if (!target) {
      // No target specified — set directly on payload at key
      payload[key] = value;
      continue;
    }

    // Parse target: e.g. "content[].image_url" → push to content array entries
    const arrayMatch = target.match(/^(\w+)\[\]\.(\w+)$/);
    if (arrayMatch) {
      const [, arrayKey, field] = arrayMatch;
      if (!payload[arrayKey]) payload[arrayKey] = [];
      const arr = payload[arrayKey];

      if (Array.isArray(value)) {
        for (const item of value) {
          arr.push({ type: inferTypeFromField(field), [field]: { url: item }, role: inferRole(key) });
        }
      } else {
        arr.push({ type: inferTypeFromField(field), [field]: { url: value }, role: inferRole(key) });
      }
      continue;
    }

    // Parse target: e.g. "content[0].text" → set on specific array index
    const indexMatch = target.match(/^(\w+)\[(\d+)\]\.(\w+)$/);
    if (indexMatch) {
      const [, arrayKey, idxStr, field] = indexMatch;
      const idx = parseInt(idxStr, 10);
      if (!payload[arrayKey]) payload[arrayKey] = [];
      const arr = payload[arrayKey];
      while (arr.length <= idx) arr.push({});
      arr[idx][field] = value;
      continue;
    }

    // Simple dot path
    setDotPath(payload, target, value);
  }
}

// ============================================================================
// applyToNodeMapping: inject evaluated values into workflow by node mapping
// For node-mapping compilers (ComfyUI, RunningHub)
// ============================================================================

export function applyToNodeMapping(
  values: Record<string, unknown>,
  nodeMapping: Record<string, { nodeId: string; fieldName: string }>,
  workflow: Record<string, any>,
): void {
  for (const [key, value] of Object.entries(values)) {
    const mapping = nodeMapping[key];
    if (!mapping) continue;

    const node = workflow[mapping.nodeId];
    if (!node) {
      logger.warn(`InputEvaluator: nodeId "${mapping.nodeId}" not found in workflow for key "${key}"`);
      continue;
    }
    if (!node.inputs) node.inputs = {};
    node.inputs[mapping.fieldName] = value;
  }
}

// Build RunningHub nodeInfoList from evaluated values + node mapping
export function buildNodeInfoList(
  values: Record<string, unknown>,
  nodeMapping: Record<string, { nodeId: string; fieldName: string }>,
): Array<{ nodeId: string; fieldName: string; fieldValue: unknown }> {
  const result: Array<{ nodeId: string; fieldName: string; fieldValue: unknown }> = [];
  for (const [key, value] of Object.entries(values)) {
    const mapping = nodeMapping[key];
    if (!mapping) continue;
    result.push({ nodeId: mapping.nodeId, fieldName: mapping.fieldName, fieldValue: value });
  }
  return result;
}

// ============================================================================
// Helpers
// ============================================================================

function resolveDotPath(obj: any, path: string): unknown {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

function setDotPath(obj: Record<string, any>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current)) current[parts[i]] = {};
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

function inferTypeFromField(field: string): string {
  if (field.includes('image')) return 'image_url';
  if (field.includes('video')) return 'video_url';
  if (field.includes('audio')) return 'audio_url';
  return 'text';
}

function inferRole(key: string): string {
  if (key === 'first_frame') return 'first_frame';
  if (key === 'last_frame') return 'last_frame';
  if (key.includes('image')) return 'reference_image';
  if (key.includes('video')) return 'reference_video';
  if (key.includes('audio')) return 'reference_audio';
  return key;
}
