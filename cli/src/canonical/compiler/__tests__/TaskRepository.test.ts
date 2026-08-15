import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileProductionTask, type ProductionTask } from '../ProductionTaskCompiler';
import { TaskRepository } from '../TaskRepository';
import type { CanonicalSnapshot } from '../CanonicalSnapshot';

function snapshot(): CanonicalSnapshot {
  return {
    schema: 'opsv.canonical-snapshot', version: 1,
    source: { path: 'videospec/shots/arrival.md', digest: `sha256:${'1'.repeat(64)}` },
    asset: { id: 'arrival' } as CanonicalSnapshot['asset'], references: [],
    contract: {
      schema: 'opsv.production-contract', version: 1,
      pack: { id: 'short-drama', version: '1.0.0', contentDigest: `sha256:${'2'.repeat(64)}` },
      category: 'shot', profile: { id: 'shot-video', kind: 'production', capability: 'video-generation', digest: `sha256:${'3'.repeat(64)}` },
      capability: { declared: 'video-generation', id: 'video.generate' }, boundModel: 'rhcli.seedance', outputs: ['video'], inputSlots: [], policy: {},
      artifactContract: { source: 'builtin', value: { contract: 'builtin/v1', output: { type: '*' }, required: { uri: true, provenance: true }, validation: [], metadata: {} }, digest: `sha256:${'4'.repeat(64)}` },
      digest: `sha256:${'5'.repeat(64)}`,
    },
    production: { type: 'produce', prompt: 'Arrival', payload: { global_settings: { aspect_ratio: '16:9', quality: 'high' } }, references: { image: [], video: [], audio: [] } },
    digest: `sha256:${'6'.repeat(64)}`,
  };
}

describe('TaskRepository', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-task-repo-')); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('atomically persists a canonical Task, rereads it, and makes same-content writes idempotent', async () => {
    const repository = new TaskRepository(root);
    const task = compileProductionTask(snapshot());
    const stored = await repository.put(task);
    expect(stored.relativePath).toBe(`.opsv/tasks/arrival/${task.revision}.json`);
    expect((await repository.get(task.id, task.revision)).task).toEqual(task);
    expect((await repository.put(task)).task.digest).toBe(task.digest);
  });

  it('rejects different immutable audit content at an existing id and revision', async () => {
    const repository = new TaskRepository(root);
    const task = compileProductionTask(snapshot());
    await repository.put(task);
    const sameSemanticRevisionDifferentAudit = {
      ...task,
      source: { ...task.source, digest: `sha256:${'9'.repeat(64)}` },
    };

    await expect(repository.put(sameSemanticRevisionDifferentAudit)).rejects.toThrow(/TASK_REPOSITORY_CONFLICT/);
  });

  it('rejects a tampered stored Task rather than treating it as verified', async () => {
    const repository = new TaskRepository(root);
    const task = compileProductionTask(snapshot());
    const stored = await repository.put(task);
    const tampered = { ...task, production: { ...task.production, prompt: 'tampered' } };
    fs.writeFileSync(stored.path, JSON.stringify(tampered));
    await expect(repository.get(task.id, task.revision)).rejects.toThrow(/TASK_DIGEST_MISMATCH/);
  });

  it('decodes legacy queue JSON as explicitly unverified and never invents a digest', async () => {
    const queuePath = path.join(root, 'queue.json');
    fs.writeFileSync(queuePath, JSON.stringify({ payload: {}, _opsv: { provider: 'fixture', modelKey: 'fixture.video', type: 'video', shotId: 'arrival', api_url: 'http://fixture', compiledAt: '2026-08-14T00:00:00Z' } }));
    await expect(new TaskRepository(root).readLegacyQueueTask(queuePath)).resolves.toMatchObject({ kind: 'legacy', verified: false, reason: 'LEGACY_TASK_NO_VERIFIED_ENVELOPE' });
  });

  it('changes revision when protected contracts or compiler identity change', () => {
    const task = compileProductionTask(snapshot());
    const changed = { ...task, contract: { ...task.contract, boundModel: 'rhcli.other' } } as ProductionTask;
    expect(task.digest).not.toBe(require('../ProductionTaskCompiler').digestProductionTask(changed));
  });
});
