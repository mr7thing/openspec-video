// ============================================================================
// OpsV Category Validate Loader (v0.10.0)
// Loads per-category validation rules.
// Lookup: user (~/.opsv/) → project (.opsv/)
// ============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from './logger';

export interface FieldCheck {
  min_length?: number;
  max_length?: number;
  no_placeholder?: boolean;
  refs_in_prompt_must_match_refs?: boolean;
  severity?: 'error' | 'warning';
}

export interface CategoryRule {
  required_fields?: string[];
  skip_prompt_check?: boolean;
  severity?: 'error' | 'warning';
  field_schema?: Record<string, FieldCheck>;
}

export type CategoryRules = Record<string, CategoryRule>;

export class CategoryValidateLoader {
  private rules: CategoryRules;

  constructor() {
    this.rules = {};
  }

  load(projectRoot: string, options?: { silent?: boolean }): CategoryRules {
    const projectPath = path.join(projectRoot, '.opsv', 'category_validate.yaml');
    const userPath = path.join(os.homedir(), '.opsv', 'category_validate.yaml');

    // Start with empty rules — all defaults come from config files
    const merged: CategoryRules = {};

    // Apply user-level overlay (global fallback)
    const userRules = this.tryLoad(userPath, options);
    if (userRules) Object.assign(merged, userRules);

    // Apply project-level overlay (highest priority)
    const projectRules = this.tryLoad(projectPath, options);
    if (projectRules) Object.assign(merged, projectRules);

    this.rules = merged;
    return this.rules;
  }

  private tryLoad(filePath: string, options?: { silent?: boolean }): CategoryRules | null {
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as CategoryRules | null;
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (e: any) {
      if (!options?.silent) {
        logger.warn(`Failed to load ${filePath}: ${e.message}`);
      }
      return null;
    }
  }

  getRule(category: string): CategoryRule | undefined {
    return this.rules[category];
  }

  getRules(): CategoryRules {
    return this.rules;
  }
}
