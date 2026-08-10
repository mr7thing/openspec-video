import fs from 'fs';
import os from 'os';
import path from 'path';
import { Command } from 'commander';
import { registerConformanceCommand } from '../conformance';

describe('opsv conformance', () => {
  let root: string;
  let logs: string[];
  let errors: string[];
  let spyLog: jest.SpyInstance;
  let spyErr: jest.SpyInstance;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-conformance-cmd-'));
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

  const VALID: Record<string, string> = {
    'pack.yaml': [
      'id: demo',
      'version: 1',
      'categories:',
      '  script: categories/script.yaml',
      'profiles:',
      '  draft-script: profiles/draft-script.yaml',
      'skills:',
      '  draft-script: skills/draft-script/skill.yaml',
      '',
    ].join('\n'),
    'graph.yaml': [
      'workflow:',
      '  script:',
      '    inputs: []',
      '    outputs:',
      '      contract: script-doc',
      '    completion: [document_status_approved]',
      '    roles:',
      '      document-author: required',
      '',
    ].join('\n'),
    'categories/script.yaml': 'default_profile: draft-script\nprofiles: [draft-script]\n',
    'profiles/draft-script.yaml': 'kind: workflow\nskill: draft-script\n',
    'skills/draft-script/skill.yaml': 'action: draft\ncategory: script\nprofile: draft-script\n',
  };

  function writePack(files: Record<string, string>): void {
    for (const [rel, content] of Object.entries(files)) {
      const target = path.join(root, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  }

  async function run(args: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerConformanceCommand(program);
    await program.parseAsync(['node', 'opsv', ...args]);
  }

  it('prints the six-check matrix as pure machine JSON on stdout with --json', async () => {
    writePack(VALID);
    await run(['conformance', root, '--json']);
    expect(process.exitCode).toBe(0);
    const parsed = JSON.parse(logs.join('\n')); // throws if any non-JSON line leaked into stdout
    expect(parsed.pack.id).toBe('demo');
    expect(parsed.checks).toHaveLength(6);
    expect(parsed.ok).toBe(true);
  });

  it('exits non-zero and locates the failing stage when outputs.contract is missing', async () => {
    writePack({
      ...VALID,
      'graph.yaml': 'workflow:\n  script:\n    inputs: []\n    completion: [document_status_approved]\n    roles:\n      document-author: required\n',
    });
    await run(['conformance', root]);
    expect(process.exitCode).toBe(1);
    const output = logs.join('\n');
    expect(output).toContain('[FAIL]');
    expect(output).toContain('graph.yaml:2');
    expect(output).toContain('outputs.contract');
  });
});
