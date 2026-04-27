# opsv-review Skill

## Overview
Visual review of generated outputs. Serves a web UI with API endpoints for browsing circle outputs and approving assets.

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
1. User reviews output in browser
2. Clicks approve → `POST /api/approve/:circle/:assetId`
3. Server updates `_assets.json` status → `approved`
4. Server updates `_manifest.json` status → `approved`
5. Next `opsv circle refresh` will reflect the approved state
6. Downstream circles can now proceed

## Key Files
- `src/commands/review.ts` — Express server with API routes
- `src/review-ui/public/` — Static UI files
