// ============================================================================
// OpsV CategoryValidator (v0.10.0)
// Applies per-category rules from category_validate.yaml to a document.
// Also performs bidirectional refs ↔ prompt validation.
// ============================================================================

import { RefsByType } from '../types/Refs';
import { CategoryRule, FieldCheck } from '../utils/categoryValidateLoader';
import { extractAllRefs } from './RefSyntaxParser';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  category: string;
  field?: string;
  message: string;
}

const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bFIXME\b/i,
  /\bXXX\b/i,
  /\bTBD\b/i,
  /\bplaceholder\b/i,
];

/**
 * Validate one document's frontmatter + body against its category rule.
 *
 * brief 和 prompt 是默认检查项（所有文档都会检查），除非类别设置了跳过标志。
 *
 * @param frontmatter parsed YAML
 * @param body the markdown body (used for ref scanning)
 * @param rule rule for this category (may be undefined → only default checks)
 */
export function validateCategory(
  frontmatter: Record<string, any>,
  body: string,
  rule: CategoryRule | undefined,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const category = String(frontmatter.category ?? '');
  const defaultSeverity: ValidationSeverity = rule?.severity || 'error';

  // 1) Required fields (from category rule, if any)
  if (rule) {
    for (const field of rule.required_fields || []) {
      if (frontmatter[field] === undefined || frontmatter[field] === null || frontmatter[field] === '') {
        issues.push({
          severity: defaultSeverity,
          category,
          field,
          message: `Required field "${field}" is missing or empty`,
        });
      }
    }
  }

  // 2) Default checks: prompt (always checked unless skipped)
  const skipPrompt = rule?.skip_prompt_check === true;
  if (!skipPrompt) {
    const promptVal = frontmatter['prompt'];
    if (promptVal === undefined || promptVal === null || promptVal === '') {
      issues.push({
        severity: defaultSeverity,
        category,
        field: 'prompt',
        message: 'Required field "prompt" is missing or empty',
      });
    } else if (typeof promptVal === 'string') {
      if (promptVal.length < 10) {
        issues.push({
          severity: defaultSeverity,
          category,
          field: 'prompt',
          message: `"prompt" length ${promptVal.length} < min_length 10`,
        });
      }
      if (hasPlaceholder(promptVal)) {
        issues.push({
          severity: defaultSeverity,
          category,
          field: 'prompt',
          message: '"prompt" contains placeholder text (TODO/FIXME/XXX/TBD)',
        });
      }
    }
  }

  // 3) Default checks: brief (always checked unless skipped, warning not error)
  const skipBrief = rule?.skip_brief_check === true;
  if (!skipBrief) {
    const briefVal = frontmatter['brief'];
    if (briefVal === undefined || briefVal === null || briefVal === '') {
      issues.push({
        severity: 'warning',  // brief 缺失只警告
        category,
        field: 'brief',
        message: 'Recommended field "brief" is missing — used by prompt compiler annotate mode for image annotations',
      });
    } else if (typeof briefVal === 'string' && briefVal.length < 4) {
      issues.push({
        severity: 'warning',
        category,
        field: 'brief',
        message: `"brief" length ${briefVal.length} < min_length 4 — too short for meaningful annotation`,
      });
    }
  }

  // 4) Field-level schema checks (from category rule)
  if (rule?.field_schema) {
    for (const [field, check] of Object.entries(rule.field_schema)) {
      // skip_prompt_check also trumps prompt in field_schema
      if (skipPrompt && field === 'prompt') continue;

      const value = frontmatter[field];
      const severity = check.severity || defaultSeverity;

      if (value === undefined || value === null) continue;

      if (field === 'refs') {
        if (check.refs_in_prompt_must_match_refs) {
          const refIssues = validateRefsBidirectional(frontmatter, body, severity);
          issues.push(...refIssues);
        }
        continue;
      }

      const strVal = typeof value === 'string' ? value : String(value);

      if (typeof check.min_length === 'number' && strVal.length < check.min_length) {
        issues.push({ severity, category, field, message: `"${field}" length ${strVal.length} < min_length ${check.min_length}` });
      }
      if (typeof check.max_length === 'number' && strVal.length > check.max_length) {
        issues.push({ severity, category, field, message: `"${field}" length ${strVal.length} > max_length ${check.max_length}` });
      }
      if (check.no_placeholder && hasPlaceholder(strVal)) {
        issues.push({ severity, category, field, message: `"${field}" contains placeholder text (TODO/FIXME/XXX/TBD)` });
      }
      if (check.refs_in_prompt_must_match_refs && field === 'prompt') {
        const refIssues = validateRefsBidirectional(frontmatter, body, severity);
        issues.push(...refIssues);
      }
    }
  }

  return issues;
}

/**
 * Bidirectional refs ↔ prompt validation (v0.10.0):
 *   refs only mirror what the prompt field references.
 *   prompt / refs are validated (when present);
 *   brief / visual_brief / visual_detailed / body are NOT scanned — they may
 *   contain narrative @-references that don't represent generation inputs.
 *
 *  - Every @-token in `prompt` must have a refs entry
 *  - Every refs key must appear as an @-token in `prompt`
 */
export function validateRefsBidirectional(
  frontmatter: Record<string, any>,
  body: string,
  severity: ValidationSeverity,
): ValidationIssue[] {
  const category = String(frontmatter.category ?? '');
  const issues: ValidationIssue[] = [];

  const prompt = String(frontmatter.prompt ?? '');
  const promptTokens = extractAllRefs(prompt);
  const promptKeys = new Set(promptTokens.map(t => t.key));

  const refs = (frontmatter.refs || {}) as RefsByType;
  const refKeys = new Set<string>();
  for (const typeMap of Object.values(refs)) {
    for (const key of Object.keys(typeMap || {})) {
      refKeys.add(key);
    }
  }

  // Direction 1: prompt @-token must be in refs
  for (const key of promptKeys) {
    if (!refKeys.has(key)) {
      issues.push({
        severity,
        category,
        field: 'refs',
        message: `"${key}" referenced in prompt/visual but missing from refs`,
      });
    }
  }

  // Direction 2: refs key must be used in prompt
  for (const key of refKeys) {
    if (!promptKeys.has(key)) {
      issues.push({
        severity,
        category,
        field: 'refs',
        message: `"${key}" declared in refs but not used in prompt/visual`,
      });
    }
  }

  return issues;
}

function hasPlaceholder(text: string): boolean {
  for (const re of PLACEHOLDER_PATTERNS) {
    if (re.test(text)) return true;
  }
  return false;
}
