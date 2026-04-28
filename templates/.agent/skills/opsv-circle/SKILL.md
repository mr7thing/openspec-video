# opsv-circle Skill

## Overview
Manage circle lifecycle: create dependency graph, generate circle directories with `_manifest.json` (including `assets` field), and maintain per-circle manifests.

## Commands

### Create Circles
```bash
opsv circle create --dir videospec
opsv circle create --dir videospec --name custom    # override basename
opsv circle create --dir videospec --skip-middle-circle
```

Scans the specified `--dir` directory (e.g. `videospec/elements/` and `videospec/scenes/`), builds a dependency graph from `refs` fields, topologically sorts assets into layers, and creates:
- `opsv-queue/{basename}.circle{N}/` directories (batch number increments each create)
- `opsv-queue/{basename}.circle{N}/_manifest.json` per circle (includes `assets` field, replaces `_assets.json`)

**Reference sections** (v0.8.3):
- `## Approved References` — Output-side: approved images written by `opsv review`, read by `ApprovedRefReader` when other documents reference this one via `@assetId:variant`
- `## Design References` — Input-side: design reference images bundled with the document, read by `DesignRefReader` as `reference_images` during compilation

Circle directory naming:
- Each `opsv circle create` increments the batch number: `.circle1/`, `.circle2/`, `.circle3/`
- Layer semantics (ZeroCircle, FirstCircle, EndCircle) are stored in `_manifest.json`, not in directory names
- `--name` overrides the basename (default: derived from `--dir` path)

### Refresh Circles
```bash
opsv circle refresh --dir videospec
```

Rebuilds the graph, diffs against existing `_manifest.json` `assets` field, and updates per-circle manifests. Reports new/removed assets.

## Key Files
- `src/commands/circle.ts` — Command handler
- `src/core/DependencyGraph.ts` — Graph engine, topological sort, circle naming, manifest writing
- `src/core/AssetManager.ts` — Asset loading from videospec/
- `src/executor/naming.ts` — Task/output naming convention helpers (`parseOutputFilename`, `isModifiedTask`)
