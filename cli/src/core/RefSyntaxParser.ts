// ============================================================================
// OpsV RefSyntaxParser (v0.10.0)
// Unified @-syntax parser:
//   @id                  → external asset
//   @id:variant          → external + variant
//   @:key                → in-document Design Reference
//   @FRAME:shotId_first  → frame reference (resolved at compile time)
// ============================================================================

import { PromptRefToken } from '../types/Refs';

// Token regex:
//   @ followed by either:
//     :name              (in-doc)
//     FRAME:name_kind    (frame)
//     id(:variant)?      (external)
// id/key/variant: Unicode alphanumeric + _ -
// Note: '.' is intentionally excluded to avoid swallowing trailing punctuation in prose.
const TOKEN_REGEX = /@(?::([\p{L}\p{N}_\-]+)|FRAME:([\p{L}\p{N}_\-]+)|([\p{L}\p{N}_\-]+)(?::([\p{L}\p{N}_\-]+))?)/gu;

/**
 * Parse all @-tokens in a text. Returns tokens in source order.
 * Duplicates are preserved (caller may dedupe by .key).
 */
export function parsePromptRefs(text: string): PromptRefToken[] {
  if (!text) return [];
  const tokens: PromptRefToken[] = [];
  let match: RegExpExecArray | null;
  TOKEN_REGEX.lastIndex = 0;

  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const [raw, docKey, frameKey, extId, extVariant] = match;

    if (docKey !== undefined) {
      tokens.push({
        raw,
        kind: 'doc',
        id: docKey,
        key: `@:${docKey}`,
      });
    } else if (frameKey !== undefined) {
      tokens.push({
        raw,
        kind: 'frame',
        id: frameKey,
        key: `@FRAME:${frameKey}`,
      });
    } else if (extId !== undefined) {
      tokens.push({
        raw,
        kind: 'external',
        id: extId,
        variant: extVariant,
        key: extVariant ? `@${extId}:${extVariant}` : `@${extId}`,
      });
    }
  }

  return tokens;
}

/**
 * Extract unique non-frame refs from prompt text (deduped by canonical key).
 * @FRAME:* tokens are excluded because they don't participate in refs validation.
 */
export function extractRefsFromText(text: string): PromptRefToken[] {
  const tokens = parsePromptRefs(text);
  const seen = new Set<string>();
  const unique: PromptRefToken[] = [];
  for (const t of tokens) {
    if (t.kind === 'frame') continue;
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    unique.push(t);
  }
  return unique;
}

/**
 * Extract unique frame refs.
 */
export function extractFrameRefs(text: string): PromptRefToken[] {
  const tokens = parsePromptRefs(text);
  const seen = new Set<string>();
  const unique: PromptRefToken[] = [];
  for (const t of tokens) {
    if (t.kind !== 'frame') continue;
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    unique.push(t);
  }
  return unique;
}

/**
 * Combined: scan multiple text fields (prompt, visual_brief, visual_detailed, body)
 * and return all unique non-frame refs.
 */
export function extractAllRefs(...texts: Array<string | undefined>): PromptRefToken[] {
  const seen = new Set<string>();
  const unique: PromptRefToken[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const t of extractRefsFromText(text)) {
      if (seen.has(t.key)) continue;
      seen.add(t.key);
      unique.push(t);
    }
  }
  return unique;
}
