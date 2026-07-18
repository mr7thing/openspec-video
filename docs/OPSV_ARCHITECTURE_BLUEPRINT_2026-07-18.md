# OPSV Architecture Blueprint

Status: agreed design direction (2026-07-18)

## Purpose

OPSV is an asset-production runtime and Agent workflow protocol. It lets projects combine versioned Packs to define different asset-production work while keeping asset identity, provenance, execution, review, and Agent behavior consistent.

OPSV is not a generic project manager and not a full declarative creative-workflow engine. Packs define domain workflow and skills; OPSV Core enforces runtime facts and executes production.

## Design Principles

1. Every generated Asset has one source-of-truth Asset Document.
2. A document represents one stable Asset identity, not one output file.
3. Artifacts, Tasks, Circle plans, and document history are append-only from an Agent's perspective.
4. Agents never delete documents, tasks, Circles, or Artifacts. `delete: never` is a Core invariant.
5. The CLI, not prose, enforces rules that affect correctness.
6. Packs describe domain rules; Project configuration chooses and constrains them.
7. The Agent receives a small Work Packet for its current action, not a monolithic manual.

## Domain Model

| Term | Meaning |
| --- | --- |
| Asset Document | Source of truth for one Asset's specification, references, review record, and approved results. |
| Production Asset Document | An Asset Document with a production Profile that compiles to a Task. |
| Workflow Document | A document with a workflow Profile that guides document creation but does not compile to a Task. |
| Profile | A category-scoped operation profile. It is either `workflow` or `production`. |
| Production Task | Immutable execution request resolved from a document, Profile, Project binding, and Pack lock. |
| Artifact | Concrete output from a Task. It is not the Asset identity. |
| Approved Reference | An explicitly approved Artifact recorded under a unique Variant. |
| Reference | A media input supplied to a generation operation. |
| External Reference | A Reference to another Asset's approved output. It may create a Circle execution dependency. |
| Design Reference | A local reference in the current document. It does not create a Circle dependency. |
| Circle | Immutable, user-scoped task scheduling snapshot. It owns Task and Artifact history. |
| Work Packet | CLI-derived Agent context: candidate action, constraints, one primary Skill, and required gates. |

## Document Contract

Every Asset Document has a concise Core envelope:

```yaml
id: luran
category: character
status: drafting
refs: {}
review: []
```

- `id` is stable and short. It does not carry category, sequence position, or version attributes.
- `category` is the asset type and selects the Pack contract. Do not introduce `asset_type`.
- A category supplies a default Profile. A document writes `profile` only when it overrides that default.
- Pack contracts add domain fields without changing the Core envelope.

### Lifecycle

```text
drafting --approve original Task--> approved
drafting --approve revised Task--> syncing --synchronize--> approved
```

- `drafting`: document is still under creation or review.
- `approved`: document and its chosen Approved References are safe for external consumption.
- `syncing`: an approved revised Task exists, but the document has not yet been freely reconciled with it.
- Review is an action, not a lifecycle state.

## Profiles and Configuration

### Profile kinds

```yaml
profiles:
  shotlist:
    kind: workflow
    skill: create-shotlist

  i2v:
    kind: production
    capability: continuous-i2v
    outputs: [video, first, last]
```

- A `workflow` Profile defines document-creation prerequisites and its primary Skill. It has no Task.
- A `production` Profile describes one execution capability, allowed references, expected outputs, and Profile-specific validation.
- One production Profile maps to one Task and one Provider/workflow invocation. A workflow may emit many Artifacts.
- Cross-API production chains use multiple Asset Documents and External References, not hidden multi-call Profiles.

### Configuration layers

```text
OPSV Core
  universal runtime semantics

Pack
  category contracts, Profiles, workflow rules, Skills, templates

Project
  Pack Stack, capability bindings, derived Profiles, policies, defaults

Asset Document
  category, optional Profile override, domain specification, refs

Task
  resolved Pack-qualified Profile, lock summary, Provider/workflow snapshot
```

- A Pack Profile targets a named capability rather than a hard-coded Provider.
- Project configuration binds a capability to an `api_config` model/workflow.
- Projects derive a Profile with `extends`; they do not silently overwrite a Pack Profile.
- Pack Stack resolution is locked in `.opsv/pack-lock.yaml`; each Task records the lock summary.

### Project configuration

`.opsv/project.yaml` is the project production entry point. It declares Pack Stack order, derived Profiles, capability bindings, action policy, and project defaults. Existing API, validation, and input-type configuration can be migrated into this model without compatibility constraints.

## References and Circle Scheduling

### Reference forms

| Form | Meaning | Circle effect |
| --- | --- | --- |
| `@id` | External Asset Reference when target has exactly one Approved Reference | Dependency if target must be generated |
| `@id:variant` | Explicit external Approved Reference | Dependency if target must be generated |
| `@:key` | Local Design Reference | No dependency |
| `@FRAME:` | Shotsdeck continuity directive, valid only for an enabled Profile | No generic ref or Circle behavior |

### Variant rules

1. No approved output: external use is invalid.
2. One approved output: `@id` and `@id:variant` are valid.
3. Two or more approved outputs: only `@id:variant` is valid.
4. Variants are non-empty, unique, and never reused.
5. A replacement creates a new Variant and records `supersedes`; it never overwrites or deletes the old Variant.

### External versus local references

- `refs` only describes generation references. It is not a general document-workflow relation.
- An External Reference creates a Circle execution dependency only when the referenced Asset needs production before its output is available.
- A Materialized Reference is a provenance-preserving conversion from an external approved Artifact to a local Design Reference. It removes the Circle dependency.
- `@id` requires the target Asset Document to exist. If a source document is missing, its retained Artifact can only be used through an explicitly attached Design Reference.
- A Syncing Asset blocks all new external consumption until it is synchronized. Unrelated production can proceed.

### Circle

- A Circle is a user-selected execution scope, created from explicit directories or documents.
- It schedules only Production Asset Documents and derives batches from External References.
- It is not a document-generation workflow and does not interpret Shotlist plans.
- Circle creation creates a new immutable snapshot when specifications or references materially change; old Circles and Artifacts remain.
- Default Circle scope is configuration, not code: command selector > project default > user default > shipped default.

## Review, Approval, Iteration, and Sync

### Commands

```text
opsv review feedback <output> --note <text>
opsv review revise <asset> --note <text>
opsv approve <output> --variant <name> [--supersedes <old>]
opsv iterate <task>
opsv sync <asset>
```

- `review` records feedback or a revision request. It never grants formal approval.
- `approve` selects one Artifact and gives it a semantic Variant. It is the only command that creates an Approved Reference.
- Remove `opsv approved`; directory scanning must never auto-approve all matching outputs.
- `iterate` is deliberately flexible: Agents may change any runnable Task payload to explore a specific asset design without re-entering the document-to-compile flow.
- An approved revised Task enters `syncing`. Before the agent reconciles the document, OPSV commits a local Git snapshot of that document only.
- `sync` validates the freely updated document, commits it locally, and moves it to `approved`. It does not reverse-compile payloads or restrict how the Agent edited the document.

## Workflow Documents and Materialization

### Short-drama Pack terms

```text
Script -> Shotlist -> Clip documents -> Shot documents -> Shotsdeck
```

- A **Shotlist** is a Workflow Document. It owns narrative order and the Clip/Shot structure.
- A **Clip** is a continuous planned segment. Its Profile can generate frame references, video, or both.
- A **Shot** is one AI video generation node. It may consume Clips, storyboard, character, scene, or other permitted references.
- A **Shotsdeck** is a Production Asset Document. It orders Shots, supports continuous first/last-frame creation, and may generate an Artifact.
- `@FRAME:` is retained only as a Shotsdeck Profile convenience for continuous i2v creation.

### Machine-readable plan

A Shotlist contains natural-language planning plus a concise structured plan:

```yaml
plan:
  - shot: arrival
    clips: [door-open, pause]
  - shot: departure
    clips: [turn-away]
```

- IDs are stable and have no category prefix or positional meaning.
- Array order expresses sequence; reordering does not rename IDs.
- The Pack's explicit `materialize` operation creates or reconciles derived Clip and Shot documents.
- Materialization updates only structure it owns. It never deletes documents, overwrites prompt/profile/refs/review, or removes historical Artifacts.
- `work check` detects plan drift and offers `materialize`; it is never an automatic file-save side effect.

## Packs and Skills

### Pack shape

```text
pack.yaml
categories/<category>.yaml
profiles/<profile>.yaml
graph.yaml
skills/<skill>/skill.yaml
skills/<skill>/SKILL.md
```

- `pack.yaml` is an index with name, version, dependencies, and exports.
- Category, Profile, workflow graph, and Skill definitions remain separate to minimize context and merge conflicts.
- First-stage Packs are declarative only. They do not carry arbitrary executable code.
- Complex reusable operations become Core capabilities before a trusted plugin mechanism is considered.

### Skills

- A canonical Skill has a small machine-readable manifest and one `SKILL.md`.
- The manifest declares category, Profile, action, preconditions, required CLI gates, completion state, and auxiliary references.
- A Work Packet selects exactly one primary Skill. Supporting materials are loaded only when required.
- OPSV synchronizes platform-specific discovery shims from the canonical Pack Skill; business rules are never duplicated per Agent platform.

### Action policy

Pack defaults may be tightened by Project configuration:

```yaml
policy:
  draft: auto
  compile: auto
  execute: ask
  approve: human
  sync: auto
```

`work` reports the current action policy. `delete: never` cannot be loosened.

## Agent Command Surface

| Command | Role |
| --- | --- |
| `opsv validate` | Deterministic document and configuration validation; suitable for CI. |
| `opsv work check <asset>` | Workflow check: resolved contract, refs, Circle, syncing, policy, and candidate action. |
| `opsv work next` | Candidate Work Packets grouped by hard blockers, executable production, workflow work, and optional creation. |
| `opsv work plan` | Read-only current execution and workflow view. |
| `opsv pack ...` | Resolve, inspect, lock, install, and synchronize Packs. |
| `opsv materialize <workflow-doc>` | Pack-declared, safe derivation of production document structure. |
| `opsv circle ...` | Create and inspect immutable execution snapshots. |

`work next` does not choose creative priority for the user. Core identifies hard blockers and available actions; Pack recommends; Agent or user chooses.

## Storage and Provenance

```text
Git: documents, Packs, configuration, Task metadata, review, provenance
Artifact Store: images, video, audio, large execution output
```

- The default Artifact Store can remain the local ignored queue.
- Git LFS, object storage, or shared storage are optional Artifact Store backends.
- Git tracks Artifact paths, hashes, producing Task, approval decision, and source document history. It need not store large binaries.

## Implementation Order

1. Establish the canonical reference analyzer and its variant rules; remove first-result selection for multi-reference Assets.
2. Redesign Circle around external-reference execution dependencies and configurable scope; separate it from workflow document creation.
3. Add Pack Stack resolution, lock files, Project bindings, category/profile contracts, and canonical Skill manifests.
4. Add `work` Work Packets, `materialize`, and workflow-profile support.
5. Replace approval/review semantics, remove `approved`, and implement syncing plus local-Git-backed synchronization.
6. Implement short-drama Pack contracts for Shotlist, Clip, Shot, Shotsdeck, and Profile-scoped `@FRAME:`.
7. Add integration fixtures proving references, Circle batching, profile checks, materialization, approval variants, syncing, and Work Packet selection agree.
8. Retain the previously identified provider media resolver, execution-lifecycle, and prepared-job refactors as later locality improvements.

## Explicit Non-Goals

- No generic task tracker maintained separately from Asset Documents.
- No arbitrary Pack code execution in the first stage.
- No global DAG for authoring workflow prerequisites.
- No automatic approval by output filename scan.
- No Agent deletion capability.
- No ordinary Git requirement for large Artifacts.
