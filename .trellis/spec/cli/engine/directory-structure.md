# CLI Directory Structure

> Module map for `cli/src/`. The package builds with `tsc` to `cli/dist/`; the published binary is `opsv` → `dist/cli.js`.

---

## Entry Point and Command Registration

- `src/cli.ts` is the bin entry. Bootstrap order matters and is ordering-sensitive:
  1. Three-tier `.env` loading (user → project root → project `.opsv/`), with transparent AES-256-GCM decryption (`utils/envCipher.ts`).
  2. Version read from `package.json`.
  3. Singleton `ctx = OpsVContext.create(process.cwd())` and `container = new Container()` are created and **exported**.
  4. The 8 executor providers are registered by name (`volcengine`, `siliconflow`, `minimax`, `rhworkflow-v1`, `comfylocal`, `webapp`, `rhapi`, `rhworkflow-v2`).
  5. All commands are registered.
  6. `program.parse(process.argv)`.
- `src/index.ts` is the library export surface.
- Each command lives in its own file under `src/commands/` and exports `register<Name>Command(program: Command, ...): void` (commander v13). Example: `registerValidateCommand` in `src/commands/validate.ts`.
- The shared `--dir <paths...>` option is standardized through `src/utils/dirOption.ts` (`addDirOption` / `resolveDirs`). Do not hand-roll directory list parsing in a new command.
- Command action template: wrap the body in `try { ... } catch (err: any) { logger.error(err.message); process.exit(1); }`.

## Module Map

| Path | Owns |
|------|------|
| `src/commands/` | 24 command modules, one per command group, plus `produceUtils.ts` |
| `src/container/` | `Container.ts` (DI registry for compilers/executors), `OpsVContext.ts` (per-invocation runtime context) |
| `src/core/` | Document engine: `FrontmatterParser.ts`, `AssetDocIndex.ts`, `AssetManager.ts`, the @-ref subsystem (`RefEngine.ts` facade, `RefSyntaxParser.ts`, `RefBinder.ts`, `RefResolver.ts`, `ApprovedRefReader.ts`, `DesignRefReader.ts`), `ManifestReader.ts`, orchestration (`ProductionPipeline.ts`, `DependencyGraph.ts`, `Materializer.ts`, `WorkPacket.ts`, `PackContracts.ts`, `ProjectConfig.ts`), review/approve/sync (`ReviewService.ts`, `ReviewStrategy.ts`, `ApproveService.ts`, `SyncService.ts`), `CategoryValidator.ts` |
| `src/core/compiler/` | Compile stage: `ProviderCompiler.ts` (interface), `PromptCompiler.ts`, `TaskBuilder.ts`, `providers/` (8 provider compilers), `shared/` (`compilerUtils.ts`, `InputEvaluator.ts`) |
| `src/executor/` | Execute stage: `QueueRunner.ts` (scheduler), `HttpClient.ts` (axios + retry), `polling.ts` (gradient polling, JSONL checkpoints), `naming.ts` (output naming/locking), `providers/` (`BaseApiProvider.ts` + 8 concrete providers) |
| `src/types/` | All Zod schemas: `FrontmatterSchema.ts`, `Job.ts`, `ManifestSchema.ts`, `Refs.ts` |
| `src/errors/` | `OpsVError.ts` — the entire error taxonomy in one file |
| `src/utils/` | Config loaders (`configLoader.ts`, `configWriter.ts`, `categoryValidateLoader.ts`, `categoryConfigDiscoverer.ts`, `inputTypesLoader.ts`), `logger.ts`, `FileUtils.ts`, `projectResolver.ts`, `pathSecurity.ts`, `envManager.ts`/`envCipher.ts`, `download.ts`, `fileToBase64.ts`, `imageStitch.ts`, `frameExtractor.ts`, `randomSeed.ts`, `dirOption.ts`, `reviewEntry.ts`, `string.ts` |
| `src/review-ui/` | Express 5 review **server**: `ReviewServer.ts` app factory, `controllers/`, `middleware/` (`auth.ts`, `errorHandler.ts`) |
| `src/auth/` | `CredentialManager.ts` (`~/.opsv/credentials.json`), `DeviceFlowClient.ts` (OAuth device flow) |
| `src/tunnel/` | Remote review exposure: `TunnelClient.ts` (WS bridge, 512KB chunking), `CloudClient.ts`, `CloudReviewSession.ts`, `CloudflaredManager.ts`, adapters |
| `src/webapp-runner/` | Browser-automation provider fallback (Gemini): `core/` (types, task, pipeline, dispatcher), `runners/` (`gemini.ts`, `gemini-cdp.ts`, `gemini-opencli.ts`) |

## Outside `src/`

- `cli/review-ui/index.html` — a single self-contained ~81KB SPA (no build step) served by the review server. `scripts/copy-ui-assets.js` copies it into `dist/review-ui/` at build time. **Not** the same thing as `src/review-ui/` (the server). `src/review-ui/public/` is vestigial (only `.gitkeep`).
- `cli/scripts/` — CommonJS Node scripts: `copy-ui-assets.js` (build step), `postinstall.js` (copies default `.opsv/*.yaml` configs to `~/.opsv/` if absent; never overwrites user config).
- `cli/.opsv/` — the built-in tier of the three-tier config (see [Config System](./config-system.md)).
- Tests: colocated `src/**/__tests__/*.test.ts` (see [Testing](./testing.md)).

## Placement Rules

- New Zod schemas belong in `src/types/`, not beside their consumers.
- New provider support means **two** classes: a compiler in `src/core/compiler/providers/` and an executor in `src/executor/providers/` (usually extending `BaseApiProvider`), plus registration in `cli.ts` and `TaskBuilder`'s compiler map. See [Document Pipeline](./document-pipeline.md#adding-a-provider).
- Shared helpers go to `src/utils/` only after checking nothing similar exists there already (see `../../guides/code-reuse-thinking-guide.md`).
- Do not import from `src/cli.ts` (the entry point) inside commands — `commands/run.ts` does this and it is a known circular-import wart. Receive `ctx`/`container` by parameter or construct them.

Reference: `src/cli.ts`, `src/commands/validate.ts:42` (registration pattern), `src/container/Container.ts`.
