import fs from 'fs';
import os from 'os';
import path from 'path';
import { ProductionPipeline } from '../ProductionPipeline';
import { TaskBuilder } from '../compiler/TaskBuilder';

describe('ProductionPipeline reference gates', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-pipeline-'));
    fs.mkdirSync(path.join(root, 'videospec', 'assets'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  async function errors(sourceStatus: string, refKey = '@source'): Promise<string[]> {
    const source = path.join(root, 'videospec/assets/source.md');
    const target = path.join(root, 'videospec/assets/target.md');
    fs.writeFileSync(source, `---\ncategory: image\nstatus: ${sourceStatus}\n---\n## Approved References\n\n![one](one.png)\n![two](two.png)\n`);
    fs.writeFileSync(target, `---\ncategory: image\nstatus: drafting\nrefs:\n  image:\n    "${refKey}": [source.png]\n---\n`);
    return (new ProductionPipeline(root) as any).validateRefStatuses({ id: 'target', filePath: target }, {});
  }

  it('blocks an external reference to a syncing Asset', async () => {
    await expect(errors('syncing')).resolves.toEqual(expect.arrayContaining([expect.stringContaining('syncing')]));
  });

  it('requires a variant for an Asset with multiple approved outputs', async () => {
    await expect(errors('approved')).resolves.toEqual(expect.arrayContaining([expect.stringContaining('variant required')]));
  });
});

describe('ProductionPipeline Phase 0 legacy characterization', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-pipeline-characterization-'));
    fs.mkdirSync(path.join(root, 'videospec', 'assets'), { recursive: true });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('builds a mutable Job directly from Asset Markdown and copies arbitrary frontmatter into payload.extra', async () => {
    const assetPath = path.join(root, 'videospec', 'assets', 'shot-legacy.md');
    fs.writeFileSync(assetPath, [
      '---',
      'status: drafting',
      'aspect_ratio: "16:9"',
      'quality: high',
      'provider_hint: legacy-only',
      'seed: 42',
      '---',
      '',
      'Prompt sourced from the Markdown body.',
      '',
    ].join('\n'));

    const job = await (new ProductionPipeline(root) as any).buildJob(
      { id: 'shot-legacy', filePath: assetPath },
      { duration: 5 },
    );

    expect(job).toMatchObject({
      id: 'shot-legacy',
      type: 'produce',
      prompt: 'Prompt sourced from the Markdown body.',
      payload: {
        prompt: 'Prompt sourced from the Markdown body.',
        global_settings: { aspect_ratio: '16:9', quality: 'high' },
        extra: {
          media_refs: [],
          duration: 5,
          status: 'drafting',
          aspect_ratio: '16:9',
          quality: 'high',
          provider_hint: 'legacy-only',
          seed: 42,
        },
      },
    });
    expect(job).not.toHaveProperty('_meta');
  });
});

describe('ProductionPipeline canonical production routing', () => {
  it('routes a Pack-backed Asset Document through ProductionTask lowering instead of the legacy Job facade', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-pipeline-canonical-'));
    const pack = path.resolve(__dirname, '../../../../packs/short-drama');
    const circleDir = path.join(root, '.opsv', 'queue', 'story_circle1');
    const assetPath = path.join(root, 'videospec', 'shots', 'arrival.md');
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.mkdirSync(circleDir, { recursive: true });
    fs.writeFileSync(
      path.join(root, '.opsv', 'project.yaml'),
      `packs:\n  - id: short-drama\n    source: ${pack}\nbindings:\n  video-generation: rhcli.seedance\n`,
    );
    fs.writeFileSync(assetPath, [
      '---',
      'id: arrival',
      'category: shot',
      'profile: shot-video',
      'status: drafting',
      'aspect_ratio: "16:9"',
      'quality: high',
      '---',
      '',
      'A traveler enters through the old city gate.',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(circleDir, '_manifest.json'), JSON.stringify({
      assets: {
        arrival: { status: 'drafting', category: 'shot' },
      },
    }));

    const canonicalSpy = jest.spyOn(TaskBuilder.prototype, 'compileProductionTasksToDir')
      .mockResolvedValue([{
        payload: {},
        _opsv: {
          provider: 'rhcli',
          modelKey: 'rhcli.seedance',
          type: 'video',
          shotId: 'arrival',
          api_url: 'https://example.invalid',
          compiledAt: '2026-08-14T00:00:00.000Z',
        },
      }]);
    const legacySpy = jest.spyOn(TaskBuilder.prototype, 'compileToDir').mockResolvedValue([]);

    try {
      const result = await new ProductionPipeline(root).run({
        modelKey: 'rhcli.seedance',
        circleDir,
        dryRun: true,
      });

      expect(result).toMatchObject({ compiled: 1, skipped: 0, errors: [] });
      expect(canonicalSpy).toHaveBeenCalledTimes(1);
      const [tasks] = canonicalSpy.mock.calls[0];
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        schema: 'opsv.production-task',
        id: 'arrival',
        boundModel: 'rhcli.seedance',
      });
      expect(legacySpy).not.toHaveBeenCalled();
    } finally {
      canonicalSpy.mockRestore();
      legacySpy.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
