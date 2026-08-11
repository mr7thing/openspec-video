import fs from 'fs';
import os from 'os';
import path from 'path';
import { RhCliProvider } from '../RhCliProvider';
import { RhRunner, RhCliError, RhRunOpts, RhJsonResult, RhCliCheckResult } from '../../rh-runner/index';
import { BaseTaskJson } from '../../../types/Job';
import { OpsVContext } from '../../../container/OpsVContext';
import { appendLog, readLastLogEntry } from '../../polling';
import crypto from 'crypto';
import { RhCliRecoveryAdapter, RhRecoveryStatus } from '../../rhcli/RhCliRecoveryAdapter';

class MockRunner implements RhRunner {
  checkCalls = 0;
  runOpts: RhRunOpts[] = [];
  runImpl: (opts: RhRunOpts) => Promise<RhJsonResult> = async (opts) => {
    const f = path.join(opts.outputDir, 'result.png');
    fs.writeFileSync(f, 'img');
    return { files: [f], texts: [], cost: '0.50', duration: 42, task_id: 't1' };
  };

  async check(): Promise<RhCliCheckResult> {
    this.checkCalls++;
    return { status: 'ready', capabilities: ['json-check', 'model-run', 'app-run'] };
  }
  async run(opts: RhRunOpts): Promise<RhJsonResult> {
    this.runOpts.push(opts);
    return this.runImpl(opts);
  }
}

class MockRecoveryAdapter implements RhCliRecoveryAdapter {
  queryCalls = 0;
  downloadCalls = 0;
  constructor(private readonly status: Omit<RhRecoveryStatus, 'taskId'>) {}
  async query(input: { taskId: string }): Promise<RhRecoveryStatus> {
    this.queryCalls++;
    return { ...this.status, taskId: input.taskId };
  }
  async download(input: { resultUrls: readonly string[]; outputDir: string }): Promise<string[]> {
    this.downloadCalls++;
    const file = path.join(input.outputDir, 'recovered.png');
    fs.mkdirSync(input.outputDir, { recursive: true });
    fs.writeFileSync(file, 'recovered');
    return [file];
  }
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

describe('RhCliProvider', () => {
  let dir: string;
  let runner: MockRunner;
  let provider: RhCliProvider;
  let ctx: OpsVContext;
  let modelConfig: any;

  const makeTask = (payload: Record<string, unknown>): { task: BaseTaskJson<any>; taskPath: string } => {
    const taskPath = path.join(dir, 'shot01.json');
    const task: BaseTaskJson<any> = {
      payload,
      _opsv: {
        provider: 'rhcli',
        modelKey: 'rhcli.t2i',
        type: 'imagen',
        shotId: 'shot01',
        api_url: 'rhcli://model/ns/t2i',
        compiledAt: new Date().toISOString(),
      },
    };
    fs.writeFileSync(taskPath, JSON.stringify(task));
    return { task, taskPath };
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhcli-provider-test-'));
    runner = new MockRunner();
    provider = new RhCliProvider(runner);
    modelConfig = {
      provider: 'rhcli',
      type: 'imagen',
      required_env: ['RUNNINGHUB_API_KEY'],
      fallback_env: ['RH_API_KEY'],
      rh: { mode: 'model', endpoint_id: 'ns/t2i' },
    };
    ctx = {
      configLoader: {
        getModelConfig: jest.fn(() => modelConfig),
        getResolvedApiKey: jest.fn(() => 'resolved-key'),
      },
    } as any;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('success: moves artifact into opsv naming and logs cost/duration', async () => {
    const { task, taskPath } = makeTask({ prompt: 'a cat', resolution: '2k' });
    const result = await provider.execute(task, taskPath, ctx);

    expect(result.success).toBe(true);
    expect(result.outputPaths).toEqual([path.join(dir, 'shot01_1.png')]);
    expect(fs.existsSync(result.outputPaths![0])).toBe(true);

    // prompt lifted to -p, remaining payload as params
    const opts = runner.runOpts[0];
    expect(opts.mode).toBe('model');
    expect(opts.endpointId).toBe('ns/t2i');
    expect(opts.prompt).toBe('a cat');
    expect(opts.params).toEqual({ resolution: '2k' });
    expect(opts.apiKey).toBe('resolved-key');
    expect(opts.outputDir).toBe(path.join(dir, '.rh-out', 'shot01'));

    const last = readLastLogEntry(taskPath);
    expect(last?.event).toBe('succeeded');
    expect(last?.cost).toBe('0.50');
    expect(last?.duration).toBe(42);
  });

  it('runs availability check once per provider instance', async () => {
    const { task, taskPath } = makeTask({ prompt: 'x' });
    await provider.execute(task, taskPath, ctx);
    const task2 = { ...task };
    await provider.execute(task2, taskPath, ctx);
    expect(runner.checkCalls).toBe(1);
  });

  it('routes local media files to flags and URLs to params', async () => {
    const img = path.join(dir, 'frame.png');
    fs.writeFileSync(img, 'x');
    modelConfig.type = 'video';
    const { task, taskPath } = makeTask({
      prompt: 'animate',
      imageUrls: [img],
      refUrl: 'https://cdn.example.com/ref.mp4',
    });
    const result = await provider.execute(task, taskPath, ctx);
    expect(result.success).toBe(true);
    const opts = runner.runOpts[0];
    expect(opts.images).toEqual([img]);
    expect(opts.params).toEqual({ refUrl: 'https://cdn.example.com/ref.mp4' });
  });

  it('app mode: maps payload via node_mappings to --node/--file', async () => {
    modelConfig.rh = { mode: 'app', app_id: '999', instance_type: 'plus' };
    modelConfig.type = 'comfy';
    modelConfig.node_mappings = {
      prompt: { nodeId: '52', fieldName: 'prompt' },
      image: { nodeId: '39', fieldName: 'image' },
    };
    const img = path.join(dir, 'in.jpg');
    fs.writeFileSync(img, 'x');
    const { task, taskPath } = makeTask({ prompt: 'dance', image: img, orphan: 'ignored' });
    modelConfig.rh.ignorable_inputs = ['orphan'];

    const result = await provider.execute(task, taskPath, ctx);
    expect(result.success).toBe(true);
    const opts = runner.runOpts[0];
    expect(opts.mode).toBe('app');
    expect(opts.appId).toBe('999');
    expect(opts.instanceType).toBe('plus');
    expect(opts.nodes).toEqual(['52:prompt=dance']);
    expect(opts.files).toEqual([`39:image=${img}`]);
  });

  it('fails closed when an app payload key has no mapping or explicit ignore rule', async () => {
    modelConfig.rh = { mode: 'app', app_id: '999' };
    modelConfig.node_mappings = { prompt: { nodeId: '52', fieldName: 'prompt' } };
    const { task, taskPath } = makeTask({ prompt: 'dance', orphan: 'not safe to drop' });

    const result = await provider.execute(task, taskPath, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no node_mapping/);
    expect(runner.runOpts).toHaveLength(0);
  });

  it('preserves submitted-unknown and refuses a second subprocess run', async () => {
    runner.runImpl = async () => { throw new RhCliError('timeout', 'rh timed out'); };
    const first = makeTask({ prompt: 'x' });
    const firstResult = await provider.execute(first.task, first.taskPath, ctx);
    expect(firstResult.success).toBe(false);
    expect(firstResult.retryability).toBe('manual');
    expect(firstResult.fallbackability).toBe('manual');
    expect(readLastLogEntry(first.taskPath)).toMatchObject({ event: 'submitted-unknown', state: 'submitted-unknown' });

    const secondResult = await provider.execute(first.task, first.taskPath, ctx);
    expect(secondResult.success).toBe(false);
    expect(secondResult.error).toMatch(/Refusing automatic retry/);
    expect(runner.runOpts).toHaveLength(1);
  });

  it('recovers a matching verified task id without spawning rh', async () => {
    const payload = { prompt: 'recover me' };
    const { task, taskPath } = makeTask(payload);
    const recovery = new MockRecoveryAdapter({ state: 'completed', resultUrls: ['https://example.test/result.png'] });
    provider = new RhCliProvider(runner, undefined, recovery);
    appendLog(taskPath, {
      event: 'submitted-with-task-id', state: 'submitted-with-task-id', task_id: 'remote-task-123',
      provider: 'rhcli', model_key: 'rhcli.t2i', mode: 'model',
      payload_sha256: sha256(JSON.stringify(payload)), credential_scope: sha256('resolved-key'),
    });

    const result = await provider.execute(task, taskPath, ctx);

    expect(result.success).toBe(true);
    expect(recovery.queryCalls).toBe(1);
    expect(recovery.downloadCalls).toBe(1);
    expect(runner.runOpts).toHaveLength(0);
    expect(readLastLogEntry(taskPath)).toMatchObject({ event: 'succeeded', task_id: 'remote-task-123' });
  });

  it('does not call recovery for a legacy rhcli descriptor', async () => {
    const { task, taskPath } = makeTask({ prompt: 'legacy' });
    const recovery = new MockRecoveryAdapter({ state: 'completed', resultUrls: ['https://example.test/result.png'] });
    provider = new RhCliProvider(runner, undefined, recovery);
    appendLog(taskPath, { event: 'submitted', task_id: 'rhcli://model/ns/t2i' });

    const result = await provider.execute(task, taskPath, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/legacy checkpoint/);
    expect(recovery.queryCalls).toBe(0);
    expect(runner.runOpts).toHaveLength(0);
  });

  it('does not call recovery when checkpoint identity differs', async () => {
    const { task, taskPath } = makeTask({ prompt: 'changed' });
    const recovery = new MockRecoveryAdapter({ state: 'completed', resultUrls: ['https://example.test/result.png'] });
    provider = new RhCliProvider(runner, undefined, recovery);
    appendLog(taskPath, {
      event: 'submitted-with-task-id', task_id: 'remote-task-123', provider: 'rhcli', model_key: 'rhcli.t2i', mode: 'model',
      payload_sha256: sha256(JSON.stringify({ prompt: 'old' })), credential_scope: sha256('resolved-key'),
    });

    const result = await provider.execute(task, taskPath, ctx);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/identity does not match/);
    expect(recovery.queryCalls).toBe(0);
    expect(runner.runOpts).toHaveLength(0);
  });

  it('treats a verified remote terminal failure as safely fallbackable', async () => {
    const { task, taskPath } = makeTask({ prompt: 'remote failure' });
    const recovery = new MockRecoveryAdapter({ state: 'failed', resultUrls: [], error: 'supplier rejected task' });
    provider = new RhCliProvider(runner, undefined, recovery);
    appendLog(taskPath, {
      event: 'polling', state: 'polling', task_id: 'remote-task-123', provider: 'rhcli', model_key: 'rhcli.t2i', mode: 'model',
      payload_sha256: sha256(JSON.stringify(task.payload)), credential_scope: sha256('resolved-key'),
    });

    const result = await provider.execute(task, taskPath, ctx);

    expect(result.success).toBe(false);
    expect(result.retryability).toBe('safe');
    expect(result.fallbackability).toBe('safe');
  });

  it('increments output index when previous outputs exist', async () => {
    fs.writeFileSync(path.join(dir, 'shot01_1.png'), 'old');
    const { task, taskPath } = makeTask({ prompt: 'again' });
    const result = await provider.execute(task, taskPath, ctx);
    expect(result.success).toBe(true);
    expect(result.outputPaths).toEqual([path.join(dir, 'shot01_2.png')]);
    expect(fs.existsSync(path.join(dir, 'shot01_1.png'))).toBe(true); // untouched
  });

  it('maps RhCliError to success:false and logs failed', async () => {
    runner.runImpl = async () => { throw new RhCliError('balance', 'RunningHub balance insufficient — top up'); };
    const { task, taskPath } = makeTask({ prompt: 'x' });
    const result = await provider.execute(task, taskPath, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('balance');
    expect(readLastLogEntry(taskPath)?.event).toBe('failed');
  });

  it('fails when rh returns no files and no texts', async () => {
    runner.runImpl = async () => ({ files: [], texts: [] });
    const { task, taskPath } = makeTask({ prompt: 'x' });
    const result = await provider.execute(task, taskPath, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('no output files');
  });

  it('persists text-only results as .txt output', async () => {
    runner.runImpl = async () => ({ files: [], texts: ['line1', 'line2'], cost: '0.05' });
    const { task, taskPath } = makeTask({ prompt: 'x' });
    const result = await provider.execute(task, taskPath, ctx);
    expect(result.success).toBe(true);
    expect(result.outputPaths).toEqual([path.join(dir, 'shot01_1.txt')]);
    expect(fs.readFileSync(result.outputPaths![0], 'utf-8')).toBe('line1\nline2');
  });

  it('fails before spawn when API key resolution throws', async () => {
    (ctx.configLoader.getResolvedApiKey as jest.Mock).mockImplementation(() => {
      throw new Error('Missing API Key');
    });
    const { task, taskPath } = makeTask({ prompt: 'x' });
    const result = await provider.execute(task, taskPath, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing API Key');
    expect(runner.runOpts).toHaveLength(0);
  });

  it('fails cleanly when model config is missing', async () => {
    (ctx.configLoader.getModelConfig as jest.Mock).mockReturnValue(undefined);
    const { task, taskPath } = makeTask({ prompt: 'x' });
    const result = await provider.execute(task, taskPath, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('model config not found');
  });

  it('fails with actionable path instructions when binary is missing', async () => {
    modelConfig.rh.binary = '/opt/rh-compatible';
    runner.check = async () => { throw new RhCliError('binary-missing', 'rh CLI not found. Install RH_CLI'); };
    const { task, taskPath } = makeTask({ prompt: 'x' });
    const result = await provider.execute(task, taskPath, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('rh CLI not found');
    expect(result.error).toContain('attempted: /opt/rh-compatible');
    expect(result.error).toContain('export RH_CLI_BINARY=');
    expect(result.error).toContain("models:\n    rhcli.t2i:\n      rh:\n        binary:");
    expect(result.retryability).toBe('safe');
    expect(result.fallbackability).toBe('safe');
    expect(runner.runOpts).toHaveLength(0);
  });

  it('explains how to replace an incompatible binary', async () => {
    modelConfig.rh.binary = '/home/user/.local/bin/rh';
    runner.check = async () => {
      throw new RhCliError('cli-incompatible', 'rh --json check is not supported');
    };
    const { task, taskPath } = makeTask({ prompt: 'x' });
    const result = await provider.execute(task, taskPath, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('attempted: /home/user/.local/bin/rh');
    expect(result.error).toContain('compatible RH CLI binary');
    expect(result.error).toContain('No RH CLI subprocess was started');
    expect(result.retryability).toBe('safe');
  });
});
