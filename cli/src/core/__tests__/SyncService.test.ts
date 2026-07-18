import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SyncService } from '../SyncService';

describe('SyncService', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-sync-'));
    fs.mkdirSync(path.join(root, 'videospec', 'assets'), { recursive: true });
    execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@opsv.local'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'OpsV Test'], { cwd: root });
    fs.writeFileSync(path.join(root, 'videospec', 'assets', 'hero.md'), '---\ncategory: image\nstatus: syncing\n---\n# Hero\n');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('commits only the syncing Asset Document and returns it to approved', () => {
    fs.writeFileSync(path.join(root, 'unrelated.txt'), 'leave unstaged');
    const result = new SyncService(root).sync('hero');
    expect(result.commitCreated).toBe(true);
    expect(fs.readFileSync(path.join(root, 'videospec', 'assets', 'hero.md'), 'utf8')).toContain('status: approved');
    const names = execFileSync('git', ['show', '--name-only', '--format='], { cwd: root, encoding: 'utf8' });
    expect(names.trim()).toBe('videospec/assets/hero.md');
    expect(fs.existsSync(path.join(root, 'unrelated.txt'))).toBe(true);
  });
});
