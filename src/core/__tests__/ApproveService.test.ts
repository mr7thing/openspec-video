import fs from 'fs';
import path from 'path';
import os from 'os';
import { ApproveService } from '../ApproveService';
import { ManifestReader } from '../ManifestReader';
import { ValidationError } from '../../errors/OpsVError';

describe('ApproveService', () => {
  let tmpDir: string;
  let projectRoot: string;
  let queueRoot: string;
  let manifestReader: ManifestReader;
  let service: ApproveService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-approve-'));
    projectRoot = path.join(tmpDir, 'project');
    queueRoot = path.join(projectRoot, 'opsv-queue');
    fs.mkdirSync(queueRoot, { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'videospec', 'elements'), { recursive: true });

    manifestReader = new ManifestReader();
    service = new ApproveService(projectRoot, queueRoot, manifestReader);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeDoc(assetId: string, content: string) {
    const dir = path.join(projectRoot, 'videospec', 'elements');
    fs.writeFileSync(path.join(dir, `@${assetId}.md`), content);
  }

  function writeManifest(circle: string, assets: Record<string, any>) {
    const dir = path.join(queueRoot, `${circle}`);
    fs.mkdirSync(dir, { recursive: true });
    const fullAssets: Record<string, any> = {};
    for (const [id, info] of Object.entries(assets)) {
      fullAssets[id] = { category: 'element', ...info };
    }
    fs.writeFileSync(
      path.join(dir, '_manifest.json'),
      JSON.stringify({ version: '0.9.0', target: 'videospec', generatedAt: new Date().toISOString(), assets: fullAssets, circles: [] })
    );
  }

  it('approves an original task', () => {
    writeDoc('hero', '---\nstatus: drafting\n---\n# Hero');
    writeManifest('videospec_circle1', { hero: { status: 'drafting', index: 0 } });

    const result = service.execute({ circle: 'videospec_circle1', assetId: 'hero', outputFile: 'hero_1.png' });

    expect(result.success).toBe(true);
    expect(result.status).toBe('approved');

    const docContent = fs.readFileSync(path.join(projectRoot, 'videospec', 'elements', '@hero.md'), 'utf-8');
    expect(docContent).toContain('status: approved');
    expect(docContent).toContain('reviews:');
  });

  it('sets syncing for modified task', () => {
    writeDoc('hero', '---\nstatus: drafting\n---\n# Hero');
    writeManifest('videospec_circle1', { hero: { status: 'drafting', index: 0 } });

    const result = service.execute({ circle: 'videospec_circle1', assetId: 'hero', outputFile: 'hero_m1_1.png' });

    expect(result.status).toBe('syncing');
    const docContent = fs.readFileSync(path.join(projectRoot, 'videospec', 'elements', '@hero.md'), 'utf-8');
    expect(docContent).toContain('status: syncing');
  });

  it('validates request', () => {
    expect(() => service.execute({ circle: '../etc', assetId: 'hero' })).toThrow(ValidationError);
    expect(() => service.execute({ circle: 'circle1', assetId: '' })).toThrow(ValidationError);
  });

  it('throws if document not found', () => {
    writeManifest('videospec_circle1', { hero: { status: 'drafting', index: 0 } });
    expect(() => service.execute({ circle: 'videospec_circle1', assetId: 'hero' })).toThrow('Document not found');
  });

  it('updates manifest status', () => {
    writeDoc('hero', '---\nstatus: drafting\n---\n# Hero');
    writeManifest('videospec_circle1', { hero: { status: 'drafting', index: 0 } });

    service.execute({ circle: 'videospec_circle1', assetId: 'hero' });

    const manifest = JSON.parse(fs.readFileSync(path.join(queueRoot, 'videospec_circle1', '_manifest.json'), 'utf-8'));
    expect(manifest.assets.hero.status).toBe('approved');
  });
});
