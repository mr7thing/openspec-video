import axios from 'axios';
import { HttpClient } from '../HttpClient';
import { ExecutionError, OpsVErrorCode } from '../../errors/OpsVError';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HttpClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds Authorization header with Bearer token', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { id: '123' } });
    const client = new HttpClient({ apiKey: 'secret' });
    await client.post('http://api/test', { prompt: 'hi' });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://api/test',
      { prompt: 'hi' },
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'Content-Type': 'application/json',
        }),
        timeout: 30000,
      })
    );
  });

  it('supports custom auth header name', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: {} });
    const client = new HttpClient({ apiKey: 'key', authHeader: 'X-API-Key' });
    await client.post('http://api/test', {});

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://api/test',
      {},
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'Bearer key',
        }),
      })
    );
  });

  it('returns response data on success', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { status: 'done' } });
    const client = new HttpClient();
    const result = await client.get('http://api/status');
    expect(result).toEqual({ status: 'done' });
  });

  it('retries on failure and eventually throws', async () => {
    mockedAxios.post.mockRejectedValue(new Error('Network error'));
    const client = new HttpClient({ maxRetries: 2, retryDelayCap: 100 });

    await expect(client.post('http://api/test', {})).rejects.toThrow(ExecutionError);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('retries and succeeds on second attempt', async () => {
    mockedAxios.post
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce({ data: { id: 'ok' } });

    const client = new HttpClient({ maxRetries: 3, retryDelayCap: 50 });
    const result = await client.post('http://api/test', {});
    expect(result).toEqual({ id: 'ok' });
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('uses custom timeout', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: {} });
    const client = new HttpClient({ timeout: 5000 });
    await client.post('http://api/test', {});
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ timeout: 5000 })
    );
  });

  it('merges extra axios config', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: {} });
    const client = new HttpClient();
    await client.get('http://api/test', { responseType: 'stream' });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://api/test',
      expect.objectContaining({ responseType: 'stream', timeout: 30000 })
    );
  });

  it('does not retry 4xx client errors', async () => {
    const err400: any = new Error('Bad Request');
    err400.response = { status: 400, data: {} };
    mockedAxios.post.mockRejectedValue(err400);

    const client = new HttpClient({ maxRetries: 3, retryDelayCap: 50 });
    await expect(client.post('http://api/test', {})).rejects.toThrow(ExecutionError);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1); // no retry
  });

  it('does not retry 401/403 errors', async () => {
    const err403: any = new Error('Forbidden');
    err403.response = { status: 403, data: {} };
    mockedAxios.post.mockRejectedValue(err403);

    const client = new HttpClient({ maxRetries: 3, retryDelayCap: 50 });
    await expect(client.post('http://api/test', {})).rejects.toThrow(ExecutionError);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx server errors', async () => {
    const err500: any = new Error('Internal Server Error');
    err500.response = { status: 500, data: {} };
    mockedAxios.post
      .mockRejectedValueOnce(err500)
      .mockResolvedValueOnce({ data: { id: 'ok' } });

    const client = new HttpClient({ maxRetries: 3, retryDelayCap: 50 });
    const result = await client.post('http://api/test', {});
    expect(result).toEqual({ id: 'ok' });
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });
});
