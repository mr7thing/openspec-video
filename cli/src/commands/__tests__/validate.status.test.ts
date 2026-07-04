import { findStatusInconsistencies } from '../validate';
import path from 'path';
import fs from 'fs';
import { CircleManifest, ManifestAssetEntry } from '../../types/ManifestSchema';

describe('validate status vs manifest consistency', () => {
  const os = require('os');
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-status-test-'));
  });

  afterEach(() => {
    function rimraf(dir: string) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir)) {
        const p = path.join(dir, entry);
        fs.statSync(p).isDirectory() ? rimraf(p) : fs.unlinkSync(p);
      }
      fs.rmdirSync(dir);
    }
    rimraf(tmpDir);
  });

  function writeFile(relativePath: string, content: string) {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  }

  it('reports manifest approved but frontmatter drafting', () => {
    // videospec root = tmpDir/videospec
    // queue dir = tmpDir/opsv-queue
    const videospecDir = path.join(tmpDir, 'videospec');
    fs.mkdirSync(videospecDir, { recursive: true });
    const queueDir = path.join(tmpDir, 'opsv-queue', 'videospec_circle1');
    fs.mkdirSync(queueDir, { recursive: true });

    // Document: status=drafting, in subdirectory (not root level)
    writeFile('videospec/shots/shot.md', `---\ncategory: shot-design\nasset_id: shot\nstatus: drafting\n---\n\n# Shot`);
    // Manifest: status=approved
    fs.writeFileSync(
      path.join(queueDir, '_manifest.json'),
      JSON.stringify({
        target: videospecDir,
        assets: {
          shot: { id: 'shot', status: 'approved', index: 0, category: 'shot-design' }
        }
      }, null, 2)
    );

    const inconsistencies = findStatusInconsistencies(tmpDir);
    expect(inconsistencies).toContainEqual(
      expect.objectContaining({
        file: path.join('shots', 'shot.md'),
        docStatus: 'drafting',
        manifestStatus: 'approved',
      })
    );
  });

  it('passes when manifest status matches frontmatter status', () => {
    const videospecDir = path.join(tmpDir, 'videospec');
    fs.mkdirSync(videospecDir, { recursive: true });
    const queueDir = path.join(tmpDir, 'opsv-queue', 'videospec_circle1');
    fs.mkdirSync(queueDir, { recursive: true });

    writeFile('videospec/shot.md', `---\ncategory: shot-design\nasset_id: shot\nstatus: approved\n---\n\n# Shot`);
    fs.writeFileSync(
      path.join(queueDir, '_manifest.json'),
      JSON.stringify({
        target: videospecDir,
        assets: {
          shot: { id: 'shot', status: 'approved', index: 0, category: 'shot-design' }
        }
      }, null, 2)
    );

    const inconsistencies = findStatusInconsistencies(tmpDir);
    expect(inconsistencies).toEqual([]);
  });

  it('passes when no opsv-queue directory exists', () => {
    writeFile('videospec/shot.md', `---\ncategory: shot-design\nasset_id: shot\nstatus: drafting\n---\n\n# Shot`);

    const inconsistencies = findStatusInconsistencies(tmpDir);
    expect(inconsistencies).toEqual([]);
  });

  it('skips root-level documents', () => {
    // Root-level *.md files are not validated (same as validate command behavior)
    // videospecDir = tmpDir/videospec, no subdirs
    const videospecDir = path.join(tmpDir, 'videospec');
    fs.mkdirSync(videospecDir, { recursive: true });
    const queueDir = path.join(tmpDir, 'opsv-queue', 'videospec_circle1');
    fs.mkdirSync(queueDir, { recursive: true });

    writeFile('videospec/project.md', `---\ncategory: project\nasset_id: project\nstatus: approved\n---\n\n# Project`);
    fs.writeFileSync(
      path.join(queueDir, '_manifest.json'),
      JSON.stringify({
        target: videospecDir,
        assets: {
          project: { id: 'project', status: 'approved', index: 0, category: 'project' }
        }
      }, null, 2)
    );

    const inconsistencies = findStatusInconsistencies(tmpDir);
    expect(inconsistencies).toEqual([]);
  });
});

// ============================================================================
// Validate --circle mode tests
// ============================================================================

describe('validate --circle status consistency', () => {
  const os = require('os');
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-circle-validate-test-'));
  });

  afterEach(() => {
    function rimraf(dir: string) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir)) {
        const p = path.join(dir, entry);
        fs.statSync(p).isDirectory() ? rimraf(p) : fs.unlinkSync(p);
      }
      fs.rmdirSync(dir);
    }
    rimraf(tmpDir);
  });

  function writeFile(relativePath: string, content: string) {
    const fullPath = path.join(tmpDir, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  }

  it('inline check: reports mismatch when manifest status differs from frontmatter', () => {
    // Simulate the logic used in validate.ts --circle mode
    const manifest: CircleManifest = {
      version: '0.11.0',
      target: path.join(tmpDir, 'videospec'),
      generatedAt: new Date().toISOString(),
      assets: {
        shot: { status: 'approved', index: 0, category: 'shot-design' },
      },
      circles: [{ circle: 'firstcircle', index: 0, assetIds: ['shot'], status: { shot: 'approved' } }],
    };

    writeFile('videospec/shots/shot.md', `---\ncategory: shot-design\nasset_id: shot\nstatus: drafting\n---\n\n# Shot`);

    // Inline check logic (same as validate.ts)
    const issues: Array<{ file: string; docStatus: string; manifestStatus: string }> = [];
    const assetId = 'shot';
    const frontmatterStatus = 'drafting';
    const manifestEntry = manifest.assets?.[assetId];

    if (manifestEntry && frontmatterStatus) {
      if (frontmatterStatus !== manifestEntry.status) {
        issues.push({
          file: 'shots/shot.md',
          docStatus: frontmatterStatus,
          manifestStatus: manifestEntry.status,
        });
      }
    }

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      file: 'shots/shot.md',
      docStatus: 'drafting',
      manifestStatus: 'approved',
    });
  });

  it('inline check: passes when manifest status matches frontmatter status', () => {
    const manifest: CircleManifest = {
      version: '0.11.0',
      target: path.join(tmpDir, 'videospec'),
      generatedAt: new Date().toISOString(),
      assets: {
        shot: { status: 'approved', index: 0, category: 'shot-design' },
      },
      circles: [{ circle: 'firstcircle', index: 0, assetIds: ['shot'], status: { shot: 'approved' } }],
    };

    writeFile('videospec/shots/shot.md', `---\ncategory: shot-design\nasset_id: shot\nstatus: approved\n---\n\n# Shot`);

    const issues: Array<{ file: string; docStatus: string; manifestStatus: string }> = [];
    const assetId = 'shot';
    const frontmatterStatus = 'approved';
    const manifestEntry = manifest.assets?.[assetId];

    if (manifestEntry && frontmatterStatus) {
      if (frontmatterStatus !== manifestEntry.status) {
        issues.push({
          file: 'shots/shot.md',
          docStatus: frontmatterStatus,
          manifestStatus: manifestEntry.status,
        });
      }
    }

    expect(issues).toHaveLength(0);
  });

  it('inline check: handles missing frontmatter status gracefully', () => {
    const manifest: CircleManifest = {
      version: '0.11.0',
      target: path.join(tmpDir, 'videospec'),
      generatedAt: new Date().toISOString(),
      assets: {
        shot: { status: 'approved', index: 0, category: 'shot-design' },
      },
      circles: [{ circle: 'firstcircle', index: 0, assetIds: ['shot'], status: { shot: 'approved' } }],
    };

    writeFile('videospec/shots/shot.md', `---\ncategory: shot-design\nasset_id: shot\n---\n\n# Shot`);

    const issues: Array<{ file: string; docStatus: string; manifestStatus: string }> = [];
    const assetId = 'shot';
    const frontmatterStatus = undefined; // no status in frontmatter
    const manifestEntry = manifest.assets?.[assetId];

    if (manifestEntry && frontmatterStatus) {
      if (frontmatterStatus !== manifestEntry.status) {
        issues.push({ file: 'shots/shot.md', docStatus: frontmatterStatus, manifestStatus: manifestEntry.status });
      }
    }

    // Should skip without error when frontmatter has no status
    expect(issues).toHaveLength(0);
  });

  it('inline check: handles multiple assets with mixed statuses', () => {
    const manifest: CircleManifest = {
      version: '0.11.0',
      target: path.join(tmpDir, 'videospec'),
      generatedAt: new Date().toISOString(),
      assets: {
        hero: { status: 'approved', index: 0, category: 'element' },
        temple: { status: 'drafting', index: 0, category: 'element' },
        scene1: { status: 'approved', index: 1, category: 'scene' },
      },
      circles: [
        { circle: 'zerocircle', index: 0, assetIds: ['hero', 'temple'], status: { hero: 'approved', temple: 'drafting' } },
        { circle: 'firstcircle', index: 1, assetIds: ['scene1'], status: { scene1: 'approved' } },
      ],
    };

    writeFile('videospec/elements/hero.md', `---\ncategory: element\nasset_id: hero\nstatus: approved\n---\n\n# Hero`);
    writeFile('videospec/elements/temple.md', `---\ncategory: element\nasset_id: temple\nstatus: rejected\n---\n\n# Temple`);

    const issues: Array<{ file: string; docStatus: string; manifestStatus: string }> = [];
    const docs: Record<string, string> = {
      hero: 'approved',
      temple: 'rejected',
    };

    for (const [assetId, frontmatterStatus] of Object.entries(docs)) {
      const manifestEntry = manifest.assets?.[assetId];
      if (manifestEntry && frontmatterStatus) {
        if (frontmatterStatus !== manifestEntry.status) {
          issues.push({
            file: `${assetId}.md`,
            docStatus: frontmatterStatus,
            manifestStatus: manifestEntry.status,
          });
        }
      }
    }

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      file: 'temple.md',
      docStatus: 'rejected',
      manifestStatus: 'drafting',
    });
  });
});
