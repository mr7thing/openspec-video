// ============================================================================
// opsv validate --inline (A6) — command-level fixture tests.
// Proves: proposed content with a dead ref yields the same REF_MISSING code
// as the disk scan; valid content exits 0; hook cache key ingredients
// (proposedContentHash + Pack content_digest) are in the JSON report; and the
// inline path works in projects without .opsv/ or .trellis/ (standalone).
// ============================================================================

import { Command } from 'commander';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { registerValidateCommand } from '../validate';
import { logger } from '../../utils/logger';
import { loadProjectConfig, resolvePacks } from '../../core/ProjectConfig';

process.env.FORCE_COLOR = '0';

interface RunResult {
  exitCode: number | null;
  output: string;
}

async function runValidate(args: string[]): Promise<RunResult> {
  const program = new Command();
  program.exitOverride();
  registerValidateCommand(program, '0.0.0-test');

  const chunks: string[] = [];
  const exitSpy = jest
    .spyOn(process, 'exit')
    .mockImplementation(((code?: number) => {
      throw new Error(`__exit:${code ?? 0}`);
    }) as never);
  const logSpy = jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => chunks.push(a.join(' ')));
  const errSpy = jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => chunks.push(a.join(' ')));
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const writeSpy = jest
    .spyOn(process.stdout, 'write')
    .mockImplementation(((chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    }) as never);
  // Keep winston uninitialized: the action's catch would otherwise create a
  // logs/ dir when our mocked process.exit throws through it.
  const loggerSpy = jest.spyOn(logger, 'error').mockImplementation((() => undefined) as never);

  let exitCode: number | null = null;
  try {
    await program.parseAsync(['node', 'opsv', ...args]);
  } catch (err: any) {
    const match = /__exit:(\d+)/.exec(err?.message ?? '');
    if (match) exitCode = parseInt(match[1], 10);
    else throw err;
  } finally {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
    warnSpy.mockRestore();
    writeSpy.mockRestore();
    loggerSpy.mockRestore();
  }
  return { exitCode, output: chunks.join('\n') };
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

const HERO_DOC = [
  '---',
  'category: shot',
  'status: drafting',
  'prompt: A hero standing in the rain',
  'brief: hero shot',
  '---',
  '',
  'Hero body',
  '',
].join('\n');

const PROPOSED_DEAD_REF = [
  '---',
  'category: shot',
  'status: drafting',
  'prompt: Uses @ghost reference here',
  'brief: ghost user',
  'refs:',
  '  image:',
  '    "@ghost": ["videospec/elements/ghost.png"]',
  '---',
  '',
  'Body',
  '',
].join('\n');

const PACK_FILES: Record<string, string> = {
  'pack.yaml': [
    'id: ready',
    'version: 1.0.0',
    'policy:',
    '  sync: human',
    'categories:',
    '  shot: categories/shot.yaml',
    'profiles:',
    '  i2v: profiles/i2v.yaml',
    'skills:',
    '  create-shot: skills/create-shot/skill.yaml',
    '',
  ].join('\n'),
  'categories/shot.yaml': 'default_profile: i2v\nprofiles: [i2v]\n',
  'profiles/i2v.yaml': 'kind: production\ncapability: continuous-i2v\nskill: create-shot\noutputs: [video]\n',
  'skills/create-shot/skill.yaml': 'action: compile\ncategory: shot\nprofile: i2v\ngates: [work-check, refs-valid, circle]\ncompletion: task-compiled\n',
  'skills/create-shot/SKILL.md': '# Create Shot\n',
};

describe('opsv validate --inline (A6)', () => {
  let root: string;
  let previousCwd: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-inline-'));
    previousCwd = process.cwd();
    process.chdir(root);
  });
  afterEach(() => {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeBaseProject(): void {
    writeFiles(root, {
      '.opsv/project.yaml': 'packs: []\n',
      '.opsv/category_validate.yaml': '{}\n',
      '.opsv/input_types.yaml': 'input_types:\n  image:\n    description: test\n',
      'videospec/shots/hero.md': HERO_DOC,
    });
  }

  it('reports REF_MISSING for proposed content, same code as the disk scan', async () => {
    writeBaseProject();
    // Docs one level below the scan dir: the disk scan skips scan-root-level
    // files by design (pre-existing "root-level" rule).
    writeFiles(root, { 'videospec/shots/seq/proposed.md': PROPOSED_DEAD_REF });

    // Disk path: the same content on disk is flagged as a dead reference.
    const disk = await runValidate(['validate', '--dir', 'videospec/shots']);
    expect(disk.exitCode).toBe(1);
    expect(disk.output).toContain('dead reference');
    expect(disk.output).toContain('refs "@ghost" — document not found');

    // Inline path: identical issue code for the identical proposed content.
    const inline = await runValidate(['validate', '--inline', 'videospec/shots/seq/proposed.md', '--json']);
    expect(inline.exitCode).toBe(1);
    const report = JSON.parse(inline.output);
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      expect.objectContaining({ code: 'REF_MISSING', severity: 'error', ref: 'ghost' }),
    ]);
  });

  it('exits 0 with ok=true for valid proposed content', async () => {
    writeBaseProject();
    writeFiles(root, { 'proposed.md': HERO_DOC });

    const inline = await runValidate(['validate', '--inline', 'proposed.md', '--json']);
    expect(inline.exitCode).toBeNull(); // no process.exit call → exit 0
    const report = JSON.parse(inline.output);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('JSON report carries hook cache key ingredients: proposedContentHash + Pack content_digest', async () => {
    writeFiles(root, {
      '.opsv/project.yaml': 'packs:\n  - id: ready\nbindings:\n  continuous-i2v: test.model\n',
      '.opsv/category_validate.yaml': '{}\n',
      '.opsv/input_types.yaml': 'input_types:\n  image:\n    description: test\n',
      'videospec/shots/hero.md': HERO_DOC,
      'proposed.md': HERO_DOC,
    });
    writeFiles(path.join(root, '.opsv', 'packs', 'ready'), PACK_FILES);

    const inline = await runValidate(['validate', '--inline', 'proposed.md', '--json']);
    expect(inline.exitCode).toBeNull();
    const report = JSON.parse(inline.output);
    expect(report.validatorContractVersion).toBe(1);
    expect(report.proposedContentHash).toMatch(/^[0-9a-f]{64}$/);
    // Pack content_digest comes from the single PackDigest implementation.
    const expectedDigest = resolvePacks(root, loadProjectConfig(root))[0].contentDigest;
    expect(report.pack).toEqual({ id: 'ready', version: '1.0.0', contentDigest: expectedDigest });
  });

  it('works standalone: no .opsv/ and no .trellis/ in the project', async () => {
    // Deliberately no .opsv/, no videospec/, no .trellis/ — only the proposed
    // file and an explicit empty category config (avoids user-level fallback).
    writeFiles(root, {
      'category_validate.yaml': '{}\n',
      'valid.md': HERO_DOC,
      'invalid.md': HERO_DOC.replace('status: drafting\n', ''),
    });

    const valid = await runValidate(['validate', '--inline', 'valid.md', '--json', '--category-config', 'category_validate.yaml']);
    expect(valid.exitCode).toBeNull();
    expect(JSON.parse(valid.output).ok).toBe(true);

    const invalid = await runValidate(['validate', '--inline', 'invalid.md', '--json', '--category-config', 'category_validate.yaml']);
    expect(invalid.exitCode).toBe(1);
    const report = JSON.parse(invalid.output);
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      expect.objectContaining({ code: 'VALIDATION_SCHEMA_MISMATCH', severity: 'error' }),
    ]);
  });

  it('human output prints stable issue codes and exits non-zero on errors', async () => {
    writeBaseProject();
    writeFiles(root, { 'proposed.md': PROPOSED_DEAD_REF });

    const inline = await runValidate(['validate', '--inline', 'proposed.md']);
    expect(inline.exitCode).toBe(1);
    expect(inline.output).toContain('[REF_MISSING]');
    expect(inline.output).toContain('proposedContentHash:');
  });

  it('fails cleanly when the inline file does not exist', async () => {
    writeBaseProject();
    const inline = await runValidate(['validate', '--inline', 'nope.md']);
    expect(inline.exitCode).toBe(1);
    expect(inline.output).toContain('Inline file not found');
  });
});
