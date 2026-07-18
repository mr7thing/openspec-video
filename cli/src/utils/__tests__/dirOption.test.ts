import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveDirs } from '../dirOption';

describe('resolveDirs', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-dir-option-'));
    fs.mkdirSync(path.join(projectRoot, 'assets'), { recursive: true });
  });

  afterEach(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  it('uses caller-supplied configured defaults when --dir is absent', () => {
    expect(resolveDirs(undefined, projectRoot, { defaultDirs: ['assets'] })).toEqual(['assets']);
  });

  it('gives explicit directories precedence over configured defaults', () => {
    fs.mkdirSync(path.join(projectRoot, 'selected'));
    expect(resolveDirs(['selected'], projectRoot, { defaultDirs: ['assets'] })).toEqual(['selected']);
  });
});
