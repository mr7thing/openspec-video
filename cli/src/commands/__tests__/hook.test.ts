// ============================================================================
// opsv hook install|uninstall (A2) contract tests.
// Covers: standalone install into a .trellis-free project, settings.json
// structured merge semantics (idempotent, Trellis blocks preserved),
// uninstall rollback, clear failure when no OPSV block exists, foreign-file
// conflict handling, and standalone runnability of installed hook scripts.
// ============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import {
  installHooks,
  uninstallHooks,
  mergeOpsvHookSettings,
  isOpsvManagedGroup,
  resolveTemplateDir,
  HOOK_SCRIPT_NAMES,
  OPSV_HOOK_MARKER,
} from '../hook';

// Mirrors the real Trellis-owned registration in this repo's .claude/settings.json.
const TRELLIS_SETTINGS = {
  env: { CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR: '1' },
  hooks: {
    SessionStart: [
      { matcher: 'startup', hooks: [{ type: 'command', command: 'python3 .claude/hooks/session-start.py', timeout: 30 }] },
      { matcher: 'clear', hooks: [{ type: 'command', command: 'python3 .claude/hooks/session-start.py', timeout: 30 }] },
      { matcher: 'compact', hooks: [{ type: 'command', command: 'python3 .claude/hooks/session-start.py', timeout: 30 }] },
    ],
    PreToolUse: [
      { matcher: 'Task', hooks: [{ type: 'command', command: 'python3 .claude/hooks/inject-subagent-context.py', timeout: 30 }] },
    ],
    UserPromptSubmit: [
      { hooks: [{ type: 'command', command: 'python3 .claude/hooks/inject-workflow-state.py', timeout: 15 }] },
    ],
  },
};

function readSettings(root: string): any {
  return JSON.parse(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8'));
}

function seedTrellisSettings(root: string): void {
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify(TRELLIS_SETTINGS, null, 2));
}

describe('opsv hook install/uninstall (A2)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsv-hook-install-'));
    // Deliberately no .trellis/ — standalone operation is the contract.
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('installs scripts and settings registration into a .trellis-free project', () => {
    const result = installHooks(root);

    expect(result.warnings).toEqual([]);
    for (const name of HOOK_SCRIPT_NAMES) {
      const dest = path.join(root, '.claude', 'hooks', name);
      expect(fs.existsSync(dest)).toBe(true);
      const content = fs.readFileSync(dest, 'utf8');
      expect(content).toContain(OPSV_HOOK_MARKER);
      // No .trellis path is ever referenced as a real file path (docstring
      // contract notes use `.trellis/` in backticks only; standalone
      // runnability in a .trellis-free dir is proven by the run test below).
      expect(content).not.toMatch(/\.trellis\/\w/);
      // Installed content matches the template shipped inside the package.
      expect(content).toBe(fs.readFileSync(path.join(resolveTemplateDir(), name), 'utf8'));
    }

    const settings = readSettings(root);
    for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse']) {
      const groups = settings.hooks[event];
      expect(Array.isArray(groups)).toBe(true);
      expect(groups.filter(isOpsvManagedGroup)).toHaveLength(1);
    }
    expect(settings.hooks.PreToolUse.find(isOpsvManagedGroup).matcher).toBe('Task|Agent');
  });

  it('is idempotent and never rewrites Trellis blocks', () => {
    seedTrellisSettings(root);

    installHooks(root);
    const afterFirst = readSettings(root);
    installHooks(root);
    const afterSecond = readSettings(root);

    expect(afterSecond).toEqual(afterFirst);
    // Exactly one OPSV group per event even after two installs.
    for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse']) {
      expect(afterSecond.hooks[event].filter(isOpsvManagedGroup)).toHaveLength(1);
    }
    // Every original Trellis group survives byte-for-byte.
    for (const event of Object.keys(TRELLIS_SETTINGS.hooks)) {
      const trellisGroups = (TRELLIS_SETTINGS.hooks as any)[event];
      const surviving = afterSecond.hooks[event].filter((g: any) => !isOpsvManagedGroup(g));
      expect(surviving).toEqual(trellisGroups);
    }
    expect(afterSecond.env).toEqual(TRELLIS_SETTINGS.env);
  });

  it('uninstall rolls back settings.json (Trellis preserved) and removes scripts', () => {
    seedTrellisSettings(root);
    installHooks(root);
    const result = uninstallHooks(root);

    expect(result.removedScripts).toHaveLength(HOOK_SCRIPT_NAMES.length);
    for (const name of HOOK_SCRIPT_NAMES) {
      expect(fs.existsSync(path.join(root, '.claude', 'hooks', name))).toBe(false);
    }
    // settings.json returns to its exact pre-install shape.
    expect(readSettings(root)).toEqual(TRELLIS_SETTINGS);
  });

  it('uninstall without an OPSV block fails with a clear error and touches nothing', () => {
    seedTrellisSettings(root);
    const before = fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8');

    expect(() => uninstallHooks(root)).toThrow(/HOOK_NOT_INSTALLED: no OPSV-managed hook block/);
    expect(fs.readFileSync(path.join(root, '.claude', 'settings.json'), 'utf8')).toBe(before);
  });

  it('uninstall on a project with no settings.json fails with a clear error', () => {
    expect(() => uninstallHooks(root)).toThrow(/HOOK_NOT_INSTALLED/);
  });

  it('install refuses to overwrite a foreign file occupying an OPSV script path', () => {
    const hooksDir = path.join(root, '.claude', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    const foreign = path.join(hooksDir, 'opsv-inject-workflow-state.py');
    fs.writeFileSync(foreign, '# user-owned customization\n');

    const result = installHooks(root);

    expect(result.warnings.some((w) => w.includes('Refusing to overwrite non-OPSV file'))).toBe(true);
    expect(fs.readFileSync(foreign, 'utf8')).toBe('# user-owned customization\n');
    // Other scripts still installed.
    expect(fs.existsSync(path.join(hooksDir, 'opsv-inject-session-start.py'))).toBe(true);
    // Uninstall keeps the foreign file while removing OPSV-owned scripts.
    const un = uninstallHooks(root);
    expect(un.keptForeignScripts).toEqual([foreign]);
    expect(fs.existsSync(foreign)).toBe(true);
  });

  it('merge warns instead of rewriting a non-OPSV block that runs an opsv script from a foreign path', () => {
    const existing = {
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: 'command', command: 'python3 /opt/custom/opsv-inject-workflow-state.py' }] },
        ],
      },
    };
    const { settings, warnings } = mergeOpsvHookSettings(existing);

    expect(warnings.some((w) => w.startsWith('Conflict:'))).toBe(true);
    const groups = (settings.hooks as any).UserPromptSubmit;
    expect(groups[0].hooks[0].command).toBe('python3 /opt/custom/opsv-inject-workflow-state.py');
    expect(groups.filter(isOpsvManagedGroup)).toHaveLength(1);
  });

  it('installed hook scripts run standalone: stdin JSON in, exit 0 out', () => {
    installHooks(root);
    for (const name of HOOK_SCRIPT_NAMES) {
      const script = path.join(root, '.claude', 'hooks', name);
      // execFileSync throws on non-zero exit, so reaching the end means exit 0.
      execFileSync('python3', [script], { input: '{}', stdio: ['pipe', 'pipe', 'pipe'] });
    }
  });
});
