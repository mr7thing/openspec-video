import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveProjectRoot } from '../projectResolver';

describe('resolveProjectRoot', () => {
  let root: string;
  beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-project-root-')); });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('recognizes canonical .opsv/project.yaml without legacy api config', () => {
    fs.mkdirSync(path.join(root, '.opsv'), { recursive: true });
    fs.mkdirSync(path.join(root, 'nested', 'work'), { recursive: true });
    fs.writeFileSync(path.join(root, '.opsv', 'project.yaml'), 'packs: []\n');
    expect(resolveProjectRoot(path.join(root, 'nested', 'work'))).toBe(root);
  });
});
