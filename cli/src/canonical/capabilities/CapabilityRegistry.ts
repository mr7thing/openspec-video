// ============================================================================
// Capability Registry — a read-only projection of capability → provider
//
// OPSV asks "what capability do you have?" not "what skill do you have?".
// The registry reads existing configuration only (three-tier api_config.yaml
// models + .opsv/project.yaml bindings); it adds no storage and no third
// execution registry. Spec: .trellis/spec/canonical-model/capability-contract.md
// ============================================================================

import { ConfigLoader } from '../../utils/configLoader';
import { loadProjectConfig } from '../../core/ProjectConfig';
import {
  CAPABILITY_ALIASES,
  MODEL_TYPE_TO_CAPABILITY,
  resolveCapabilityId,
} from '../../core/PackContracts';
import { ValidationError, OpsVErrorCode } from '../../errors/OpsVError';

/** Compatibility exports; PackContracts owns aliases and model-type semantics. */
export { CAPABILITY_ALIASES, MODEL_TYPE_TO_CAPABILITY };
export const TYPE_TO_CAPABILITY = MODEL_TYPE_TO_CAPABILITY;

export interface CapabilityProvider {
  modelKey: string;
  provider: string;
  type: string;
}

export interface CapabilityInfo {
  id: string;
  available: boolean;
  providers: CapabilityProvider[];
}

/** Canonical types the capability contract recognizes as input/output. */
const KNOWN_CANONICAL_TYPES = new Set([
  'opsv.shot',
  'opsv.segment',
  'opsv.asset',
  'opsv.project',
  'artifact.video',
  'artifact.image',
  'artifact.audio',
  'artifact.composite',
]);

/**
 * Discover available capabilities from the three-tier model config + project
 * bindings. Every model with a known type contributes a provider; a project
 * binding makes the bound model the preferred provider for that capability.
 */
export function discoverCapabilities(projectRoot: string): Record<string, CapabilityInfo> {
  const loader = new ConfigLoader();
  const config = loader.loadConfig(projectRoot, { silent: true });
  const models = config.models;

  const result: Record<string, CapabilityInfo> = {};

  // 1. Every model with a known type contributes a provider.
  for (const [modelKey, model] of Object.entries(models)) {
    if (!model.type) continue;
    const capability = MODEL_TYPE_TO_CAPABILITY[model.type];
    if (!capability) continue;
    const entry = (result[capability] ??= {
      id: capability,
      available: false,
      providers: [],
    });
    entry.providers.push({ modelKey, provider: model.provider, type: model.type });
    if (model.enable !== false) entry.available = true;
  }

  // 2. Project bindings map a capability (possibly aliased) to a preferred model.
  const projectConfig = loadProjectConfig(projectRoot);
  for (const [capability, modelKey] of Object.entries(projectConfig.bindings ?? {})) {
    const semantic = resolveCapabilityId(capability);
    const entry = (result[semantic] ??= { id: semantic, available: false, providers: [] });
    const model = models[modelKey];
    if (model) {
      const exists = entry.providers.some((p) => p.modelKey === modelKey);
      if (!exists) entry.providers.push({ modelKey, provider: model.provider, type: model.type ?? 'unknown' });
      if (model.enable !== false) entry.available = true;
    }
  }

  return result;
}

/**
 * Validate a capability contract's input/output types against known Canonical
 * types. Unknown types fail closed with `CAPABILITY_CONTRACT_INVALID`.
 */
export function validateCapabilityContract(
  capabilityId: string,
  inputType: string,
  outputType: string,
): void {
  if (!KNOWN_CANONICAL_TYPES.has(inputType)) {
    throw new ValidationError(
      OpsVErrorCode.CAPABILITY_CONTRACT_INVALID,
      `Capability ${capabilityId} declares unknown input type '${inputType}'`,
      { capability: { id: capabilityId, inputType, outputType } },
    );
  }
  if (!KNOWN_CANONICAL_TYPES.has(outputType)) {
    throw new ValidationError(
      OpsVErrorCode.CAPABILITY_CONTRACT_INVALID,
      `Capability ${capabilityId} declares unknown output type '${outputType}'`,
      { capability: { id: capabilityId, inputType, outputType } },
    );
  }
}
