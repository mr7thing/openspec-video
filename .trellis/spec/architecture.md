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
- Pack Stack resolution is locked in `.opsv/pack-lock.yaml` (schema v2: manifest + content digests).

## Work Packet and NextAction (contract v2)

A Work Packet (`core/WorkPacket.ts`, `contractVersion: 2`) aggregates profile, primary skill + gates, refs, circle, effective policy, pack provenance (`contentDigest`), and issues for one asset. Its machine contract is the structured **NextAction** (`core/NextAction.ts`): `draft | materialize | circle | compile | sync | blocked`.

- The Skill manifest `action` is the source of truth for workflow profiles — never guessed from `profile.kind`.
- `compile` always carries a project-root-relative `manifest` + asset selector; multiple circles → `CIRCLE_AMBIGUOUS`; any blocking issue → `blocked` (never "issue + executable action").
- The rendered shell command (`renderNextActionCommand`) is a derived display. Future Hook adapters and the AgentRouter must consume the structured action, never parse command strings.
- Policy merges through `core/PolicyLattice.ts` only: projects tighten, never loosen; loosening attempts block the packet with `PROJECT_POLICY_LOOSENS_PACK`.

## Standard Roles and the Injection Channel (2026-08-09)

OPSV Core fixes four atomic roles (Packs will only declare `required | optional | not_applicable` per Stage — the stage schema lands in Phase C of `docs/OPSV_IMPROVEMENT_PLAN_FROM_TRELLIS_ANALYSIS_2026-08-09.md`):

| Role | May | Must not |
|------|-----|----------|
| `document-author` | create/modify Asset Documents | self-approve |
| `contract-checker` | read-only validation, emit issue codes | write |
| `production-dispatcher` | advance `produce`/`run`, coordinate external capability | replace `produce` |
| `asset-quality-reviewer` | advise against Pack quality guidance | replace user Review/Approve |

Injection channel (stage A, Claude Code first): `opsv hook install|uninstall --platform claude` (`src/commands/hook.ts`) copies hook templates from the **installed package** (`cli/templates/hooks/`, shipped via `package.json files`, located with `require.resolve` — never the repo checkout) into `.claude/hooks/` and registers SessionStart / UserPromptSubmit / PreToolUse groups in `.claude/settings.json`.

- The settings.json merge manages only OPSV-identified groups (command contains `.claude/hooks/opsv-`; scripts carry an `# OPSV-MANAGED-HOOK` marker). Foreign groups (e.g. Trellis) are preserved byte-identically; conflicts warn instead of rewriting. Uninstall rolls back to the pre-install shape; no OPSV block → `HOOK_NOT_INSTALLED`, exit 1.
- Standalone rule: OPSV runtime code and hook scripts must never read `.trellis/` — Trellis is an optional dev-workflow overlay, not an OPSV dependency.
- Breadcrumb semantics (borrowed from Trellis, source-verified): state hooks exit 0 on every path; visibility travels in `additionalContext` content, never in exit codes. Hard blocking belongs to PreToolUse gates on real actions, not to per-turn breadcrumbs.

## Two Change Mechanisms: Short-Range Iterate vs Long-Range Plan Revision (2026-08-10)

Execution Records (`.opsv/execution/<id>/`) follow the plan lifecycle `create → planning → validate → start → running → completed/blocked` (`opsv exec create|validate|start|complete|block`). Changes to the work happen through **two strictly separate mechanisms** (analysis §8.2); confusing them corrupts both.

### Short-range: `iterate + review + syncing` (unchanged)

Local user guidance on one task or Artifact: modify the Task JSON → `opsv iterate` → run → review → approve modified task → syncing → Agent writes back the Asset Document → `opsv sync`. This is the normal production loop. It **never modifies the long-range plan and never emits `plan_revision` events** — its facts are `review`/`syncing` events (when an Execution Record exists) plus the document frontmatter and Git history it already owns.

### Long-range: Plan Revision (`opsv exec revise`)

Retrospective change to the long-range intent after execution history exists: long-term goal, stage dependencies, or scope changed. `revise` advances `plan-v<N> → plan-v<N+1>`:

- **Explicit version reference.** The appended `plan_revision` event carries `fromVersion`/`toVersion`; the revision is linear (`toVersion = fromVersion + 1`). `plan.json` (v1) and every `plan.v<N>.json` snapshot are **immutable** — a revision writes a new snapshot and appends an event; it never silently rewrites plan-v1, and the event log only grows.
- **Declared-rule impact analysis only.** The affected-stage set is computed exclusively from: the structural plan diff, plan `dependsOn` edges of the old plan, the Pack Workflow Graph (bootstrap manifest nodes), explicit profile input relations, and Pack/Contract/Bootstrap digest changes (`checkBootstrapStale`). An impact scope that no declared rule can resolve **blocks the revision** (`EXECUTION_PLAN_REVISION_UNRESOLVED`) unless a human confirms it with `--allow-unresolved` — confirmed scopes are recorded on the event (`unresolved`). Impact is never guessed from prose or "the newest file".
- **Reopened stages.** The event lists `affectedStages` and `reopenedStages` (affected stages with recorded progress). The reducer resets reopened stages to `open`/`pending` (attempt history preserved); a blocked execution revised with reopened stages returns to `running`. The revised plan starts unvalidated (`planValidatedVersion: null`).
- **Does not bypass the Asset Document lifecycle.** Plan Revision records long-term intent and impact scope; the concrete changes still land through the document workflow or the short-range `iterate + review + syncing` loop above.

Like all OPSV runtime code, both mechanisms are standalone: they read `.opsv/` and project docs only, never `.trellis/`.

## Status of the Blueprint

`docs/OPSV_ARCHITECTURE_BLUEPRINT_2026-07-18.md` is the agreed design direction with an 8-step implementation order. Current code (`videospec` v0.17.1) already implements the core of it (document contract, refs/variants, circles, packs, work packets, review/approve/sync). Where code and blueprint differ, **the code is the truth for specs** — the blueprint is direction, not documentation of current behavior.

Flagged open ambiguities (from the ubiquitous language doc): `@FRAME:` durable provenance contract; exact Profile syntax for workflow prerequisites.
