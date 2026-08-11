import crypto from 'crypto';
import { RhCliCheckResult, RhCliError, RhRunner } from '../rh-runner/index';

export interface RhCliHealth {
  binary: string;
  version?: string;
  capabilities: readonly string[];
  resumability: 'unknown' | 'none' | 'task-id-after-completion';
  status: 'ready';
}

export interface RhCliProbeInput {
  binary: string;
  apiKey: string;
  requiredCapabilities: readonly string[];
}

/** Strict boundary between an arbitrary `rh` executable and the RH CLI contract OPSV supports. */
export class RhCliProbe {
  private readonly cache = new Map<string, RhCliHealth>();

  constructor(private readonly runner: RhRunner) {}

  async probe(input: RhCliProbeInput): Promise<RhCliHealth> {
    const key = [input.binary, fingerprint(input.apiKey), [...input.requiredCapabilities].sort().join(',')].join('|');
    const cached = this.cache.get(key);
    if (cached) return cached;

    const result = await this.runner.check({ binary: input.binary, apiKey: input.apiKey });
    const health = validateCheckResult(input.binary, result, input.requiredCapabilities);
    this.cache.set(key, health);
    return health;
  }
}

function validateCheckResult(binary: string, result: RhCliCheckResult, required: readonly string[]): RhCliHealth {
  if (!result || result.status !== 'ready' || !Array.isArray(result.capabilities) ||
      !result.capabilities.every((cap) => typeof cap === 'string' && cap.length > 0)) {
    throw new RhCliError('cli-incompatible',
      `rh CLI '${binary}' returned an incompatible --json check response; expected { status: "ready", capabilities: string[] }.`);
  }
  const missing = required.filter((cap) => !result.capabilities.includes(cap));
  if (missing.length > 0) {
    throw new RhCliError('cli-incompatible',
      `rh CLI '${binary}' is ready but lacks required capability/capabilities: ${missing.join(', ')}.`);
  }
  const resumability = result.resumability === 'none' || result.resumability === 'task-id-after-completion'
    ? result.resumability : 'unknown';
  return { binary, version: result.version, capabilities: result.capabilities, resumability, status: 'ready' };
}

function fingerprint(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}
