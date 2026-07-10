import { RhWorkflowProvider } from '../RhWorkflowProvider';
import { BaseTaskJson } from '../../../types/Job';
import { OpsVContext } from '../../../container/OpsVContext';
import * as download from '../../../utils/download';

jest.mock('../../naming', () => ({
  ...jest.requireActual('../../naming'),
  resolveNextOutputIndex: jest.fn(),
  outputFilePath: jest.fn(),
  withTaskLock: jest.fn((_key: string, fn: () => Promise<any>) => fn()),
}));
jest.mock('../../../utils/download');
jest.mock('../../../container/OpsVContext');

describe('RhWorkflowProvider', () => {
  let provider: RhWorkflowProvider;
  let ctx: jest.Mocked<OpsVContext>;
  let httpPost: jest.Mock;
  let httpGet: jest.Mock;

  beforeEach(() => {
    provider = new RhWorkflowProvider();
    httpPost = jest.fn();
    httpGet = jest.fn();

    ctx = {
      configLoader: {
        getModelConfig: jest.fn().mockReturnValue({
          timeout: { submit: 10000, status: 5000 },
          max_poll_duration: 60000,
        }),
        getResolvedApiKey: jest.fn().mockReturnValue('rh-key'),
        getSettings: jest.fn().mockReturnValue({}),
      },
    } as any;

    jest.spyOn(provider as any, 'buildHttpClient').mockReturnValue({
      post: httpPost,
      get: httpGet,
    });
    jest.spyOn(require('../../naming'), 'resolveNextOutputIndex').mockReturnValue(1);
    jest.spyOn(require('../../naming'), 'outputFilePath').mockReturnValue('/tmp/out_1.png');
    jest.spyOn(download, 'downloadFile').mockResolvedValue('/tmp/output.png');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const workflowMeta = {
    provider: 'rhworkflow' as const,
    modelKey: 'rhworkflow.klein9b',
    type: 'imagen' as const,
    shotId: 'shot01',
    api_url: 'https://api.runninghub.cn/run/workflow/2075497084035358722',
    api_status_url: 'https://www.runninghub.cn/openapi/v2/query',
    compiledAt: '2024-01-01T00:00:00Z',
  };

  it('submits workflow with nodeInfoList and polls to completion', async () => {
    httpPost
      .mockResolvedValueOnce({ taskId: 'task-123', status: 'QUEUED' })
      .mockResolvedValueOnce({ status: 'SUCCESS', results: [{ url: 'http://output.png' }] });

    jest.spyOn(require('../../polling'), 'getElapsedMs').mockReturnValue(0);
    jest.spyOn(require('../../polling'), 'getPollIntervalMs').mockReturnValue(10);
    jest.spyOn(require('../../polling'), 'sleep').mockResolvedValue(undefined);
    jest.spyOn(require('../../polling'), 'getResumeTaskId').mockReturnValue(null);
    jest.spyOn(require('../../polling'), 'appendLog').mockImplementation(() => {});

    const task: BaseTaskJson<any> = {
      payload: {
        nodeInfoList: [
          { nodeId: '177', fieldName: 'prompt', fieldValue: 'a cat' },
          { nodeId: '103', fieldName: 'noise_seed', fieldValue: 42 },
        ],
      },
      _opsv: workflowMeta,
    };

    const result = await provider.execute(task, '/tmp/task.json', ctx);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe('/tmp/out_1.png');
    expect(httpPost).toHaveBeenNthCalledWith(1,
      'https://api.runninghub.cn/run/workflow/2075497084035358722',
      expect.objectContaining({
        nodeInfoList: expect.arrayContaining([
          expect.objectContaining({ nodeId: '177', fieldName: 'prompt' }),
        ]),
      }),
    );
  });

  it('handles sync response with direct results', async () => {
    httpPost.mockResolvedValueOnce({
      taskId: 'task-456',
      status: 'SUCCESS',
      results: [{ url: 'http://sync-output.png', nodeId: '29', outputType: 'png' }],
    });

    jest.spyOn(require('../../polling'), 'getResumeTaskId').mockReturnValue(null);

    const task: BaseTaskJson<any> = {
      payload: { nodeInfoList: [{ nodeId: '177', fieldName: 'prompt', fieldValue: 'sync test' }] },
      _opsv: workflowMeta,
    };

    const result = await provider.execute(task, '/tmp/task.json', ctx);

    expect(result.success).toBe(true);
    expect(result.outputPaths).toHaveLength(1);
  });

  it('fails when workflow returns FAILED status', async () => {
    httpPost
      .mockResolvedValueOnce({ taskId: 'task-789', status: 'QUEUED' })
      .mockResolvedValueOnce({ status: 'FAILED', errorMessage: 'Model inference error' });

    jest.spyOn(require('../../polling'), 'getElapsedMs').mockReturnValue(0);
    jest.spyOn(require('../../polling'), 'getPollIntervalMs').mockReturnValue(10);
    jest.spyOn(require('../../polling'), 'sleep').mockResolvedValue(undefined);
    jest.spyOn(require('../../polling'), 'getResumeTaskId').mockReturnValue(null);
    jest.spyOn(require('../../polling'), 'appendLog').mockImplementation(() => {});

    const task: BaseTaskJson<any> = {
      payload: { nodeInfoList: [{ nodeId: '177', fieldName: 'prompt', fieldValue: 'fail test' }] },
      _opsv: workflowMeta,
    };

    const result = await provider.execute(task, '/tmp/task.json', ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Model inference error');
  });
});
