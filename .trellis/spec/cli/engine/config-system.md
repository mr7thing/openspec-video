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

## Rules and Pitfalls

- `ConfigLoader` is **not** a singleton — one instance per `OpsVContext`. Do not add module-level config caches.
- `ModelConfig.workflowdir` and the frontmatter `workflow` field are **deprecated** (use `workflow_id` / `workflow_path`); do not build on them.
- The postinstall script must stay non-destructive: copy only when the user file is absent.
- Project-level policy (`ActionPolicy` with `auto|ask|human` gates in `core/ProjectConfig.ts`) can tighten pack defaults but `delete: never` cannot be loosened — see `../../architecture.md`.

Reference files: `cli/src/utils/configLoader.ts`, `cli/src/utils/projectResolver.ts`, `cli/scripts/postinstall.js`, `cli/src/utils/__tests__/configLoader.test.ts` (three-tier merge tests).
