import fs from 'fs';
import os from 'os';
import path from 'path';
import { Command } from 'commander';
import { registerInitCommand } from '../init';

describe('opsv init rhcli setup guidance', () => {
  let root: string;
  let previousCwd: string;
  let logs: string[];
  let spyLog: jest.SpyInstance;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-init-rhcli-'));
    previousCwd = process.cwd();
    logs = [];
    spyLog = jest.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });
    process.exitCode = 0;
  });

  afterEach(() => {
    spyLog.mockRestore();
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
    process.exitCode = 0;
  });

  it('keeps RH CLI optional while documenting both binary overrides', async () => {
    const projectParent = path.join(root, 'projects');
    fs.mkdirSync(projectParent);
    const program = new Command();
    program.exitOverride();
    registerInitCommand(program, 'test');

    await program.parseAsync(['node', 'opsv', 'init', 'demo', '--dir', projectParent]);

    const project = path.join(projectParent, 'demo');
    const envSample = fs.readFileSync(path.join(project, '.env.sample'), 'utf8');
    const output = logs.join('\n');

    expect(fs.existsSync(project)).toBe(true);
    expect(envSample).toContain('# RH_CLI_BINARY=/absolute/path/to/compatible/rh');
    expect(envSample).toContain('# Alternatively set models.<model-key>.rh.binary');
    expect(output).toContain('Optional RH CLI: set RH_CLI_BINARY=');
    expect(output).toContain('models.<model-key>.rh.binary');
  });
});
