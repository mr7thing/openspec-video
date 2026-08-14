import fs from 'fs';
import os from 'os';
import path from 'path';
import { ProductionPipeline } from '../ProductionPipeline';

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
