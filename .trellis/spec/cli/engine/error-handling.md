# Error Handling and Logging

> One error taxonomy, two output channels, three kinds of logs. Keep them distinct.

---

## Error Taxonomy

All errors live in one file: `cli/src/errors/OpsVError.ts`.

- `OpsVErrorCode` enum with layered string codes: **E1xxx** asset/document, **E2xxx** config, **E3xxx** compilation, **E4xxx** execution, **E5xxx** infrastructure, **E6xxx** validation, **E7xxx** scheduling.
- `OpsVError extends Error` carries `code`, `details`, `context` (`ErrorContext`), plus `withContext()`, `formatMessage()`, `toJSON()`.
- Seven layer subclasses (`AssetError`, `ConfigError`, `CompilationError`, `ExecutionError`, `InfrastructureError`, `ValidationError`, `SchedulingError`) — they only rename `this.name`.
- When adding an error: pick the matching layer prefix, add the code to the enum, throw the layer subclass at the origin.

## Propagation Rules

| Level | Convention |
|-------|-----------|
| Command actions (orchestration) | Throw typed `OpsVError` subclasses; the action catches `err: any`, `logger.error(err.message)`, `process.exit(1)` |
| Executor providers (task level) | **Errors as values**: catch internally, return `ProviderResult {success:false, error}`. Never throw for provider/task failures — one bad task must not kill the queue |
| HTTP layer | `executor/HttpClient.ts` converts axios failures into `ExecutionError` with exponential backoff; retries 421/429/queue-limit only, never other 4xx |
| Review server | `review-ui/middleware/errorHandler.ts` maps code prefixes to HTTP statuses (E4→502, E7→409, …) — keep the mapping consistent when adding codes |

## Intentional Silent Catches

Some `catch {}` swallows are deliberate: cross-document enrichment in `TaskBuilder`, directory collection in `QueueRunner.collectFromDir`, `FrontmatterParser.parseRaw` fallback. The rule: **enrichment and best-effort collection failures are non-fatal; core correctness failures are not.** If you add a silent catch, leave a comment saying why it is safe.

## Logging: Dual Channel

1. **User-facing CLI output** — `console.log` + `chalk` (v4) directly in command files and `QueueRunner`. Color convention: `cyan` progress/headers, `green` success, `yellow` warnings, `red` errors, `gray` secondary. (~294 call sites; this is the established pattern, not an accident.)
2. **Operational logging** — winston via `cli/src/utils/logger.ts`. Facade `logger.{error,warn,info,http,verbose,debug}`, lazily initialized by `initializeLogger` (triggered as a side effect of `OpsVContext.create`). Writes `error.log` + `combined.log` (JSON, 10MB×5 rotation) under `{projectRoot}/logs/`. Level from `LOG_LEVEL`.

Rule of thumb: progress and results the user must see → `console` + chalk. Diagnostics a developer needs after the fact → `logger`. Do not use `logger` for primary command output or `console.log` for diagnostics.

## Task Execution Logs (JSONL)

Append-only `.log` files next to task JSONs, written by `executor/polling.ts` `appendLog`. Events: `submitted | polling | succeeded | failed | upload`. These checkpoints drive resume/skip logic in `QueueRunner` — treat the event stream as a contract, not debug output.

## Debug Switches

- `LOG_LEVEL` — winston level.
- `OPSV_DEBUG_HTTP=1` — full HTTP request/response logging with Authorization redaction (`executor/HttpClient.ts`).

## Known Issues (do not propagate)

- `ErrorContext` is declared **twice** in `OpsVError.ts` (relies on TS interface merging; the second copy lacks `provider`/`command`/`extra`). Be careful which shape you rely on; merge them if you touch the file.
- `ErrorFactory` covers only 2 cases and its `compilationFailed` is misused for missing-API-key config errors in `configLoader.ts`. Prefer constructing the layer subclass directly.
- Version fallback strings in `cli.ts` ('0.12.0') and `logger.ts` ('0.9.0') are stale vs. the real version — read version from `package.json` only.

Reference files: `cli/src/errors/OpsVError.ts`, `cli/src/utils/logger.ts`, `cli/src/executor/HttpClient.ts`, `cli/src/executor/polling.ts`, `cli/src/review-ui/middleware/errorHandler.ts`.
