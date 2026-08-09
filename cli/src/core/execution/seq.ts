// ============================================================================
// Seq sidecar reconciliation (execution event store).
//
// Mechanism borrowed from Trellis channel store (reconcileSeq/writeSidecar):
// the `.seq` sidecar is a cache of the last committed seq; on every append it
// is reconciled against the JSONL tail so a missing/corrupt/drifted sidecar
// repairs itself instead of silently reusing stale reservations. Recovery
// semantics: reconcile, never silently replay.
// OPSV-owned implementation — no Trellis import.
// ============================================================================

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ExecutionError, OpsVErrorCode } from '../../errors/OpsVError';

const READ_TAIL_BYTES = 4096;

/** Parse sidecar content. Returns null on missing / non-integer. */
function parseSidecar(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // Reject leading +/-/0x/whitespace permutations; require pure digits.
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

async function readSidecar(sidecar: string): Promise<number | null> {
  if (!fs.existsSync(sidecar)) return null;
  try {
    return parseSidecar(await fsp.readFile(sidecar, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Recover the last seq from the JSONL tail without loading the whole file.
 * Returns 0 when the file is absent/empty. Throws when the file has content
 * but no recoverable seq — guessing would risk duplicate seq assignment.
 */
async function readLastJsonlSeq(jsonlPath: string): Promise<number> {
  if (!fs.existsSync(jsonlPath)) return 0;
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(jsonlPath);
  } catch {
    return 0;
  }
  if (stat.size === 0) return 0;

  const seqFromBuffer = (buf: Buffer): number | null => {
    const lines = buf.toString('utf-8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as { seq?: number };
        if (typeof parsed.seq === 'number' && Number.isFinite(parsed.seq)) {
          return parsed.seq;
        }
      } catch {
        continue;
      }
    }
    return null;
  };

  const tailLen = Math.min(stat.size, READ_TAIL_BYTES);
  const fh = await fsp.open(jsonlPath, 'r');
  try {
    const buf = Buffer.alloc(tailLen);
    await fh.read(buf, 0, tailLen, stat.size - tailLen);
    // Skip a partial first line the tail window may have sliced mid-event.
    let usable = buf;
    if (stat.size > tailLen) {
      const firstNewline = buf.indexOf(0x0a);
      usable = firstNewline >= 0 ? buf.subarray(firstNewline + 1) : Buffer.alloc(0);
    }
    if (usable.length > 0) {
      const found = seqFromBuffer(usable);
      if (found !== null) return found;
    }
  } finally {
    await fh.close();
  }

  // Tail produced no seq — full scan fallback.
  const text = await fsp.readFile(jsonlPath, 'utf-8');
  const found = seqFromBuffer(Buffer.from(text));
  if (found !== null) return found;
  if (text.split('\n').some((line) => line.trim() !== '')) {
    throw new ExecutionError(
      OpsVErrorCode.EXECUTION_SEQ_UNRECOVERABLE,
      `Unable to recover execution seq from ${jsonlPath}`,
    );
  }
  return 0;
}

/**
 * Drop an uncommitted torn tail (partial final line with no trailing
 * newline) before appending.
 *
 * Writes are ordered `appendFile → writeSidecar`, so a non-newline-terminated
 * tail can only come from a crash mid-append — the bytes were never
 * committed. Appending raw would glue the new event onto the torn fragment,
 * producing one unparseable line and silently losing a confirmed event.
 * Caller must hold the execution lock.
 */
export async function dropTornTail(jsonlPath: string): Promise<void> {
  if (!fs.existsSync(jsonlPath)) return;
  let stat: fs.Stats;
  try {
    stat = await fsp.stat(jsonlPath);
  } catch {
    return;
  }
  if (stat.size === 0) return;

  const fh = await fsp.open(jsonlPath, 'r');
  try {
    const lastByte = Buffer.alloc(1);
    await fh.read(lastByte, 0, 1, stat.size - 1);
    if (lastByte[0] === 0x0a) return; // clean tail — nothing to drop
  } finally {
    await fh.close();
  }

  // Torn tail: rare path, read the file to find the last complete line.
  const text = await fsp.readFile(jsonlPath, 'utf-8');
  const lastNewline = text.lastIndexOf('\n');
  await fsp.truncate(jsonlPath, lastNewline + 1);
}

/**
 * Compute the last committed seq by reconciling the sidecar with the JSONL
 * tail. Repairs the sidecar when it is missing, corrupted, lower than the
 * tail, or ahead of the tail (a stale reservation must not leave a seq gap).
 *
 * Caller must hold the execution lock when invoking this and the subsequent
 * JSONL append + sidecar write.
 */
export async function reconcileSeq(jsonlPath: string, sidecarPath: string): Promise<number> {
  const sidecar = await readSidecar(sidecarPath);
  const jsonlTail = await readLastJsonlSeq(jsonlPath);

  const last = jsonlTail;
  if (sidecar !== last) {
    await writeSidecar(sidecarPath, last);
  }
  return last;
}

export async function writeSidecar(sidecarPath: string, seq: number): Promise<void> {
  await fsp.mkdir(path.dirname(sidecarPath), { recursive: true });
  const tmp = `${sidecarPath}.tmp.${process.pid}.${Date.now()}`;
  await fsp.writeFile(tmp, `${seq}\n`, 'utf-8');
  await fsp.rename(tmp, sidecarPath);
}
