# OPSV Design Philosophy

> Why the system is built this way — the reasoning behind each architectural decision.

---

## 1. Source of Truth: Document, Not Manifest

**The manifest is derived data, not the source of truth.**

OPSV starts from markdown documents in `videospec/` (elements/, scenes/, shots/). Each document has frontmatter with a `status` field. The entire pipeline — compilation, execution, review — flows from this status:

- `drafting` → can be compiled but not executed downstream
- `syncing` → approved by human but task was modified, agent must align
- `approved` → all downstream documents can now compile

The `_manifest.json` in each circle directory is a cache/manifest of all assets in that circle — computed from the dependency graph, not the authoritative record. When frontmatter changes, the manifest is recomputed via `opsv circle refresh`.

**Why**: Documents are what humans edit. They have history (git), comments (Feishu), and review threads. The manifest is a performance index for the Review UI, not a database.

---

## 2. Circle = Topological Batch

**A circle is a set of documents with no mutual dependencies — they can execute in parallel.**

The dependency graph does a topological sort and groups documents into batches. Each batch becomes a circle. Circle `index` is the batch number (0-based). The circle name is semantic: `zerocircle` (index 0), `firstcircle` (1), ..., or `end_circle` if the last batch contains `shotdeck.md`.

**Key invariant**: Documents within the same circle never reference each other. If they did, they'd be in different circles.

**Directory naming**: `{basename}_circle{N}/` where N starts at 1. The underscore avoids path parsing bugs in Node.js and Express. The semantic name (zerocircle, firstcircle) is only in the manifest JSON and UI — never in paths.

**Why batches instead of a flat queue**: Topological batching means the system can safely parallelize within a circle without coordination. A document at index 2 never blocks a document at index 0 — all its dependencies are already in earlier circles.

---

## 3. Incremental Preservation Principle

**Compiled tasks are never auto-deleted. Re-running does not overwrite — it appends.**

When you run `opsv run` multiple times:

- Output files accumulate: `shot_01_1.png`, `shot_01_2.png`, `shot_01_3.png`
- Task JSON files are kept: `shot_01.json`, `shot_01_m1.json`, `shot_01_m2.json`
- Only `approved` status in manifest causes `opsv run` to skip a task

Iteration is native: `opsv iterate` creates a new task file with `_m{N}` suffix. Each iteration is a first-class artifact, not a mutation of the original.

**Why**: Media production is exploratory. You want to compare `shot_01_1.png` (v1 prompt) with `shot_01_2.png` (v2 prompt). You want to revert to the original if iteration goes wrong. The pipeline preserves all versions.

---

## 4. Compile/Execute/Serve Are Separate Phases

**Compilation (markdown → task JSON) does not trigger execution. Execution does not start the server.**

```
opsv imagen           # Compile: doc.md → queue/basename_circle1/provider.model_001/docId.json
opsv run              # Execute: task JSON → API call → output files
opsv review           # Serve: web UI for human review + approve
```

This separation is why the pipeline is debuggable. You can:
- Inspect compiled task JSON before running
- Modify task JSON before execution
- Re-run failed tasks with `opsv run --retry`
- Run the same compiled task against a different provider

**Why not auto-compile**: In production, you may compile many documents but execute only a subset. Or you may want to review all compiled tasks before any execution. Auto-compile on approve would hide this choice.

---

## 5. Provider Abstraction

**All AI providers (Volcengine, SiliconFlow, Minimax, ComfyUI, RunningHub) implement the same interface.**

`ProviderCompiler` converts a generic `Job` into a provider-specific `TaskJson`.
`Provider` executes a `TaskJson` via the provider's API and returns a `ProviderResult`.

The `modelKey` (e.g., `volcengine.seadream5`) encodes both the provider and the model, resolved from `api_config.yaml`.

**Why**: Media generation is a fast-moving space. New providers emerge. Provider-specific quirks should be isolated in one place, not scattered across the codebase.

---

## 6. Review UI Is a便利, Not本质

**The Review UI is a convenience layer. The authoritative state lives in frontmatter.**

The Review UI (`opsv review`) serves a human-facing window into the manifest and file system. But all state it reads — document status, approved references — ultimately comes from frontmatter in source documents.

If the Review UI were removed tomorrow, the pipeline would still work: `opsv imagen`, `opsv run`, and `opsv iterate` all read frontmatter directly.

**Why**: Web UIs have maintenance costs and security surfaces. The CLI should be complete without it.

---

## 7. Error Taxonomy

Errors are categorized by which layer they occur in:

| Code Range | Layer | Examples |
|-----------|-------|----------|
| E1xxx | Asset/Document | parse failed, missing field, image not found |
| E2xxx | Config | missing API key, invalid model config |
| E3xxx | Compilation | invalid ref, circular dependency |
| E4xxx | Execution | API error, timeout, download failed |
| E5xxx | Infrastructure | file not found, network, WebSocket |
| E6xxx | Validation | schema mismatch, type error |
| E7xxx | Scheduling | circle not found, dependency not ready |

**Design rule**: Errors in lower-numbered ranges should never cause errors in higher-numbered ranges. A config error (E2xxx) stops before compilation (E3xxx). A compilation error produces a descriptive TaskJson, not an exception — the execution layer handles it.

---

## 8. Status State Machine

```
drafting → approved           (human review, original task)
drafting → syncing → approved  (human review, modified task)

syncing is a checkpoint: task was modified after initial approval,
agent must re-align fields before final approval
```

The `syncing` state exists because iteration (`opsv iterate`) creates a new task JSON that may differ from the approved original. The agent must confirm the new task's parameters before the system treats it as approved.

**No backward transitions**: Once `approved`, frontmatter status is not automatically reverted. If a later task iteration produces worse results, you approve a different iteration or set status back manually.

---

## 9. ApproveService: The Boundary

**ApproveService is the only place where document frontmatter is written by the system.**

Every other component — compilers, executors, Review UI — reads frontmatter. Only `ApproveService.execute()` writes it, via two operations:

1. Append a `review:` entry to the document's frontmatter (audit trail)
2. Update the `status:` field

This makes the write path auditable and testable in isolation.

---

## 10. Directory Structure

```
project/
├── videospec/           # Source documents (the canonical workspace)
│   ├── elements/        # roles, props, scenes
│   ├── scenes/          # scene descriptions
│   └── shots/           # shot designs (references elements/scenes)
├── opsv-queue/          # Build output (generated, not git-tracked)
│   └── videospec_circle1/
│       ├── _manifest.json
│       └── volcengine.seadream_001/
│           └── shot_01.json         # Compiled task
│           └── shot_01_1.png        # Output
└── .env                 # API keys (never committed)
```

**Key rule**: `videospec/` is the workspace. `opsv-queue/` is the build directory — output of compilation, input to execution. The two are never confused.

---

## 11. Engine Provides Hooks, Agent Owns Decisions

**Principle**: The CLI provides validation, resolution, and transformation primitives. It never injects semantic rules about *how* references should influence generation.

This principle crystallized during comparison with ArcReel, a reference-based AI video project that hard-codes consistency rules into its engine: injection priority order (product > character > scene > prop), fidelity tail text ("logo 不得改变"), per-type prompt guards, and temporal consistency via previous-storyboard injection with segment_break control.

**Why ArcReel's approach was rejected for OPSV**: ArcReel bakes consistency heuristics into the engine because it targets weak models with rigid pipelines. OPSV targets strong models (Gemini etc.) with Agent-driven workflows. The agent, guided by skill instructions, makes better injection decisions than any hard-coded rule. An engine that guesses "this ref is for identity" vs "this ref is for style" will inevitably guess wrong for some workflow.

**What the CLI does**:
- `RefBinder` resolves `@-syntax` keys to file paths and groups them by `input_type`
- `validate` checks that every `@-token` in `prompt` has a corresponding refs entry (bidirectional), that referenced files exist, and that `input_type` values are registered — all structural, not semantic
- `TaskBuilder` assembles `referenceImages` from `groupedInputs` — a flat array, no priority reordering, no appended instructions

**What the CLI deliberately does NOT do**:
- No injection priority ordering — the agent controls the order via how it writes `refs:` in frontmatter
- No per-type prompt tails (e.g., "产品高保真还原") — the agent writes those in `prompt` or `visual_brief` when needed
- No temporal consistency injection (previous shot / segment_break) — if a skill needs this, the agent explicitly includes prior outputs in the next shot's `refs:`
- No asset semantics — `input_types.yaml` declares *what* a type is (image/video/audio) and what file extensions it covers, not *how* it should be injected

**How the agent makes decisions**: The skill (`SKILL.md`) tells the agent how to use refs. `Vision Brief` describes the overall visual goal. The agent reads both, understands the intent, and writes `prompt` and `refs:` accordingly. A product fidelity workflow gets a prompt tail like "产品外观必须与参考图完全一致" because the agent wrote it, not because the engine appended it.

**The implicit contract**: `input_types` keys are hooks — not rules. When a skill says "refs of type `element` should anchor identity, refs of type `style` should guide atmosphere," the agent encodes that in the prompt. The CLI ensures the refs exist and are wired correctly. The division of labor is: CLI checks *can it work*, agent decides *how to work*.
