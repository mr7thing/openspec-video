# opsv-review Skill

## Overview
OpsV Review v0.8.26 — Visual review of generated outputs.

- **Global mode** (default, no `--circle`): scans all documents and all circles. Document frontmatter is the single source of truth for `category`/`status`. Manifest is used only to discover which assets exist and find their output files.
- **Manifest-driven mode** (`--circle`): focuses on a single circle's manifest. Assets and outputs are scoped to that circle.

## Document Is the Single Source of Truth

- **docId comes from manifest**: The `assets` keys in `_manifest.json` define which documents exist in the review. Output filenames are never reverse-engineered to derive docId.
- **Attributes come from frontmatter**: `category`, `status` and all descriptive fields are read from the source `.md` document's YAML frontmatter. Manifest values are snapshots, not overrides.
- **Outputs are matched by docId**: Given a docId from the manifest, review recursively scans circle directories for output files whose names start with that docId prefix.
- **Naming follows the document**: `@hero.md` → `@hero.json` → `@hero_1.png`. The document name is the origin; everything downstream derives from it.

## Command
```bash
opsv review                              # Global mode: all circles, docs as source of truth
opsv review --port 3100 --ttl 300        # Custom port and idle timeout
opsv review --latest                     # Global mode: only latest circle
opsv review --circle                     # Manifest-driven: auto-discover latest manifest
opsv review --circle videospec.circle1   # Manifest-driven: explicit circle directory
opsv review --circle opsv-queue/videospec.circle1/_manifest.json  # Explicit manifest path
```

## API Endpoints
- `GET /api/circles` — List circles with asset counts
- `GET /api/circles/:name/assets` — Get assets with output files for a circle (recursive scan)
- `GET /api/documents` — List documents (global or manifest-scoped)
- `GET /api/documents/:circle/:docId` — Get single document content
- `GET /api/files/*filePath` — Serve output file (supports nested provider directories)
- `POST /api/approve/:circle/:assetId` — Approve an asset (updates status)

## Approval Flow

### Conditional Status by Output Filename Pattern

Review approve uses `parseOutputFilename()` to detect whether the approved output came from an original or modified task:

| Output Filename | Pattern | Task Type | Result |
|-----------------|---------|-----------|--------|
| `@hero_1.png` | `id_N.ext` | Original task (`@hero.json`) | `status: approved` |
| `@hero_2_1.png` | `id_N_N.ext` | Modified task (`@hero_2.json`) | `status: syncing` |

### What CLI Does (Deterministic, Conflict-Free Only)
1. **Append review record** to source `.md` frontmatter:
   - Timestamp + approve opinion
   - If modified task: append `modified_task: <task JSON path>` in review entry
2. **Set status** based on filename pattern:
   - Original → `approved`
   - Modified → `syncing`
3. **Update** `_manifest.json` status (including `assets` field)

### What CLI Never Does
- Never modifies `prompt_en`, `visual_detailed`, `visual_brief`, `refs`, or any content field
- Never writes to `## Approved References` (that's the agent's job after syncing)
- Never infers docId from output filenames (docId always comes from manifest)

### Agent Responsibility for `syncing` Assets
When an asset is in `syncing` state, the agent must:
1. Read the review record to find the `modified_task` path
2. Load the modified task JSON
3. Align `visual_detailed`, `visual_brief`, `prompt_en`, `refs` in the source `.md` with the modified task JSON
4. Write approved output to `## Approved References`
5. Set `status: approved`
6. Run `opsv circle refresh` to update `_manifest.json` in the `.circleN/` directory

## Key Files
- `src/commands/review.ts` — CLI registration + Express route handlers
- `src/core/ReviewStrategy.ts` — `ManifestReviewStrategy` + `GlobalReviewStrategy`
- `src/core/ApproveService.ts` — Decomposed approve flow (validate → buildEntry → resolveTarget → applyReview → updateManifest)
- `src/core/ManifestReader.ts` — Unified manifest read/cache/validate
- `src/executor/naming.ts` — `parseOutputFilename()` for filename-based status decision
