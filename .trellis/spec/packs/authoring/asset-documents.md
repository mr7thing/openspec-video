# Asset Documents

> The Markdown documents OPSV compiles. Source of truth: `opsv-cli-skill/references/agent-contract.md` (the reference-contract authority) and `UBIQUITOUS_LANGUAGE_2026-07-18.md`. Machine enforcement: Zod schemas in `cli/src/types/FrontmatterSchema.ts`.

---

## Frontmatter Contract

```yaml
---
id: stable-semantic-id        # globally unique; carries NO category/position/version info
category: clip                # selects the Pack contract and allowed Profiles
profile: clip-keyframe        # optional; only when overriding the category default
status: drafting              # drafting | approved | syncing
refs:                         # generation media ONLY — never workflow prerequisites
  image:                      #   outer key = input_type
    "@look-library:night": [reference/look-night.png]   # inner key = @id or @id:variant
---
```

- `id` is stable and short. Do not encode category, sequence, or version in it.
- The asset-type field is `category`. **Never introduce `asset_type`.**
- Approved outputs are recorded in the document body under `## Approved References` as `![variant](path)`.
- File naming: UTF-8, paired `---` frontmatter, 2-space YAML, `@` never appears in filenames. Circle scans only first-level `.md` files. See `opsv-packs/opsv-multi-ref-pipeline/references/file_spec.md` for the full convention set.

## Reference Syntax (hard rules)

| Form | Meaning | Circle dependency |
|------|---------|-------------------|
| `@id` | External Approved Reference; valid only when the target has exactly one approved output | Yes |
| `@id:variant` | Explicit external Approved Reference; **mandatory** when the target has ≥2 approved outputs | Yes |
| `@:key` | Local Design Reference owned by the current document | No |
| `@FRAME:...` | Shotsdeck continuity directive; valid only when the Profile sets `frame_directive: true` | Profile-defined |

- Variants are non-empty, unique, and never reused. A replacement creates a **new** Variant with `supersedes` recorded — never overwrite or delete the old one.
- `refs` as a flat array (`- "@id"`) is **deprecated and rejected by the compiler**.
- An External Reference requires the target Asset Document to exist; a retained Artifact without its source document can only be attached as a Design Reference.
- `refs` describes generation inputs only. Workflow prerequisites belong to Profiles/Skills, never `refs`.

## Lifecycle

```text
drafting --approve original Task--> approved
drafting --approve revised Task--> syncing --opsv sync--> approved
```

- Approval is explicit: `opsv approve <output> --variant <name>`. The older `opsv approved` form and any filename-scan auto-approval are deprecated/forbidden.
- A `syncing` Asset blocks all new external consumption until synchronized; unrelated production proceeds.
- Iteration uses `opsv iterate` (creates `_m{N}` task clones) — never edit or delete history. Agents never delete documents, tasks, Circles, or Artifacts.

## Validation Layers

| Layer | Where defined | Enforced by |
|-------|---------------|-------------|
| Hard contracts | `pack.yaml` `policy:`, `profiles/*.yaml` (`required_ref_categories`, `frame_directive`), `skills/*/skill.yaml` `gates:` | `opsv work check` via `cli/src/core/PackContracts.ts` (REF_MISSING / REF_UNAVAILABLE) |
| Soft field rules | `.opsv/category_validate.yaml` per category: `required_fields`, `field_schema` (`min_length`, `no_placeholder`, `min_items`, …), `skip_prompt_check` | `opsv validate` via `cli/src/core/CategoryValidator.ts`; unknown keys are warnings only |
| Arithmetic/semantic checks | Pack `scripts/` (e.g. `mv-check.js`) and review skills | Run explicitly; not pipeline stages |

Note: pack-shipped validation templates (`.opsv/_category_validate.yaml`) must be copied into the project's `.opsv/` — `opsv init` only creates `.sample` files.

## Anti-Patterns

- Do not put workflow ordering ("create shotlist before shots") into `refs` or the Circle — Circles schedule production only.
- Do not auto-create or auto-delete documents as a file-save side effect; drift detection is `work check`, reconciliation is the explicit `materialize` operation.
- Do not teach agents to delete anything; history is append-only (`delete: never`).
- Do not name models in pack skills or profiles — capabilities only; project `bindings:` map capability → model key.
