import axios from 'axios';
import { CloudClient } from './CloudClient';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('CloudClient', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('unwraps createSession envelope and maps reviewToken', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          sessionId: 'sid_1',
          sessionToken: 'session-token',
          reviewToken: 'review-token-hex',
          reviewUrl: 'https://cloud.example/s/sid_1?t=review-token-hex',
          tunnelUrl: 'wss://cloud.example/tunnel?token=session-token',
        },
      },
    });

    const client = new CloudClient('https://cloud.example', 'api-key');
    await expect(client.createSession()).resolves.toEqual({
      sessionId: 'sid_1',
      sessionToken: 'session-token',
      reviewToken: 'review-token-hex',
      reviewUrl: 'https://cloud.example/s/sid_1?t=review-token-hex',
      tunnelUrl: 'wss://cloud.example/tunnel?token=session-token',
      routeMode: 'tunnel',
      relayAvailable: false,
    });
  });

  it('unwraps rotateReviewToken envelope', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          reviewToken: 'new-review-token',
          reviewUrl: 'https://cloud.example/s/sid_1?t=new-review-token',
        },
      },
    });

    const client = new CloudClient('https://cloud.example', 'api-key');
    await expect(client.rotateReviewToken('sid_1')).resolves.toEqual({
      reviewToken: 'new-review-token',
      reviewUrl: 'https://cloud.example/s/sid_1?t=new-review-token',
    });
  });

  it('reports quota errors for 429 responses', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      message: 'Request failed with status code 429',
      response: { status: 429, data: { error: 'limit reached' } },
    });

    const client = new CloudClient('https://cloud.example', 'api-key');
    await expect(client.createSession()).rejects.toThrow('OpsV Cloud quota exceeded');
  });
});
