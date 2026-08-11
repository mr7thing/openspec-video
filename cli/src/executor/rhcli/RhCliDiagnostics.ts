// ============================================================================
// RH CLI user-facing diagnostics
// ============================================================================

/**
 * Add actionable binary configuration help to failures that happen before
 * the RH CLI subprocess can submit work. Keep this in the adapter layer so
 * the runner remains usable by non-CLI callers and does not know model config.
 */
export function addRhCliBinaryGuidance(
  message: string,
  binary: string,
  modelKey: string,
): string {
  return [
    message,
    '',
    `Configure a compatible RH CLI binary (attempted: ${binary}):`,
    '  export RH_CLI_BINARY="/absolute/path/to/compatible/rh"',
    '',
    `Or set it for model '${modelKey}' in .opsv/api_config.yaml:`,
    '  models:',
    `    ${modelKey}:`,
    '      rh:',
    '        binary: /absolute/path/to/compatible/rh',
    '',
    'No RH CLI subprocess was started; retrying or selecting another provider is safe.',
  ].join('\n');
}
