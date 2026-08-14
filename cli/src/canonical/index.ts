// ============================================================================
// OpsV Canonical Model — facade
//
// Layer 3 of the target architecture: the IR between the Authoring DSL and the
// OPSV Runtime. P1 ships the schema + frontmatter conversion. Import from this
// facade rather than deep-importing schema/ internals where possible.
// ============================================================================

export * from './schema';
export * from './schema/convert';
export * from './parser/RefExpressionParser';
export * from './parser/BodyGrammarParser';
export * from './parser/CanonicalNormalizer';
export * from './state/AssetStateMachine';
export * from './state/TransitionStore';
export * from './artifacts/ArtifactContract';
export * from './artifacts/ArtifactValidator';
export * from './artifacts/mediaProbe';
export * from './artifacts/CommitService';
