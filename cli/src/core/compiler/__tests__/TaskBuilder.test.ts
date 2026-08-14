import path from 'path';
import os from 'os';
import fs from 'fs';
import { TaskBuilder } from '../TaskBuilder';
import { Job } from '../../../types/Job';
import { OpsVContext } from '../../../container/OpsVContext';
import { ConfigError, CompilationError } from '../../../errors/OpsVError';
import type { ProductionTask } from '../../../canonical/compiler/ProductionTaskCompiler';

jest.mock('../../../container/OpsVContext');

describe('TaskBuilder', () => {
  let tmpDir: string;
  let ctx: jest.Mocked<OpsVContext>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-tb-'));
    const mockConfigLoader = {
      getModelConfig: jest.fn(),
      getResolvedApiKey: jest.fn().mockReturnValue('test-key'),
    };
    ctx = {
      projectRoot: tmpDir,
      configLoader: mockConfigLoader,
    } as any;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const mockJob: Job = {
    id: 'hero',
    type: 'imagen',
    prompt: 'A hero',
    payload: {
      prompt: 'A hero',
      global_settings: { aspect_ratio: '16:9', quality: 'high' },
    },
  };

  it('throws if model not found', async () => {
    (ctx.configLoader.getModelConfig as jest.Mock).mockReturnValue(undefined);
    const builder = new TaskBuilder(ctx);
    await expect(builder.compileToDir([mockJob], 'unknown.model', tmpDir)).rejects.toThrow(ConfigError);
  });

  it('throws for unknown provider', async () => {
    (ctx.configLoader.getModelConfig as jest.Mock).mockReturnValue({ provider: 'unknown_xyz' } as any);
    const builder = new TaskBuilder(ctx);
    await expect(builder.compileToDir([mockJob], 'unknown_xyz.model', tmpDir)).rejects.toThrow(CompilationError);
  });

  it('compiles job to output dir', async () => {
    (ctx.configLoader.getModelConfig as jest.Mock).mockReturnValue({
      provider: 'volcengine',
      type: 'imagen',
      api_url: 'http://api',
      model: 'seadream5',
    } as any);

    const builder = new TaskBuilder(ctx);
    const outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const results = await builder.compileToDir([mockJob], 'volc.seadream5', outDir);

    expect(results).toHaveLength(1);
    expect(results[0]._opsv.shotId).toBe('hero');
    expect(results[0]._opsv.provider).toBe('volcengine');
    expect(fs.existsSync(path.join(outDir, 'hero.json'))).toBe(true);
  });

  it('dry run does not write files', async () => {
    (ctx.configLoader.getModelConfig as jest.Mock).mockReturnValue({
      provider: 'volcengine',
      type: 'imagen',
      api_url: 'http://api',
      model: 'seadream5',
    } as any);

    const builder = new TaskBuilder(ctx);
    const outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    const results = await builder.compileToDir([mockJob], 'volc.seadream5', outDir, true);

    expect(results).toHaveLength(1);
    expect(fs.existsSync(path.join(outDir, 'hero.json'))).toBe(false);
  });


  it('compiles a frozen Production Task without rereading its source document', async () => {
    (ctx.configLoader.getModelConfig as jest.Mock).mockReturnValue({
      provider: 'volcengine',
      type: 'imagen',
      api_url: 'http://api',
      model: 'seadream5',
    } as any);

    const sourcePath = path.join(tmpDir, 'source.md');
    fs.writeFileSync(sourcePath, [
      '---',
      'id: hero',
      'refs:',
      '  image:',
      '    "@missing": []',
      '---',
      '',
      'Mutable source prompt',
    ].join('\n'));

    const task: ProductionTask = Object.freeze({
      schema: 'opsv.production-task',
      version: 1,
      id: 'hero',
      revision: `sha256:${'4'.repeat(64)}`,
      digest: `sha256:${'4'.repeat(64)}`,
      snapshotDigest: `sha256:${'3'.repeat(64)}`,
      source: { path: 'source.md', digest: `sha256:${'1'.repeat(64)}` },
      capability: 'image-generation',
      boundModel: 'volc.seadream5',
      outputs: ['image'],
      references: [],
      production: {
        type: 'imagen' as const,
        prompt: 'Frozen prompt',
        payload: {
          prompt: 'Frozen prompt',
          global_settings: { aspect_ratio: '16:9', quality: 'high' },
        },
        references: { image: [], video: [], audio: [] },
      },
    });

    const builder = new TaskBuilder(ctx);
    const outDir = path.join(tmpDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const readSpy = jest.spyOn(fs, 'readFileSync');

    try {
      const results = await builder.compileProductionTasksToDir([task], 'volc.seadream5', outDir);

      expect(results[0].payload).toMatchObject({ prompt: 'Frozen prompt' });
      expect(results[0]._opsv.canonical).toMatchObject({
        taskId: 'hero',
        taskRevision: task.revision,
        taskDigest: task.digest,
        snapshotDigest: task.snapshotDigest,
        sourceDigest: task.source.digest,
        schemaVersion: 1,
      });
      expect(readSpy.mock.calls.some(([file]) => file === sourcePath)).toBe(false);
    } finally {
      readSpy.mockRestore();
    }
  });

  it('rejects canonical model mismatches, duplicate ids, and execution-time workflow overrides', async () => {
    const task: ProductionTask = {
      schema: 'opsv.production-task',
      version: 1,
      id: 'guarded-task',
      revision: `sha256:${'4'.repeat(64)}`,
      digest: `sha256:${'4'.repeat(64)}`,
      snapshotDigest: `sha256:${'3'.repeat(64)}`,
      source: { path: 'source.md', digest: `sha256:${'1'.repeat(64)}` },
      boundModel: 'volc.seadream5',
      outputs: ['image'],
      references: [],
      production: {
        type: 'imagen',
        prompt: 'Frozen prompt',
        payload: {
          prompt: 'Frozen prompt',
          global_settings: { aspect_ratio: '16:9', quality: 'high' },
        },
        references: { image: [], video: [], audio: [] },
      },
    };
    const builder = new TaskBuilder(ctx);
    const outputDir = path.join(tmpDir, 'out');

    await expect(builder.compileProductionTasksToDir(
      [task],
      'volc.other-model',
      outputDir,
      true,
    )).rejects.toThrow(/bound to model/);
    await expect(builder.compileProductionTasksToDir(
      [task, task],
      'volc.seadream5',
      outputDir,
      true,
    )).rejects.toThrow(/Duplicate Production Task id/);
    await expect(builder.compileProductionTasksToDir(
      [task],
      'volc.seadream5',
      outputDir,
      true,
      'workflows/late-override.json',
    )).rejects.toThrow(/execution-time workflow override/);
  });

  it('rejects a canonical local reference that disappeared after Snapshot compilation', async () => {
    (ctx.configLoader.getModelConfig as jest.Mock).mockReturnValue({
      provider: 'volcengine',
      type: 'imagen',
      api_url: 'http://api',
      model: 'seadream5',
    } as any);

    const task: ProductionTask = {
      schema: 'opsv.production-task',
      version: 1,
      id: 'missing-reference',
      revision: `sha256:${'4'.repeat(64)}`,
      digest: `sha256:${'4'.repeat(64)}`,
      snapshotDigest: `sha256:${'3'.repeat(64)}`,
      source: { path: 'source.md', digest: `sha256:${'1'.repeat(64)}` },
      capability: 'image-generation',
      boundModel: 'volc.seadream5',
      outputs: ['image'],
      references: [{
        kind: 'image',
        uri: 'deleted.png',
        digest: `sha256:${'2'.repeat(64)}`,
      }],
      production: {
        type: 'imagen',
        prompt: 'Frozen prompt',
        payload: {
          prompt: 'Frozen prompt',
          global_settings: { aspect_ratio: '16:9', quality: 'high' },
        },
        references: { image: ['deleted.png'], video: [], audio: [] },
      },
    };

    const builder = new TaskBuilder(ctx);
    await expect(builder.compileProductionTasksToDir(
      [task],
      'volc.seadream5',
      path.join(tmpDir, 'out'),
      true,
    )).rejects.toThrow(/no longer an existing file/);
  });

  describe('parseModelKey', () => {
    it('parses provider.model format', () => {
      expect(TaskBuilder.parseModelKey('volc.seadream5')).toEqual({ provider: 'volc', model: 'seadream5' });
    });

    it('throws on invalid format', () => {
      expect(() => TaskBuilder.parseModelKey('nodot')).toThrow(CompilationError);
      expect(() => TaskBuilder.parseModelKey('.leadingdot')).toThrow(CompilationError);
    });
  });
});
