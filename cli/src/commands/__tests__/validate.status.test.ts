import { findStatusInconsistencies } from '../validate';
import path from 'path';
import fs from 'fs';

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
