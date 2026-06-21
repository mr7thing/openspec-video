import path from 'path';
import os from 'os';
import fs from 'fs';
import { TaskBuilder } from '../TaskBuilder';
import { Job } from '../../../types/Job';
import { OpsVContext } from '../../../container/OpsVContext';
import { ConfigError, CompilationError } from '../../../errors/OpsVError';

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
