import fs from 'fs';
import os from 'os';
import path from 'path';
import { commitArtifact } from '../artifacts/CommitService';
import { readTransitions, projectState } from '../state/TransitionStore';
import { inferMediaType } from '../artifacts/mediaProbe';

describe('Commit Service — Commit Boundary (P3b)', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-commit-test-'));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function writeArtifact(name: string, content = 'not a real media file'): string {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, content);
    return name;
  }

  it('accepts an artifact under the default contract and records draft→candidate', async () => {
    const name = writeArtifact('shot-023.mp4');
    const result = await commitArtifact({
      projectRoot: tmp,
      artifactPath: name,
      type: inferMediaType(name),
      task: 'shot-023',
      variant: 'v1',
      actor: { type: 'agent', id: 'test' },
      capability: 'video.generate',
    });
    expect(result.ok).toBe(true);
    expect(result.state).toBe('candidate');
    expect(result.asset).toBe('shot-023');

    const transitions = await readTransitions(tmp, 'shot-023');
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ from: 'draft', to: 'candidate', asset: 'shot-023' });
    expect(projectState(transitions)).toBe('candidate');
  });

  it('rejects a type mismatch against the contract', async () => {
    const name = writeArtifact('notes.txt');
    const result = await commitArtifact({
      projectRoot: tmp,
      artifactPath: name,
      type: 'image', // forced wrong type
      contract: { output: { type: 'video' } },
      task: 'shot-024',
      actor: { type: 'agent', id: 'test' },
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0].rule).toBe('type');
    // nothing written
    expect(fs.existsSync(path.join(tmp, '.opsv', 'state', 'shot-024.jsonl'))).toBe(false);
  });

  it('throws when the artifact path does not exist', async () => {
    await expect(
      commitArtifact({ projectRoot: tmp, artifactPath: 'missing.mp4', type: 'video' }),
    ).rejects.toThrow(/Artifact not found/);
  });

  it('defaults provenance to human/cli + external.import when not supplied', async () => {
    const name = writeArtifact('clip.mp4');
    const result = await commitArtifact({
      projectRoot: tmp,
      artifactPath: name,
      type: 'video',
      contract: { required: { provenance: true } },
      task: 'clip-001',
    });
    // The commit boundary always fills actor + capability defaults, so a
    // provenance-requiring contract is satisfiable out of the box.
    expect(result.ok).toBe(true);
    const transitions = await readTransitions(tmp, 'clip-001');
    expect(transitions[0].actor).toEqual({ type: 'human', id: 'cli' });
  });

  describe('Phase 0 legacy characterization', () => {
    it('accepts an arbitrary task string without resolving an immutable Task', async () => {
      const name = writeArtifact('external.mp4');
      const result = await commitArtifact({
        projectRoot: tmp,
        artifactPath: name,
        type: 'video',
        task: 'free-form-task-id',
      });

      expect(result.ok).toBe(true);
      expect(result.asset).toBe('free-form-task-id');
      expect(result.artifact).toBe('free-form-task-id:external');
      expect(fs.existsSync(path.join(tmp, '.opsv', 'tasks'))).toBe(false);
    });

    it('leaves an accepted candidate at its original path instead of copying it into managed artifact storage', async () => {
      const name = writeArtifact('unmanaged.mp4');
      const sourcePath = path.join(tmp, name);

      const result = await commitArtifact({
        projectRoot: tmp,
        artifactPath: name,
        type: 'video',
        task: 'shot-unmanaged',
      });

      expect(result.ok).toBe(true);
      expect(fs.existsSync(sourcePath)).toBe(true);
      expect(fs.existsSync(path.join(tmp, '.opsv', 'artifacts'))).toBe(false);
      expect(result.transition?.reason).toContain(sourcePath);
    });

    it('appends duplicate draft-to-candidate transitions when the same content is committed twice', async () => {
      const name = writeArtifact('duplicate.mp4');
      const input = {
        projectRoot: tmp,
        artifactPath: name,
        type: 'video',
        task: 'shot-duplicate',
      };

      await commitArtifact(input);
      await commitArtifact(input);

      const transitions = await readTransitions(tmp, 'shot-duplicate');
      expect(transitions).toHaveLength(2);
      expect(transitions.map(({ from, to }) => `${from}->${to}`)).toEqual([
        'draft->candidate',
        'draft->candidate',
      ]);
    });
  });

  it('infers type from extension', () => {
    expect(inferMediaType('a.mp4')).toBe('video');
    expect(inferMediaType('a.png')).toBe('image');
    expect(inferMediaType('a.mp3')).toBe('audio');
    expect(inferMediaType('a.xyz')).toBe('composite');
  });

  it('records a degraded-probe flag without failing', async () => {
    const name = writeArtifact('asset.bin');
    const result = await commitArtifact({
      projectRoot: tmp,
      artifactPath: name,
      type: 'composite',
      task: 'asset-1',
      actor: { type: 'agent', id: 'test' },
      capability: 'external.import',
    });
    expect(result.ok).toBe(true);
    // probe of a text file degrades (no media streams), but default contract doesn't require media_info
    expect(result.degradedProbe).toBe(true);
  });
});
