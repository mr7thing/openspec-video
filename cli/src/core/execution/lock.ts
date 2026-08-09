// ============================================================================
// File-based advisory lock primitive (execution event store).
//
// Mechanism borrowed from Trellis channel store (withLock/acquireLock):
// `open(path, "wx")` (O_EXCL) for atomic creation across processes; the
// lockfile stores the holder pid so a dead holder's lock can be stolen.
// OPSV-owned implementation — no Trellis import.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { InfrastructureError, OpsVErrorCode } from '../../errors/OpsVError';

const DEFAULT_RETRY_INTERVAL_MS = 25;
const DEFAULT_MAX_WAIT_MS = 5000;

interface AcquireOptions {
  retryIntervalMs?: number;
  maxWaitMs?: number;
}

export async function acquireLock(lockFile: string, opts: AcquireOptions = {}): Promise<void> {
  const interval = opts.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
  const deadline = Date.now() + (opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS);

  fs.mkdirSync(path.dirname(lockFile), { recursive: true });

  for (;;) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      try {
        fs.writeSync(fd, String(process.pid));
      } finally {
        fs.closeSync(fd);
      }
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }

    if (await checkAndStealStale(lockFile)) continue;

    if (Date.now() >= deadline) {
      throw new InfrastructureError(
        OpsVErrorCode.INFRA_LOCK_TIMEOUT,
        `Failed to acquire lock ${lockFile} within ${opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS}ms`,
      );
    }
    await sleep(interval);
  }
}

export function releaseLock(lockFile: string): void {
  try {
    const content = fs.readFileSync(lockFile, 'utf-8').trim();
    if (content === String(process.pid)) {
      fs.unlinkSync(lockFile);
    }
  } catch {
    // already gone — nothing to release
  }
}

export async function withLock<T>(
  lockFile: string,
  fn: () => Promise<T> | T,
  opts?: AcquireOptions,
): Promise<T> {
  await acquireLock(lockFile, opts);
  try {
    return await fn();
  } finally {
    releaseLock(lockFile);
  }
}

async function checkAndStealStale(lockFile: string): Promise<boolean> {
  let holderPid = 0;
  try {
    holderPid = Number(fs.readFileSync(lockFile, 'utf-8').trim());
  } catch {
    return false;
  }
  if (!holderPid || !pidAlive(holderPid)) {
    try {
      fs.unlinkSync(lockFile);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
