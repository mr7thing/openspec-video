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
