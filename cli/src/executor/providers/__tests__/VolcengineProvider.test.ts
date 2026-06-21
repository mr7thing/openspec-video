import { VolcengineProvider } from '../VolcengineProvider';
import { BaseTaskJson } from '../../../types/Job';
import { OpsVContext } from '../../../container/OpsVContext';
import * as naming from '../../naming';
import * as download from '../../../utils/download';

jest.mock('../../naming');
jest.mock('../../../utils/download');
jest.mock('../../../container/OpsVContext');

describe('VolcengineProvider', () => {
  let provider: VolcengineProvider;
  let ctx: jest.Mocked<OpsVContext>;
  let httpPost: jest.Mock;
  let httpGet: jest.Mock;

  beforeEach(() => {
    provider = new VolcengineProvider();
    httpPost = jest.fn();
    httpGet = jest.fn();

    ctx = {
      configLoader: {
        getModelConfig: jest.fn().mockReturnValue({
          timeout: { submit: 10000, status: 5000 },
          max_poll_duration: 60000,
        }),
        getResolvedApiKey: jest.fn().mockReturnValue('key'),
        getSettings: jest.fn().mockReturnValue({}),
      },
    } as any;

    jest.spyOn(provider as any, 'buildHttpClient').mockReturnValue({
      post: httpPost,
      get: httpGet,
    });
    jest.spyOn(naming, 'resolveNextOutputIndex').mockReturnValue(1);
    jest.spyOn(naming, 'outputFilePath').mockReturnValue('/tmp/out_1.png');
    jest.spyOn(download, 'downloadFile').mockResolvedValue('/tmp/output.png');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const imageMeta = {
    provider: 'volcengine',
    modelKey: 'volc.seadream5',
    type: 'imagen' as const,
    shotId: 'hero',
    api_url: 'http://img.api',
    compiledAt: '2024-01-01T00:00:00Z',
  };

  const videoMeta = {
    provider: 'volcengine',
    modelKey: 'volc.seedance2',
    type: 'video' as const,
    shotId: 'shot01',
    api_url: 'http://vid.api',
    api_status_url: 'http://vid.api/status',
    compiledAt: '2024-01-01T00:00:00Z',
  };

  it('executes image task with direct download', async () => {
    httpPost.mockResolvedValueOnce({ data: [{ url: 'http://image.png' }] });

    const task: BaseTaskJson<any> = { payload: { prompt: 'hero' }, _opsv: imageMeta };
    const result = await provider.execute(task, '/tmp/task.json', ctx);

    expect(result.success).toBe(true);
    expect(result.outputPath).toBe('/tmp/out_1.png');
  });

  it('handles multi-image response', async () => {
    httpPost.mockResolvedValueOnce({
      data: [{ url: 'http://img1.png' }, { url: 'http://img2.png' }],
    });

    const task: BaseTaskJson<any> = { payload: { prompt: 'hero' }, _opsv: imageMeta };
    const result = await provider.execute(task, '/tmp/task.json', ctx);

    expect(result.success).toBe(true);
    expect(result.outputPaths).toHaveLength(2);
  });

  it('returns error if no image url', async () => {
    httpPost.mockResolvedValueOnce({ data: null });

    const task: BaseTaskJson<any> = { payload: { prompt: 'hero' }, _opsv: imageMeta };
    const result = await provider.execute(task, '/tmp/task.json', ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No task ID in submit response');
  });

  it('submits video and polls to completion', async () => {
    httpPost.mockResolvedValueOnce({ id: 'vid-1' });
    httpGet
      .mockResolvedValueOnce({ status: 'processing' })
      .mockResolvedValueOnce({ status: 'succeeded', content: { video_url: 'http://vid.mp4' } });

    jest.spyOn(require('../../polling'), 'getElapsedMs').mockReturnValue(0);
    jest.spyOn(require('../../polling'), 'getPollIntervalMs').mockReturnValue(10);
    jest.spyOn(require('../../polling'), 'sleep').mockResolvedValue(undefined);
    jest.spyOn(require('../../polling'), 'getResumeTaskId').mockReturnValue(null);
    jest.spyOn(require('../../polling'), 'appendLog').mockImplementation(() => {});

    const task: BaseTaskJson<any> = { payload: { prompt: 'dance' }, _opsv: videoMeta };
    const result = await provider.execute(task, '/tmp/task.json', ctx);

    expect(result.success).toBe(true);
    expect(httpPost).toHaveBeenCalledWith('http://vid.api', expect.objectContaining({ prompt: 'dance' }));
  });

  it('detects video failure', async () => {
    httpPost.mockResolvedValueOnce({ id: 'vid-1' });
    httpGet.mockResolvedValueOnce({ status: 'failed', error_message: 'Bad prompt' });

    jest.spyOn(require('../../polling'), 'getElapsedMs').mockReturnValue(0);
    jest.spyOn(require('../../polling'), 'getPollIntervalMs').mockReturnValue(10);
    jest.spyOn(require('../../polling'), 'sleep').mockResolvedValue(undefined);
    jest.spyOn(require('../../polling'), 'getResumeTaskId').mockReturnValue(null);
    jest.spyOn(require('../../polling'), 'appendLog').mockImplementation(() => {});

    const task: BaseTaskJson<any> = { payload: { prompt: 'dance' }, _opsv: videoMeta };
    const result = await provider.execute(task, '/tmp/task.json', ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Bad prompt');
  });
});
