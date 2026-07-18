import fs from 'fs';
import os from 'os';
import path from 'path';
import { ApprovedRefReader } from '../ApprovedRefReader';

describe('ApprovedRefReader', () => {
  let tmpDir: string;
  let docPath: string;
  let reader: ApprovedRefReader;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-approved-ref-'));
    docPath = path.join(tmpDir, 'hero.md');
    reader = new ApprovedRefReader(tmpDir);
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('permits a bare reference only when exactly one approved reference exists', async () => {
    fs.writeFileSync(docPath, '## Approved References\n\n![portrait](portrait.png)\n');
    expect(await reader.getFirst(docPath)).toBe(path.join(tmpDir, 'portrait.png'));

    fs.writeFileSync(docPath, '## Approved References\n\n![portrait](portrait.png)\n![casual](casual.png)\n');
    expect(await reader.getFirst(docPath)).toBeNull();
  });

  it('reports duplicate variants instead of silently overwriting them', async () => {
    fs.writeFileSync(docPath, '## Approved References\n\n![portrait](one.png)\n![portrait](two.png)\n');
    expect(await reader.getDuplicateVariants(docPath)).toEqual(['portrait']);
    expect(await reader.getAll(docPath)).toHaveLength(2);
    expect(await reader.getVariant(docPath, 'portrait')).toBeNull();
  });

  it('rejects an approval that reuses an existing variant', async () => {
    fs.writeFileSync(docPath, '## Approved References\n\n![portrait](portrait.png)\n');
    await expect(reader.appendApprovedRef(docPath, 'portrait', path.join(tmpDir, 'other.png')))
      .rejects.toThrow('already exists');
  });
});
