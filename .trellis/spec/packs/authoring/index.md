# Packs Guidelines

> Guidelines for authoring and editing OPSV **Packs** — versioned, declarative definitions of categories, profiles, and skills for a production domain. Packs contain no executable pipeline code; OPSV Core (`cli/`) enforces the contracts.

---

## Guidelines Index

| Guide | Description |
|-------|-------------|
| [Pack Format](./pack-format.md) | Pack directory layout, `pack.yaml`, categories, profiles, skills |
| [Asset Documents](./asset-documents.md) | Frontmatter contract, reference syntax, lifecycle, validation layers |

---

## Repository Layout Caveats (read first)

- **`packs/`** (in-repo): only `packs/short-drama/` is tracked in git — it is the clean minimal reference pack. `packs/mv-3d-previs/` and `packs/mv-3d-ref/` exist on disk but are git-ignored ("local 3D packs").
- **`opsv-packs/`** is a **symlink to a separate private git repo** (`../opsv-packs`, git-ignored here). Commits there do not appear in openspec-video. It holds the full production pipelines (`opsv-mv-pipeline`, `opsv-multi-ref-pipeline`, `opsv-skills-creator`).
- **`test/`** is also a symlinked, git-ignored directory of real production workspaces used for dogfooding — not automated test fixtures.
- **`opsv-cli-skill/`** (tracked) is the command-layer operator skill; its `references/agent-contract.md` is the authoritative document contract.
- **`API/`** is reference-only scraped vendor API documentation (RunningHub, Volcengine Ark) — inputs for authoring `api_config.yaml`, not code.

## Authoritative References

In priority order:

1. `opsv-packs/opsv-skills-creator/references/pack-contract.md` — the Declarative Pack Contract (private repo)
2. `opsv-cli-skill/references/agent-contract.md` — document/reference/lifecycle contract (in-repo)
3. `opsv-packs/opsv-skills-creator/assets/pack_template/` — canonical pack skeleton (private repo)
4. `UBIQUITOUS_LANGUAGE_2026-07-18.md` (repo root) — agreed terminology
5. Minimal real pack: `packs/short-drama/`; full real packs: `opsv-packs/opsv-mv-pipeline/`, `opsv-packs/opsv-multi-ref-pipeline/`

---

## Conformance — the Six Checks (2026-08-10)

`opsv conformance <pack> [--json]` runs the Pack conformance matrix (command: `cli/src/commands/conformance.ts`; implementation: `cli/src/core/Conformance.ts`). It never re-implements validation rules — base Pack validation delegates to `PackChecker.checkPack`, Stage decoding to `PackContracts.loadGraphStages`, and Role template materialization status to `Bootstrap.checkBootstrapStale`. Standalone: it reads only the Pack tree and (for check 3) the project's `.opsv/`; never `.trellis/`.

| # | Check id | Question it answers |
|---|----------|---------------------|
| 1 | `stage-inputs` | Can every Stage input be obtained from documents (Category / Stage / Profile input slot / `required_ref_categories` / `outputs.contract` reachability)? |
| 2 | `stage-output-contracts` | Does every Stage declare `outputs.contract`? |
| 3 | `role-context` | Does every Stage declare Role applicability, and are the four Role Context templates materialized (`.opsv/bootstrap/`, when a project root is given)? |
| 4 | `review-iterate-sync` | Is Review → iterate+sync reachable (a review-action Skill or a Stage completion `document_status_approved`)? |
| 5 | `recommended-not-whitelist` | Is any `recommended_capabilities` entry misused as a hard gate/completion token? |
| 6 | `constraint-layering` | Is every declaration attributable to the workflow / toolset / spec-constraint layers, with each layer present? |

Final judgement rules:

- **Check 1 vocabulary is normalized**: lowercase, `-`/`_` equivalent, a trailing `_doc`/`_document` suffix on input names and a `-vN` version suffix on contract names are ignored (`shotlist_doc` resolves to the `shotlist` Category/Stage, `shotref_doc` to the `shotref-doc-v1` contract). An **unresolved input name is a warning, not a failure** — Stage inputs declare goals, and user-provided or externally produced inputs (e.g. `user_script_text`) are legitimate goals no Pack document can provide.
- **Category-less Packs** are legal: a production-only Pack has no documents to review, so check 4 requires a review *surface* (review-action Skill or downstream review) and reports a **warning**, not a failure, when none exists. Packs that do export Categories and declare no review path **fail** check 4.
- The report's `ok` is true when no check failed — **warnings never block**. Every finding is located to a pack-root-relative file and, whenever locatable, a 1-based line.

---

**Language**: All spec documentation is written in **English**.
