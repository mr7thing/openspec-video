// ============================================================================
// OpsV PromptCompiler (v0.10.0)
// Rewrite @-tokens in prompt according to PromptCompileMode:
//   - keep:  prompt unchanged, return _refs_map for payload attachment
//   - index: @hero → image1 (per-type sequential numbering)
//   - name:  @hero → hero (bare id, @:angle_side → angle_side)
// ============================================================================

import { PromptCompileMode } from '../../types/Refs';
import { ResolvedRef } from '../../types/FrontmatterSchema';
import { parsePromptRefs } from '../RefSyntaxParser';

export interface PromptCompileResult {
  /** Rewritten prompt text */
  prompt: string;
  /** Map of canonical key → placeholder used (e.g. "@hero" → "image1") */
  refsMap: Record<string, string>;
}

/**
 * Rewrite a prompt according to the given mode and resolved refs.
 *
 * @param prompt the original prompt text
 * @param resolved the ResolvedRef[] in the order they appear in frontmatter refs
 * @param mode keep | index | name
 */
export function compilePrompt(
  prompt: string,
  resolved: ResolvedRef[],
  mode: PromptCompileMode,
): PromptCompileResult {
  if (!prompt) return { prompt: '', refsMap: {} };

  // Build the key → placeholder map up front (deterministic by resolved order).
  const refsMap: Record<string, string> = {};

  if (mode === 'keep') {
    for (const ref of resolved) {
      refsMap[ref.key] = ref.key;
    }
    return { prompt, refsMap };
  }

  if (mode === 'index') {
    const counters: Record<string, number> = {};
    for (const ref of resolved) {
      counters[ref.type] = (counters[ref.type] || 0) + 1;
      refsMap[ref.key] = `${ref.type}${counters[ref.type]}`;
    }
  } else if (mode === 'name') {
    for (const ref of resolved) {
      // External @hero → "hero"; doc @:angle_side → "angle_side"
      refsMap[ref.key] = ref.id;
    }
  }

  // Rewrite the prompt: scan tokens in source order, replace by canonical key.
  const tokens = parsePromptRefs(prompt);
  if (tokens.length === 0) return { prompt, refsMap };

  let out = '';
  let cursor = 0;
  let lastEnd = 0;

  // We need positions; re-run regex with indices.
  const re = /@(?::([a-zA-Z0-9_\-]+)|FRAME:([a-zA-Z0-9_\-]+)|([a-zA-Z0-9_\-]+)(?::([a-zA-Z0-9_\-]+))?)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(prompt)) !== null) {
    const raw = m[0];
    const start = m.index;
    const end = start + raw.length;

    // Determine canonical key (frame refs are passed through unchanged)
    let key: string | null = null;
    if (m[1] !== undefined) key = `@:${m[1]}`;
    else if (m[2] !== undefined) key = null; // frame — leave as-is
    else if (m[3] !== undefined) key = m[4] ? `@${m[3]}:${m[4]}` : `@${m[3]}`;

    out += prompt.slice(lastEnd, start);
    if (key && refsMap[key]) {
      out += refsMap[key];
    } else {
      out += raw;
    }
    lastEnd = end;
  }
  out += prompt.slice(lastEnd);

  return { prompt: out, refsMap };
}
