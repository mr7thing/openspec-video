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

**Language**: All spec documentation is written in **English**.
