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

  function writeOutput(circle: string, providerDir: string, filename: string) {
    const dir = path.join(queueRoot, circle, providerDir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), 'fake-png');
  }

  it('approve with original task → status approved, writes Approved References', async () => {
    writeDoc('hero', '---\nstatus: drafting\n---\n# Hero');
    writeManifest('videospec_circle1', { hero: { status: 'drafting', index: 0 } });
    writeOutput('videospec_circle1', 'volc.seadream5_001', 'hero_1.png');

    const result = await service.execute({ circle: 'videospec_circle1', assetId: 'hero', action: 'approve', outputFiles: ['hero_1.png'] });

    expect(result.success).toBe(true);
    expect(result.status).toBe('approved');

    const docContent = fs.readFileSync(path.join(projectRoot, 'videospec', 'elements', '@hero.md'), 'utf-8');
    expect(docContent).toContain('status: approved');
    expect(docContent).toContain('Approved References');
  });

  it('approve with modified task (hero_m1_1.png) → status syncing', async () => {
    writeDoc('hero', '---\nstatus: drafting\n---\n# Hero');
    writeManifest('videospec_circle1', { hero: { status: 'drafting', index: 0 } });
    writeOutput('videospec_circle1', 'volc.seadream5_001', 'hero_m1_1.png');

    const result = await service.execute({ circle: 'videospec_circle1', assetId: 'hero', action: 'approve', outputFiles: ['hero_m1_1.png'] });

    expect(result.success).toBe(true);
    expect(result.status).toBe('syncing');

    const docContent = fs.readFileSync(path.join(projectRoot, 'videospec', 'elements', '@hero.md'), 'utf-8');
    expect(docContent).toContain('status: syncing');
    // Still writes Approved References — output is approved, just needs sync back
    expect(docContent).toContain('Approved References');
  });

  it('design_feedback keeps drafting and writes Design References', async () => {
    writeDoc('hero', '---\nstatus: drafting\n---\n# Hero');
    writeManifest('videospec_circle1', { hero: { status: 'drafting', index: 0 } });
    writeOutput('videospec_circle1', 'volc.seadream5_001', 'hero_1.png');

    const result = await service.execute({ circle: 'videospec_circle1', assetId: 'hero', action: 'design_feedback', outputFiles: ['hero_1.png'], note: 'Make the eyes more intense' });

    expect(result.success).toBe(true);
    expect(result.status).toBe('drafting');

    const docContent = fs.readFileSync(path.join(projectRoot, 'videospec', 'elements', '@hero.md'), 'utf-8');
    expect(docContent).toContain('status: drafting');
    expect(docContent).toContain('Design References');
    expect(docContent).toContain('Make the eyes more intense');
  });

  it('revise_prompt keeps drafting and writes review only', async () => {
    writeDoc('hero', '---\nstatus: drafting\n---\n# Hero');
    writeManifest('videospec_circle1', { hero: { status: 'drafting', index: 0 } });

    const result = await service.execute({ circle: 'videospec_circle1', assetId: 'hero', action: 'revise_prompt', note: 'Prompt needs more detail' });

    expect(result.success).toBe(true);
    expect(result.status).toBe('drafting');

    const docContent = fs.readFileSync(path.join(projectRoot, 'videospec', 'elements', '@hero.md'), 'utf-8');
    expect(docContent).toContain('status: drafting');
    expect(docContent).toContain('reviews:');
    expect(docContent).toContain('Prompt needs more detail');
    expect(docContent).not.toContain('Approved References');
    expect(docContent).not.toContain('Design References');
  });

  it('validates request', () => {
    expect(() => service.validateRequest({ circle: '../etc', assetId: 'hero', action: 'approve' })).toThrow(ValidationError);
    expect(() => service.validateRequest({ circle: 'circle1', assetId: '', action: 'approve' })).toThrow(ValidationError);
    expect(() => service.validateRequest({ circle: 'circle1', assetId: 'hero', action: 'bogus' as any })).toThrow(ValidationError);
  });

  it('approve without outputFiles throws', () => {
    expect(() => service.validateRequest({ circle: 'circle1', assetId: 'hero', action: 'approve' })).toThrow('requires at least one output file');
  });

  it('throws if document not found', async () => {
    writeManifest('videospec_circle1', { hero: { status: 'drafting', index: 0 } });
    await expect(service.execute({ circle: 'videospec_circle1', assetId: 'hero', action: 'revise_prompt', note: 'test' }))
      .rejects.toThrow('Document not found');
  });

  it('updates manifest status', async () => {
    writeDoc('hero', '---\nstatus: drafting\n---\n# Hero');
    writeManifest('videospec_circle1', { hero: { status: 'drafting', index: 0 } });

    await service.execute({ circle: 'videospec_circle1', assetId: 'hero', action: 'revise_prompt', note: 'fix prompt' });

    const manifest = JSON.parse(fs.readFileSync(path.join(queueRoot, 'videospec_circle1', '_manifest.json'), 'utf-8'));
    expect(manifest.assets.hero.status).toBe('drafting');
  });

  it('always writes review entry even with empty note', async () => {
    writeDoc('hero', '---\nstatus: drafting\n---\n# Hero');
    writeManifest('videospec_circle1', { hero: { status: 'drafting', index: 0 } });

    await service.execute({ circle: 'videospec_circle1', assetId: 'hero', action: 'revise_prompt' });

    const docContent = fs.readFileSync(path.join(projectRoot, 'videospec', 'elements', '@hero.md'), 'utf-8');
    expect(docContent).toContain('reviews:');
  });
});
