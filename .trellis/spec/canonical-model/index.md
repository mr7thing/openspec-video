# Canonical Model Guidelines

> The OPSV **Canonical Model** is the intermediate representation (IR) between the Authoring DSL (Markdown / `@ref` / Timeline) and the OPSV Runtime (Asset State Machine, Commit Boundary, Compile, Review). It is the single machine contract that every downstream consumer reads. Grounded by the 2026-08-14 refactor plan (`docs/OPSV_CANONICAL_RUNTIME_REFACTOR_PLAN_2026-08-14.md`).

---

## Guidelines Index

| Guide | Description |
|-------|-------------|
| [Canonical Types](./canonical-types.md) | Full schema of `CanonicalAsset / CanonicalDocument / CanonicalTimeline / CanonicalSegment / CanonicalReference / CanonicalArtifact / CanonicalReview` and the mapping to existing types |
| [Reference DSL v2](./reference-dsl-v2.md) | `@[ns:]id[.selector][:variant][[state]]` grammar, selector allowlist, backward-compat matrix |
| [Asset State Machine](./asset-state-machine.md) | Two-layer lifecycle, transition matrix, Transition Log contract |
| [Artifact Contract](./artifact-contract.md) | `opsv commit` / `opsv import` boundary and artifact validation |
| [Capability Contract](./capability-contract.md) | `capability: {id, input, output}` registry and `opsv capabilities` |

---

## What the Canonical Model Is

In the five-layer target architecture, the Canonical Model is **Layer 3 — the only contract**:

```text
Agent / Human (not controlled)
        │  Authoring / Actions
        ▼
OPSV Authoring Layer (Markdown / @ref DSL / Timeline DSL / H3)   ← language, not overturned
        │  parse / normalize
        ▼
OPSV Canonical Model (Project / Asset / Shot / Segment / Task /
                      Dependency / Timeline / Reference / Constraint /
                      Artifact / Review)                          ← this directory
        ▼
OPSV Runtime (Asset State Machine / DAG / Version / Provenance /
              Validation / Commit Boundary / Capability Registry)
        ▼
Review Runtime (Review Protocol / Canvas / 3D / Timeline)
```

OPSV strongly controls Layers 3–5. Layers 1–2 are language and entry points only; OPSV does not control how an agent thinks or how a Skill implements a capability.

## Non-Negotiable Invariant

> **The Canonical Model is always derived from the Asset Document. It is never a second authority over the document.**

- A document is the single source of truth. Canonical assets must round-trip: `document → Canonical → document` loses no information (fixture assertions in `cli/src/canonical/__tests__/RoundTrip.test.ts`).
- Nothing writes the document back from the Canonical Model except the explicit `opsv sync` (a user-invoked reconciliation), per the existing `syncing` lifecycle.
- If a consumer needs a field, extend the Authoring DSL and the Parser — do not add a parallel store.

## Relationship to Existing Specs

| Spec | Relationship |
|------|--------------|
| [`../architecture.md`](../architecture.md) | Domain vocabulary, Core invariants (`delete: never`, append-only, three-tier config, standalone). The Canonical Model adds an IR layer but inherits every invariant. |
| [`../cli/engine/document-pipeline.md`](../cli/engine/document-pipeline.md) | parse → validate → compile → execute. The Canonical Model sits between parse and validate/compile: the Parser produces it, Validator/Compiler consume it. |
| [`../packs/authoring/pack-format.md`](../packs/authoring/pack-format.md) | Pack contract. `profiles/<profile>.yaml` gains an `artifact:` block (Artifact Contract) and `selectors:` (Reference DSL v2) without breaking existing fields. |

## Core Terms (cross-reference `../../..//UBIQUITOUS_LANGUAGE_2026-07-18.md`)

| Term | Definition |
|------|-----------|
| **Canonical Model** | The IR produced by parsing Asset Documents; the machine contract for Runtime and Review consumers. |
| **Canonical Asset** | One Asset's canonical projection: document structure + timeline + refs + artifacts + reviews + state. |
| **Asset State Machine** | The artifact-side lifecycle (`draft → candidate → review → approved → released`, plus `rejected` / `superseded`) enforced by a Transition Log. |
| **Commit Boundary** | `opsv commit` / `opsv import` are the only gates at which an external artifact becomes an OPSV asset. |
| **Artifact Contract** | Validation rules (`type / duration tolerance / codec / resolution / provenance`) an artifact must satisfy to be accepted. |
| **Capability Registry** | A read-only view over existing config exposing `capability → provider` bindings. |

## Before You Code In `cli/src/canonical/`

1. Read [Canonical Types](./canonical-types.md) — do not invent a new field name that a spec already covers.
2. If you touch parsing, read [Reference DSL v2](./reference-dsl-v2.md) — the `RefSyntaxParser` token class currently excludes `.` on purpose; selector allowlist is the only sanctioned way to add member access.
3. Follow the existing domain vocabulary (`category`, `Asset Document`, `Production Task`, `Artifact`, `Variant`). Never introduce synonyms like `asset_type`.

## Verification Commands

```bash
cd cli
npm run build    # tsc + copy review-ui assets; must pass before commit
npm test         # jest --passWithNoTests; baseline 597+ must stay green
npm run lint     # errors = 0; warnings must not grow
```
