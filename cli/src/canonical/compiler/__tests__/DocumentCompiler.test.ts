import fs from 'fs';
import os from 'os';
import path from 'path';
import { DocumentCompiler } from '../DocumentCompiler';
import { isSnapshotStale } from '../CanonicalSnapshot';
import { compileProductionTask } from '../ProductionTaskCompiler';
import { ProductionPipeline } from '../../../core/ProductionPipeline';
import { TaskBuilder } from '../../../core/compiler/TaskBuilder';

function setupProject(withBinding = true, modelBinding = 'rhcli.seedance'): { root: string; assetPath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-document-compiler-'));
  const pack = path.resolve(__dirname, '../../../../../packs/short-drama');
  fs.mkdirSync(path.join(root, '.opsv'), { recursive: true });
  fs.mkdirSync(path.join(root, 'videospec', 'shots'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.opsv', 'project.yaml'),
    `packs:\n  - id: short-drama\n    source: ${pack}\nbindings:\n${withBinding ? `  video-generation: ${modelBinding}\n` : ''}`,
  );
  const assetPath = path.join(root, 'videospec', 'shots', 'arrival.md');
  fs.writeFileSync(assetPath, [
    '---',
    'id: arrival',
    'category: shot',
    'profile: shot-video',
    'status: drafting',
    'aspect_ratio: "16:9"',
    'quality: high',
    'seed: 17',
    '---',
    '',
    'A traveler enters through the old city gate.',
    '',
  ].join('\n'));
  return { root, assetPath };
}

describe('DocumentCompiler canonical production slice', () => {
  it('compiles a short-drama shot once into a digest-bound Snapshot and legacy-compatible production input', async () => {
    const { root, assetPath } = setupProject();
    try {
      const result = await new DocumentCompiler(root).compile({ id: 'arrival', filePath: assetPath }, { duration: 5 });

      expect(result.kind).toBe('canonical');
      if (result.kind !== 'canonical') throw new Error('expected canonical compilation');
      expect(result.snapshot.source.path).toBe('videospec/shots/arrival.md');
      expect(result.snapshot.source.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.snapshot.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(result.snapshot.asset).toMatchObject({ id: 'arrival', category: 'shot' });
      expect(result.snapshot.contract).toMatchObject({
        pack: { id: 'short-drama', version: '1.0.0' },
        category: 'shot',
        profile: { id: 'shot-video', kind: 'production', capability: 'video-generation' },
        boundModel: 'rhcli.seedance',
        outputs: ['video', 'first', 'last'],
      });
      expect(result.snapshot.production).toMatchObject({
        type: 'produce',
        prompt: 'A traveler enters through the old city gate.',
        payload: {
          global_settings: { aspect_ratio: '16:9', quality: 'high' },
          extra: { duration: 5, seed: 17 },
        },
      });
      expect(isSnapshotStale(result.snapshot, fs.readFileSync(assetPath, 'utf8'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('binds local media content digests so ref changes invalidate Snapshot and Task identity', async () => {
    const { root, assetPath } = setupProject();
    try {
      const mediaPath = path.join(root, 'media', 'reference.png');
      fs.mkdirSync(path.dirname(mediaPath), { recursive: true });
      fs.writeFileSync(mediaPath, 'reference-v1');
      const source = fs.readFileSync(assetPath, 'utf8').replace(
        'quality: high',
        [
          'quality: high',
          'refs:',
          '  image:',
          '    local:',
          '      - ../../media/reference.png',
        ].join('\n'),
      );
      fs.writeFileSync(assetPath, source);

      const compiler = new DocumentCompiler(root);
      const first = await compiler.compile({ id: 'arrival', filePath: assetPath });
      if (first.kind !== 'canonical') throw new Error('expected canonical compilation');
      expect(first.snapshot.references).toEqual([
        expect.objectContaining({
          kind: 'image',
          uri: 'media/reference.png',
          digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        }),
      ]);

      fs.writeFileSync(mediaPath, 'reference-v2');
      const second = await compiler.compile({ id: 'arrival', filePath: assetPath });
      if (second.kind !== 'canonical') throw new Error('expected canonical compilation');

      expect(first.snapshot.source.digest).toBe(second.snapshot.source.digest);
      expect(first.snapshot.digest).not.toBe(second.snapshot.digest);
      expect(compileProductionTask(first.snapshot).revision)
        .not.toBe(compileProductionTask(second.snapshot).revision);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('normalizes and digest-binds an explicit workflow file during Document compilation', async () => {
    const { root, assetPath } = setupProject();
    try {
      const workflowPath = path.join(root, 'workflows', 'shot.json');
      fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
      fs.writeFileSync(workflowPath, '{"1":{"inputs":{}}}');

      const result = await new DocumentCompiler(root).compile(
        { id: 'arrival', filePath: assetPath },
        {},
        { workflowPath },
      );
      if (result.kind !== 'canonical') throw new Error('expected canonical compilation');

      expect(result.snapshot.production.workflowPath).toBe('workflows/shot.json');
      expect(result.snapshot.references).toContainEqual(expect.objectContaining({
        kind: 'workflow',
        uri: 'workflows/shot.json',
        digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      }));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('lowers the short-drama Snapshot to a provider payload equivalent to the legacy Job path', async () => {
    const { root, assetPath } = setupProject(true, 'volc.seedance');
    try {
      const compiler = new DocumentCompiler(root);
      const result = await compiler.compile({ id: 'arrival', filePath: assetPath }, { duration: 5 });
      if (result.kind !== 'canonical') throw new Error('expected canonical compilation');

      const legacyJob = await (new ProductionPipeline(root) as any).buildJob(
        { id: 'arrival', filePath: assetPath },
        { duration: 5 },
      );
      const ctx = {
        projectRoot: root,
        configLoader: {
          getModelConfig: jest.fn().mockReturnValue({
            provider: 'volcengine',
            type: 'video',
            api_url: 'https://example.invalid/generate',
            api_status_url: 'https://example.invalid/status',
            model: 'seedance',
          }),
          getResolvedApiKey: jest.fn().mockReturnValue('test-key'),
        },
      } as any;
      const builder = new TaskBuilder(ctx);
      const outputDir = path.join(root, '.opsv', 'queue-test');
      const legacy = await builder.compileToDir([legacyJob], 'volc.seedance', outputDir, true);
      const canonical = await builder.compileProductionTasksToDir(
        [compileProductionTask(result.snapshot)],
        'volc.seedance',
        outputDir,
        true,
      );

      expect(canonical[0].payload).toEqual(legacy[0].payload);
      expect({ ...canonical[0]._opsv, canonical: undefined, compiledAt: undefined }).toEqual({
        ...legacy[0]._opsv,
        canonical: undefined,
        compiledAt: undefined,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails before provider compilation when the production capability binding is missing', async () => {
    const { root, assetPath } = setupProject(false);
    try {
      await expect(new DocumentCompiler(root).compile({ id: 'arrival', filePath: assetPath }, {}))
        .rejects.toThrow(/CAPABILITY_BINDING_MISSING/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
