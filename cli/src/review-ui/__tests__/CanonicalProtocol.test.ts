import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createReviewApp } from '../ReviewServer';
import { ReviewStrategy } from '../../core/ReviewStrategy';
import { ManifestReader } from '../../core/ManifestReader';

jest.mock('../../core/ReviewStrategy');
jest.mock('../../core/ManifestReader');

describe('Review Protocol v1 (P6)', () => {
  let tmp: string;
  let app: express.Application;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-canonical-review-'));
    const mockStrategy = {} as unknown as jest.Mocked<ReviewStrategy>;
    const mockManifestReader = {} as unknown as jest.Mocked<ManifestReader>;
    app = createReviewApp({
      projectRoot: tmp,
      queueRoot: path.join(tmp, 'opsv-queue'),
      opts: { port: 3100, ttl: 900 },
      strategy: mockStrategy,
      manifestReader: mockManifestReader,
    });
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('GET an asset with no log returns draft + []', async () => {
    const res = await request(app).get('/api/canonical/assets/shot-023');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ asset: 'shot-023', state: 'draft', transitions: [] });
  });

  it('POST approve walks a fresh asset to approved (3 transitions)', async () => {
    const res = await request(app)
      .post('/api/canonical/approve')
      .send({ asset: 'shot-001', artifact: 'shot-001:v1', reason: 'looks good' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.state).toBe('approved');
    expect(res.body.transitions.map((t: any) => `${t.from}→${t.to}`)).toEqual([
      'draft→candidate',
      'candidate→review',
      'review→approved',
    ]);

    const get = await request(app).get('/api/canonical/assets/shot-001');
    expect(get.body.state).toBe('approved');
  });

  it('POST review reject from approved is illegal (400)', async () => {
    await request(app).post('/api/canonical/approve').send({ asset: 'a1' });
    const res = await request(app)
      .post('/api/canonical/review')
      .send({ asset: 'a1', action: 'reject', comment: 'no' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No legal state path/);
  });

  it('POST review reject moves review → rejected', async () => {
    // walk to review via commit (draft→candidate) then a manual review transition
    const { appendTransition } = require('../../canonical/state/TransitionStore');
    await appendTransition(tmp, {
      asset: 'a2',
      artifact: 'a2:v1',
      from: 'draft',
      to: 'candidate',
      actor: { type: 'agent', id: 'test' },
      timestamp: new Date().toISOString(),
    });
    await appendTransition(tmp, {
      asset: 'a2',
      artifact: 'a2:v1',
      from: 'candidate',
      to: 'review',
      actor: { type: 'agent', id: 'test' },
      timestamp: new Date().toISOString(),
    });

    const res = await request(app)
      .post('/api/canonical/review')
      .send({ asset: 'a2', action: 'reject', comment: 'face drift' });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('rejected');
  });

  it('POST review revise reopens rejected → candidate', async () => {
    const { appendTransition } = require('../../canonical/state/TransitionStore');
    await appendTransition(tmp, {
      asset: 'a3',
      artifact: 'a3:v1',
      from: 'draft',
      to: 'candidate',
      actor: { type: 'agent', id: 'test' },
      timestamp: new Date().toISOString(),
    });
    await appendTransition(tmp, {
      asset: 'a3',
      artifact: 'a3:v1',
      from: 'candidate',
      to: 'review',
      actor: { type: 'agent', id: 'test' },
      timestamp: new Date().toISOString(),
    });
    await appendTransition(tmp, {
      asset: 'a3',
      artifact: 'a3:v1',
      from: 'review',
      to: 'rejected',
      actor: { type: 'human', id: 'reviewer' },
      timestamp: new Date().toISOString(),
    });

    const res = await request(app)
      .post('/api/canonical/review')
      .send({ asset: 'a3', action: 'revise', comment: 'fix identity and re-run' });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe('candidate');
  });

  it('rejects missing parameters', async () => {
    const res = await request(app).post('/api/canonical/review').send({ action: 'reject' });
    expect(res.status).toBe(400);
  });
});
