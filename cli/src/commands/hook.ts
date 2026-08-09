// ============================================================================
// OpsV opsv hook install|uninstall (A2)
// Self-install channel for OPSV Claude Code hooks: copies hook script
// templates shipped inside the npm package into the target project's
// .claude/hooks/ and merges an OPSV-owned registration block into
// .claude/settings.json. Standalone: never reads .trellis/.
// Merge rules (Go contract): structured, idempotent, uninstallable,
// rollback-safe. Only OPSV-marked blocks are managed; foreign blocks
// (e.g. Trellis hooks) are preserved byte-for-byte and conflicts are
// surfaced as warnings instead of overwrites.
// ============================================================================

import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { logger } from '../utils/logger';

/** Marker line present in every OPSV-managed hook script (owned => safe to update/remove). */
export const OPSV_HOOK_MARKER = '# OPSV-MANAGED-HOOK';
/** Command substring identifying an OPSV-managed settings.json hook group. */
const COMMAND_MARKER = '.claude/hooks/opsv-';

export const HOOK_SCRIPT_NAMES = [
  'opsv-inject-session-start.py',
  'opsv-inject-workflow-state.py',
  'opsv-inject-subagent-context.py',
] as const;

type HookCommand = { type: string; command: string; timeout?: number };
type HookGroup = { matcher?: string; hooks: HookCommand[]; [key: string]: unknown };
type SettingsJson = { hooks?: Record<string, HookGroup[]>; [key: string]: unknown };

function hookCommand(script: string, timeout: number): HookCommand {
  return { type: 'command', command: `python3 .claude/hooks/${script}`, timeout };
}

/** Canonical OPSV-owned registration groups, keyed by hook event (SessionStart / UserPromptSubmit / PreToolUse). */
export function buildOpsvHookGroups(): Record<string, HookGroup[]> {
  return {
    SessionStart: [
      { matcher: 'startup|clear|compact', hooks: [hookCommand('opsv-inject-session-start.py', 30)] },
    ],
    UserPromptSubmit: [
      { hooks: [hookCommand('opsv-inject-workflow-state.py', 15)] },
    ],
    PreToolUse: [
      { matcher: 'Task|Agent', hooks: [hookCommand('opsv-inject-subagent-context.py', 30)] },
    ],
  };
}

/** A hook group is OPSV-managed iff any of its commands runs an opsv-* hook script. */
export function isOpsvManagedGroup(group: unknown): boolean {
  if (!group || typeof group !== 'object') return false;
  const hooks = (group as HookGroup).hooks;
  if (!Array.isArray(hooks)) return false;
  return hooks.some(
    (h) =>
      h &&
      typeof h === 'object' &&
      typeof (h as HookCommand).command === 'string' &&
      (h as HookCommand).command.includes(COMMAND_MARKER),
  );
}

/** Locate the installed package root via module resolution — never the repo checkout path. */
export function resolvePackageRoot(): string {
  return path.dirname(require.resolve('../../package.json'));
}

/** Hook templates ship inside the npm package (package.json `files` includes `templates`). */
export function resolveTemplateDir(): string {
  return path.join(resolvePackageRoot(), 'templates', 'hooks');
}

export interface MergeResult {
  settings: SettingsJson;
  warnings: string[];
}

/**
 * Merge the OPSV registration block into parsed settings.json content.
 * Stale OPSV-managed groups are replaced with the canonical block (self-heal,
 * idempotent); non-OPSV groups are kept untouched. A non-OPSV group that runs
 * an opsv-* script from a foreign path is a conflict: warn, never rewrite.
 */
export function mergeOpsvHookSettings(existing: SettingsJson): MergeResult {
  const settings: SettingsJson = JSON.parse(JSON.stringify(existing ?? {}));
  const warnings: string[] = [];
  const groups = buildOpsvHookGroups();
  const hooks = { ...((settings.hooks as Record<string, HookGroup[]>) ?? {}) };

  for (const [event, opsvGroups] of Object.entries(groups)) {
    const current = Array.isArray(hooks[event]) ? hooks[event] : [];
    const kept: HookGroup[] = [];
    for (const group of current) {
      if (isOpsvManagedGroup(group)) continue; // stale OPSV block: replaced below
      for (const h of group?.hooks ?? []) {
        const command = (h as HookCommand)?.command ?? '';
        if (HOOK_SCRIPT_NAMES.some((name) => command.includes(name))) {
          warnings.push(
            `Conflict: existing non-OPSV hook block under "${event}" already runs "${command}". ` +
              'Leaving it untouched; remove it manually if it is a stale OPSV registration.',
          );
        }
      }
      kept.push(group);
    }
    hooks[event] = [...kept, ...opsvGroups];
  }

  settings.hooks = hooks;
  return { settings, warnings };
}

export interface StripResult {
  settings: SettingsJson;
  removedGroups: number;
}

/**
 * Remove every OPSV-managed group from parsed settings.json content.
 * Non-OPSV groups survive unchanged; event arrays (and the `hooks` key) that
 * become empty are pruned so uninstall restores the pre-install shape.
 */
export function stripOpsvHookSettings(existing: SettingsJson): StripResult {
  const settings: SettingsJson = JSON.parse(JSON.stringify(existing ?? {}));
  const hooks = { ...((settings.hooks as Record<string, HookGroup[]>) ?? {}) };
  let removedGroups = 0;

  for (const event of Object.keys(hooks)) {
    const current = Array.isArray(hooks[event]) ? hooks[event] : [];
    const kept = current.filter((group) => {
      if (isOpsvManagedGroup(group)) {
        removedGroups++;
        return false;
      }
      return true;
    });
    if (kept.length > 0) hooks[event] = kept;
    else delete hooks[event];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  else settings.hooks = hooks;

  return { settings, removedGroups };
}

function readSettings(settingsPath: string): SettingsJson {
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (err: any) {
    throw new Error(
      `HOOK_SETTINGS_UNPARSEABLE: cannot parse ${settingsPath}: ${err.message}. ` +
        'Fix or remove it before managing OPSV hooks.',
    );
  }
}

function writeSettings(settingsPath: string, settings: SettingsJson): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export interface InstallResult {
  scripts: string[];
  settingsPath: string;
  warnings: string[];
}

export function installHooks(projectRoot: string): InstallResult {
  const templateDir = resolveTemplateDir();
  if (!fs.existsSync(templateDir)) {
    throw new Error(`HOOK_TEMPLATES_MISSING: OPSV hook templates not found in the installed package: ${templateDir}`);
  }

  const hooksDir = path.join(projectRoot, '.claude', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });
  const warnings: string[] = [];
  const scripts: string[] = [];

  for (const name of HOOK_SCRIPT_NAMES) {
    const src = path.join(templateDir, name);
    if (!fs.existsSync(src)) {
      throw new Error(`HOOK_TEMPLATES_MISSING: OPSV hook template missing from package: ${src}`);
    }
    const dest = path.join(hooksDir, name);
    const templateContent = fs.readFileSync(src, 'utf8');
    if (fs.existsSync(dest)) {
      const existing = fs.readFileSync(dest, 'utf8');
      if (existing === templateContent) {
        scripts.push(dest); // idempotent: already correct
        continue;
      }
      if (!existing.includes(OPSV_HOOK_MARKER)) {
        // postinstall.js precedent: never overwrite files we do not own
        warnings.push(`Refusing to overwrite non-OPSV file: ${dest}`);
        continue;
      }
      // OPSV-managed but different content (package upgrade): refresh it
    }
    fs.writeFileSync(dest, templateContent);
    fs.chmodSync(dest, 0o755);
    scripts.push(dest);
  }

  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  const merged = mergeOpsvHookSettings(readSettings(settingsPath));
  warnings.push(...merged.warnings);
  writeSettings(settingsPath, merged.settings);

  return { scripts, settingsPath, warnings };
}

export interface UninstallResult {
  removedScripts: string[];
  keptForeignScripts: string[];
  settingsPath: string;
}

export function uninstallHooks(projectRoot: string): UninstallResult {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  const stripped = stripOpsvHookSettings(readSettings(settingsPath));
  if (stripped.removedGroups === 0) {
    throw new Error(
      `HOOK_NOT_INSTALLED: no OPSV-managed hook block found in ${settingsPath}. ` +
        'Nothing to uninstall (non-OPSV blocks such as Trellis hooks are never touched).',
    );
  }

  const hooksDir = path.join(projectRoot, '.claude', 'hooks');
  const removedScripts: string[] = [];
  const keptForeignScripts: string[] = [];
  for (const name of HOOK_SCRIPT_NAMES) {
    const dest = path.join(hooksDir, name);
    if (!fs.existsSync(dest)) continue;
    const content = fs.readFileSync(dest, 'utf8');
    if (content.includes(OPSV_HOOK_MARKER)) {
      fs.rmSync(dest);
      removedScripts.push(dest);
    } else {
      keptForeignScripts.push(dest);
    }
  }

  // Rollback: settings.json returns to its pre-install shape, Trellis blocks intact.
  writeSettings(settingsPath, stripped.settings);

  return { removedScripts, keptForeignScripts, settingsPath };
}

function assertPlatform(platform: string): void {
  if (platform !== 'claude') {
    throw new Error(`HOOK_PLATFORM_UNKNOWN: --platform must be claude (got "${platform}")`);
  }
}

export function registerHookCommands(program: Command): void {
  const hook = program
    .command('hook')
    .description('Install/uninstall OPSV Claude Code hooks (standalone; no .trellis required)');

  hook
    .command('install')
    .description('Install OPSV hook scripts and settings.json registration into this project')
    .option('--platform <platform>', 'Target platform (claude)', 'claude')
    .action((options: { platform: string }) => {
      try {
        assertPlatform(options.platform);
        const result = installHooks(process.cwd());
        for (const script of result.scripts) console.log(chalk.green(`Installed: ${script}`));
        console.log(chalk.green(`Registered OPSV hooks: ${result.settingsPath}`));
        for (const warning of result.warnings) console.log(chalk.yellow(`Warning: ${warning}`));
      } catch (err: any) {
        logger.error(err.message);
        process.exitCode = 1;
      }
    });

  hook
    .command('uninstall')
    .description('Remove OPSV hook scripts and roll back the OPSV settings.json block (Trellis blocks preserved)')
    .option('--platform <platform>', 'Target platform (claude)', 'claude')
    .action((options: { platform: string }) => {
      try {
        assertPlatform(options.platform);
        const result = uninstallHooks(process.cwd());
        for (const script of result.removedScripts) console.log(chalk.green(`Removed: ${script}`));
        for (const kept of result.keptForeignScripts) console.log(chalk.yellow(`Kept non-OPSV file: ${kept}`));
        console.log(chalk.green(`Rolled back OPSV hook block: ${result.settingsPath}`));
      } catch (err: any) {
        logger.error(err.message);
        process.exitCode = 1;
      }
    });
}
