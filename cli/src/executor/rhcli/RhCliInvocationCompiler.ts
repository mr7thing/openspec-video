import fs from 'fs';
import path from 'path';
import { ModelConfig } from '../../utils/configLoader';
import { RhCliError, RhRunOpts, partitionModelPayload } from '../rh-runner/index';

export interface RhCliInvocationInput {
  modelConfig: ModelConfig;
  payload: Record<string, unknown>;
  outputDir: string;
  binary: string;
  apiKey: string;
}

/** Compiles Asset Task payload semantics to argv-neutral RhRunOpts. */
export class RhCliInvocationCompiler {
  compile(input: RhCliInvocationInput): RhRunOpts {
    const rh = input.modelConfig.rh || {};
    const mode = rh.mode || 'model';
    if (mode === 'app') return this.compileApp(input);
    return this.compileModel(input);
  }

  private compileApp(input: RhCliInvocationInput): RhRunOpts {
    const rh = input.modelConfig.rh || {};
    if (!rh.app_id || /^REPLACE_WITH_/i.test(rh.app_id)) {
      throw new RhCliError('cli-error', 'rhcli app mode requires a real rh.app_id; template placeholders cannot execute.');
    }
    const ignorable = new Set(rh.ignorable_inputs || []);
    const mappings = input.modelConfig.node_mappings || {};
    const nodes: string[] = [];
    const files: string[] = [];
    for (const [key, value] of Object.entries(input.payload)) {
      if (value === undefined || value === null) continue;
      const mapping = mappings[key];
      if (!mapping) {
        if (ignorable.has(key)) continue;
        throw new RhCliError('cli-error', `rhcli app mode: non-empty payload key '${key}' has no node_mapping.`);
      }
      if (!mapping.nodeId || !mapping.fieldName) {
        throw new RhCliError('cli-error', `rhcli app mode: invalid node_mapping for '${key}'; nodeId and fieldName are required.`);
      }
      const target = `${mapping.nodeId}:${mapping.fieldName}`;
      const values = Array.isArray(value) ? value : [value];
      if (values.some(Array.isArray)) {
        throw new RhCliError('cli-error', `rhcli app mode: nested arrays are not supported for '${key}'.`);
      }
      for (const v of values) {
        if (isLocalFile(v)) files.push(`${target}=${v}`);
        else nodes.push(`${target}=${serialize(v)}`);
      }
    }
    return { mode: 'app', appId: rh.app_id, instanceType: rh.instance_type, nodes, files,
      outputDir: input.outputDir, binary: input.binary, apiKey: input.apiKey,
      timeoutMs: input.modelConfig.max_poll_duration };
  }

  private compileModel(input: RhCliInvocationInput): RhRunOpts {
    const rh = input.modelConfig.rh || {};
    if (!rh.endpoint_id) throw new RhCliError('cli-error', 'rhcli model mode requires rh.endpoint_id.');
    if (hasNestedLocalMediaArray(input.payload)) {
      throw new RhCliError('cli-error', 'rhcli model mode does not support nested arrays containing local media files.');
    }
    const parts = partitionModelPayload(input.payload);
    if (parts.overflow.length > 0) {
      throw new RhCliError('cli-error', `rhcli model mode has media overflow (${parts.overflow.join(', ')}); declare media_bindings or reduce to RH CLI slot capacity.`);
    }
    const unknown = collectUnknownLocalFiles(input.payload);
    if (unknown.length > 0) {
      throw new RhCliError('cli-error', `rhcli model mode has unsupported local media file(s): ${unknown.join(', ')}.`);
    }
    if (rh.media_bindings) validateBindings(input.payload, rh.media_bindings, parts);
    const params = { ...parts.params };
    const prompt = typeof params.prompt === 'string' ? params.prompt : undefined;
    if (prompt !== undefined) delete params.prompt;
    return { mode: 'model', endpointId: rh.endpoint_id, prompt, params, images: parts.images,
      video: parts.video, audio: parts.audio, outputDir: input.outputDir, binary: input.binary,
      apiKey: input.apiKey, timeoutMs: input.modelConfig.max_poll_duration };
  }
}

function validateBindings(payload: Record<string, unknown>, bindings: NonNullable<ModelConfig['rh']>['media_bindings'], parts: ReturnType<typeof partitionModelPayload>): void {
  // Once bindings are declared, they are the complete allowlist for local
  // media. This prevents a newly-added payload key from silently changing the
  // argv media surface simply because its value happens to be a local file.
  for (const [field, raw] of Object.entries(payload)) {
    if (!containsLocalFile(raw)) continue;
    if (!bindings?.[field]) {
      throw new RhCliError('cli-error', `rhcli model mode: local media payload key '${field}' has no rh.media_bindings declaration.`);
    }
  }

  for (const [field, binding] of Object.entries(bindings || {})) {
    const expectedTarget = binding.kind === 'image' ? 'images' : binding.kind;
    if (binding.target && binding.target !== expectedTarget) {
      throw new RhCliError('cli-error', `rhcli media binding '${field}' has incompatible target '${binding.target}' for ${binding.kind}; expected '${expectedTarget}'.`);
    }
    const raw = payload[field];
    if (raw === undefined || raw === null || !containsLocalFile(raw)) continue;
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.some(Array.isArray)) throw new RhCliError('cli-error', `rhcli media binding '${field}' does not support nested arrays.`);
    const local = values.filter(isLocalFile);
    const min = binding.cardinality?.min ?? 0;
    const max = binding.cardinality?.max ?? (binding.kind === 'image' ? Number.MAX_SAFE_INTEGER : 1);
    if (local.length < min || local.length > max) {
      throw new RhCliError('cli-error', `rhcli media binding '${field}' expects ${min}${max === Number.MAX_SAFE_INTEGER ? '+' : `-${max}`} local ${binding.kind} file(s), got ${local.length}.`);
    }
    for (const file of local) {
      const ext = path.extname(file).slice(1).toLowerCase();
      if (!matchesKind(ext, binding.kind)) throw new RhCliError('cli-error', `rhcli media binding '${field}' expects ${binding.kind}, got '${file}'.`);
    }
  }
  if ((parts.video && countLocalKind(payload, 'video') > 1) || (parts.audio && countLocalKind(payload, 'audio') > 1)) {
    throw new RhCliError('cli-error', 'rhcli model mode only supports one video and one audio runner slot unless the upstream CLI exposes more slots.');
  }
}

function hasNestedLocalMediaArray(value: unknown, nested = false): boolean {
  if (Array.isArray(value)) {
    if (nested && containsLocalFile(value)) return true;
    return value.some((item) => hasNestedLocalMediaArray(item, true));
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) => hasNestedLocalMediaArray(item, false));
  }
  return false;
}
function isLocalFile(value: unknown): value is string {
  return typeof value === 'string' && !/^https?:\/\//i.test(value) && !value.startsWith('data:') && fs.existsSync(value) && fs.statSync(value).isFile();
}
function containsLocalFile(value: unknown): boolean { return isLocalFile(value) || (Array.isArray(value) && value.some(containsLocalFile)); }
function serialize(value: unknown): string { return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value); }
function matchesKind(ext: string, kind: string): boolean {
  const map: Record<string, Set<string>> = {
    image: new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff']),
    video: new Set(['mp4', 'mov', 'webm', 'mkv', 'avi']),
    audio: new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac']),
  };
  return map[kind]?.has(ext) || false;
}
function collectUnknownLocalFiles(value: unknown): string[] {
  const result: string[] = [];
  const visit = (v: unknown): void => {
    if (isLocalFile(v)) { const ext = path.extname(v).slice(1).toLowerCase(); if (!matchesKind(ext, 'image') && !matchesKind(ext, 'video') && !matchesKind(ext, 'audio')) result.push(v); }
    else if (Array.isArray(v)) v.forEach(visit);
  };
  if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(visit);
  return result;
}
function countLocalKind(value: unknown, kind: 'video' | 'audio'): number {
  let n = 0;
  const visit = (v: unknown): void => { if (isLocalFile(v) && matchesKind(path.extname(v).slice(1).toLowerCase(), kind)) n++; else if (Array.isArray(v)) v.forEach(visit); };
  if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(visit);
  return n;
}
