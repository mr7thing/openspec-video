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

## Stage 2: Validate

- Entry: `opsv validate` (`src/commands/validate.ts`). Exit code 1 on errors; `--strict` promotes warnings.
- Per document it runs:
  1. Schema pick by category (`getSchemaForCategory`).
  2. Ref binding via `bindRefs` (`core/RefBinder.ts`) → `RefBinderResult {resolved, groupedInputs, errors}`.
  3. Category business rules via `validateCategory` (`core/CategoryValidator.ts`), driven by `category_validate.yaml` rules loaded through `utils/categoryValidateLoader.ts` (+ `categoryConfigDiscoverer.ts` for tier-conflict detection).
  4. Input-type registry checks (`utils/inputTypesLoader.ts`).
  5. Dead-ref detection, missing-image detection, manifest-vs-frontmatter status consistency.
- Validation reports `ValidationIssue {severity, category, field?, message}` — do not throw for ordinary validation failures; collect issues.

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
2. Executor: new class in `executor/providers/` (extend `BaseApiProvider` for REST); register in `cli.ts` alongside the other 8.
3. Config: add model entries under `models:` in `cli/.opsv/api_config.yaml` with `provider`, `api_url`, `required_env`, `payload_example`.
4. Input bindings: extend `input_types.yaml` if the provider takes new media input kinds.

Known wart: compilers resolve through a hardcoded map in `TaskBuilder.resolveCompiler`, **not** through `Container`, even though `Container.registerCompiler` exists. If you touch this area, prefer converging on one registry rather than adding a third.

## Anti-Patterns

- Do not merge compile and execute into one step; `opsv produce` output must stay inspectable before `opsv run`.
- Do not auto-approve outputs by scanning filenames — approval is explicit (`opsv approve --variant`), per the architecture blueprint.
- Do not let executors throw for provider/task failures — return `ProviderResult`.
- Do not bypass `executor/naming.ts` to write output files; index allocation and task locking live there.

Reference files: `core/ProductionPipeline.ts`, `core/compiler/TaskBuilder.ts`, `executor/QueueRunner.ts`, `executor/providers/BaseApiProvider.ts`, `core/__tests__/ArchitectureFlow.test.ts` (end-to-end flow).
