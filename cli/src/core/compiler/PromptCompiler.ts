// ============================================================================
// OpsV PromptCompiler (v0.15.0)
// Rewrite @-tokens in prompt according to PromptCompileMode:
//   - keep:    prompt unchanged, return _refs_map for downstream resolution
//   - index:   @hero → image1 (per-type sequential numbering)
//   - name:    @hero → hero (bare id)
//   - annotate:(default) prefix: "image1 is @hero(#brief:...);"
//              body: @hero(image1) ...  ; reads brief from ResolvedRef.brief
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
 * @param mode keep | index | name | annotate
 */
export function compilePrompt(
  prompt: string,
  resolved: ResolvedRef[],
  mode: PromptCompileMode,
): PromptCompileResult {
  if (!prompt) return { prompt: '', refsMap: {} };

  if (mode === 'annotate') {
    return compileAnnotated(prompt, resolved);
  }

  // --- Legacy modes: keep / index / name ---
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
      refsMap[ref.key] = ref.id;
    }
  }

  return { prompt: rewritePromptTokens(prompt, refsMap), refsMap };
}

// ============================================================================
// Annotate mode — default
// ============================================================================

function compileAnnotated(
  prompt: string,
  resolved: ResolvedRef[],
): PromptCompileResult {
  // Separate refs by type, preserving order within each type
  const imageRefs = resolved.filter(r => r.type === 'image');
  const videoRefs = resolved.filter(r => r.type === 'video');
  const audioRefs = resolved.filter(r => r.type === 'audio');

  // Build refsMap: @hero → image1, @scene → image2, @bgm → audio1
  const refsMap: Record<string, string> = {};
  const allTyped: Array<{ type: string; prefix: string }> = [
    { type: 'image', prefix: 'image' },
    { type: 'video', prefix: 'video' },
    { type: 'audio', prefix: 'audio' },
  ];

  // Number sequentially per type
  const idByKey: Record<string, string> = {};  // "@hero" → "image1"
  for (const { type, prefix } of allTyped) {
    let idx = 0;
    for (const ref of resolved) {
      if (ref.type !== type) continue;
      idx++;
      const placeholder = `${prefix}${idx}`;
      refsMap[ref.key] = placeholder;
      idByKey[ref.key] = placeholder;
    }
  }

  // Build header: "image1 is @hero(#brief:...); image2 is @scene(#brief:...); "
  const headerParts: string[] = [];
  for (const ref of resolved.filter(r => idByKey[r.key])) {
    const placeholder = idByKey[ref.key];
    const briefSuffix = ref.brief ? `(#brief:${ref.brief})` : '';
    headerParts.push(`${placeholder} is ${ref.key}${briefSuffix}`);
  }
  const header = headerParts.length > 0 ? headerParts.join('; ') + '; ' : '';

  // Rewrite body: @hero → @hero(image1)
  const body = rewritePromptTokens(prompt, (key) => {
    const placeholder = idByKey[key];
    if (placeholder) {
      return `${key}(${placeholder})`;
    }
    return key; // unchanged for refs without numbering (shouldn't happen)
  });

  return {
    prompt: header + body,
    refsMap,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Rewrite @-tokens in prompt text using a value resolver.
 *
 * @param prompt original text
 * @param resolve function mapping canonical key (e.g. "@hero") to replacement string
 */
function rewritePromptTokens(
  prompt: string,
  resolve: ((key: string) => string) | Record<string, string>,
): string {
  const resolver = typeof resolve === 'function'
    ? resolve
    : (key: string) => (resolve as Record<string, string>)[key] || key;

  const tokens = parsePromptRefs(prompt);
  if (tokens.length === 0) return prompt;

  const re = /@(?::([\p{L}\p{N}_\-]+)|FRAME:([\p{L}\p{N}_\-]+)|([\p{L}\p{N}_\-]+)(?::([\p{L}\p{N}_\-]+))?)/gu;
  let out = '';
  let cursor = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(prompt)) !== null) {
    const raw = m[0];
    const start = m.index;
    const end = start + raw.length;

    // Determine canonical key
    let key: string | null = null;
    if (m[1] !== undefined) key = `@:${m[1]}`;
    else if (m[2] !== undefined) key = null; // frame — leave as-is
    else if (m[3] !== undefined) key = m[4] ? `@${m[3]}:${m[4]}` : `@${m[3]}`;

    out += prompt.slice(cursor, start);
    if (key) {
      out += resolver(key);
    } else {
      out += raw;
    }
    cursor = end;
  }
  out += prompt.slice(cursor);

  return out;
}
