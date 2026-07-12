// ============================================================================
// OpsV Refs Types (v0.10.0)
// Unified @-syntax for references, grouped by input_type
// ============================================================================

import { z } from 'zod';

/**
 * RefsByType — grouped refs structure used in frontmatter.
 *
 * Outer key: input_type (image / video / audio / bvh / mask / custom)
 * Inner key: ref id with @-syntax (@id, @id:variant, @:key)
 * Value: array of resolved file paths (at least one)
 */
export const RefsByTypeSchema = z.record(
  z.record(z.array(z.string()).min(1))
);
export type RefsByType = z.infer<typeof RefsByTypeSchema>;

/**
 * PromptRefToken — single ref occurrence extracted from prompt text.
 */
export interface PromptRefToken {
  /** Original text matched: e.g. "@hero", "@style:night", "@:angle_side" */
  raw: string;
  /** Kind of reference */
  kind: 'external' | 'doc' | 'frame';
  /** For external/doc: the bare id (after @ or @:) */
  id: string;
  /** For external refs with variant */
  variant?: string;
  /** Canonical key used as refs map lookup: e.g. "@hero", "@style:night", "@:angle_side" */
  key: string;
}

/**
 * PromptCompileMode — how to rewrite prompt @-tokens at compile time.
 *
 * - keep:    prompt unchanged, attach _refs_map payload
 * - index:   @hero → image1, @:angle_side → image2 (per-type sequential)
 * - name:    @hero → hero, @:angle_side → angle_side (bare names)
 * - annotate: (default) prefix with imageN is @hero(#brief:...);
 *             body: @hero → @hero(image1); reads brief from referenced doc
 */
export type PromptCompileMode = 'keep' | 'index' | 'name' | 'annotate';

/**
 * RefSyntaxKind — categorizes a parsed @-token without consuming it.
 */
export type RefSyntaxKind = 'external' | 'doc' | 'frame';
