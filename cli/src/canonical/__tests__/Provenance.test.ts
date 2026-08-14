import fs from 'fs';
import os from 'os';
import path from 'path';
import { commitArtifact } from '../artifacts/CommitService';
import { readTransitions, appendTransition } from '../state/TransitionStore';
import { AssetState } from '../schema';

describe('Artifact Provenance (Q3)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-prov-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('records provider/model/seed/parents on commit', async () => {
    const p = path.join(tmp, 'clip.mp4');
    fs.writeFileSync(p, 'not really media');
    await commitArtifact({
      projectRoot: tmp,
      artifactPath: 'clip.mp4',
      type: 'video',
      task: 'shot-023',
      variant: 'v1',
      provider: 'rhcli',
      model: 'i2v',
      seed: 42,
      parentAssets: ['@alice:v3', '@temple:v2'],
      actor: { type: 'agent', id: 'test' },
      capability: 'video.generate',
    });
    const transitions = await readTransitions(tmp, 'shot-023');
    expect(transitions[0].provenance).toEqual({
      provider: 'rhcli',
      model: 'i2v',
      seed: 42,
      parentAssets: ['@alice:v3', '@temple:v2'],
    });
  });

  it('omits provenance when none is supplied', async () => {
    const p = path.join(tmp, 'clip.mp4');
    fs.writeFileSync(p, 'x');
    await commitArtifact({ projectRoot: tmp, artifactPath: 'clip.mp4', type: 'video', task: 'a1' });
    const transitions = await readTransitions(tmp, 'a1');
    expect(transitions[0].provenance).toBeUndefined();
  });

  it('reads legacy transitions without provenance (backward compatible)', async () => {
    await appendTransition(tmp, {
      asset: 'a1',
      artifact: 'a1:v1',
      from: 'draft',
      to: 'candidate',
      actor: { type: 'human', id: 'reviewer' },
      timestamp: new Date().toISOString(),
    } as never);
    const transitions = await readTransitions(tmp, 'a1');
    expect(transitions).toHaveLength(1);
    expect(transitions[0].to).toBe('candidate');
  });

  it('accepts a provenance field on a manually appended transition', async () => {
    await appendTransition(tmp, {
      asset: 'a1',
      artifact: 'a1:v1',
      from: 'draft' as AssetState,
      to: 'candidate' as AssetState,
      actor: { type: 'agent', id: 'test' },
      timestamp: new Date().toISOString(),
      provenance: { provider: 'veo', model: 'veo-3', seed: 7, parentAssets: ['@alice'] },
    });
    const transitions = await readTransitions(tmp, 'a1');
    expect(transitions[0].provenance?.model).toBe('veo-3');
  });
});
