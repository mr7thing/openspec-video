import fs from 'fs';
import path from 'path';
import os from 'os';
import { QueueRunner } from '../QueueRunner';
import { Container, ProviderExecutor } from '../../container/Container';
import { OpsVContext } from '../../container/OpsVContext';
import { BaseTaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';

class MockExecutor implements ProviderExecutor {
  readonly name = 'mock';
  async execute(_task: BaseTaskJson<unknown>, taskPath: string, _ctx: OpsVContext): Promise<ProviderResult> {
    return { taskPath, shotId: _task._opsv.shotId, provider: 'mock', success: true };
  }
}

class FailingExecutor implements ProviderExecutor {
  readonly name = 'failing';
  async execute(_task: BaseTaskJson<unknown>, taskPath: string, _ctx: OpsVContext): Promise<ProviderResult> {
    return { taskPath, shotId: _task._opsv.shotId, provider: 'failing', success: false, error: 'mock error' };
  }
}

describe('QueueRunner', () => {
  let tmpDir: string;
  let container: Container;
  let ctx: jest.Mocked<OpsVContext>;
  let runner: QueueRunner;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-runner-'));
    container = new Container();
    ctx = {
      configLoader: {
        getModelConfig: jest.fn().mockReturnValue({ concurrency: 2 }),
      },
    } as any;
    runner = new QueueRunner(container, ctx);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTask(name: string, provider: string, manifestDir?: string) {
    const dir = path.join(tmpDir, provider);
    fs.mkdirSync(dir, { recursive: true });
    const task: BaseTaskJson<unknown> = {
      payload: {},
      _opsv: { provider, modelKey: `${provider}.test`, type: 'imagen', shotId: name, api_url: 'http://test', compiledAt: '2024-01-01T00:00:00Z' },
    };
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(task));

    if (manifestDir) {
      fs.mkdirSync(path.join(tmpDir, manifestDir), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, manifestDir, '_manifest.json'),
        JSON.stringify({ assets: { [name]: { status: 'drafting' } } })
      );
    }
    return path.join(dir, `${name}.json`);
  }

  it('executes tasks across multiple providers in parallel', async () => {
    container.registerExecutor('mock', MockExecutor);
    container.registerExecutor('failing', FailingExecutor);

    writeTask('a', 'mock');
    writeTask('b', 'failing');

    const results = await runner.runPaths([tmpDir]);
    expect(results).toHaveLength(2);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(results.filter((r) => !r.success)).toHaveLength(1);
  });

  it('dry run returns empty without executing', async () => {
    container.registerExecutor('mock', MockExecutor);
    writeTask('a', 'mock');

    const results = await runner.runPaths([tmpDir], { dryRun: true });
    expect(results).toHaveLength(0);
  });

  it('retry only includes tasks with error logs', async () => {
    container.registerExecutor('mock', MockExecutor);
    const taskPath = writeTask('a', 'mock');
    fs.writeFileSync(taskPath.replace('.json', '_error.log'), JSON.stringify({ error: 'fail' }));

    const results = await runner.runPaths([tmpDir], { retry: true });
    expect(results).toHaveLength(1);
  });

  it('skips approved tasks', async () => {
    container.registerExecutor('mock', MockExecutor);
    writeTask('a', 'mock');

    // Place manifest in parent dir so it can be found walking up
    fs.writeFileSync(
      path.join(tmpDir, '_manifest.json'),
      JSON.stringify({ assets: { a: { status: 'approved' } } })
    );

    // Create an output file so the skip logic triggers
    fs.writeFileSync(path.join(tmpDir, 'mock', 'a_1.png'), 'fake');

    const results = await runner.runPaths([path.join(tmpDir, 'mock')]);
    expect(results).toHaveLength(0);
  });

  it('handles missing providers gracefully', async () => {
    const dir = path.join(tmpDir, 'unknown');
    fs.mkdirSync(dir, { recursive: true });
    const task: BaseTaskJson<unknown> = {
      payload: {},
      _opsv: { provider: 'unknown', modelKey: 'unknown.test', type: 'imagen', shotId: 'x', api_url: 'http://test', compiledAt: '2024-01-01T00:00:00Z' },
    };
    fs.writeFileSync(path.join(dir, 'x.json'), JSON.stringify(task));

    const results = await runner.runPaths([dir]);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('not registered');
  });

  it('returns empty for no matching tasks', async () => {
    const results = await runner.runPaths([tmpDir]);
    expect(results).toHaveLength(0);
  });
});
