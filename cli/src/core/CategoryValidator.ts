// ============================================================================
// OpsV CategoryValidator (v0.11.0)
// Applies per-category rules from category_validate.yaml to a document.
// All rules are executed generically — no field names are hardcoded.
// Unknown rule keys in the config are flagged by the loader, not ignored.
// ============================================================================

import { RefsByType } from '../types/Refs';
import { CategoryRule, FieldCheck } from '../utils/categoryValidateLoader';
import { extractAllRefs } from './RefEngine';

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

// ---------------------------------------------------------------------------
// Generic field value coercion helpers
// ---------------------------------------------------------------------------

/** Coerce a value to a string for string-type checks. */
function asString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value);
}

/** Coerce a value to a number for numeric checks. Returns NaN if not coercible. */
function asNumber(value: unknown): number {
  if (value === undefined || value === null) return NaN;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return parseFloat(value);
  return NaN;
}

/** Check if value is array. */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Generic field validation — one field, all its checks
// ---------------------------------------------------------------------------

/**
 * Run all field-level checks for a single field against its value.
 * Returns issues for ALL failed checks (not short-circuit).
 */
function validateField(
  field: string,
  value: unknown,
  check: FieldCheck,
  defaultSeverity: ValidationSeverity,
  category: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const severity = check.severity || defaultSeverity;

  // ----- type -----
  if (check.type !== undefined) {
    const typeOk = checkType(value, check.type);
    if (!typeOk) {
      issues.push({
        severity,
        category,
        field,
        message: `"${field}" must be of type ${check.type}, got ${typeof value}${Array.isArray(value) ? ' (array)' : ''}`,
      });
    }
  }

  // ----- min / max (numeric) -----
  if (!isNaN(asNumber(value))) {
    const numVal = asNumber(value);
    if (typeof check.min === 'number' && numVal < check.min) {
      issues.push({
        severity,
        category,
        field,
        message: `"${field}" value ${numVal} < min ${check.min}`,
      });
    }
    if (typeof check.max === 'number' && numVal > check.max) {
      issues.push({
        severity,
        category,
        field,
        message: `"${field}" value ${numVal} > max ${check.max}`,
      });
    }
  }

  // ----- min_length / max_length (string) -----
  const strVal = asString(value);
  if (strVal !== null) {
    if (typeof check.min_length === 'number' && strVal.length < check.min_length) {
      issues.push({
        severity,
        category,
        field,
        message: `"${field}" length ${strVal.length} < min_length ${check.min_length}`,
      });
    }
    if (typeof check.max_length === 'number' && strVal.length > check.max_length) {
      issues.push({
        severity,
        category,
        field,
        message: `"${field}" length ${strVal.length} > max_length ${check.max_length}`,
      });
    }
    if (check.no_placeholder && hasPlaceholder(strVal)) {
      issues.push({
        severity,
        category,
        field,
        message: `"${field}" contains placeholder text (TODO/FIXME/XXX/TBD)`,
      });
    }
  }

  // ----- min_items / max_items (array) -----
  if (isArray(value)) {
    const arr = value as unknown[];
    if (typeof check.min_items === 'number' && arr.length < check.min_items) {
      issues.push({
        severity,
        category,
        field,
        message: `"${field}" has ${arr.length} items, min_items ${check.min_items}`,
      });
    }
    if (typeof check.max_items === 'number' && arr.length > check.max_items) {
      issues.push({
        severity,
        category,
        field,
        message: `"${field}" has ${arr.length} items, max_items ${check.max_items}`,
      });
    }
  }

  // ----- enum -----
  if (check.enum !== undefined && Array.isArray(check.enum)) {
    const valStr = strVal ?? JSON.stringify(value);
    if (!check.enum.some(e => String(e) === valStr)) {
      issues.push({
        severity,
        category,
        field,
        message: `"${field}" value "${valStr}" is not one of allowed values: [${check.enum.map(e => JSON.stringify(e)).join(', ')}]`,
      });
    }
  }

  // ----- must_include (array or object field values must contain specific items) -----
  if (check.must_include !== undefined && Array.isArray(check.must_include) && isArray(value)) {
    const arr = value as string[];
    for (const required of check.must_include) {
      if (!arr.includes(required)) {
        issues.push({
          severity,
          category,
          field,
          message: `"${field}" must include "${required}", got [${arr.map(v => JSON.stringify(v)).join(', ')}]`,
        });
      }
    }
  }

  return issues;
}

/** Check if a value matches the expected type string. */
function checkType(value: unknown, expected: string): boolean {
  switch (expected) {
    case 'string':
      return typeof value === 'string';
    case 'integer':
    case 'number':
      return typeof value === 'number' && !isNaN(value) && (expected === 'integer' ? Number.isInteger(value) : true);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true; // Unknown type → pass
  }
}

// ---------------------------------------------------------------------------
// Main validate function
// ---------------------------------------------------------------------------

/**
 * Validate one document's frontmatter + body against its category rule.
 *
 * @param frontmatter parsed YAML (record of field → value)
 * @param body markdown body (used for ref scanning)
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

  // 1) Required fields
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
  const hasPromptFieldSchema = !!rule?.field_schema?.prompt;
  if (!skipPrompt && !hasPromptFieldSchema) {
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
        severity: 'warning',
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
      // skip_prompt_check also bypasses prompt field_schema checks
      if (skipPrompt && field === 'prompt') continue;

      const value = frontmatter[field];
      if (value === undefined || value === null) continue;

      // refs is special: handle refs_in_prompt_must_match_refs generically
      if (field === 'refs') {
        if (check.refs_in_prompt_must_match_refs) {
          const refIssues = validateRefsBidirectional(frontmatter, body, check.severity || defaultSeverity);
          issues.push(...refIssues);
        }
        // Also validate refs structure generically
        if (typeof check.min_items === 'number' || typeof check.max_items === 'number' || check.enum || check.type || check.must_include) {
          issues.push(...validateField(field, value, check, defaultSeverity, category));
        }
        continue;
      }

      // refs_in_prompt_must_match_refs on the prompt field
      if (check.refs_in_prompt_must_match_refs && field === 'prompt') {
        const refIssues = validateRefsBidirectional(frontmatter, body, check.severity || defaultSeverity);
        issues.push(...refIssues);
      }

      // Generic field validation for all check types
      issues.push(...validateField(field, value, check, defaultSeverity, category));
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Bidirectional refs ↔ prompt validation (v0.11.0)
// ---------------------------------------------------------------------------

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

  // Direction 1: @-token in prompt must exist in refs
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasPlaceholder(text: string): boolean {
  for (const re of PLACEHOLDER_PATTERNS) {
    if (re.test(text)) return true;
  }
  return false;
}
