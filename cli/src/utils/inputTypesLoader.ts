// ============================================================================
// OpsV Input Types Loader (v0.10.0)
// Loads .opsv/input_types.yaml; defines the registry of allowed input_type keys.
// ============================================================================

import fs from 'fs';
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

  load(projectRoot: string, options?: { silent?: boolean }): InputTypesRegistry {
    const configPath = path.join(projectRoot, '.opsv', 'input_types.yaml');

    if (!fs.existsSync(configPath)) {
      if (!options?.silent) {
        logger.debug(`input_types.yaml not found at ${configPath}, using built-in defaults`);
      }
      this.registry = BUILTIN_DEFAULTS;
      return this.registry;
    }

    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = yaml.load(raw, { schema: yaml.JSON_SCHEMA }) as InputTypesRegistry;
      if (!parsed || typeof parsed !== 'object' || !parsed.input_types) {
        logger.warn(`input_types.yaml malformed, using built-in defaults`);
        this.registry = BUILTIN_DEFAULTS;
        return this.registry;
      }
      this.registry = parsed;
      return this.registry;
    } catch (e: any) {
      logger.error(`Failed to load input_types.yaml: ${e.message}`);
      this.registry = BUILTIN_DEFAULTS;
      return this.registry;
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
