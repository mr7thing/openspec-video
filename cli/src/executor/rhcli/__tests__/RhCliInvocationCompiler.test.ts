import fs from 'fs';
import os from 'os';
import path from 'path';
import { RhCliInvocationCompiler } from '../RhCliInvocationCompiler';
import { ModelConfig } from '../../../utils/configLoader';

function tempFile(dir: string, name: string): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, 'fixture');
  return file;
}

function modelConfig(rh: ModelConfig['rh']): ModelConfig {
  return { provider: 'rhcli', type: 'video', rh };
}

function compile(config: ModelConfig, payload: Record<string, unknown>) {
  return new RhCliInvocationCompiler().compile({
    modelConfig: config, payload, outputDir: '/tmp/rh-out', binary: '/opt/rh', apiKey: 'key',
  });
}

describe('RhCliInvocationCompiler', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhcli-invocation-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('requires an explicit app ignore rule rather than dropping an unmapped payload field', () => {
    const cfg = modelConfig({ mode: 'app', app_id: '123' });
    cfg.node_mappings = { prompt: { nodeId: '52', fieldName: 'prompt' } };

    expect(() => compile(cfg, { prompt: 'hello', seed: 7 })).toThrow(/no node_mapping/);

    cfg.rh!.ignorable_inputs = ['seed'];
    expect(compile(cfg, { prompt: 'hello', seed: 7 }).nodes).toEqual(['52:prompt=hello']);
  });

  it('rejects template app ids at the execution seam too', () => {
    expect(() => compile(modelConfig({ mode: 'app', app_id: 'REPLACE_WITH_WEBAPP_ID' }), {}))
      .toThrow(/real rh.app_id/);
  });

  it('rejects model media overflow, unknown extensions, and nested media arrays', () => {
    const one = tempFile(dir, 'one.mp4');
    const two = tempFile(dir, 'two.mp4');
    const unknown = tempFile(dir, 'input.pdf');
    const cfg = modelConfig({ mode: 'model', endpoint_id: 'ns/video' });

    expect(() => compile(cfg, { primary: one, secondary: two })).toThrow(/media overflow/);
    expect(() => compile(cfg, { attachment: unknown })).toThrow(/unsupported local media/);
    expect(() => compile(cfg, { refs: [[one]] })).toThrow(/media overflow|nested arrays/);
  });

  it('treats media_bindings as a complete local-media allowlist and validates kind/cardinality', () => {
    const image = tempFile(dir, 'frame.png');
    const video = tempFile(dir, 'motion.mp4');
    const cfg = modelConfig({
      mode: 'model', endpoint_id: 'ns/video',
      media_bindings: { imageUrls: { kind: 'image', target: 'images', cardinality: { max: 1 } } },
    });

    expect(() => compile(cfg, { imageUrls: image, videoUrl: video })).toThrow(/no rh.media_bindings declaration/);
    expect(() => compile(cfg, { imageUrls: [image, image] })).toThrow(/expects 0-1 local image/);
    expect(() => compile(cfg, { imageUrls: video })).toThrow(/expects image/);
    expect(compile(cfg, { imageUrls: image }).images).toEqual([image]);
  });
});
