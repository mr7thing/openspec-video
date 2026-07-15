// ============================================================================
// OpsV Category Validate Loader (v0.11.0)
// Loads per-category validation rules from a single config file.
// Lookup + discovery handled by CategoryConfigDiscoverer (separate concern).
// ============================================================================

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from './logger';
import { DiscoveryResult, CategoryConfigDiscoverer } from './categoryConfigDiscoverer';

// ---------------------------------------------------------------------------
// Supported validation rule types (v0.11.0)
// These are the ONLY rules the validator knows how to execute.
// Unknown keys in field_schema are flagged as unsupported at load time.
// ---------------------------------------------------------------------------

/** Supported field-level validation checks. */
export interface FieldCheck {
  // --- String checks ---
  min_length?: number;
  max_length?: number;
  no_placeholder?: boolean;

  // --- Numeric checks (for integer-valued fields) ---
  type?: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object';
  min?: number;
  max?: number;

  // --- Array checks ---
  min_items?: number;
  max_items?: number;

  // --- Enum checks ---
  enum?: unknown[];

  // --- Refs checks ---
  refs_in_prompt_must_match_refs?: boolean;

  // --- Field-level severity override ---
  severity?: 'error' | 'warning';

  // --- Cross-field: must_include (for refs / object fields) ---
  must_include?: string[];
}

/** Per-category rule. */
export interface CategoryRule {
  required_fields?: string[];
  skip_prompt_check?: boolean;            // 跳过默认 prompt 检查
  skip_brief_check?: boolean;             // 跳过默认 brief 检查
  skip_prompt_refs_check?: boolean;      // 跳过 prompt ↔ refs 双向校验
  severity?: 'error' | 'warning';
  field_schema?: Record<string, FieldCheck>;
}

export type CategoryRules = Record<string, CategoryRule>;

// ---------------------------------------------------------------------------
// Supported top-level rule keys
// ---------------------------------------------------------------------------

const VALID_RULE_KEYS = new Set<string>([
  'required_fields',
  'skip_prompt_check',
  'skip_brief_check',
  'skip_prompt_refs_check',
  'severity',
  'field_schema',
]);

const VALID_FIELD_CHECK_KEYS = new Set<string>([
  'min_length',
  'max_length',
  'no_placeholder',
  'type',
  'min',
  'max',
  'min_items',
  'max_items',
  'enum',
  'refs_in_prompt_must_match_refs',
  'severity',
  'must_include',
]);

/** Issues found during config loading (unknown keys etc.) */
export interface ConfigLoadIssue {
  severity: 'error' | 'warning';
  path: string;   // e.g. "music.min_length", "character.prompt.type"
  message: string;
}

/** Result of loading a single config file. */
export interface LoadResult {
  rules: CategoryRules;
  /** Issues found (unknown keys, type mismatches, etc.) */
  issues: ConfigLoadIssue[];
}

/** Result of full discovery + load. */
export interface DiscoveryLoadResult {
  /** The selected config that was loaded */
  selectedConfig: DiscoveryResult['config'];
  /** All discovery result metadata */
  discovery: DiscoveryResult;
  /** Loaded rules (empty if discovery failed) */
  rules: CategoryRules;
  /** Issues from config loading */
  issues: ConfigLoadIssue[];
}

/** Warns about unknown keys in a rule object. */
function collectRuleIssues(
  obj: Record<string, unknown>,
  path_prefix: string,
): ConfigLoadIssue[] {
  const issues: ConfigLoadIssue[] = [];
  for (const key of Object.keys(obj)) {
    if (!VALID_RULE_KEYS.has(key)) {
      issues.push({
        severity: 'warning',
        path: path_prefix ? `${path_prefix}.${key}` : key,
        message: `Unknown top-level rule key "${key}" — validator will ignore it`,
      });
    }
  }
  return issues;
}

/** Recursively validates a field_schema entry and collects unknown key warnings. */
function collectFieldSchemaIssues(
  fieldSchema: Record<string, unknown>,
  category: string,
): ConfigLoadIssue[] {
  const issues: ConfigLoadIssue[] = [];
  for (const [field, check] of Object.entries(fieldSchema)) {
    if (!check || typeof check !== 'object') continue;
    const checkObj = check as Record<string, unknown>;
    for (const key of Object.keys(checkObj)) {
      if (!VALID_FIELD_CHECK_KEYS.has(key)) {
        issues.push({
          severity: 'warning',
          path: `${category}.${field}.${key}`,
          message: `Unknown field check key "${key}" for field "${field}" — validator will ignore it`,
        });
      }
    }
    // Basic type sanity checks
    if ('type' in checkObj && typeof check !== 'string') {
      const t = (checkObj as Record<string, unknown>)['type'];
      if (typeof t !== 'string' || !['string', 'integer', 'number', 'boolean', 'array', 'object'].includes(t)) {
        issues.push({
          severity: 'warning',
          path: `${category}.${field}.type`,
          message: `Unsupported type "${t}" for field "${field}" — validator supports: string | integer | number | boolean | array | object`,
        });
      }
    }
  }
  return issues;
}

export class CategoryValidateLoader {
  private rules: CategoryRules = {};
  private issues: ConfigLoadIssue[] = [];

  /**
   * Discover + load using the old API signature.
   * Uses CategoryConfigDiscoverer internally.
   *
   * ALL warnings and errors are printed to console — never silent. The user must
   * see what config was used, what fallback happened, and what fields are unrecognized.
   *
   * @param projectRoot - Project root directory
   * @param options.explicitPath - Explicit config path (from CLI --category-config); skips discovery
   */
  load(projectRoot: string, options?: { explicitPath?: string }): DiscoveryLoadResult {
    const discoverer = new CategoryConfigDiscoverer();
    const discovery = discoverer.discover(projectRoot, { explicitPath: options?.explicitPath });
    const result = this.loadFromDiscovery(discovery);
    // Errors are ALWAYS shown (blocking)
    for (const e of discovery.errors) {
      console.error(`[opsv validate] error: ${e}`);
    }
    // Warnings are ALWAYS shown (user must see fallback, non-canonical filename, etc.)
    for (const w of discovery.warnings) {
      console.warn(`[opsv validate] warning: ${w}`);
    }
    // Config-load issues (e.g., unsupported rules in YAML) — ALWAYS shown
    for (const issue of result.issues) {
      if (issue.severity === 'error') {
        console.error(`[opsv validate] error: ${issue.path}: ${issue.message}`);
      } else {
        console.warn(`[opsv validate] warning: ${issue.path}: ${issue.message}`);
      }
    }
    this.rules = result.rules;
    this.issues = result.issues;
    return result;
  }

  /**
   * Load rules from a single config file path.
   * Validates structure and collects unknown-key warnings.
   */
  loadFromFile(filePath: string): LoadResult {
    const issues: ConfigLoadIssue[] = [];

    if (!fs.existsSync(filePath)) {
      return { rules: {}, issues: [{ severity: 'error', path: filePath, message: `File not found` }] };
    }

    let raw: string;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (e: any) {
      return { rules: {}, issues: [{ severity: 'error', path: filePath, message: `Read failed: ${e.message}` }] };
    }

    let parsed: unknown;
    try {
      parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA });
    } catch (e: any) {
      return { rules: {}, issues: [{ severity: 'error', path: filePath, message: `YAML parse failed: ${e.message}` }] };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { rules: {}, issues: [{ severity: 'error', path: filePath, message: `Config must be a YAML object` }] };
    }

    const obj = parsed as Record<string, unknown>;

    // Top-level keys are category names (user-defined, no validation needed).
    // We only validate the rule-object under each category name.

    const rules: CategoryRules = {};

    for (const [category, ruleVal] of Object.entries(obj)) {
      if (!ruleVal || typeof ruleVal !== 'object') {
        rules[category] = {};
        continue;
      }
      const ruleObj = ruleVal as Record<string, unknown>;
      issues.push(...collectRuleIssues(ruleObj, category));

      // Validate field_schema
      if (ruleObj.field_schema && typeof ruleObj.field_schema === 'object') {
        issues.push(...collectFieldSchemaIssues(ruleObj.field_schema as Record<string, unknown>, category));
      }

      try {
        rules[category] = ruleObj as CategoryRule;
      } catch {
        rules[category] = {};
      }
    }

    this.rules = rules;
    this.issues = issues;
    return { rules, issues };
  }

  /**
   * Load rules from a discovery result (project + user level).
   * Uses the single selected config; does NOT merge multiple configs.
   */
  loadFromDiscovery(discovery: DiscoveryResult): DiscoveryLoadResult {
    if (!discovery.config) {
      return {
        selectedConfig: null,
        discovery,
        rules: {},
        issues: [],
      };
    }

    const { rules, issues } = this.loadFromFile(discovery.config.path);

    return {
      selectedConfig: discovery.config,
      discovery,
      rules,
      issues,
    };
  }

  getRule(category: string): CategoryRule | undefined {
    return this.rules[category];
  }

  getRules(): CategoryRules {
    return this.rules;
  }

  getIssues(): ConfigLoadIssue[] {
    return this.issues;
  }
}
