# opsv-review Skill

## Overview
Visual review of generated outputs. Serves a web UI with API endpoints for browsing circle outputs and approving assets.

## Document Is the Single Source of Truth

- **docId comes from manifest**: The `assets` keys in `_manifest.json` define which documents exist in the review. Output filenames are never reverse-engineered to derive docId.
- **Attributes come from frontmatter**: `category`, `status` and all descriptive fields are read from the source `.md` document's YAML frontmatter. Manifest values are snapshots, not overrides.
- **Outputs are matched by docId**: Given a docId, review scans circle directories for output files whose names start with that docId prefix.
- **Naming follows the document**: `@hero.md` → `@hero.json` → `@hero_1.png`. The document name is the origin; everything downstream derives from it.

## Command
```bash
opsv review --port 3100
opsv review --latest --ttl 300
opsv review --all
```

## API Endpoints
- `GET /api/circles` — List all circles with asset counts
- `GET /api/circles/:name/assets` — Get assets with output files for a circle
- `GET /api/files/:circle/:provider/:file` — Serve output file
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
3. **Update** `_manifest.json` status (including `assets` field, replacing `_assets.json`)

### What CLI Never Does
- Never modifies `prompt_en`, `visual_detailed`, `visual_brief`, `refs`, or any content field
- Never writes to `## Approved References` (that's the agent's job after syncing)

### Agent Responsibility for `syncing` Assets
When an asset is in `syncing` state, the agent must:
1. Read the review record to find the `modified_task` path
2. Load the modified task JSON
3. Align `visual_detailed`, `visual_brief`, `prompt_en`, `refs` in the source `.md` with the modified task JSON
4. Write approved output to `## Approved References`
5. Set `status: approved`
6. Run `opsv circle refresh` to update `_manifest.json` in the `.circleN/` directory

## Key Files
- `src/commands/review.ts` — Express server with API routes
- `src/executor/naming.ts` — `parseOutputFilename()` for filename-based status decision
- `src/review-ui/public/` — Static UI files
