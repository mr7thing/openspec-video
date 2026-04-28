# opsv-circle Skill

## Overview
Manage circle lifecycle: create dependency graph, generate circle directories with `_assets.json`, and maintain `_manifest.json`.

## Commands

### Create Circles
```bash
opsv circle create --dir videospec
opsv circle create --dir videospec --skip-middle-circle
```

Scans `videospec/elements/` and `videospec/scenes/`, builds a dependency graph from `refs` fields, topologically sorts assets into layers, and creates:
- `opsv-queue/videospec/<circle>/` directories
- `opsv-queue/videospec/<circle>/_assets.json` per circle
- `opsv-queue/videospec/_manifest.json` global status snapshot

Circle naming:
- Layer 1 → `zerocircle` (no dependencies)
- Layer 2 → `firstcircle` (or `circle1` if 3+ layers)
- Last layer → `endcircle` (if 3+ layers)
- Middle layers → `circle2`, `circle3`, etc.

### Refresh Circles
```bash
opsv circle refresh --dir videospec
```

Rebuilds the graph, diffs against existing `_assets.json`, and updates both per-circle and global manifests. Reports new/removed assets.

## Key Files
- `src/commands/circle.ts` — Command handler
- `src/core/DependencyGraph.ts` — Graph engine, topological sort, circle naming, manifest writing
- `src/core/AssetManager.ts` — Asset loading from videospec/
- `src/executor/naming.ts` — Task/output naming convention helpers (`parseOutputFilename`, `isModifiedTask`)
