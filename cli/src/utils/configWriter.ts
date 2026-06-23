// ============================================================================
// OpsV API Config Writer
// Validate and append model configs to .opsv/api_config.yaml
// Only supports comfylocal and runninghub provider types.
// ============================================================================

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface AddModelInput {
  modelKey: string;
  config: Record<string, any>;
}

/**
 * Validate a model config structure for comfylocal or runninghub.
 * Returns an array of error messages (empty = valid).
 * Mutates config to auto-set default values where appropriate.
 */
export function validateModelConfig(
  modelKey: string,
  config: Record<string, any>
): string[] {
  const errors: string[] = [];
  const provider = config.provider;

  if (!provider) {
    errors.push('provider is required');
    return errors;
  }

  if (!['comfylocal', 'runninghub'].includes(provider)) {
    errors.push(`provider must be "comfylocal" or "runninghub", got "${provider}"`);
    return errors;
  }

  if (!modelKey || typeof modelKey !== 'string') {
    errors.push('modelKey is required and must be a non-empty string');
  }

  // Common required
  if (!config.node_mappings || Object.keys(config.node_mappings).length === 0) {
    errors.push('node_mappings is required with at least one entry');
  }

  // Provider-specific checks
  if (provider === 'comfylocal') {
    if (config.required_env && config.required_env.length > 0) {
      errors.push('comfylocal does not use required_env — remove this field');
    }
    if (!config.workflow) {
      errors.push('workflow is required for comfylocal (path to .json workflow file)');
    }
    // Default api_url for local ComfyUI
    if (!config.api_url) {
      config.api_url = 'http://127.0.0.1:8188/';
    }
    if (!config.type) {
      config.type = 'comfy';
    }
  }

  if (provider === 'runninghub') {
    if (!config.workflowId) {
      errors.push('workflowId is required for runninghub');
    }
    if (!config.api_url) {
      errors.push('api_url is required for runninghub');
    }
    if (!config.api_status_url) {
      errors.push('api_status_url is required for runninghub');
    }
    // Auto-ensure required_env
    if (!config.required_env || config.required_env.length === 0) {
      config.required_env = ['RUNNINGHUB_API_KEY'];
    }
    if (!config.type) {
      config.type = 'comfy';
    }
  }

  return errors;
}

/**
 * Append a model entry to a project's api_config.yaml.
 * Reads existing file, checks for duplicate modelKey, appends if unique.
 * Creates the file if it doesn't exist.
 */
export function appendModelToConfig(
  configPath: string,
  modelKey: string,
  config: Record<string, any>
): { success: boolean; message: string } {
  // Read existing config or start fresh
  let data: Record<string, any> = { models: {} };
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = yaml.load(raw) as Record<string, any> | null;
      if (parsed) data = parsed;
    } catch (err: any) {
      return { success: false, message: `Failed to parse existing config: ${err.message}` };
    }
  }

  if (!data.models) data.models = {};

  // Check for duplicate
  if (data.models[modelKey]) {
    return { success: false, message: `Model "${modelKey}" already exists in api_config.yaml` };
  }

  // Append the new model
  data.models[modelKey] = config;

  // Write back
  try {
    const yamlStr = yaml.dump(data, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    });
    fs.writeFileSync(configPath, yamlStr, 'utf8');
    return { success: true, message: `Model "${modelKey}" added to ${configPath}` };
  } catch (err: any) {
    return { success: false, message: `Failed to write config: ${err.message}` };
  }
}

/**
 * Get the project-level api_config.yaml path.
 */
export function resolveConfigPath(projectRoot: string): string {
  return path.join(projectRoot, '.opsv', 'api_config.yaml');
}
