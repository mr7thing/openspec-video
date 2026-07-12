import { BaseApiProvider } from '../BaseApiProvider';
import { BaseTaskJson, TaskMeta } from '../../../types/Job';
import { OpsVContext } from '../../../container/OpsVContext';
import { ProviderResult } from '../../QueueRunner';
import { ExecutionError, OpsVErrorCode } from '../../../errors/OpsVError';
import * as polling from '../../polling';
import * as naming from '../../naming';
import * as download from '../../../utils/download';

jest.mock('../../polling');
jest.mock('../../naming');
jest.mock('../../../utils/download');
jest.mock('../../../container/OpsVContext');

interface TestPayload {
  prompt: string;
}

interface TestSubmit {
  id?: string;
}

interface TestStatus {
  done?: boolean;
  failed?: boolean;
  url?: string;
}

class TestProvider extends BaseApiProvider<TestPayload, TestSubmit, TestStatus> {
  readonly name = 'test';

  protected buildPayload(task: BaseTaskJson<TestPayload>): unknown {
    return { ...task.payload };
  }

  protected parseTaskId(res: TestSubmit): string | undefined {
    return res.id;
  }

  protected buildStatusUrl(meta: { api_url: string; api_status_url?: string }, taskId: string): string {
    return `${meta.api_url}/status/${taskId}`;
  }

  protected isComplete(res: TestStatus): boolean {
    return !!res.done;
  }

  protected isFailed(res: TestStatus): boolean {
    return !!res.failed;
  }

  protected extractError(res: TestStatus): string {
    return 'Test error';
  }

  protected extractOutputUrls(res: TestStatus): string[] {
    return res.url ? [res.url] : [];
  }

  protected getOutputExtension(): string {
    return 'png';
  }
}

describe('BaseApiProvider', () => {
  let provider: TestProvider;
  let mockCtx: jest.Mocked<OpsVContext>;
  const meta: TaskMeta = {
    provider: 'test',
    modelKey: 'test.model',
    type: 'imagen',
    shotId: 'hero',
    api_url: 'http://api',
    compiledAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    provider = new TestProvider();
    mockCtx = {
      configLoader: {
        getModelConfig: jest.fn().mockReturnValue({
          timeout: { submit: 10000, status: 5000 },
          max_poll_duration: 60000,
          retry: { max_retries: 1, delay_cap: 100 },
        }),
        getSettings: jest.fn().mockReturnValue({}),
        getResolvedApiKey: jest.fn().mockReturnValue('key'),
      },
      projectRoot: '/tmp/project',
    } as any;

    jest.spyOn(polling, 'getResumeTaskId').mockReturnValue(null);
    jest.spyOn(polling, 'getElapsedMs').mockReturnValue(0);
    jest.spyOn(polling, 'getPollIntervalMs').mockReturnValue(10);
    jest.spyOn(polling, 'sleep').mockResolvedValue(undefined);
    jest.spyOn(polling, 'appendLog').mockImplementation(() => {});
    jest.spyOn(naming, 'resolveNextOutputIndex').mockReturnValue(1);
    jest.spyOn(naming, 'outputFilePath').mockReturnValue('/tmp/output_1.png');
    jest.spyOn(naming, 'withTaskLock').mockImplementation(async (_id, fn) => fn());
    jest.spyOn(download, 'downloadFile').mockResolvedValue('/tmp/output.png');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('submits task and polls to completion', async () => {
    const httpClient = provider['buildHttpClient'](mockCtx, 'test.model');
    jest.spyOn(provider as any, 'buildHttpClient').mockReturnValue(httpClient);

    jest.spyOn(httpClient, 'post').mockResolvedValueOnce({ id: 'task-1' });
    jest.spyOn(httpClient, 'get')
      .mockResolvedValueOnce({ done: false })
      .mockResolvedValueOnce({ done: true, url: 'http://img.png' });

    const task: BaseTaskJson<TestPayload> = { payload: { prompt: 'test' }, _opsv: meta };
    const result: ProviderResult = await provider.execute(task, '/tmp/task.json', mockCtx);

    expect(result.success).toBe(true);
    expect(result.shotId).toBe('hero');
    expect(result.provider).toBe('test');
    expect(result.outputPath).toBe('/tmp/output_1.png');
  });

  it('resumes from existing task id', async () => {
    jest.spyOn(polling, 'getResumeTaskId').mockReturnValue('resume-123');
    const mockHttpClient = {
      post: jest.fn(),
      get: jest.fn().mockResolvedValueOnce({ done: true, url: 'http://img.png' }),
    };
    jest.spyOn(provider as any, 'buildHttpClient').mockReturnValue(mockHttpClient);

    const task: BaseTaskJson<TestPayload> = { payload: { prompt: 'test' }, _opsv: meta };
    const result = await provider.execute(task, '/tmp/task.json', mockCtx);

    expect(result.success).toBe(true);
    expect(mockHttpClient.post).not.toHaveBeenCalled();
  });

  it('returns error on submit without task id', async () => {
    const httpClient = provider['buildHttpClient'](mockCtx, 'test.model');
    jest.spyOn(provider as any, 'buildHttpClient').mockReturnValue(httpClient);
    jest.spyOn(httpClient, 'post').mockResolvedValueOnce({});

    const task: BaseTaskJson<TestPayload> = { payload: { prompt: 'test' }, _opsv: meta };
    const result = await provider.execute(task, '/tmp/task.json', mockCtx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No task ID');
  });

  it('returns error on task failure', async () => {
    const httpClient = provider['buildHttpClient'](mockCtx, 'test.model');
    jest.spyOn(provider as any, 'buildHttpClient').mockReturnValue(httpClient);
    jest.spyOn(httpClient, 'post').mockResolvedValueOnce({ id: 't1' });
    jest.spyOn(httpClient, 'get').mockResolvedValueOnce({ failed: true });

    const task: BaseTaskJson<TestPayload> = { payload: { prompt: 'test' }, _opsv: meta };
    const result = await provider.execute(task, '/tmp/task.json', mockCtx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('failed');
  });

  it('returns error on timeout', async () => {
    const httpClient = provider['buildHttpClient'](mockCtx, 'test.model');
    jest.spyOn(provider as any, 'buildHttpClient').mockReturnValue(httpClient);
    jest.spyOn(httpClient, 'post').mockResolvedValueOnce({ id: 't1' });
    jest.spyOn(polling, 'getElapsedMs').mockReturnValue(99999999);

    const task: BaseTaskJson<TestPayload> = { payload: { prompt: 'test' }, _opsv: meta };
    const result = await provider.execute(task, '/tmp/task.json', mockCtx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
  });
});
