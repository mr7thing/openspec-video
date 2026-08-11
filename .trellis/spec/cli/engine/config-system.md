# Config System

> OPSV uses a **three-tier config** everywhere: built-in defaults → user (`~/.opsv/`) → project (`./.opsv/`). Only override what differs. This pattern repeats across API config, validation rules, and input types — follow it when adding new config kinds.

---

## The Three Tiers

Implemented in `ConfigLoader.loadConfig` (`cli/src/utils/configLoader.ts`):

| Tier | Location | Role |
|------|----------|------|
| Built-in | `cli/.opsv/api_config.yaml` (shipped with the package; resolved via `__dirname` so it works from `dist/`) | Defaults for every model |
| User | `~/.opsv/api_config.yaml` | Machine-wide overrides; populated non-destructively by `cli/scripts/postinstall.js` |
| Project | `{projectRoot}/.opsv/api_config.yaml` | Per-project overrides |

- Merging: shallow per-key merge over `models:`, plus field-level merge of `settings.{dirs,circle,polling,timeout,retry}` (`shallowMerge`). It is **not** a deep merge — document new fields with this in mind.
- The same tier pattern is reused by `utils/categoryValidateLoader.ts` (+ `utils/categoryConfigDiscoverer.ts` for cross-tier conflict detection) and `utils/inputTypesLoader.ts`.
- Config writes go through `utils/configWriter.ts` — do not hand-write YAML config files from commands.

## Project Root Resolution

`utils/projectResolver.ts` walks upward looking for `.opsv/project.yaml` or `.opsv/api_config.yaml`. All project-relative paths must be anchored at `resolveProjectRoot()`, never at `process.cwd()` directly.

`.opsv/project.yaml` is the project production entry point: Pack Stack order, capability bindings, derived Profiles (`extends`, never silent overwrite), action policy, defaults. Loaded by `core/ProjectConfig.ts`; pack contracts by `core/PackContracts.ts` (`resolveDocumentContract`).

## Environment Variables and API Keys

- `.env` is loaded three-tier as well (user → project root → project `.opsv/`) at `cli.ts` bootstrap, with transparent AES-256-GCM decryption via `utils/envCipher.ts`.
- API keys resolve through `required_env` / `fallback_env` fields in the model config (`ConfigLoader.getResolvedApiKey`).
- Never log API keys. `OPSV_DEBUG_HTTP=1` enables full HTTP logging **with Authorization redaction already implemented** in `executor/HttpClient.ts` — keep that redaction intact when touching HTTP logging.

## Model Config Shape

Key interfaces in `configLoader.ts`: `ModelConfig`, `ApiConfig`, `ProjectSettings`, `TimeoutConfig`, `RetryConfig`, `NodeMapping`, `InputBinding`.

A `ModelConfig` entry typically carries: `provider`, `api_url`, `required_env`, `payload_example`, polling/timeout overrides, and `inputs:` bindings evaluated by `core/compiler/shared/InputEvaluator.ts`.

Subprocess providers add a typed sub-block instead of `api_url`: `rhcli` uses `rh: {mode: 'model'|'app', endpoint_id, app_id, binary, instance_type, params}` (`RhCliConfig` in `configLoader.ts`). rhcli entries use `required_env: [RUNNINGHUB_API_KEY]` with `fallback_env: [RH_API_KEY]`; the provider injects the resolved key into the child env as `RUNNINGHUB_API_KEY`, so existing `RH_API_KEY` users need no second variable. Endpoint ids for rhcli entries come from `docs/runninghub-capability-map.md` (verify live with `rh model info <endpoint>`).

## Rules and Pitfalls

- `ConfigLoader` is **not** a singleton — one instance per `OpsVContext`. Do not add module-level config caches.
- `ModelConfig.workflowdir` and the frontmatter `workflow` field are **deprecated** (use `workflow_id` / `workflow_path`); do not build on them.
- The postinstall script must stay non-destructive: copy only when the user file is absent.
- Project-level policy can only **tighten** pack policy, never loosen it. Merge semantics live in exactly one module: `core/PolicyLattice.ts` (`auto < ask < human`; `effective = stricter(pack, project)`). A loosening attempt produces `PROJECT_POLICY_LOOSENS_PACK` (packet blocked, stricter value kept); unknown keys warn; `delete: never` is a Core invariant — see `../../architecture.md`.

## Pack Lock and Content Digest

- `.opsv/pack-lock.yaml` is **schema v2** (`core/ProjectConfig.ts` `writePackLock`): per pack `id`/`version`/`source`, `manifest_digest`, `content_digest`, `digest_algorithm`/`digest_version`, and a per-file hash manifest for drift diagnosis.
- `content_digest` (`core/PackDigest.ts`, single owner) covers `pack.yaml`, exported Category/Profile/Skill manifests, their `SKILL.md`, and conventional behavior dirs (`scripts/`, `templates/`, `references/`, `validation/`); excludes `.git/`, caches, test output, logs, OS metadata. Paths are sorted with `/` separators — same content → same digest across machines.
- v1 locks (manifest-only `digest`) are recognized by `readPackLock` and reported as `PACK_LOCK_LEGACY` (re-run `opsv pack lock`); never silently treated as current.
- Path canonicalization for pack exports: `utils/pathSecurity.ts` `resolveContainedReal` (lexical + realpath containment, tolerant of not-yet-existing finals). All pack-file resolution must go through it — no ad-hoc `path.join(packRoot, rel)`.

## .opsv Directory Conventions (2026-08-10)

| Path | Durability | Owner |
|------|-----------|-------|
| `.opsv/project.yaml` | durable, hand-edited | Project Config (Pack Stack, bindings, policy) |
| `.opsv/pack-lock.yaml` | durable, `opsv pack lock` | Pack content digests (schema v2) |
| `.opsv/bootstrap/` | regenerable, `opsv bootstrap` | `manifest.json` + `roles/<role>.md` (references only, never copied Pack content). Any digest drift (pack.yaml/graph.yaml/profiles/categories/project.yaml) → `BOOTSTRAP_STALE` via `checkBootstrapStale`; `opsv bootstrap check` and `opsv exec start` are fail-closed on it |
| `.opsv/execution/<id>/` | durable, git-trackable | Execution Record: `plan.json` + immutable `plan.v<N>.json` snapshots, `events.jsonl` (fact source), `state.json` + `ready-actions.json` (reducer projections — always rebuildable). Events carry reference ids/paths/hashes only, never document content |
| `.opsv/runtime/` | volatile, **gitignored** | lock files, seq sidecars, `active-asset` — losing it must never lose plan/history |

Reference files: `cli/src/utils/configLoader.ts`, `cli/src/utils/projectResolver.ts`, `cli/scripts/postinstall.js`, `cli/src/utils/__tests__/configLoader.test.ts` (three-tier merge tests).
