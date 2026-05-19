import fs from 'fs';
import path from 'path';
import os from 'os';
import { ManifestReader } from '../ManifestReader';
import { CompilationError } from '../../errors/OpsVError';

describe('ManifestReader', () => {
  let tmpDir: string;
  let reader: ManifestReader;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-manifest-'));
    reader = new ManifestReader();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeManifest(fileName: string, data: any) {
    fs.writeFileSync(path.join(tmpDir, fileName), JSON.stringify(data));
  }

  it('reads a valid manifest', () => {
    writeManifest('_manifest.json', {
      version: '0.9.0',
      target: 'videospec',
      generatedAt: new Date().toISOString(),
      assets: { hero: { status: 'drafting', index: 0, category: 'element' } },
      circles: [],
    });

    const result = reader.read(path.join(tmpDir, '_manifest.json'));
    expect(result.version).toBe('0.9.0');
    expect(result.assets?.hero.status).toBe('drafting');
  });

  it('caches manifest reads', () => {
    writeManifest('_manifest.json', {
      version: '0.9.0',
      target: 'videospec',
      generatedAt: new Date().toISOString(),
      assets: {},
      circles: [],
    });

    const mp = path.join(tmpDir, '_manifest.json');
    const a = reader.read(mp);
    const b = reader.read(mp);
    expect(a).toBe(b); // same reference
  });

  it('throws CompilationError on invalid manifest', () => {
    writeManifest('bad_manifest.json', { invalid: true });

    expect(() => reader.read(path.join(tmpDir, 'bad_manifest.json'))).toThrow(CompilationError);
  });

  it('throws CompilationError on missing required fields', () => {
    writeManifest('partial_manifest.json', { version: '0.9.0' });

    expect(() => reader.read(path.join(tmpDir, 'partial_manifest.json'))).toThrow(CompilationError);
  });

  it('invalidates cache entry', () => {
    writeManifest('_manifest.json', {
      version: '0.9.0',
      target: 'videospec',
      generatedAt: new Date().toISOString(),
      assets: { hero: { status: 'drafting', index: 0, category: 'element' } },
      circles: [],
    });

    const mp = path.join(tmpDir, '_manifest.json');
    const a = reader.read(mp);
    reader.invalidate(mp);
    const b = reader.read(mp);
    expect(a).not.toBe(b); // different reference after invalidation
  });
});
