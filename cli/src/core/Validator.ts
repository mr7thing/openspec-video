// ============================================================================
// OpsV Validator (A6) — shared validation kernel for document content.
//
// Pure functions: no fs, no config discovery, no .trellis/ access. Callers
// supply everything through DocumentValidationContext, so the `opsv validate`
// disk scan, `opsv validate --inline` (proposed content), and future hook
// adapters share exactly one implementation — no copied logic.
//
// Issue codes emitted here are stable (hook/router contract, 08-05 Go #4);
// adding or renaming a code is a compatibility event. DOCUMENT_ISSUE_CODES
// is the frozen list, locked by Validator.test.ts.
// ============================================================================

import crypto from 'crypto';
import { z } from 'zod';
import { FrontmatterParser } from './FrontmatterParser';
import {
  BaseFrontmatterSchema,
  ProjectFrontmatterSchema,
  ShotDesignFrontmatterSchema,
  ShotProductionFrontmatterSchema,
} from '../types/FrontmatterSchema';
import { RefsByType } from '../types/Refs';
import { bindRefs, parseKey } from './RefEngine';
import { validateCategory } from './CategoryValidator';
import { CategoryRule } from '../utils/categoryValidateLoader';
import { InputTypesLoader } from '../utils/inputTypesLoader';
import { OpsVError, OpsVErrorCode } from '../errors/OpsVError';

/** Contract version of the shared validation kernel (hook cache key ingredient). */
export const VALIDATOR_CONTRACT_VERSION = 1;

/** Which check produced an issue — lets command layers bucket issues without re-parsing codes. */
export type DocumentValidationSource = 'frontmatter' | 'refs' | 'category' | 'ref-target';

export interface DocumentValidationIssue {
  /** Stable issue code (see DOCUMENT_ISSUE_CODES). */
  code: string;
  severity: 'error' | 'warning';
  message: string;
  source: DocumentValidationSource;
  field?: string;
  category?: string;
  /** Bare external ref id (only for source 'ref-target'). */
  ref?: string;
}

/**
 * Frozen set of issue codes the kernel can emit.
 * - VALIDATION_* names mirror OpsVErrorCode enum keys (frontmatter/schema failures).
 * - REF_* names are shared with RefBinder / WorkPacket (REF_MISSING parity).
 * - CATEGORY_RULE wraps CategoryValidator rule findings (severity carries through).
 */
export const DOCUMENT_ISSUE_CODES = [
  'VALIDATION_FRONTMATTER_MISSING',
  'VALIDATION_FRONTMATTER_MALFORMED',
  'VALIDATION_YAML_PARSE_FAILED',
  'VALIDATION_SCHEMA_MISMATCH',
  'VALIDATION_UNKNOWN',
  'REF_INPUT_TYPE_UNKNOWN',
  'REF_STRUCTURE_INVALID',
  'REF_PATHS_EMPTY',
  'REF_KEY_INVALID',
  'REF_MISSING',
  'CATEGORY_RULE',
] as const;

export interface DocumentValidationContext {
  /**
   * Asset ids known to exist (from AssetDocIndex). When provided, external
   * refs whose target id is absent produce REF_MISSING. Omit (undefined) to
   * skip the dead-ref check — e.g. standalone use without a document tree.
   */
  knownAssetIds?: ReadonlySet<string>;
  /** Category rule lookup (from CategoryValidateLoader). */
  getCategoryRule?: (category: string) => CategoryRule | undefined;
  /** Registered input types (from InputTypesLoader). */
  inputTypes?: InputTypesLoader;
  skipCategoryRules?: boolean;
}

export interface DocumentValidationResult {
  /** parseRaw frontmatter (available even when the typed schema check failed). */
  frontmatter?: Record<string, any>;
  body?: string;
  /** True when the typed schema parse succeeded (mirrors disk validFiles semantics). */
  schemaValid: boolean;
  issues: DocumentValidationIssue[];
}

/** Category → Zod schema (Document Contract). Single owner; moved from commands/validate.ts. */
export function getSchemaForCategory(category?: string): z.ZodType {
  switch (category) {
    case 'project':
      return ProjectFrontmatterSchema;
    case 'shot-design':
      return ShotDesignFrontmatterSchema;
    case 'shot-production':
      return ShotProductionFrontmatterSchema;
    default:
      return BaseFrontmatterSchema;
  }
}

/** Deterministic sha256 of proposed content — hook cache key ingredient (08-05 Go follow-up #2). */
export function hashProposedContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

const FRONTMATTER_ERROR_CODE_NAMES: Partial<Record<OpsVErrorCode, string>> = {
  [OpsVErrorCode.VALIDATION_FRONTMATTER_MISSING]: 'VALIDATION_FRONTMATTER_MISSING',
  [OpsVErrorCode.VALIDATION_FRONTMATTER_MALFORMED]: 'VALIDATION_FRONTMATTER_MALFORMED',
  [OpsVErrorCode.VALIDATION_YAML_PARSE_FAILED]: 'VALIDATION_YAML_PARSE_FAILED',
  [OpsVErrorCode.VALIDATION_SCHEMA_MISMATCH]: 'VALIDATION_SCHEMA_MISMATCH',
};

function frontmatterErrorToIssue(err: unknown): DocumentValidationIssue {
  if (err instanceof OpsVError) {
    return {
      code: FRONTMATTER_ERROR_CODE_NAMES[err.code] ?? err.code,
      severity: 'error',
      message: err.message,
      source: 'frontmatter',
    };
  }
  return {
    code: 'VALIDATION_UNKNOWN',
    severity: 'error',
    message: err instanceof Error ? err.message : String(err),
    source: 'frontmatter',
  };
}

/**
 * Validate one document's proposed (or on-disk) frontmatter+body content.
 *
 * Check order and failure semantics mirror the historical `opsv validate`
 * disk path exactly:
 *  1. parseRaw frontmatter; a missing `---` block short-circuits everything.
 *  2. Typed schema check (Document Contract). On failure, refs-structure and
 *     category-rule checks are skipped — but the dead-ref pass still runs.
 *  3. Refs structure binding (single implementation: RefBinder.bindRefs).
 *  4. Category rules (single implementation: CategoryValidator.validateCategory).
 *  5. Dead-ref pass over raw refs when knownAssetIds is provided (doc-kind
 *     `@:key` refs are never in the asset index and are skipped).
 */
export function validateDocumentContent(
  content: string,
  ctx: DocumentValidationContext = {},
): DocumentValidationResult {
  const issues: DocumentValidationIssue[] = [];

  let raw: { frontmatter: Record<string, any>; body: string };
  try {
    raw = FrontmatterParser.parseRaw(content);
  } catch (err) {
    issues.push(frontmatterErrorToIssue(err));
    return { schemaValid: false, issues };
  }
  const { frontmatter, body } = raw;

  let schemaValid = true;
  try {
    FrontmatterParser.parse(content, getSchemaForCategory(frontmatter.category));
  } catch (err) {
    schemaValid = false;
    issues.push(frontmatterErrorToIssue(err));
  }

  if (schemaValid) {
    const binding = bindRefs(frontmatter.refs as RefsByType | undefined, {
      inputTypes: ctx.inputTypes,
    });
    for (const issue of binding.issues) {
      issues.push({ code: issue.code, severity: 'error', message: issue.message, source: 'refs' });
    }

    if (!ctx.skipCategoryRules) {
      const rule = ctx.getCategoryRule?.(String(frontmatter.category ?? ''));
      for (const issue of validateCategory(frontmatter, body, rule)) {
        issues.push({
          code: 'CATEGORY_RULE',
          severity: issue.severity,
          message: issue.message,
          source: 'category',
          field: issue.field,
          category: issue.category,
        });
      }
    }
  }

  if (ctx.knownAssetIds) {
    const refs = (frontmatter.refs || {}) as RefsByType;
    for (const typeMap of Object.values(refs)) {
      for (const key of Object.keys(typeMap || {})) {
        const parsed = parseKey(key);
        if (!parsed) continue;
        if (parsed.kind === 'doc') continue; // local doc refs not in asset index
        if (!ctx.knownAssetIds.has(parsed.id)) {
          issues.push({
            code: 'REF_MISSING',
            severity: 'error',
            message: `refs "@${parsed.id}" — document not found`,
            source: 'ref-target',
            ref: parsed.id,
          });
        }
      }
    }
  }

  return { frontmatter, body, schemaValid, issues };
}
