import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import { ArtifactPreviewAdapter } from '../ArtifactPreviewAdapter';
import { createPreviewController } from '../controllers/previewController';

describe('ArtifactPreviewAdapter', () => {
  let queueRoot: string;

  beforeEach(() => {
    queueRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-preview-'));
    fs.mkdirSync(path.join(queueRoot, 'circle', 'provider'), { recursive: true });
    fs.writeFileSync(path.join(queueRoot, 'circle', 'provider', 'clip.mp4'), '0123456789');
  });

  afterEach(() => {
    fs.rmSync(queueRoot, { recursive: true, force: true });
  });

  it('creates an opaque local preview descriptor and resolves its token', async () => {
    const adapter = new ArtifactPreviewAdapter(queueRoot, 'test-secret');
    const descriptor = await adapter.describe({
      id: 'artifact-1',
      revisionId: 'revision-1',
      uri: 'circle/provider/clip.mp4',
      type: 'video',
    });

    expect(descriptor.kind).toBe('video');
    expect(descriptor.availability).toBe('available');
    expect(descriptor.seekable).toBe(true);
    expect(descriptor.previewUrl).toMatch(/^\/api\/review\/preview\//);
    expect(descriptor.previewUrl).not.toContain('circle');

    const token = descriptor.previewUrl!.split('/').pop()!;
    expect(adapter.resolveToken(token)?.absolutePath).toBe(path.join(queueRoot, 'circle/provider/clip.mp4'));
  });

  it('rejects absolute and remote URIs', async () => {
    const adapter = new ArtifactPreviewAdapter(queueRoot, 'test-secret');
    const absolute = await adapter.describe({ id: 'a', revisionId: 'r', uri: path.join(queueRoot, 'circle/provider/clip.mp4'), type: 'video' });
    const remote = await adapter.describe({ id: 'b', revisionId: 'r', uri: 'https://example.com/clip.mp4', type: 'video' });

    expect(absolute.availability).toBe('missing');
    expect(remote.availability).toBe('missing');
    expect(remote.previewUrl).toBeUndefined();
  });

  it('serves full and ranged responses through the preview controller', async () => {
    const adapter = new ArtifactPreviewAdapter(queueRoot, 'test-secret');
    const descriptor = await adapter.describe({ id: 'artifact-1', revisionId: 'revision-1', uri: 'circle/provider/clip.mp4', type: 'video' });
    const token = descriptor.previewUrl!.split('/').pop()!;
    const app = express();
    const controller = createPreviewController(adapter);
    app.get('/preview/:token', controller.serve);
    app.head('/preview/:token', controller.serve);

    const full = await request(app).get(`/preview/${token}`);
    expect(full.status).toBe(200);
    expect(full.headers['accept-ranges']).toBe('bytes');
    expect(Buffer.from(full.body).toString('utf8')).toBe('0123456789');

    const ranged = await request(app).get(`/preview/${token}`).set('Range', 'bytes=2-5');
    expect(ranged.status).toBe(206);
    expect(ranged.headers['content-range']).toBe('bytes 2-5/10');
    expect(Buffer.from(ranged.body).toString('utf8')).toBe('2345');
  });
});
