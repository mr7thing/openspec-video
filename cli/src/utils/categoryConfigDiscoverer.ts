// ============================================================================
// OpsV Category Config Discoverer (v0.11.0)
// Finds category_validate config files using regex patterns.
// Lookup order: project-level (.opsv/) → user-level (~/.opsv/)
// Multiple candidates at same level → conflict (must resolve explicitly).
// ============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from './logger';

export interface DiscoveredConfig {
  /** Absolute path to the config file */
  path: string;
  /** The basename, e.g. "category_validate.yaml" or "_category_validate.yaml" */
  basename: string;
  /**
   * "canonical" | "underscore-prefix" | "other"
   * canonical     = category_validate.yaml (or .yml)
   * underscore   = _category_validate.yaml (Skill Pack convention)
   * other         = anything else that matches the pattern
   */
  variant: 'canonical' | 'underscore-prefix' | 'other';
}

export interface DiscoveryResult {
  /** The selected config file */
  config: DiscoveredConfig | null;
  /** All candidates found at project level (for conflict reporting) */
  projectCandidates: DiscoveredConfig[];
  /** All candidates found at user level (for conflict reporting) */
  userCandidates: DiscoveredConfig[];
  /** Warning messages (non-blocking) */
  warnings: string[];
  /** Error messages (blocking) */
  errors: string[];
}

/**
 * Regex pattern for valid category validate config filenames.
 * Must contain "category" AND "validate" as separate tokens.
 * Separators can be: -, _, or none.
 * Extensions: .yaml or .yml
 *
 * Examples that match:
 *   category_validate.yaml
 *   _category_validate.yaml
 *   category-validate.yaml
 *   category_validate.yml
 *   _category-validate.yml
 *   k2-category_validate.yaml
 *
 * Examples that do NOT match:
 *   categoryvalidation.yaml  (no separator between tokens)
 *   category.conf.yaml       (conf is not validate)
 *   validate_category.yaml   (tokens in wrong order)
 */
// Matches:
//   category_validate.yaml, _category_validate.yaml (canonical)
//   k2-category_validate.yaml, opsv-category_validate.yaml (prefix variants)
//   category_validate.yml (alternate extension)
//
// Does NOT match (intentional — these files will NOT be loaded):
//   categoryvalidate.yaml, category-validate.yaml (no/wrong separator)
//   something_category_validate_other.yaml (suffix after validate)
//   category_validate.txt (wrong extension)
//   category_validate.yaml.bak (extra suffix after extension)
//   category_validate.bak.yaml (extra suffix before extension)
//   category_validate.yaml.sample, .tmp, .swp, .draft, ~, .N (editor/backup suffixes)
//   category_validate.json (not YAML)
//
// The `$` anchor forces the filename to END with `.yaml` or `.yml`.
// Any extra suffix (e.g., `.bak`, `.sample`) makes the file invisible to the discoverer.
const CONFIG_PATTERN = /^_?([a-z][a-z0-9]*[-_])?category_validate\.ya?ml$/i;

/**
 * Check if a filename matches the category config pattern.
 */
export function matchesConfigPattern(filename: string): boolean {
  return CONFIG_PATTERN.test(filename);
}

/**
 * Classify the variant of a matched filename.
 * Returns null for non-matching filenames.
 */
export function classifyVariant(basename: string): DiscoveredConfig['variant'] | null {
  if (basename === 'category_validate.yaml' || basename === 'category_validate.yml') {
    return 'canonical';
  }
  if (basename.startsWith('_') && (basename === '_category_validate.yaml' || basename === '_category_validate.yml')) {
    return 'underscore-prefix';
  }
  // If it matches the pattern but isn't canonical or underscore-prefix → "other" variant
  if (matchesConfigPattern(basename)) return 'other';
  return null;
}

/**
 * Scan a directory for category validate config files.
 * Returns all files that match the pattern, sorted: canonical first, then underscore, then other.
 */
function scanDir(dir: string): DiscoveredConfig[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return [];
  }

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }

  const matched = entries
    .filter(matchesConfigPattern)
    .map((basename) => ({
      path: path.join(dir, basename),
      basename,
      variant: classifyVariant(basename) as DiscoveredConfig['variant'],
    }));

  // Sort: canonical > underscore-prefix > other; within same variant sort by name
  const ORDER: Record<DiscoveredConfig['variant'], number> = {
    canonical: 0,
    'underscore-prefix': 1,
    other: 2,
  };
  matched.sort((a, b) => {
    const delta = ORDER[a.variant] - ORDER[b.variant];
    return delta !== 0 ? delta : a.basename.localeCompare(b.basename);
  });

  return matched;
}

/**
 * Discover category validate config for a project.
 *
 * Behavior:
 *   - project-level found → use it (single or first)
 *   - project-level multiple → conflict error
 *   - project-level not found → check user-level
 *   - user-level single → use it (with warning if non-canonical)
 *   - user-level multiple → conflict error
 *   - neither found → null (no rules loaded)
 *
 * Explicit override via CATEGORY_VALIDATE_FILE env var always wins.
 */
export class CategoryConfigDiscoverer {
  /**
   * Discover and resolve the category validate config file.
   *
   * @param projectRoot - Project root directory
   * @param options.explicitPath - Explicit config path (from CLI --category-config); skips discovery
   * @param options.strictNaming - If true, non-canonical names produce warnings; if false, silent
   * @param options.homedir - Override homedir for user-level lookup (testing only)
   */
  discover(
    projectRoot: string,
    options?: {
      explicitPath?: string;
      homedir?: string;
    },
  ): DiscoveryResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Explicit path always wins
    if (options?.explicitPath) {
      const explicitPath = path.resolve(options.explicitPath);
      const basename = path.basename(explicitPath);
      // Check pattern FIRST (before existence) so bad filenames always error
      if (!matchesConfigPattern(basename)) {
        errors.push(`Explicit --category-config filename does not match pattern: ${basename}`);
        return { config: null, projectCandidates: [], userCandidates: [], warnings, errors };
      }
      if (!fs.existsSync(explicitPath)) {
        errors.push(`Explicit --category-config path does not exist: ${explicitPath}`);
        return { config: null, projectCandidates: [], userCandidates: [], warnings, errors };
      }
      const variant = classifyVariant(basename)!; // Already validated by matchesConfigPattern above
      const config: DiscoveredConfig = { path: explicitPath, basename, variant };
      const discovered: DiscoveryResult = {
        config,
        projectCandidates: [],
        userCandidates: [],
        warnings,
        errors,
      };
      if (variant === 'underscore-prefix') {
        warnings.push(`Using non-canonical config filename "${basename}" (expected: category_validate.yaml)`);
      } else if (variant === 'other') {
        warnings.push(`Using non-canonical prefix-variant config filename "${basename}" (expected: category_validate.yaml)`);
      }
      return discovered;
    }

    const projectDir = path.join(projectRoot, '.opsv');
    const userDir = path.join(options?.homedir || os.homedir(), '.opsv');

    const projectCandidates = scanDir(projectDir);
    const userCandidates = scanDir(userDir);

    // Project-level resolution
    if (projectCandidates.length > 0) {
      if (projectCandidates.length > 1) {
        const names = projectCandidates.map(c => `.opsv/${c.basename}`).join(', ');
        errors.push(
          `Multiple category validate configs found in project .opsv/: ${names}. ` +
          `Resolve the conflict or use --category-config <path> to select one.`,
        );
        return { config: null, projectCandidates, userCandidates, warnings, errors };
      }

      const selected = projectCandidates[0];
      // Always warn on non-canonical filename (even single candidate)
      if (selected.variant === 'underscore-prefix') {
        warnings.push(
          `Config filename ".opsv/${selected.basename}" is non-canonical. ` +
          `Recommended: "category_validate.yaml".`,
        );
      } else if (selected.variant === 'other') {
        warnings.push(
          `Config filename ".opsv/${selected.basename}" has a non-canonical prefix variant. ` +
          `Recommended: "category_validate.yaml".`,
        );
      }
      return { config: selected, projectCandidates, userCandidates, warnings, errors };
    }

    // Project not found → user-level fallback (warn so user knows it's happening)
    if (userCandidates.length > 0) {
      if (userCandidates.length > 1) {
        const names = userCandidates.map(c => `~/.opsv/${c.basename}`).join(', ');
        errors.push(
          `Multiple category validate configs found in ~/.opsv/: ${names}. ` +
          `Resolve the conflict or use --category-config <path> to select one.`,
        );
        return { config: null, projectCandidates, userCandidates, warnings, errors };
      }

      const selected = userCandidates[0];
      // Project-level not found → using user-level fallback (always warn)
      warnings.push(
        `No project-level category validate config found in "${projectDir}/". ` +
        `Falling back to user-level: "~/.opsv/${selected.basename}". ` +
        `Consider copying this to "${projectDir}/category_validate.yaml" for project isolation.`,
      );
      // Always warn on non-canonical filename
      if (selected.variant === 'underscore-prefix') {
        warnings.push(
          `User-level config "~/.opsv/${selected.basename}" is non-canonical. ` +
          `Recommended: "category_validate.yaml".`,
        );
      } else if (selected.variant === 'other') {
        warnings.push(
          `User-level config "~/.opsv/${selected.basename}" has a non-canonical prefix variant. ` +
          `Recommended: "category_validate.yaml".`,
        );
      }
      return { config: selected, projectCandidates, userCandidates, warnings, errors };
    }

    // Neither project-level nor user-level config found (always warn)
    warnings.push(
      `No category validate config found in "${projectDir}/" or "~/.opsv/". ` +
      `Validation will run with NO category rules (only Zod schema + default prompt/brief checks). ` +
      `Create "${projectDir}/category_validate.yaml" to enable Skill Pack validation rules.`,
    );
    return { config: null, projectCandidates, userCandidates, warnings, errors };
  }
}
