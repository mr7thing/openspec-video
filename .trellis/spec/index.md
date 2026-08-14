# OPSV Spec Index

> Project-specific coding guidelines for the openspec-video repository. OPSV is a **compiler for video**: Markdown Asset Documents are source code; the engine validates them, resolves dependencies, and compiles them into AI API calls. See `README.md` for the product view.

---

## Start Here

- [Architecture & Domain Model](./architecture.md) — ubiquitous language, core invariants, how the layers fit together. **Read this before any cross-layer work.**

## Layer Specs

| Package | Layer spec | Scope |
|-------|-----------|-------|
| `cli` | [cli/engine/](./cli/engine/index.md) | `cli/` — TypeScript package `videospec` (binary `opsv`): parse → validate → compile → execute |
| `extension` | [extension/companion/](./extension/companion/index.md) | `extension/` — MV3 companion extension + Node daemon automating gemini.google.com (git submodule) |
| `packs` | [packs/authoring/](./packs/authoring/index.md) | `packs/`, `opsv-packs/`, `opsv-cli-skill/` — declarative pack format and Asset Document contract |
| `canonical` | [canonical-model/](./canonical-model/index.md) | Canonical Model (IR) — canonical types, Reference DSL v2, Asset State Machine, Artifact Contract, Capability Contract |

## Thinking Guides

| Guide | When to use |
|-------|-------------|
| [guides/code-reuse-thinking-guide.md](./guides/code-reuse-thinking-guide.md) | Before writing new helpers or when a pattern repeats 3+ times |
| [guides/cross-layer-thinking-guide.md](./guides/cross-layer-thinking-guide.md) | Features touching 3+ layers or adding a message kind / config field / payload field |

## Repo Map (non-spec)

| Path | What it is |
|------|-----------|
| `API/` | Reference-only scraped vendor API docs (RunningHub, Volcengine Ark) |
| `test/` | Symlinked, git-ignored real production workspaces for dogfooding — not automated tests |
| `docs/` | Architecture blueprint, plans, audit logs |
| `UBIQUITOUS_LANGUAGE_2026-07-18.md` | Agreed domain terminology |

## Maintenance

- Specs describe the project **as it exists now**. When code reality changes, update the spec in the same change (see the `trellis-update-spec` workflow).
- Known-broken or deprecated surfaces are documented as such inside each layer spec — keep those lists current; delete entries when fixed.
