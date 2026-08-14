// ============================================================================
// Repair Report — the OPSV side of the Generate → Verify → Repair loop
//
// Aggregates, for one asset: document existence, canonical parse health,
// asset state machine state, and a deterministic suggested repair action.
// The agent reads this as a failure report and acts (fix spec → re-validate →
// re-commit). Analysis: 项目意义与改进建议.md §12 / §18 P2.
// ============================================================================

import fs from 'node:fs';
import { buildAssetDocIndex } from '../../core/AssetDocIndex';
import { getProjectDir } from '../../utils/configLoader';
import { parseAssetDocument } from '../parser/CanonicalNormalizer';
import { currentStateSync } from '../state/TransitionStore';

export interface RepairReport {
  asset: string;
  exists: boolean;
  docPath?: string;
  canonicalOk: boolean;
  canonicalError?: string;
  state: string;
  transitions: number;
  suggested: string;
}

/** Deterministic next-repair-action per asset state. */
export function suggestAction(state: string): string {
  switch (state) {
    case 'draft':
      return 'commit an artifact (opsv commit <artifact> --task <asset>)';
    case 'candidate':
      return 'compile + run the affected tasks, then submit for review';
    case 'review':
      return 'approve, or revise (opsv review revise <asset>) to reopen';
    case 'rejected':
      return 'fix the issues and re-commit (rejected → candidate)';
    case 'approved':
      return 'release, or supersede when a new variant is needed';
    default:
      return 'terminal state; start a new variant to iterate';
  }
}

export function buildRepairReport(projectRoot: string, assetId: string): RepairReport {
  const videospec = getProjectDir(projectRoot, 'videospec');
  const index = buildAssetDocIndex(videospec);
  const entry = index.entries.get(assetId);

  if (!entry) {
    return {
      asset: assetId,
      exists: false,
      canonicalOk: false,
      state: 'draft',
      transitions: 0,
      suggested: 'create the Asset Document first (videospec/<...>/<asset>.md)',
    };
  }

  let canonicalOk = true;
  let canonicalError: string | undefined;
  try {
    parseAssetDocument(fs.readFileSync(entry.filePath, 'utf-8'));
  } catch (err: any) {
    canonicalOk = false;
    canonicalError = err.message;
  }

  const { state, transitions } = currentStateSync(projectRoot, assetId);
  return {
    asset: assetId,
    exists: true,
    docPath: entry.filePath,
    canonicalOk,
    canonicalError,
    state,
    transitions: transitions.length,
    suggested: suggestAction(state),
  };
}
