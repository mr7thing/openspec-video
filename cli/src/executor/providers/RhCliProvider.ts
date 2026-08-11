// ============================================================================
// OPSV RH_CLI Executor Provider
//
// Normal generation is deliberately a blocking external channel:
// OPSV -> `rh` subprocess -> RunningHub.  Read-only HTTP is used only to
// recover a checkpoint that already has a verified remote task id.
// ============================================================================

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { BaseTaskJson } from '../../types/Job';
import { ProviderResult } from '../QueueRunner';
import { ProviderExecutor } from '../../container/Container';
import { OpsVContext } from '../../container/OpsVContext';
import { appendLog, isVerifiedRemoteTaskId, PollLogEntry, readLastLogEntry } from '../polling';
import { outputFilePath, resolveNextOutputIndex, withTaskLock } from '../naming';
import { LocalRhRunner, RhCliError, RhJsonResult, RhRunner, resolveRhBinary } from '../rh-runner/index';
import { ProviderFailureDecision, ProviderFailurePolicy } from '../rhcli/ProviderFailurePolicy';
import { RhCliInvocationCompiler } from '../rhcli/RhCliInvocationCompiler';
import { RhCliProbe } from '../rhcli/RhCliProbe';
import { RhCliRecoveryAdapter, RunningHubReadOnlyRecoveryAdapter } from '../rhcli/RhCliRecoveryAdapter';
import { addRhCliBinaryGuidance } from '../rhcli/RhCliDiagnostics';

export class RhCliProvider implements ProviderExecutor {
  readonly name = 'rhcli';

  constructor(
    private readonly runner: RhRunner = new LocalRhRunner(),
    private readonly invocationCompiler: RhCliInvocationCompiler = new RhCliInvocationCompiler(),
    private readonly recoveryAdapter: RhCliRecoveryAdapter = new RunningHubReadOnlyRecoveryAdapter(),
    private readonly failurePolicy: ProviderFailurePolicy = new ProviderFailurePolicy(),
    private readonly probe: RhCliProbe = new RhCliProbe(runner),
  ) {}

  async execute(
    task: BaseTaskJson<Record<string, unknown>>,
    taskPath: string,
    ctx: OpsVContext,
  ): Promise<ProviderResult> {
    const meta = task._opsv;
    const shotId = meta.shotId;
    const fail = (error: string, decision?: ProviderFailureDecision): ProviderResult => ({
      taskPath, shotId, provider: this.name, success: false, error,
      retryability: decision?.retryability, fallbackability: decision?.fallbackability,
    });

    const modelConfig = ctx.configLoader.getModelConfig(meta.modelKey);
    if (!modelConfig) {
      const decision = this.failurePolicy.classify('compile');
      appendLog(taskPath, { event: 'failed', provider: this.name, error: `rhcli: model config not found for '${meta.modelKey}'` });
      return fail(`rhcli: model config not found for '${meta.modelKey}'`, decision);
    }
    const rh = modelConfig.rh || {};
    const mode = rh.mode || 'model';
    const payload = task.payload || {};

    let apiKey: string;
    try {
      apiKey = ctx.configLoader.getResolvedApiKey(meta.modelKey);
    } catch (err: any) {
      const decision = this.failurePolicy.classify('before-spawn', err);
      appendLog(taskPath, { event: 'failed', provider: this.name, error: `rhcli: ${err.message}` });
      return fail(`rhcli: ${err.message}`, decision);
    }

    const binary = resolveRhBinary(rh.binary);
    const checkpointIdentity = {
      provider: 'rhcli' as const,
      modelKey: meta.modelKey,
      mode,
      payloadSha256: sha256(stableJson(payload)),
      credentialScope: sha256(apiKey),
    };
    const previous = readLastLogEntry(taskPath);

    const resumeResult = await this.tryRecover(previous, checkpointIdentity, taskPath, task, apiKey, modelConfig.max_poll_duration, fail);
    if (resumeResult) return resumeResult;

    try {
      const requiredCapabilities = rh.required_capabilities || ['json-check', `${mode}-run`];
      await this.probe.probe({ binary, apiKey, requiredCapabilities });
    } catch (err: any) {
      const rawMessage = errorMessage(err);
      const message = err instanceof RhCliError && ['binary-missing', 'cli-incompatible'].includes(err.kind)
        ? addRhCliBinaryGuidance(rawMessage, binary, meta.modelKey)
        : rawMessage;
      const decision = this.failurePolicy.classify('probe', err);
      appendLog(taskPath, { event: 'failed', provider: this.name, error: message });
      return fail(message, decision);
    }

    const tmpOut = path.join(path.dirname(taskPath), '.rh-out', shotId);
    fs.mkdirSync(tmpOut, { recursive: true });

    let runOpts;
    try {
      runOpts = this.invocationCompiler.compile({ modelConfig, payload, outputDir: tmpOut, binary, apiKey });
    } catch (err: any) {
      const message = errorMessage(err);
      const decision = this.failurePolicy.classify('compile', err);
      appendLog(taskPath, { event: 'failed', provider: this.name, error: message });
      return fail(message, decision);
    }

    // RH CLI does not expose a task id at submit time.  This checkpoint is a
    // deliberate safety barrier: a crash after spawn is not retried/fallen
    // back automatically because the upstream task may already be charged.
    appendLog(taskPath, {
      event: 'submitted-unknown', state: 'submitted-unknown', ...logIdentity(checkpointIdentity),
      execution_id: crypto.randomUUID(), status: 'spawned',
    });

    try {
      const result = await this.runner.run(runOpts);
      return this.adoptCompletedResult(taskPath, shotId, result, checkpointIdentity);
    } catch (err: any) {
      const message = errorMessage(err);
      const decision = this.failurePolicy.classify('after-spawn', err);
      if (decision.retryability === 'safe') {
        appendLog(taskPath, { event: 'failed', ...logIdentity(checkpointIdentity), error: message });
      }
      return fail(message, decision);
    }
  }

  private async tryRecover(
    previous: PollLogEntry | null,
    identity: CheckpointIdentity,
    taskPath: string,
    task: BaseTaskJson<Record<string, unknown>>,
    apiKey: string,
    timeoutMs: number | undefined,
    fail: (error: string, decision?: ProviderFailureDecision) => ProviderResult,
  ): Promise<ProviderResult | null> {
    if (!previous) return null;
    if (previous.event === 'submitted-unknown') {
      return fail('rhcli: previous RH CLI subprocess may have submitted a remote task but no verified task id was checkpointed. Refusing automatic retry or provider fallback to avoid duplicate charges.',
        this.failurePolicy.classify('after-spawn'));
    }
    if (previous.event === 'submitted' && previous.task_id?.startsWith('rhcli://')) {
      return fail('rhcli: legacy checkpoint contains a local rhcli:// descriptor, not a RunningHub task id. It cannot be resumed automatically; inspect the supplier task manually.',
        this.failurePolicy.classify('after-spawn'));
    }
    const recoverable = previous.event === 'submitted-with-task-id' || previous.event === 'polling' || previous.event === 'downloaded';
    if (!recoverable) return null;
    if (!isVerifiedRemoteTaskId(previous.task_id) || !checkpointMatches(previous, identity)) {
      return fail('rhcli: checkpoint has a task id but its provider/model/payload/credential identity does not match this task. Recovery API was not called.',
        this.failurePolicy.classify('recovery-query'));
    }

    try {
      const status = await this.recoveryAdapter.query({ taskId: previous.task_id, apiKey, timeoutMs });
      if (status.state === 'pending') {
        appendLog(taskPath, { event: 'polling', state: 'polling', ...logIdentity(identity), task_id: previous.task_id, status: 'remote-pending' });
        return fail(`rhcli: remote task ${previous.task_id} is still pending; retained checkpoint and did not spawn a new rh process.`,
          this.failurePolicy.classify('recovery-query'));
      }
      if (status.state === 'failed') {
        const message = `rhcli: remote task ${previous.task_id} failed: ${status.error || 'unknown error'}`;
        appendLog(taskPath, { event: 'failed', ...logIdentity(identity), task_id: previous.task_id, error: message });
        return fail(message, this.failurePolicy.classify('after-spawn', new RhCliError('remote-failed', message)));
      }
      const tmpOut = path.join(path.dirname(taskPath), '.rh-out', task._opsv.shotId);
      fs.mkdirSync(tmpOut, { recursive: true });
      const files = await this.recoveryAdapter.download({ resultUrls: status.resultUrls, outputDir: tmpOut, timeoutMs });
      return this.adoptCompletedResult(taskPath, task._opsv.shotId, { files, texts: [], task_id: previous.task_id, cost: status.cost, duration: status.duration }, identity);
    } catch (err: any) {
      const message = errorMessage(err);
      return fail(message, this.failurePolicy.classify('recovery-query', err));
    }
  }

  private async adoptCompletedResult(
    taskPath: string,
    shotId: string,
    result: RhJsonResult,
    identity: CheckpointIdentity,
  ): Promise<ProviderResult> {
    const files = (Array.isArray(result.files) ? result.files : []).filter((file): file is string => typeof file === 'string' && fs.existsSync(file)).sort();
    const texts = Array.isArray(result.texts) ? result.texts : [];
    if (files.length === 0 && texts.length === 0) {
      const message = 'rhcli: rh completed but returned no output files';
      appendLog(taskPath, { event: 'failed', ...logIdentity(identity), error: message });
      return { taskPath, shotId, provider: this.name, success: false, error: message, retryability: 'manual', fallbackability: 'manual' };
    }
    const outputPaths = files.length > 0 ? await moveArtifacts(taskPath, files) : [await writeTextArtifact(taskPath, texts)];
    appendLog(taskPath, {
      event: 'succeeded', ...logIdentity(identity), task_id: isVerifiedRemoteTaskId(result.task_id) ? result.task_id : undefined,
      output: outputPaths.join(','), cost: result.cost,
      duration: typeof result.duration === 'number' ? result.duration : undefined,
    });
    return { taskPath, shotId, provider: this.name, success: true, outputPath: outputPaths[0], outputPaths };
  }
}

interface CheckpointIdentity { provider: 'rhcli'; modelKey: string; mode: 'model' | 'app'; payloadSha256: string; credentialScope: string; }
function logIdentity(identity: CheckpointIdentity): Pick<PollLogEntry, 'provider' | 'model_key' | 'mode' | 'payload_sha256' | 'credential_scope'> {
  return { provider: identity.provider, model_key: identity.modelKey, mode: identity.mode, payload_sha256: identity.payloadSha256, credential_scope: identity.credentialScope };
}
function checkpointMatches(entry: PollLogEntry, identity: CheckpointIdentity): boolean {
  return entry.provider === identity.provider && entry.model_key === identity.modelKey && entry.mode === identity.mode &&
    entry.payload_sha256 === identity.payloadSha256 && entry.credential_scope === identity.credentialScope;
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : `rhcli: unexpected error: ${String(error)}`; }
function sha256(value: string): string { return crypto.createHash('sha256').update(value).digest('hex'); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function moveArtifacts(taskPath: string, files: string[]): Promise<string[]> {
  return withTaskLock(taskPath, async () => files.map((file) => {
    const ext = path.extname(file).slice(1).toLowerCase() || 'bin';
    const dest = outputFilePath(taskPath, resolveNextOutputIndex(taskPath, ext), ext);
    fs.renameSync(file, dest);
    return dest;
  }));
}
async function writeTextArtifact(taskPath: string, texts: string[]): Promise<string> {
  return withTaskLock(taskPath, async () => {
    const dest = outputFilePath(taskPath, resolveNextOutputIndex(taskPath, 'txt'), 'txt');
    fs.writeFileSync(dest, texts.join('\n'), 'utf-8');
    return dest;
  });
}
