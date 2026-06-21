// ============================================================================
// OpsV Input Types Loader (v0.10.0)
// Loads .opsv/input_types.yaml; defines the registry of allowed input_type keys.
// ============================================================================

import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from './logger';

export interface InputTypeDef {
  description?: string;
  extensions?: string[];
}

export interface InputTypesRegistry {
  input_types: Record<string, InputTypeDef>;
}

const BUILTIN_DEFAULTS: InputTypesRegistry = {
  input_types: {
    image: { description: 'Static image', extensions: ['.png', '.jpg', '.jpeg', '.webp'] },
    video: { description: 'Video file', extensions: ['.mp4', '.mov', '.webm'] },
    audio: { description: 'Audio file', extensions: ['.mp3', '.wav', '.m4a'] },
    bvh:   { description: 'Motion capture', extensions: ['.bvh'] },
    mask:  { description: 'Alpha/segmentation mask', extensions: ['.png'] },
  },
};

export class InputTypesLoader {
  private registry: InputTypesRegistry;

  constructor() {
    this.registry = BUILTIN_DEFAULTS;
  }

  /**
   * Three-tier lookup: built-in → ~/.opsv/ → ./.opsv/
   */
  load(projectRoot: string, options?: { silent?: boolean }): InputTypesRegistry {
    // Tier 1 — built-in defaults
    let merged: InputTypesRegistry = {
      input_types: { ...BUILTIN_DEFAULTS.input_types },
    };

    // Tier 2 — user-level override
    const userPath = path.join(os.homedir(), '.opsv', 'input_types.yaml');
    const userConfig = this.tryLoad(userPath, options);
    if (userConfig) {
      merged.input_types = { ...merged.input_types, ...userConfig.input_types };
    }

    // Tier 3 — project-level override (highest priority)
    const projectPath = path.join(projectRoot, '.opsv', 'input_types.yaml');
    const projectConfig = this.tryLoad(projectPath, options);
    if (projectConfig) {
      merged.input_types = { ...merged.input_types, ...projectConfig.input_types };
    }

    this.registry = merged;
    return this.registry;
  }

  private tryLoad(filePath: string, options?: { silent?: boolean }): InputTypesRegistry | null {
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as InputTypesRegistry;
      if (!parsed || typeof parsed !== 'object' || !parsed.input_types) {
        logger.warn(`${filePath} malformed, skipping`);
        return null;
      }
      return parsed;
    } catch (e: any) {
      if (!options?.silent) {
        logger.warn(`Failed to load ${filePath}: ${e.message}`);
      }
      return null;
    }
  }

  /** Returns true if the given type is registered. */
  isValidType(type: string): boolean {
    return type in this.registry.input_types;
  }

  /** Returns the list of registered type names. */
  listTypes(): string[] {
    return Object.keys(this.registry.input_types);
  }

  getRegistry(): InputTypesRegistry {
    return this.registry;
  }
}
