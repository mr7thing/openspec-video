# Architecture & Domain Model

> Cross-layer orientation for OPSV. Terminology is agreed in `UBIQUITOUS_LANGUAGE_2026-07-18.md`; design direction in `docs/OPSV_ARCHITECTURE_BLUEPRINT_2026-07-18.md`. This file summarizes what holds **today** and points to the layer specs for details.

---

## What OPSV Is

An asset-production runtime and Agent workflow protocol. Markdown documents are source code; the CLI compiles them into provider API calls; outputs are versioned, traceable, never overwritten. Packs define domain workflow and skills; OPSV Core enforces runtime facts.

## Core Invariants (never violate)

1. Every generated Asset has exactly one source-of-truth Asset Document.
2. A document represents one stable Asset identity, not one output file.
3. Artifacts, Tasks, Circle plans, and document history are **append-only** from an Agent's perspective. `delete: never` is a Core invariant that cannot be loosened by any config layer.
4. The CLI, not prose, enforces rules that affect correctness.
5. Compile / Execute / Review are separate stages — inspect before running.
6. Approval is explicit (`opsv approve <output> --variant <name>`); no auto-approval by filename scan.
7. Three-tier config everywhere: built-in → `~/.opsv/` → `./.opsv/`.

## Ubiquitous Language (use these exact terms)

| Term | Meaning | Avoid saying |
|------|---------|--------------|
| **Asset Document** | Source of truth for one Asset: spec, refs, review record, approved references | spec file, descriptor |
| **Production Task** | Immutable execution request compiled from a document (`BaseTaskJson`) | job document |
| **Artifact** | One concrete output file from one Task; not the Asset identity | final asset |
| **Approved Reference / Variant** | An approved Artifact recorded under a unique Variant name | final file, index |
| **External Reference** (`@id[:variant]`) | Ref to another Asset's approved output; creates a Circle execution dependency | workflow input |
| **Design Reference** (`@:key`) | Local ref; no Circle dependency | external reference |
| **Circle** | Immutable, user-scoped execution snapshot that schedules Production Asset Documents | workflow plan |
| **Profile** | Category-scoped operation profile: `workflow` (guides authoring, no Task) or `production` (compiles to one Task) | preset, model choice |
| **Pack / Pack Stack** | Versioned declarative domain definition / the ordered set a project activates | plugin bundle |
| **Work Packet** | CLI-derived context for one allowed next action (`opsv work check`) | task document |
| **Category** | The asset type field in every Asset Document | asset_type |

Video terms: **Shotlist** (workflow planning doc) → **Clip** (continuous planned segment) → **Shot** (one AI video generation node) → **Shotsdeck** (orders Shots, frame continuity). `@FRAME:` is a Shotsdeck-continuity-only directive. "Beat" is deprecated — use **Clip**.

Full definitions: `UBIQUITOUS_LANGUAGE_2026-07-18.md`.

## How the Layers Fit

```text
Packs (declarative contracts)          Project (.opsv/project.yaml)
  categories / profiles / skills    +    Pack Stack, bindings, policy
                │                            │
                └──────────┬─────────────────┘
                           ▼
        cli/ (OPSV Core, TypeScript)
        parse → validate → compile → execute
                           │
              ┌────────────┼──────────────┐
              ▼            ▼              ▼
        REST providers  ComfyUI      extension/ (webapp provider:
        (Volcengine,    (local +     Chrome ext + daemon driving
         SiliconFlow,   RunningHub)  gemini.google.com)
         Minimax, RHapi)
```

- The CLI is the only component that enforces correctness rules. See [cli/](./cli/engine/index.md).
- The extension is the execution backend of the `webapp` provider and follows its own state-ownership rules. See [extension/](./extension/companion/index.md).
- Packs are declarative; projects bind capabilities to concrete models. See [packs/](./packs/authoring/index.md).

## Configuration Layers (strongest wins)

```text
OPSV Core      universal runtime semantics (cli/)
Pack           category contracts, Profiles, Skills, templates
Project        .opsv/project.yaml: Pack Stack, bindings, derived Profiles (extends), policy, defaults
Asset Document category, optional profile override, domain spec, refs
Task           resolved provider snapshot + pack lock summary
```

- A Pack Profile targets a named **capability**, never a hard-coded provider/model.
- Projects derive Profiles with `extends`; they never silently overwrite Pack Profiles.
- Pack Stack resolution is locked in `.opsv/pack-lock.yaml`.

## Status of the Blueprint

`docs/OPSV_ARCHITECTURE_BLUEPRINT_2026-07-18.md` is the agreed design direction with an 8-step implementation order. Current code (`videospec` v0.17.1) already implements the core of it (document contract, refs/variants, circles, packs, work packets, review/approve/sync). Where code and blueprint differ, **the code is the truth for specs** — the blueprint is direction, not documentation of current behavior.

Flagged open ambiguities (from the ubiquitous language doc): `@FRAME:` durable provenance contract; exact Profile syntax for workflow prerequisites.
