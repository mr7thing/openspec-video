# OpsV Design Philosophy

## Why These Rules Exist

OpsV is not just a CLI tool — it is a **coordination protocol** between humans, AI agents, and generation APIs. Every design decision addresses a specific failure mode observed across versions v0.5 through v0.7.

---

## 1. Spec-as-Code: Markdown Is the Single Source of Truth

**Principle**: All generation parameters originate from YAML frontmatter in `.md` files. The CLI never fabricates or overrides content.

**Why**: In v0.5–v0.6, prompt text was scattered across `jobs.json`, `PromptSchema.ts`, and inline defaults. When a user edited the markdown, the CLI would still use stale cached values. Making frontmatter the sole authority eliminates this divergence permanently.

**How it applies**: Every `imagen`/`animate`/`comfy` compilation reads frontmatter fields (`visual_brief`, `prompt_en`, `refs`, `frame_ref`) and builds the Job object from them. The CLI never writes back to these fields.

---

## 2. CLI Does Only Deterministic, Conflict-Free Actions

**Principle**: The CLI restricts itself to operations that are:
- **Deterministic**: Same input always produces the same output
- **Non-destructive**: Never overwrites user-authored content
- **Conflict-free**: Never modifies fields that an agent might also be editing

**Why**: In v0.7, the review `approve` action automatically overwrote `prompt_en` with the task JSON's prompt and synced Design References. This created race conditions: if an agent was simultaneously editing `visual_detailed` based on the same review, the CLI's write would clobber the agent's work. The result was lost edits and confused state.

**How it applies**: The `opsv review` approve endpoint now only does two things:
1. Appends a review record (timestamped, additive — never conflicts)
2. Sets `status` to `syncing` (a deterministic state transition)

All field alignment (`prompt_en`, `visual_detailed`, `visual_brief`, `refs`) is the agent's responsibility after seeing `syncing`. The CLI never touches these fields.

---

## 3. Intent-Execution Decoupling

**Principle**: Produce commands (`imagen`, `animate`, `comfy`, `webapp`) only compile. Execution is a separate step via `opsv run`.

**Why**: In v0.5–v0.6, `opsv imagen` mixed five responsibilities: document parsing, dependency scheduling, prompt assembly, task construction, and persistence. Changing one aspect broke others. The coupling made it impossible to compile without executing, or to re-execute without recompiling.

**How it applies**: `opsv imagen --model volcengine.seadream` compiles task `.json` files to disk. `opsv run opsv-queue/videospec.circle1/` executes them. You can inspect, modify, or delete compiled tasks before execution. You can re-run without recompiling.

---

## 4. Physical State Machine

**Principle**: Task state = file existence. No in-memory dispatcher, no database, no daemon tracking state.

**Why**: In v0.6, the SpoolerQueue used in-memory state with file-based persistence. If the process crashed during execution, tasks could be lost or duplicated. A file-existence-based system is inherently crash-safe: if `@hero_1.png` exists, the task succeeded. If only `@hero.json` exists, the task hasn't run.

**How it applies**: `opsv run` scans `.json` task files, checks if corresponding output files already exist, and only executes tasks that lack outputs. This makes retry trivial (`--retry` flag) and eliminates the need for a task status database.

---

## 5. Circle-Centric Directory Structure (No Iteration Numbers)

**Principle**: Directories are named by circle batch (`basename.circleN`) without iteration suffixes. Provider directories are flat `provider.model/` without `queue_1/` subdirectories.

**Why**: In v0.6–v0.7, directory names included iteration numbers (`zerocircle_1`, `queue_1/`). When a user re-ran a task, a new iteration number was created (`zerocircle_2`), breaking all downstream path references. The A1 incremental update strategy (update in place, don't create new iteration directories) eliminates this problem.

**How it applies**: `opsv circle refresh` updates `_manifest.json` in place. Produce commands overwrite existing `.json` files rather than creating `@hero_v2.json`. The directory structure is stable across iterations.

---

## 6. Status Simplification: drafting → syncing → approved

**Principle**: Three states only. `drafting` is the default (no review history). `syncing` means the output was accepted but the source document needs alignment. `approved` means fully aligned and locked.

**Why**: v0.7 had four states (`drafting`, `draft`, `syncing`, `approved`), but the distinction between `drafting` and `draft` was unclear — both meant "not yet reviewed." Agents and users were confused about which to use. Removing `draft` simplifies the state machine without losing information.

**How it applies**: New assets default to `drafting`. After review approval, status becomes `syncing`. Agent aligns fields and sets to `approved`. Downstream circles only unblock when all dependencies are `approved`.

---

## 7. By-Provider Parallelism

**Principle**: Tasks for the same provider execute serially; tasks for different providers execute in parallel.

**Why**: API providers typically enforce rate limits per API key. Running multiple tasks concurrently to the same provider triggers throttling and failures. But tasks to different providers (e.g., Volcengine + SiliconFlow) can safely run in parallel.

**How it applies**: `opsv run` groups tasks by `_opsv.provider`, then runs each provider group serially while running groups in parallel. This maximizes throughput without risking rate limits.

---

## 8. The `syncing` Gate

**Principle**: A `syncing` asset blocks its downstream circle. No downstream task can compile or execute until the asset reaches `approved`.

**Why**: In v0.5–v0.6, an approved image might have been generated with a different prompt than what's in the frontmatter. When a downstream video task referenced this asset via `@hero`, it used the frontmatter's `visual_brief` — which might not match the actual generated image. The `syncing` gate forces alignment before propagation.

**How it applies**: `opsv circle refresh` reports `syncing` assets as blocked. Produce commands skip `syncing` assets. The agent must verify that `visual_detailed`, `visual_brief`, `prompt_en`, and `refs` all reflect the actual generation result before setting `status: approved`.

---

## 9. `--model` Is Mandatory

**Principle**: Produce commands require `--model` (e.g., `opsv imagen --model volcengine.seadream`). There is no default model.

**Why**: In v0.7, `opsv imagen` without `--model` would compile all models found in `api_config.yaml`, often generating hundreds of tasks the user didn't want. Making `--model` mandatory forces explicit intent and prevents accidental API costs.

**How it applies**: Omitting `--model` produces an error: "option --model is required". The user must specify exactly which provider model to compile for.

---

## 10. _manifest.json as the Circle's Authoritative Manifest

**Principle**: Each circle directory (`.circleN/`) contains `_manifest.json` — the single source of truth for which assets belong to that circle and their current status. The `assets` field within `_manifest.json` replaces the former `_assets.json`.

**Why**: In v0.7, circle membership was inferred from the dependency graph at runtime, while status was tracked separately in `.opsv/`. This created synchronization issues: the graph might say an asset belongs to one circle, but the status file thought it was in another. Co-locating membership and status in `_manifest.json` within the circle directory makes them impossible to desynchronize. Merging the former `_assets.json` into `_manifest.json`'s `assets` field eliminates the redundant file and the risk of the two files diverging.

**How it applies**: `opsv circle create` writes `_manifest.json`. `opsv circle refresh` updates it. `opsv review` approves update it. Produce commands read it to determine which assets to compile. No other source of circle membership or status exists.

---

## 11. Filename-Encoded Provenance: Task Identity Carries Modification History

**Principle**: Task and output filenames encode whether a task has been modified, enabling deterministic review logic without any external state.

**Why**: In v0.7, when a user modified a compiled task JSON and re-ran it, the review system had no way to know whether the approved output matched the original frontmatter or the modified task. The CLI would either blindly overwrite `prompt_en` (causing conflicts with agent edits) or skip alignment entirely (leaving stale descriptions). Encoding modification history in the filename makes the distinction trivial: `id_1.ext` = original, `id_2_1.ext` = modified.

**How it applies**:
- Initial compilation: `@hero.json` → output `@hero_1.png`
- Modified re-compile: `@hero_2.json` → output `@hero_2_1.png`
- Review approve: if output matches `id_N.ext` pattern (original) → set `approved` directly. If output matches `id_N_N.ext` pattern (modified) → set `syncing` and record the modified task JSON path so the agent can align frontmatter fields with the modified task.
