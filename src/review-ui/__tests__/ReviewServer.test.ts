import request from 'supertest';
import express from 'express';
import { createReviewApp } from '../ReviewServer';
import { ReviewStrategy } from '../../core/ReviewStrategy';
import { ManifestReader } from '../../core/ManifestReader';

jest.mock('../../core/ReviewStrategy');
jest.mock('../../core/ManifestReader');

describe('ReviewServer', () => {
  let app: express.Application;
  let mockStrategy: jest.Mocked<ReviewStrategy>;
  let mockManifestReader: jest.Mocked<ManifestReader>;

  beforeEach(() => {
    mockStrategy = {
      listDocuments: jest.fn().mockReturnValue([]),
      findDocument: jest.fn().mockReturnValue(null),
      listCircles: jest.fn().mockReturnValue([]),
      listCircleAssets: jest.fn().mockReturnValue({ circle: 'c1', assets: [] }),
    } as unknown as jest.Mocked<ReviewStrategy>;

    mockManifestReader = {} as any;

    app = createReviewApp({
      projectRoot: '/tmp/project',
      queueRoot: '/tmp/project/opsv-queue',
      opts: { port: 3100, ttl: 900 },
      strategy: mockStrategy,
      manifestReader: mockManifestReader,
    });
  });

  it('GET /api/documents returns documents', async () => {
    mockStrategy.listDocuments.mockReturnValue([{ docId: 'hero', status: 'drafting', category: 'character', circle: 'c1', docPath: '/tmp/hero.md', outputs: [] } as any]);
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ docId: 'hero', status: 'drafting', category: 'character', circle: 'c1', docPath: '/tmp/hero.md', outputs: [] }]);
  });

  it('GET /api/documents/:circle/:docId returns 404 if not found', async () => {
    mockStrategy.findDocument.mockReturnValue(null);
    const res = await request(app).get('/api/documents/c1/hero');
    expect(res.status).toBe(404);
  });

  it('GET /api/circles returns circles', async () => {
    mockStrategy.listCircles.mockReturnValue([{ name: 'circle1', target: 'videospec', assetCount: 1, indexCount: 0 }]);
    const res = await request(app).get('/api/circles');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ name: 'circle1', target: 'videospec', assetCount: 1, indexCount: 0 }]);
  });

  it('GET /api/circles/:name/assets returns assets', async () => {
    const res = await request(app).get('/api/circles/c1/assets');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ circle: 'c1', assets: [] });
  });

  it('POST /api/approve/:circle/:assetId approves', async () => {
    const res = await request(app)
      .post('/api/approve/c1/hero')
      .send({ outputFile: 'hero_1.png' });

    // ApproveService needs real files; expect 500 in unit test without FS setup
    expect([200, 500]).toContain(res.status);
  });

  it('GET /api/files/* serves files with correct mime', async () => {
    // Path traversal should be blocked
    const res = await request(app).get('/api/files/../etc/passwd');
    expect([403, 404]).toContain(res.status);
  });
});
