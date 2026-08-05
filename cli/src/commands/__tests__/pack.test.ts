import fs from 'fs';
import os from 'os';
import path from 'path';
import { Command } from 'commander';
import { registerPackCommands } from '../pack';

describe('opsv pack check', () => {
  let root: string;
  let logs: string[];
  let errors: string[];
  let spyLog: jest.SpyInstance;
  let spyErr: jest.SpyInstance;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-pack-cmd-'));
    logs = [];
    errors = [];
    spyLog = jest.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });
    spyErr = jest.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args.join(' ')); });
    process.exitCode = 0;
  });
  afterEach(() => {
    spyLog.mockRestore();
    spyErr.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
    process.exitCode = 0;
  });

  function writePack(files: Record<string, string>): void {
    for (const [rel, content] of Object.entries(files)) {
      const target = path.join(root, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  }

  const VALID = {
    'pack.yaml': 'id: demo\nversion: 1.0.0\ncategories:\n  shot: categories/shot.yaml\nprofiles:\n  i2v: profiles/i2v.yaml\nskills:\n  create-shot: skills/create-shot/skill.yaml\n',
    'categories/shot.yaml': 'default_profile: i2v\nprofiles: [i2v]\n',
    'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: create-shot\noutputs: [video]\n',
    'skills/create-shot/skill.yaml': 'action: compile\ncategory: shot\nprofile: i2v\ngates: [work-check]\n',
  };

  async function run(args: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerPackCommands(program);
    await program.parseAsync(['node', 'opsv', ...args]);
  }

  it('prints pure machine JSON on stdout with --json', async () => {
    writePack(VALID);
    await run(['pack', 'check', root, '--json']);
    expect(process.exitCode).toBe(0);
    const stdout = logs.join('\n');
    const parsed = JSON.parse(stdout); // throws if any non-JSON line leaked into stdout
    expect(parsed.ok).toBe(true);
    expect(parsed.pack.id).toBe('demo');
  });

  it('exits 1 and reports issues as JSON for an invalid pack', async () => {
    writePack({ ...VALID, 'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: ghost\noutputs: [video]\n' });
    await run(['pack', 'check', root, '--json']);
    expect(process.exitCode).toBe(1);
    const parsed = JSON.parse(logs.join('\n'));
    expect(parsed.ok).toBe(false);
    expect(parsed.issues.some((i: any) => i.code === 'PACK_PROFILE_SKILL_MISSING')).toBe(true);
  });

  it('renders a human report without --json', async () => {
    writePack(VALID);
    await run(['pack', 'check', root]);
    expect(process.exitCode).toBe(0);
    expect(logs.join('\n')).toContain('demo@1.0.0: 0 issues');
  });
});
