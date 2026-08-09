// ============================================================================
// OpsV RefBinder (v0.10.0) — Bind frontmatter refs to runtime ResolvedRef[]
// ============================================================================

import fs from 'fs';
import { ResolvedRef } from '../types/FrontmatterSchema';
import { RefsByType } from '../types/Refs';
import { logger } from '../utils/logger';
import { InputTypesLoader } from '../utils/inputTypesLoader';
import { parseRefKey } from './RefSyntaxParser';

export interface RefBinderContext {
  /** Unused by bindRefs itself (only checkPathsExist resolves paths); optional so pure validation callers need no project root. */
  projectRoot?: string;
  inputTypes?: InputTypesLoader;
}

/** Stable issue codes for refs-structure binding failures (hook/router contract). */
export type RefBindingIssueCode =
  | 'REF_INPUT_TYPE_UNKNOWN'
  | 'REF_STRUCTURE_INVALID'
  | 'REF_PATHS_EMPTY'
  | 'REF_KEY_INVALID';

export interface RefBindingIssue {
  code: RefBindingIssueCode;
  message: string;
}

export interface RefBinderResult {
  resolved: ResolvedRef[];
  /** Grouped flat paths by type, ready for InputEvaluator consumption */
  groupedInputs: Record<string, string[]>;
  errors: string[];
  /** Coded counterparts of `errors` (same entries, same order). */
  issues: RefBindingIssue[];
}

/**
 * Parse frontmatter refs into ResolvedRef[] + grouped flat path map.
 * Validates:
 *  - input_type is registered (when inputTypes loader provided)
 *  - each ref key has at least one path
 *  - paths exist on disk (warning, not error — handled by validate command)
 */
export function bindRefs(rawRefs: RefsByType | undefined, ctx: RefBinderContext): RefBinderResult {
  const resolved: ResolvedRef[] = [];
  const groupedInputs: Record<string, string[]> = {};
  const errors: string[] = [];
  const issues: RefBindingIssue[] = [];
  const pushError = (code: RefBindingIssueCode, message: string): void => {
    errors.push(message);
    issues.push({ code, message });
  };

  if (!rawRefs) return { resolved, groupedInputs, errors, issues };

  const validTypes = ctx.inputTypes?.listTypes();

  for (const [type, refsMap] of Object.entries(rawRefs)) {
    if (validTypes && !validTypes.includes(type)) {
      pushError('REF_INPUT_TYPE_UNKNOWN', `refs: unknown input_type "${type}" (not in input_types.yaml). Valid: ${validTypes.join(', ')}`);
      continue;
    }

    if (!refsMap || typeof refsMap !== 'object') {
      pushError('REF_STRUCTURE_INVALID', `refs[${type}]: must be an object mapping ref keys to path arrays`);
      continue;
    }

    if (!groupedInputs[type]) groupedInputs[type] = [];

    for (const [key, paths] of Object.entries(refsMap)) {
      if (!Array.isArray(paths) || paths.length === 0) {
        pushError('REF_PATHS_EMPTY', `refs[${type}]["${key}"]: must be a non-empty array of paths`);
        continue;
      }

      const parsed = parseKey(key);
      if (!parsed) {
        pushError('REF_KEY_INVALID', `refs[${type}]["${key}"]: invalid key syntax (expected @id, @id:variant, or @:key)`);
        continue;
      }

      resolved.push({
        key,
        type,
        kind: parsed.kind,
        id: parsed.id,
        variant: parsed.variant,
        paths,
      });

      groupedInputs[type].push(...paths);
    }
  }

  return { resolved, groupedInputs, errors, issues };
}

/** Parse a refs map key into structured form. */
export function parseKey(key: string): { kind: 'external' | 'doc'; id: string; variant?: string } | null {
  return parseRefKey(key);
}

/**
 * Verify that referenced files exist. Returns missing paths.
 */
export function checkPathsExist(resolved: ResolvedRef[], projectRoot: string): string[] {
  const missing: string[] = [];
  for (const ref of resolved) {
    for (const p of ref.paths) {
      const abs = p.startsWith('/') ? p : `${projectRoot}/${p}`;
      if (!fs.existsSync(abs)) {
        missing.push(`${ref.key} → ${p}`);
      }
    }
  }
  return missing;
}
