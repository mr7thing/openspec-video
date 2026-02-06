# Proposal: Rename CLI command from opsx to opsv
**Date**: 2026-02-06
**Status**: Implemented

## Summary
Rename the CLI command executable from `opsx` to `opsv`.

## Motivation
- **Clarity**: `opsv` stands for "OpenSpec-Video", which is more specific and descriptive than `opsx` (Extension).
- **Conflict Avoidance**: Reduces potential naming conflicts with future "OpenSpec" core tools.
- **Brand Consistency**: Aligns with the project name.

## Impact Analysis
- [x] Update `package.json` bin entry.
- [x] Update `src/cli.ts` program name.
- [x] Update `MANUAL.md` documentation references.
- [x] Update Agent Workflows (`workflows/*.md`).

## Tasks
- [x] Refactor Codebase.
- [x] Verify `npx opsv` execution.
- [x] Commit changes.
