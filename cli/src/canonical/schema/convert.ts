// ============================================================================
// Canonical Model — conversion between existing document structures and the IR
// ============================================================================
//
// P1 scope: frontmatter-level conversion only. Body/timeline parsing is P2.
// Fidelity contract: `raw` keeps the complete original frontmatter record so
// `toFrontmatter(fromFrontmatter(x))` restores `x` exactly (no information
// loss). The typed fields are the canonical view for downstream consumers.
// ============================================================================

import { RefsByType } from '../../types/Refs';
import { parseRefKey, ParsedRefKey } from '../../core/RefSyntaxParser';
import {
  CanonicalReference,
  CanonicalReferenceSchema,
  CanonicalDocument,
  CanonicalDocumentSchema,
} from './index';

/**
 * Convert a parsed ref token into a CanonicalReference.
 *
 * `@:key` (design) and `@id` / `@id:variant` (external) share the same
 * CanonicalReference shape; the external/design split lives at the container
 * level (`CanonicalDocument.refs`). `raw` preserves the exact original text.
 *
 * @param parsed result of `parseRefKey` (or a compatible hand-built value)
 * @param raw    the exact original text (`@alice:v3` / `@:key`)
 * @param namespace namespace override — 'FRAME' for frame directives
 */
export function fromRefToken(
  parsed: Pick<ParsedRefKey, 'id' | 'variant'>,
  raw: string,
  namespace = 'asset',
): CanonicalReference {
  return CanonicalReferenceSchema.parse({
    type: 'reference',
    namespace,
    id: parsed.id,
    variant: parsed.variant,
    raw,
  });
}

/**
 * Split a frontmatter refs map into external and design CanonicalReferences.
 *
 * Outer key is the input type (image/video/audio/...) and is not part of the
 * reference expression; the inner `@id[:variant]` / `@:key` keys are parsed.
 */
export function fromRefsMap(
  refs: RefsByType | undefined,
): { external: CanonicalReference[]; design: CanonicalReference[] } {
  const external: CanonicalReference[] = [];
  const design: CanonicalReference[] = [];
  if (!refs) return { external, design };

  for (const entries of Object.values(refs)) {
    for (const key of Object.keys(entries)) {
      const parsed = parseRefKey(key);
      if (!parsed) continue; // unknown key shape — preserved in raw, not a canonical ref
      const ref = fromRefToken(parsed, key);
      if (parsed.kind === 'doc') design.push(ref);
      else external.push(ref);
    }
  }
  return { external, design };
}

/**
 * Parse a raw frontmatter record into a CanonicalDocument.
 *
 * Known fields are extracted into typed slots; the complete original record
 * is kept in `raw` for lossless round-trip. `body` is preserved verbatim.
 */
export function fromFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
): CanonicalDocument {
  const {
    category,
    status,
    id,
    prompt,
    visual_brief,
    visual_detailed,
    negative_prompt,
    refs,
    reviews,
  } = frontmatter;

  const doc = CanonicalDocumentSchema.parse({
    category,
    status,
    id: typeof id === 'string' ? id : undefined,
    prompt: typeof prompt === 'string' ? prompt : undefined,
    visualBrief: typeof visual_brief === 'string' ? visual_brief : undefined,
    visualDetailed: typeof visual_detailed === 'string' ? visual_detailed : undefined,
    negativePrompt: typeof negative_prompt === 'string' ? negative_prompt : undefined,
    refs: fromRefsMap(refs as RefsByType | undefined),
    reviews: Array.isArray(reviews) ? (reviews as string[]) : [],
    bodyRaw: body,
    raw: frontmatter,
  });

  return doc;
}

/**
 * Reconstruct the frontmatter record from a CanonicalDocument.
 *
 * v1 restores the exact original record from `raw`. Typed write-back (e.g.
 * review annotations landed via `opsv sync`) is a P3 concern that merges
 * typed changes over `raw`; until then, `raw` is the fidelity source.
 */
export function toFrontmatter(doc: CanonicalDocument): Record<string, unknown> {
  return { ...doc.raw };
}
