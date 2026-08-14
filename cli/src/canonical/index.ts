// ============================================================================
// OpsV Canonical Model — facade
//
// Layer 3 of the target architecture: the IR between the Authoring DSL and the
// OPSV Runtime. P1 ships the schema + frontmatter conversion. Import from this
// facade rather than deep-importing schema/ internals where possible.
// ============================================================================

export * from './schema';
export * from './schema/convert';
