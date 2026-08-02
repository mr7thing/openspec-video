# OPSV Project Assessment

Date: 2026-08-02 (analysis performed 2026-07-30, against `videospec` v0.17.1 / extension v0.5.13)
Method: deep architecture analysis of all three code layers during the Trellis spec bootstrap (`.trellis/spec/`); findings are source-backed and cross-referenced there.

---

## Overall Judgment

OPSV is a project whose **design thinking is well ahead of its engineering maturity**. "Markdown as source code, Compile/Execute/Review separation, append-only history, explicit approval" is an unusually strong model for AI video tooling — the ubiquitous language document and architecture blueprint approach genuine DDD practice. The debt concentrates in the implementation and operational layers.

## Layer: CLI Engine (`cli/`, v0.17.1) — most mature

**Strengths**
- Clean, well-executed layering: commands → core (parse/validate) → compiler → executor, each with explicit contracts (`ProviderCompiler` synchronous pure-ish, `ProviderExecutor` errors-as-values).
- All data models centralized as Zod schemas in `src/types/`; error codes layered (E1xxx–E7xxx) with HTTP status mapping by prefix in the review server.
- Resume correctness via append-only JSONL checkpoints — clearly born from real production needs.
- Test infrastructure exists with good exemplars (`configLoader` three-tier merge, `ArchitectureFlow` end-to-end).

**Issues (by severity)**
1. **Broken engineering toolchain**: `npm run lint` fails (no eslint dependency/config), no prettier, no CI, no pre-commit hooks. Quality rests entirely on discipline.
2. **Structural debt**: dual provider registries (`Container` vs hardcoded compiler map in `TaskBuilder.resolveCompiler`); circular import (`commands/run.ts` imports the entry point `cli.ts`); duplicate `ErrorContext` interface relying on TS declaration merging.
3. **Sloppiness**: `validate.ts` reads every document twice; two stale version fallbacks ('0.12.0' / '0.9.0' vs actual 0.17.1); long-lived deprecated surfaces (`workflowdir`, `workflow`, `ref_videos`/`ref_audios`, legacy approve endpoint).
4. Dual-channel output (~294 `console.*` + ~109 winston call sites) is intentional but enforced only by convention.

## Layer: Chrome Extension (`extension/`, v0.5.13) — highest risk

**Core fact: the upload path is broken at HEAD.** `extension/docs/gemini-upload-mechanism.md` honestly documents that all three in-page upload strategies failed from v0.5.7→v0.5.13 (isolated-world vs main-world prototypes); `main-world-bridge.js` is dead code; the active branch `opencli-attempt-stable-v2` indicates the CDP migration is in flight. **The webapp provider is effectively unusable today** — an existential risk for that provider. (As of this assessment the CLI marks it "temporarily unavailable" — see `cli/src/webapp-runner/availability.ts`.)

Other issues:
- Giant files: `content.js` (~1653 lines) and `sidepanel.js` (~1836 lines) mix networking, state machine, DOM heuristics, and rendering.
- Zero tests, zero build, zero lint — verification is fully manual.
- Fragile state: all queue/batch state lives in sidepanel memory; recovery logic is spread across three files with overlapping responsibilities.
- At least 4 visible bugs in code: undefined `$_opsvDragPreCheck` in a template string, implicit global `event`, `'completed'` vs `'done'` status mismatch in Clear Done, dead `try/require` block.
- Localhost-trust security posture (CORS `*`, unauthenticated `/agent/cmd`) — acceptable for a local tool but must stay documented.
- Deep coupling to Gemini's DOM including hard-coded Chinese aria-labels; any upstream redesign breaks it.

**Worth noting**: the sidepanel-as-source-of-truth + Agent-gated batch protocol from `PLAN-v5.4.md` is the right architecture; the upload investigation document is excellent.

## Layer: Packs — clean contract, generational split

- The declarative pack contract (capabilities never name models, project-side bindings, `delete: never`) is clean; `packs/short-drama` is a good minimal reference.
- Two generations coexist: `packs/` (minimal contract-1.0) vs `opsv-packs/` (heavy pipelines with `manifest.json`/`SKILL_PACK.md`/`graph.yaml`); the migration path is undocumented.
- **Repo hygiene**: `opsv-packs/` and `test/` are symlinks to private, git-ignored repos. The open-source repo **cannot be reproduced standalone** — no real packs, no test data. `packs/mv-3d-*` are also git-ignored local packs.
- Friction: pack-shipped `category_validate.yaml` must be manually copied into each project to take effect.

## Cross-Cutting

| Dimension | Assessment |
|-----------|-----------|
| Docs | Excellent design docs, but scattered (root, `docs/`, `extension/`, inside packs); no ongoing reconciliation between blueprint and reality |
| Terminology discipline | Excellent — the ubiquitous language is genuinely enforced in code (`category`, never `asset_type`) |
| Tests | CLI has them (315 passing) but no coverage measurement; extension zero; packs near zero |
| Reproducibility | Poor — symlinks + gitignore + private repos mean externals cannot build a working system |
| Solo-project traits | Pervasive (mixed CN/EN comments, dated change markers, `test/` holding real production workspaces). Reasonable for solo work; blocks collaboration |

## Prioritized Recommendations

1. **Fix the extension upload path or degrade gracefully** — the CDP/OpenCLI migration is the only P0; the CLI now marks webapp as temporarily unavailable until it lands.
2. **Rebuild the engineering floor** — fix lint, add CI (build + test) for the CLI. Low cost, immediate payoff.
3. **Clean up the dual provider registry and circular import** — guaranteed to bite the next time a provider is added.
4. **Decide the packs unification direction** — one generation;回流 publicly-safe content from `opsv-packs` into the main repo.
5. **Institutionalize blueprint reconciliation** — map the blueprint's 8-step implementation order against v0.17.1 reality (done / diverged / dropped).

These recommendations are tracked as Trellis tasks under `01-engineering-health/` (created alongside this document).
