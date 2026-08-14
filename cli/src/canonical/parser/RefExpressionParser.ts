// ============================================================================
// Reference DSL v2 — ReferenceExpression parser
//
// Grammar: @[namespace:]id[.selector][:variant][[state]]
//
// Backward-compatibility contract:
//   - The v1 forms (@id, @id:variant, @:key, @FRAME:shotId_first) parse exactly
//     as before. Existing RefSyntaxParser / RefBinder tests must not change.
//   - A `.selector` resolves ONLY when the selector is in the active allowlist
//     (declared by a Pack). With an empty allowlist the parser behaves exactly
//     like v1: the `.` stays prose in text scanning, and a dotted key is not a
//     valid refs-map key (matches parseRefKey returning null).
//
// Spec: .trellis/spec/canonical-model/reference-dsl-v2.md
// ============================================================================

import { CanonicalReference, CanonicalReferenceSchema } from '../schema';

// v1 token class (no dots) — intentionally identical to RefSyntaxParser.
// Kept as a bare character class (no ^ anchor) so it can be composed.
const ID_CLASS = '[\\p{L}\\p{N}_\\-]+';
// A selector/variant/state token (after the id).
const SUFFIX_TOKEN = /^[\p{L}\p{N}_\-]+/u;

export interface RefScanToken {
  ref: CanonicalReference;
  /** Index of the '@' in the source text. */
  start: number;
  /** Index just past the consumed token. */
  end: number;
}

interface ParsedFragment {
  ref: CanonicalReference;
  /** Characters consumed from the input fragment. */
  length: number;
}

/**
 * Parse a refs-map key (or standalone expression) into a CanonicalReference.
 *
 * Returns null when the input is not a valid canonical reference — including
 * a `.selector` that is not in the allowlist (mirrors parseRefKey returning
 * null for dotted keys).
 *
 * @param key       the expression, e.g. `@alice:v3`, `@:main`, `@alice.face:v2`
 * @param allowlist selector names the current Pack stack allows (empty = v1)
 */
export function parseRefExpression(
  key: string,
  allowlist: Iterable<string> = [],
): CanonicalReference | null {
  if (!key.startsWith('@')) return null;
  const parsed = tryParseFragment(key, allowlist);
  if (!parsed || parsed.length !== key.length) return null;
  return parsed.ref;
}

/**
 * Scan text for ReferenceExpressions.
 *
 * Used for prompt/body text where a non-allowlisted `.` must remain prose:
 * the token stops before it (v1 behavior). Returns tokens in source order;
 * duplicates are preserved (caller may dedupe by `.ref.raw`).
 */
export function scanRefExpressions(
  text: string,
  allowlist: Iterable<string> = [],
): RefScanToken[] {
  const tokens: RefScanToken[] = [];
  if (!text) return tokens;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@') continue;
    const parsed = tryParseFragment(text.slice(i), allowlist);
    if (!parsed) continue;
    tokens.push({ ref: parsed.ref, start: i, end: i + parsed.length });
    i += parsed.length - 1;
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function tryParseFragment(
  rest: string,
  allowlist: Iterable<string>,
): ParsedFragment | null {
  // Design reference: @:key
  const design = rest.match(/^@:([\p{L}\p{N}_\-]+)/u);
  if (design) {
    return {
      ref: CanonicalReferenceSchema.parse({
        type: 'reference',
        id: design[1],
        raw: `@:${design[1]}`,
      }),
      length: design[0].length,
    };
  }

  // Frame directive: @FRAME:shotId_first
  const frame = rest.match(/^@FRAME:([\p{L}\p{N}_\-]+)/u);
  if (frame) {
    return {
      ref: CanonicalReferenceSchema.parse({
        type: 'reference',
        namespace: 'FRAME',
        id: frame[1],
        raw: `@FRAME:${frame[1]}`,
      }),
      length: frame[0].length,
    };
  }

  // External: @id[.selector][:variant][[state]]
  const idMatch = rest.match(new RegExp(`^@${ID_CLASS}`, 'u'));
  if (!idMatch) return null;
  const id = idMatch[0].slice(1); // strip '@'
  let cursor = idMatch[0].length;
  let selector: string | undefined;
  let variant: string | undefined;
  let state: string | undefined;

  // Optional .selector — only when the suffix is allowlisted.
  if (rest[cursor] === '.') {
    const sel = rest.slice(cursor + 1).match(SUFFIX_TOKEN);
    if (sel && isAllowlisted(sel[0], allowlist)) {
      selector = sel[0];
      cursor += 1 + sel[0].length;
    }
  }

  // Optional :variant
  if (rest[cursor] === ':') {
    const v = rest.slice(cursor + 1).match(SUFFIX_TOKEN);
    if (v) {
      variant = v[0];
      cursor += 1 + v[0].length;
    }
  }

  // Optional [state]
  if (rest[cursor] === '[') {
    const close = rest.indexOf(']', cursor + 1);
    if (close !== -1) {
      state = rest.slice(cursor + 1, close);
      cursor = close + 1;
    }
  }

  const raw = rest.slice(0, cursor);
  return {
    ref: CanonicalReferenceSchema.parse({
      type: 'reference',
      id,
      selector,
      variant,
      state,
      raw,
    }),
    length: cursor,
  };
}

function isAllowlisted(name: string, allowlist: Iterable<string>): boolean {
  for (const allowed of allowlist) {
    if (allowed === name) return true;
  }
  return false;
}
