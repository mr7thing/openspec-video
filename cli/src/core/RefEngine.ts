// ============================================================================
// OpsV RefEngine — Consolidated @-reference system
// ============================================================================
//
// Single entry point for all @-reference operations:
//   1. parsePromptRefs()    — Parse @-tokens from text (syntax)
//   2. bindRefs()           — Bind frontmatter refs to ResolvedRef[] (binding)
//   3. compilePrompt()      — Rewrite @-tokens in prompt (compilation)
//   4. RefResolver class    — Resolve @-identifiers to file paths (resolution)
//
// Usage:
//   import { parsePromptRefs, bindRefs, compilePrompt, RefResolver } from './RefEngine';
//
// Or use the high-level resolve() function for the full pipeline.
// ============================================================================

// Re-export all individual module APIs
export { parsePromptRefs, extractRefsFromText, extractFrameRefs, extractAllRefs } from './RefSyntaxParser';
export { bindRefs, parseKey, checkPathsExist } from './RefBinder';
export type { RefBinderContext, RefBinderResult } from './RefBinder';
export { compilePrompt } from './compiler/PromptCompiler';
export type { PromptCompileResult } from './compiler/PromptCompiler';
export { RefResolver } from './RefResolver';
export type { RefResult } from './RefResolver';

// ============================================================================
// High-level pipeline
// ============================================================================

import { ResolvedRef } from '../types/FrontmatterSchema';
import { RefsByType, PromptCompileMode } from '../types/Refs';
import { bindRefs, RefBinderContext } from './RefBinder';
import { compilePrompt, PromptCompileResult } from './compiler/PromptCompiler';
import { extractAllRefs } from './RefSyntaxParser';

export interface RefResolveContext extends RefBinderContext {
  promptMode?: PromptCompileMode;
}

export interface RefResolveResult {
  /** Bound refs from frontmatter */
  resolved: ResolvedRef[];
  /** Grouped flat paths by type */
  groupedInputs: Record<string, string[]>;
  /** Compiled prompt with rewritten @-tokens */
  compiled: PromptCompileResult;
  /** All @-refs found in prompt text (for validation) */
  promptRefs: ReturnType<typeof extractAllRefs>;
  /** Binding errors */
  errors: string[];
}

/**
 * Full reference resolution pipeline: bind → compile → extract.
 *
 * Given a document's frontmatter refs and prompt, produces everything
 * needed for task compilation in a single call.
 */
export function resolveRefs(
  rawRefs: RefsByType | undefined,
  prompt: string,
  ctx: RefResolveContext,
): RefResolveResult {
  // Step 1: Bind frontmatter refs to ResolvedRef[]
  const binding = bindRefs(rawRefs, ctx);

  // Step 2: Compile prompt (rewrite @-tokens)
  const mode = ctx.promptMode || 'annotate';
  const compiled = compilePrompt(prompt, binding.resolved, mode);

  // Step 3: Extract all @-refs from original prompt for validation
  const promptRefs = extractAllRefs(prompt);

  return {
    resolved: binding.resolved,
    groupedInputs: binding.groupedInputs,
    compiled,
    promptRefs,
    errors: binding.errors,
  };
}
