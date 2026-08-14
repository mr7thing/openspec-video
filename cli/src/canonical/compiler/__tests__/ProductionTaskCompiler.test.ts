import { compileProductionTask } from '../ProductionTaskCompiler';
import type { CanonicalSnapshot } from '../CanonicalSnapshot';

function snapshot(): CanonicalSnapshot {
  return {
    schema: 'opsv.canonical-snapshot',
    version: 1,
    source: { path: 'videospec/shots/arrival.md', digest: `sha256:${'1'.repeat(64)}` },
    asset: { id: 'arrival' } as CanonicalSnapshot['asset'],
    references: [],
    contract: {
      schema: 'opsv.production-contract',
      version: 1,
      pack: { id: 'short-drama', version: '1.0.0', contentDigest: `sha256:${'4'.repeat(64)}` },
      category: 'shot',
      profile: {
        id: 'shot-video',
        kind: 'production',
        capability: 'video-generation',
        digest: `sha256:${'5'.repeat(64)}`,
      },
      boundModel: 'rhcli.seedance',
      outputs: ['video'],
      digest: `sha256:${'2'.repeat(64)}`,
    },
    production: {
      type: 'produce',
      prompt: 'Arrival prompt',
      payload: { global_settings: { aspect_ratio: '16:9', quality: 'high' } },
      references: { image: [], video: [], audio: [] },
    },
    digest: `sha256:${'3'.repeat(64)}`,
  };
}

describe('ProductionTaskCompiler', () => {
  it('creates a deterministic provider-neutral Task revision from a Snapshot', () => {
    const first = compileProductionTask(snapshot());
    const second = compileProductionTask(snapshot());

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schema: 'opsv.production-task',
      version: 1,
      id: 'arrival',
      snapshotDigest: `sha256:${'3'.repeat(64)}`,
      capability: 'video-generation',
      boundModel: 'rhcli.seedance',
      outputs: ['video'],
    });
    expect(first.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.digest).toBe(first.revision);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.production.references)).toBe(true);
  });

  it('keeps raw source bytes as audit data rather than semantic Task identity', () => {
    const firstSnapshot = snapshot();
    const secondSnapshot = {
      ...firstSnapshot,
      source: { ...firstSnapshot.source, digest: `sha256:${'9'.repeat(64)}` },
    };

    expect(compileProductionTask(firstSnapshot).revision)
      .toBe(compileProductionTask(secondSnapshot).revision);
  });
});
