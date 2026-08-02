# CLI Quality Guidelines

> Conventions observed across `cli/src/`, plus known anti-patterns and legacy surfaces. Standards: `strict: true` TypeScript (target ES2020, CommonJS). `npm run build` must pass before commit. `npm run lint` is currently broken (no eslint installed/configured) — do not rely on it.

---

## Conventions

- **File header banner**: nearly every source file starts with a `// ====` block banner (`// OpsV <Name>` + purpose). Section separators inside files use the same style. Match it in new files.
- **Naming**: classes PascalCase matching filename (`FrontmatterParser.ts`); functions camelCase; constants UPPER_SNAKE; config/YAML fields snake_case (`api_url`, `required_env`). Commands export `register<Name>Command`.
- **Imports**: ES module syntax; node builtins as default imports (`import fs from 'fs'`). Relative imports only, no path aliases, no barrel files — except `src/index.ts` and `src/core/RefEngine.ts`, which are deliberate facades.
- **fs usage**: both `fs` and `fs-extra` are in use; core code mostly uses plain sync `fs` (`readFileSync`, `existsSync`, `appendFileSync`). `utils/FileUtils.ts` is the async wrapper and includes `atomicWrite` (tmp + rename) — prefer `atomicWrite` whenever writing files whose corruption would break resume (task JSONs, manifests, config).
- **Paths**: always `path.join`/`path.resolve`; project-relative paths anchored at `resolveProjectRoot()`. Any path derived from user/HTTP input must go through `utils/pathSecurity.ts` (`sanitizePathComponent`, `resolveWithin`).
- **Errors**: typed `OpsVError` subclasses at the origin; `catch (err: any)` with `err.message` only at boundaries. See [Error Handling](./error-handling.md).
- **Comments**: the codebase mixes Chinese and English comments. New comments should be in English; do not mass-translate existing ones in unrelated changes.
- **Version markers** like `(v0.15.0)` appear in headers/comments — they are historical notes, not ownership claims.

## Forbidden / Avoid

- **No imports from `src/cli.ts`** (the entry point) in commands or core — `commands/run.ts` is the one existing violator and it creates a circular import. Inject `ctx`/`container`.
- **No new global singletons.** Known ordering-sensitive ones already exist (`cli.ts` exports pre-built `ctx`/`container`; `logger` initializes as a side effect of `OpsVContext.create`). Do not add more.
- **No `process.exit` deep in library code** — only in command action bodies. (`commands/validate.ts` violating this internally is a known smell.)
- **No `require()` in TypeScript source** — a few inline `require()` calls remain (`BaseApiProvider.ts`, `webappExec.ts`, `gemini*.ts`); do not copy the pattern.
- **No auto-approval by filename scan, no deleting documents/tasks/artifacts.** `delete: never` is a Core invariant from the architecture blueprint.

## Deprecated Surfaces (do not build on)

- `ModelConfig.workflowdir` — marked `[deprecated]`.
- Frontmatter `workflow` field — use `workflow_id` / `workflow_path`.
- Legacy flat `ref_videos` / `ref_audios` keys in `ProductionPipeline.buildJob` — kept for backward compat.
- Legacy approve endpoint `/api/approve/:circle/:assetId` in the review server.
- `--prompt-mode` flag accepts `keep|index|name` but the default mode is `annotate` — the flag cannot select the default; known gap.
- `TaskJson` type alias — legacy name for `BaseTaskJson`.

## Known Structural Warts (fix deliberately, not accidentally)

1. Two parallel provider registries: `Container` (executors) vs. the hardcoded compiler map in `TaskBuilder.resolveCompiler`. Converge when touching this area.
2. Duplicate `ErrorContext` interface in `errors/OpsVError.ts` (interface merging).
3. Provider-specific knowledge leaked into generic `BaseApiProvider` (RunningHub seed handling, ComfyUI `imageFile` special-case) — keep new provider specifics in the concrete provider.
4. `validate.ts` reads each document twice (schema/refs, then dead-link detection) — perf smell.
5. `src/review-ui/public/` is vestigial (`.gitkeep` only); the real SPA is `cli/review-ui/index.html`.

## Commit Hygiene

- `npm run build && npm test` green before committing.
- Recent history follows conventional-commit style (`fix:`, `chore: release vX.Y.Z`). Match it.
