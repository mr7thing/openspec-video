# Document Pipeline

> How a Markdown Asset Document becomes generated media: **parse → validate → compile → execute**. Each stage has a distinct owner and contract. Keep the stages separate — "Compile / Execute / Review are separate" is a stated design principle in `README.md`.

---

## Stage 1: Parse

- `FrontmatterParser` (`cli/src/core/FrontmatterParser.ts`) splits `---` frontmatter, parses YAML with `js-yaml`, and validates against Zod schemas from `cli/src/types/FrontmatterSchema.ts`.
  - `parse(content, schema)` — strict; throws `ValidationError`.
  - `parseRaw(content)` — lenient with regex fallback; warns via `console.warn`. Use only where partial documents are legitimate.
  - `updateField` / `appendReview` — text-level YAML surgery that preserves comments. **Never rewrite a whole document's frontmatter with a naive YAML dump** — user comments and ordering must survive.
- Document discovery/indexing: `buildAssetDocIndex` (`core/AssetDocIndex.ts`) and `AssetManager` (`core/AssetManager.ts`).
- Core envelope fields (see `UBIQUITOUS_LANGUAGE_2026-07-18.md`): `id`, `category`, `status` (`drafting|syncing|approved`), `refs`, `reviews`. The asset type field is `category` — never introduce `asset_type`.
- **Canonical Model front-end (2026-08-14)**: the IR layer in `src/canonical/` parses a document into a `CanonicalAsset` (`parseAssetDocument` in `canonical/parser/CanonicalNormalizer.ts`). It composes the existing `FrontmatterParser` with the new body grammar (`BodyGrammarParser`) and the Reference DSL v2 (`RefExpressionParser`, selector-allowlist backward-compatible). The canonical IR is the single machine contract for future Runtime/Review consumers; it never becomes a second authority over the document (round-trip is lossless via `raw`). See [`canonical-model` spec](../../canonical-model/index.md).

## Stage 2: Validate

- Entry: `opsv validate` (`src/commands/validate.ts`). Exit code 1 on errors; `--strict` promotes warnings.
- `--inline [path]` (file or stdin; `--json` for machine output) validates **proposed content** — a document not yet on disk (hook/pre-write validation). Both the disk scan and `--inline` call the same pure kernel `validateDocumentContent(content, ctx)` in `core/Validator.ts` (no fs, no config discovery, never reads `.trellis/`). Never fork validation logic into a second implementation.
  - Kernel contract: `VALIDATOR_CONTRACT_VERSION = 1`; issue codes frozen in `DOCUMENT_ISSUE_CODES` (test-locked); `hashProposedContent(content)` = sha256 — a hook cache-key ingredient alongside `pack.contentDigest` (single owner: `core/PackDigest.ts`).
  - `--json` report: `{validatorContractVersion, proposedContentHash, pack?, ok, issues}`. An unresolvable/invalid Pack **omits** `pack` (fail-closed: callers must re-validate, never trust a fabricated digest).
- Per document it runs:
  0. **Canonical parser smoke check (P7)**: the disk scan attempts `parseAssetDocument` on every document and emits a **warn-only** `canonical parse warning` on throw — a parser regression signal, never a document failure (valid docs always parse canonically). The kernel (`--inline`) is unchanged.
  1. Schema pick by category (`getSchemaForCategory`, in `core/Validator.ts`).
  2. Ref binding via `bindRefs` (`core/RefBinder.ts`) → `RefBinderResult {resolved, groupedInputs, errors, issues}` — `issues` carries stable codes (`REF_INPUT_TYPE_UNKNOWN` / `REF_STRUCTURE_INVALID` / `REF_PATHS_EMPTY` / `REF_KEY_INVALID`) alongside the legacy `errors` strings; new consumers must use `issues`.
  3. Category business rules via `validateCategory` (`core/CategoryValidator.ts`), driven by `category_validate.yaml` rules loaded through `utils/categoryValidateLoader.ts` (+ `categoryConfigDiscoverer.ts` for tier-conflict detection).
  4. Input-type registry checks (`utils/inputTypesLoader.ts`).
  5. Dead-ref detection, missing-image detection, manifest-vs-frontmatter status consistency.
- Validation reports `ValidationIssue {severity, category, field?, message}` — do not throw for ordinary validation failures; collect issues.

## Context Manifest (`opsv work context`)

`opsv work context <asset> --role <role> [--json]` (`src/commands/work.ts` → `core/WorkContext.ts`) materializes the Context Manifest for one `(asset, role)` pair — the single source consumed by hook injection and sub-agent pull.

Manifest shape: `{contractVersion, asset, nextAction, documentContract, promptContract, refs, policy, issues, role, guidanceRefs}`. `contractVersion` reuses `WORK_PACKET_CONTRACT_VERSION`; `asset`/`nextAction`/`refs`/`policy`/`issues` come **verbatim** from `buildWorkPacket` — never recompute them in parallel.

**Asset state machine view (P7)**: both the Work Packet and the Context Manifest carry `assetState: {state, transitions}` projected from `.opsv/state/<asset>.jsonl` via `currentStateSync` (best-effort, never throws). This is the artifact-side state (`draft|candidate|review|approved|rejected|...`), distinct from the document lifecycle `status` (`drafting|syncing|approved`). See [asset-state-machine spec](../../canonical-model/asset-state-machine.md).

- Roles are a fixed Core four-tuple (`WORK_CONTEXT_ROLES`): `document-author`, `contract-checker`, `production-dispatcher`, `asset-quality-reviewer`. Unknown role → `ROLE_UNKNOWN`, exit 1.
- Exit semantics: a query, not a gate — a materialized manifest exits 0 even when `nextAction.kind` is `blocked` (issues stay visible in content). Only unknown role / unknown asset exit non-zero.
- Degradation mirrors WorkPacket: missing category → manifest without `documentContract`; missing capability binding → `documentContract` degrades to `{category}` with the issue on the manifest (fail-visible, never throw).
- Gotcha: when a Pack resolves outside the project root (`project.yaml source:`), project-relative rendering would escape (`../../...`). `relativePosix` falls back to a POSIX **absolute** path for `guidanceRefs`/`documentContract.path` — regression covered in `WorkContext.test.ts`.

## Stage 3: Compile

- Entry: `opsv produce` (`src/commands/produce.ts`) → `ProductionPipeline.run` (`core/ProductionPipeline.ts`):
  1. Load circle assets from `_manifest.json` (`core/ManifestReader.ts`, schema `CircleManifestSchema` in `types/ManifestSchema.ts`).
  2. Filter by category/file/status; validate ref approval status (`ApprovedRefReader` / `DesignRefReader`).
  3. Build `Job` objects (`types/Job.ts`). Prompt fallback chain: `prompt` → `visual_detailed` → `visual_brief` → first body paragraph.
  4. `TaskBuilder.compileToDir` (`core/compiler/TaskBuilder.ts`): resolve model config + API key → `bindRefs` → cross-document enrichment (failures here are **intentionally non-fatal**, swallowed with `catch {}`) → `compilePrompt` (`core/compiler/PromptCompiler.ts`) rewrites @-tokens per `PromptCompileMode` (`keep|index|name|annotate`) → provider compiler → write `{jobId}.json` into `circleDir/{modelKey}_NNN/`.
- Compiled unit: `BaseTaskJson<TPayload> = { payload: TPayload; _opsv: TaskMeta }` (`types/Job.ts`). `TaskMeta` carries `provider`, `modelKey`, `shotId`, `api_url`, `compiledAt`.

### Provider compiler contract

`ProviderCompiler` (`core/compiler/ProviderCompiler.ts`):

```ts
readonly provider: string;
compile(ctx: CompileContext): BaseTaskJson<unknown>;  // synchronous, pure-ish
```

Provider compilers use `payload_example` from `api_config.yaml` as the payload template and `shared/InputEvaluator.ts` for `inputs:` bindings. Reference example: `core/compiler/providers/VolcengineCompiler.ts`.

## Stage 4: Execute

- Entry: `opsv run` (`src/commands/run.ts`) → `QueueRunner.runPaths` (`executor/QueueRunner.ts`):
  1. Recursively collect task JSONs; skip completed/approved via `.log` checkpoints + `_manifest.json`.
  2. Group by provider — parallel across providers, sequential or bounded-concurrency within one provider.
  3. `container.resolveExecutor(provider)` → `execute()`.
- `BaseApiProvider` (`executor/providers/BaseApiProvider.ts`) is the template-method base for REST providers. Subclasses implement `buildPayload`, `parseTaskId`, `buildStatusUrl`, `isComplete`, `isFailed`, `extractError`, `extractOutputUrls`, `getOutputExtension`; optional hooks `pollStatus`, `extractSyncOutputUrls/Buffers`.
- Execution lifecycle: submit (queue-limit retry loop 5s→120s cycling, 1h cap) → append `submitted` to `.log` → gradient-interval polling → download via `utils/download.ts` → write outputs via `executor/naming.ts` (`outputFilePath`, `resolveNextOutputIndex`, `withTaskLock`) → append `succeeded`/`failed`.
- **Resume correctness** depends on the append-only `.log` JSONL (`executor/polling.ts` `appendLog`, events `submitted|polling|succeeded|failed|upload`). Anything that skips or reorders these events breaks resume.

### Provider executor contract

`ProviderExecutor` (`src/container/Container.ts`): `readonly name; execute(task, taskPath, ctx): Promise<ProviderResult>`. Executors return errors as values (`ProviderResult {success:false, error}`) — they do not throw for task-level failures. See [Error Handling](./error-handling.md).

## Ref System

- Three ref syntax kinds (`types/Refs.ts` `RefSyntaxKind`): `external` (`@id`, `@id:variant`), `doc`/design (`@:key`), `frame` (`@FRAME:`).
- Rules worth restating (from `UBIQUITOUS_LANGUAGE_2026-07-18.md`): with 2+ approved Variants, only `@id:variant` is valid; Variants are unique and never reused; `@FRAME:` is a Shotsdeck-continuity-only directive, not a general ref syntax.
- `RefEngine.ts` is the deliberate facade re-exporting the ref subsystem — import from it rather than deep-importing internals where possible.

## Adding a Provider

1. Compiler: new class in `core/compiler/providers/` implementing `ProviderCompiler`; register in `TaskBuilder`'s compiler map.
2. Executor: new class in `executor/providers/` (extend `BaseApiProvider` for REST); register in `cli.ts` alongside the other 9.
3. Config: add model entries under `models:` in `cli/.opsv/api_config.yaml` with `provider`, `api_url`, `required_env`, `payload_example`.
4. Input bindings: extend `input_types.yaml` if the provider takes new media input kinds.

Known wart: compilers resolve through a hardcoded map in `TaskBuilder.resolveCompiler`, **not** through `Container`, even though `Container.registerCompiler` exists. If you touch this area, prefer converging on one registry rather than adding a third.

### Subprocess providers (rhcli pattern)

When the backend is a subprocess that hides submit/poll/download (e.g. `rhcli` driving the `rh` CLI), do **not** extend `BaseApiProvider` — its abstract surface models an HTTP conversation opsv drives. Instead (precedent: `WebappProvider`, `RhCliProvider`):

1. Implement `ProviderExecutor` directly; delegate the spawn to a runner module (`executor/rh-runner/`) behind an interface so a future native implementation can be swapped per-model.
2. Replicate the lifecycle by hand: `appendLog` `submitted` before spawn and `succeeded`/`failed` after; place artifacts via `executor/naming.ts` (`outputFilePath` + `resolveNextOutputIndex` under `withTaskLock`); never throw for task failures.
3. Put provider-specific config in a typed `ModelConfig` sub-block (rhcli uses `rh: {mode, endpoint_id, app_id, binary, params}`); pass the resolved API key into the child env explicitly so `fallback_env` chains keep working.
4. Resume limitation: a subprocess killed mid-poll loses the remote task id — interrupted tasks re-execute from scratch (double-charge risk; `rhcli` documents this). QueueRunner's "output exists → skip" is the primary idempotency mechanism.
5. Test without network via an injectable runner (provider tests) plus a fake CLI binary fixture under `__tests__/fixtures/` (excluded from jest testMatch via `testPathIgnorePatterns`) for real-spawn argv/JSON/timeout coverage.

## Anti-Patterns

- Do not merge compile and execute into one step; `opsv produce` output must stay inspectable before `opsv run`.
- Do not auto-approve outputs by scanning filenames — approval is explicit (`opsv approve --variant`), per the architecture blueprint.
- Do not let executors throw for provider/task failures — return `ProviderResult`.
- Do not bypass `executor/naming.ts` to write output files; index allocation and task locking live there.

Reference files: `core/ProductionPipeline.ts`, `core/compiler/TaskBuilder.ts`, `executor/QueueRunner.ts`, `executor/providers/BaseApiProvider.ts`, `core/__tests__/ArchitectureFlow.test.ts` (end-to-end flow).
