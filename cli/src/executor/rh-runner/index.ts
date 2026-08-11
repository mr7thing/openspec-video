// ============================================================================
// OpsV RH_CLI Runner — subprocess backend for the `rh` command
// ============================================================================
//
// RH_CLI (https://github.com/HM-RunningHub/RH_CLI) is a Python CLI that wraps
// the RunningHub API: submit → poll → retry/circuit-break → download happen
// INSIDE the `rh` process. opsv drives it as a blocking subprocess:
//
//   model mode: rh --json model run -e <endpoint> -p <prompt>
//                  [-i img ...] [--video v] [--audio a] [--param k=v ...] -o <dir>
//   app mode:   rh --json app run <webappId>
//                  [--node "id:field=value" ...] [--file "id:field=/path" ...] -o <dir>
//
// Terminal stdout (with --json) is a single JSON document:
//   success: {"files": [...], "texts": [...], "cost": "0.5", "duration": 42, "task_id": "..."}
//   failure: {"error": "AUTH_FAILED"|"INSUFFICIENT_BALANCE"|..., "message": "..."}
//
// IMPORTANT (verified against RH_CLI src/rh_cli/model/payload.py):
//   --param values are only type-coerced — local file paths are NOT uploaded.
//   Media files MUST go through --image/--video/--audio flags, which rh maps
//   onto the endpoint's IMAGE/VIDEO/AUDIO-typed params (data-URI <5MB, upload
//   otherwise). URLs pass through fine as --param values.
//   partitionModelPayload() below implements that split.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// ── Types ──────────────────────────────────────────────────────────────────

export interface RhJsonResult {
  files: string[];
  texts: string[];
  cost?: string;
  duration?: number | string;
  task_id?: string;
  [k: string]: unknown;
}

/** The public JSON contract required from `rh --json check`. */
export interface RhCliCheckResult {
  status: string;
  capabilities: string[];
  version?: string;
  resumability?: 'none' | 'task-id-after-completion' | string;
  [k: string]: unknown;
}

export interface RhRunOpts {
  mode: 'model' | 'app';
  // model mode
  endpointId?: string;              // -e <endpointId>
  prompt?: string;                  // -p <prompt>
  params?: Record<string, unknown>; // --param k=v (non-scalars JSON-stringified)
  images?: string[];                // -i <path> ... (local paths only)
  video?: string;                   // --video <path>
  audio?: string;                   // --audio <path>
  // app mode
  appId?: string;                   // positional <webappId>
  nodes?: string[];                 // --node "nodeId:fieldName=value"
  files?: string[];                 // --file "nodeId:fieldName=/path"
  instanceType?: string;            // --instance-type default|plus
  // shared
  outputDir: string;                // -o <dir>
  binary?: string;                  // resolved rh binary (default: env RH_CLI_BINARY || 'rh')
  apiKey?: string;                  // injected as RUNNINGHUB_API_KEY into child env
  timeoutMs?: number;               // kill switch (default 30 min)
}

export type RhErrorKind =
  | 'binary-missing'
  | 'auth'
  | 'balance'
  | 'queue-limit'
  | 'timeout'
  | 'output-missing'
  | 'cli-incompatible'
  | 'remote-failed'
  | 'cli-error';

export class RhCliError extends Error {
  readonly kind: RhErrorKind;
  readonly exitCode?: number;
  readonly stderr?: string;

  constructor(kind: RhErrorKind, message: string, opts?: { exitCode?: number; stderr?: string }) {
    super(message);
    this.name = 'RhCliError';
    this.kind = kind;
    this.exitCode = opts?.exitCode;
    this.stderr = opts?.stderr;
  }
}

export interface RhRunner {
  /** Verify binary + API key + balance (`rh --json check`). Throws RhCliError. */
  check(opts?: { binary?: string; apiKey?: string }): Promise<RhCliCheckResult>;
  /** Run a generation command; resolves with parsed JSON on exit 0. Throws RhCliError. */
  run(opts: RhRunOpts): Promise<RhJsonResult>;
}

// ── Payload partition (model mode) ─────────────────────────────────────────

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac']);

function extOf(p: string): string {
  return path.extname(p).slice(1).toLowerCase();
}

function isLocalFile(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0) return false;
  if (/^https?:\/\//i.test(v) || v.startsWith('data:')) return false;
  try {
    return fs.existsSync(v) && fs.statSync(v).isFile();
  } catch {
    return false;
  }
}

export interface PartitionedPayload {
  params: Record<string, unknown>; // scalars/URLs/arrays-of-URLs → --param
  images: string[];                // local image paths → -i
  video?: string;                  // local video path → --video
  audio?: string;                  // local audio path → --audio
  /** local media files that did not fit a flag (e.g. 2nd video). RhCliInvocationCompiler rejects these before spawn. */
  overflow: string[];
}

/**
 * Split a compiled payload into rh CLI surfaces.
 * Local media files go to --image/--video/--audio flags (rh resolves/uploads
 * them onto the endpoint's typed params); everything else becomes --param.
 */
export function partitionModelPayload(payload: Record<string, unknown>): PartitionedPayload {
  const out: PartitionedPayload = { params: {}, images: [], overflow: [] };

  const routeFile = (key: string, file: string): void => {
    const ext = extOf(file);
    if (IMAGE_EXTS.has(ext)) {
      out.images.push(file);
    } else if (VIDEO_EXTS.has(ext)) {
      if (out.video === undefined) out.video = file;
      else { out.overflow.push(file); out.params[key] = file; }
    } else if (AUDIO_EXTS.has(ext)) {
      if (out.audio === undefined) out.audio = file;
      else { out.overflow.push(file); out.params[key] = file; }
    } else {
      // Unknown local file type — pass as param and let the server complain
      out.params[key] = file;
    }
  };

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    if (isLocalFile(value)) {
      routeFile(key, value);
    } else if (Array.isArray(value) && value.length > 0 && value.every(isLocalFile)) {
      for (const f of value) routeFile(key, f);
    } else {
      out.params[key] = value;
    }
  }
  return out;
}

// ── Argv building ──────────────────────────────────────────────────────────

export function resolveRhBinary(binary?: string, env?: NodeJS.ProcessEnv): string {
  return binary || env?.RH_CLI_BINARY || process.env.RH_CLI_BINARY || 'rh';
}

function paramArg(key: string, value: unknown): string {
  const v = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
  return `${key}=${v}`;
}

export function buildRunArgs(opts: RhRunOpts): string[] {
  const args: string[] = ['--json'];
  if (opts.mode === 'app') {
    if (!opts.appId) throw new RhCliError('cli-error', 'rhcli: app mode requires appId');
    args.push('app', 'run', opts.appId);
    for (const n of opts.nodes ?? []) args.push('--node', n);
    for (const f of opts.files ?? []) args.push('--file', f);
    if (opts.instanceType) args.push('--instance-type', opts.instanceType);
  } else {
    if (!opts.endpointId) throw new RhCliError('cli-error', 'rhcli: model mode requires endpointId');
    args.push('model', 'run', '-e', opts.endpointId);
    if (opts.prompt) args.push('-p', opts.prompt);
    for (const img of opts.images ?? []) args.push('-i', img);
    if (opts.video) args.push('--video', opts.video);
    if (opts.audio) args.push('--audio', opts.audio);
    for (const [k, v] of Object.entries(opts.params ?? {})) args.push('--param', paramArg(k, v));
  }
  args.push('-o', opts.outputDir);
  return args;
}

// ── Output parsing ─────────────────────────────────────────────────────────

/** Extract the terminal JSON document from stdout (tolerates stray log lines). */
export function parseRhJson(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through: scan lines from the bottom for a JSON object
  }
  const lines = trimmed.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    // JSON may span multiple lines (indent=2 output) — try progressive suffixes
    for (let j = i; j < lines.length; j++) {
      try {
        return JSON.parse(lines.slice(i, j + 1).join('\n'));
      } catch {
        // keep extending
      }
    }
  }
  return null;
}

// ── Local subprocess runner ────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

export class LocalRhRunner implements RhRunner {
  async check(opts?: { binary?: string; apiKey?: string }): Promise<RhCliCheckResult> {
    const binary = resolveRhBinary(opts?.binary);
    const res = await this.spawnRh(binary, ['--json', 'check'], {
      apiKey: opts?.apiKey,
      timeoutMs: 60_000,
    });
    if (res.timedOut) {
      throw new RhCliError('timeout', `rh --json check did not finish within 1min.`, { stderr: res.stderr });
    }
    if (res.code !== 0) {
      throw this.classifyFailure(res.code, res.stdout, res.stderr);
    }
    const json = parseRhJson(res.stdout);
    if (!json) {
      throw new RhCliError('cli-incompatible',
        `rh CLI '${binary}' exited 0 but did not return JSON for --json check. stdout: ${res.stdout.slice(0, 500)}`,
        { stderr: res.stderr });
    }
    return json as unknown as RhCliCheckResult;
  }

  async run(opts: RhRunOpts): Promise<RhJsonResult> {
    const binary = resolveRhBinary(opts.binary);
    const args = buildRunArgs(opts);
    const res = await this.spawnRh(binary, args, {
      apiKey: opts.apiKey,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    if (res.timedOut) {
      throw new RhCliError(
        'timeout',
        `rh did not finish within ${Math.round((opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 60000)}min; ` +
        'the remote task may still be running (re-running will submit a NEW task and may double-charge).',
        { stderr: res.stderr },
      );
    }

    if (res.code !== 0) {
      throw this.classifyFailure(res.code, res.stdout, res.stderr);
    }

    const json = parseRhJson(res.stdout);
    if (!json) {
      throw new RhCliError('output-missing',
        `rh exited 0 but produced no JSON output. stdout: ${res.stdout.slice(0, 500)}`,
        { stderr: res.stderr });
    }
    if (json.error) {
      throw this.classifyFailure(1, res.stdout, res.stderr);
    }
    const result = json as unknown as RhJsonResult;
    if (!Array.isArray(result.files) && !Array.isArray(result.texts)) {
      throw new RhCliError('output-missing',
        `rh JSON missing files/texts arrays: ${res.stdout.slice(0, 500)}`,
        { stderr: res.stderr });
    }
    return result;
  }

  private spawnRh(
    binary: string,
    args: string[],
    opts: { apiKey?: string; timeoutMs: number },
  ): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
    return new Promise((resolve, reject) => {
      const env = { ...process.env };
      if (opts.apiKey) env.RUNNINGHUB_API_KEY = opts.apiKey;
      // Never let an inherited config leak an output dir override past -o
      delete env.RH_OUTPUT_DIR;

      let child;
      try {
        child = spawn(binary, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err: any) {
        reject(new RhCliError('binary-missing', binaryMissingMessage(binary, err)));
        return;
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;
      let forceKillTimer: NodeJS.Timeout | undefined;
      const onStdout = (d: Buffer) => { stdout += d.toString(); };
      const onStderr = (d: Buffer) => { stderr += d.toString(); };
      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);

      const cleanup = (): void => {
        clearTimeout(killTimer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        child.stdout.removeListener('data', onStdout);
        child.stderr.removeListener('data', onStderr);
      };
      const settle = (outcome: { code: number; stdout: string; stderr: string; timedOut: boolean } | Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        if (outcome instanceof Error) reject(outcome);
        else resolve(outcome);
      };
      const killTimer = setTimeout(() => {
        timedOut = true;
        try { child.kill('SIGTERM'); } catch { /* child may already be gone */ }
        forceKillTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already dead */ } }, 5_000);
      }, opts.timeoutMs);

      child.once('error', (err: any) => {
        if (err.code === 'ENOENT') settle(new RhCliError('binary-missing', binaryMissingMessage(binary, err)));
        else settle(new RhCliError('cli-error', `Failed to spawn rh: ${err.message}`));
      });
      child.once('close', (code: number | null) => {
        settle({ code: code ?? 1, stdout, stderr, timedOut });
      });
    });
  }

  private classifyFailure(
    exitCode: number | null,
    stdout: string,
    stderr: string,
  ): RhCliError {
    // In --json mode rh prints {"error": code, "message": ...} on stdout
    const json = parseRhJson(stdout);
    const errCode = typeof json?.error === 'string' ? json.error : '';
    const errMsg = typeof json?.message === 'string' ? json.message : '';
    const combined = `${errCode} ${errMsg} ${stderr}`.toLowerCase();

    if (errCode === 'AUTH_FAILED' || /auth|401|403|api.?key|unauthorized/.test(combined)) {
      return new RhCliError('auth',
        `RunningHub API key invalid. Set RUNNINGHUB_API_KEY (or RH_API_KEY fallback). ${errMsg}`,
        { exitCode: exitCode ?? undefined, stderr });
    }
    if (errCode === 'INSUFFICIENT_BALANCE' || /balance|insufficient|余额/.test(combined)) {
      return new RhCliError('balance',
        `RunningHub balance insufficient — top up at https://www.runninghub.cn/vip-rights/4 . ${errMsg}`,
        { exitCode: exitCode ?? undefined, stderr });
    }
    if (/429|421|queue|rate.?limit|too many/.test(combined)) {
      return new RhCliError('queue-limit',
        `RunningHub queue/rate limit (rh already retried internally). ${errMsg || stderr.slice(0, 300)}`,
        { exitCode: exitCode ?? undefined, stderr });
    }
    return new RhCliError('cli-error',
      `rh exited ${exitCode}: ${errMsg || stderr.slice(0, 500) || stdout.slice(0, 500)}`,
      { exitCode: exitCode ?? undefined, stderr });
  }
}

function binaryMissingMessage(binary: string, err: any): string {
  return `rh CLI not found ('${binary}': ${err.message}). ` +
    'Install RH_CLI (requires Python ≥3.10): pip install from https://github.com/HM-RunningHub/RH_CLI ' +
    '— or set rh.binary in api_config.yaml / RH_CLI_BINARY env to its path.';
}
