# Pack Format

> How a Pack is structured. Source of truth: the Declarative Pack Contract (`opsv-packs/opsv-skills-creator/references/pack-contract.md`) and the canonical skeleton (`opsv-packs/opsv-skills-creator/assets/pack_template/`). The cleanest in-repo example is `packs/short-drama/`.

---

## Directory Layout

```text
pack.yaml                     # the ONLY export index
categories/<category>.yaml
profiles/<profile>.yaml
skills/<skill>/skill.yaml     # machine manifest
skills/<skill>/SKILL.md       # agent-facing instructions (frontmatter: name, description)
```

Optional but common: `references/`, `guides/`, `contracts/`, `scripts/` (validation helpers — **not** pipeline stages), `graph.yaml` (category dependency DAG), `.opsv/` (validation config templates), `README.md`. Older full packs also carry `manifest.json` + `SKILL_PACK.md` (legacy agent-framework metadata).

Hard rules:

- `pack.yaml` is the only export index — every name exported there must resolve to a real file in the pack.
- **Packs are declarative.** No arbitrary executable code as a pipeline stage; deterministic reusable logic belongs in OPSV Core (`cli/`). Validation helpers under `scripts/` (e.g. `opsv-mv-pipeline/scripts/mv-check.js`) are run explicitly, not as stages.
- Export paths must stay inside the pack root — `../`, absolute paths, and symlinks resolving outside are rejected (`PACK_EXPORT_OUTSIDE_ROOT`, enforced by `resolveContainedReal` in `cli/src/utils/pathSecurity.ts` via `resolvePackExportPath`).

## Identity Closure (enforced by `opsv pack check`)

Every exported Category/Profile/Skill must form a closed graph — violations fail closed (never degrade to empty gates):

- Profile `skill:` → an exported `skills:` key.
- Skill `profile:` → an exported `profiles:` key; Skill `category:` → an exported `categories:` key (review-type skills with `action: review` may omit both).
- Skill Profile must be in its Category `profiles:` allow-list; Category `default_profile` must be exported and inside its own allow-list.
- Use ONE canonical identity per skill across `skills:` key, Profile `skill:`, and directory name (mixed `mv-*` / `opsv-mv-*` namespaces caused review finding F3).
- Profile `capability` must be abstract — strings that look like concrete provider/model keys (e.g. `rh-workflow-v2.*`) are rejected (`PACK_CAPABILITY_CONCRETE_MODEL`). Skill docs must never prescribe `--model <concrete>` execution paths; guard this with a static test in the pack (see `opsv-mv-pipeline/test/no-concrete-models.test.js`), not long-term manual grep.
- Unexported files under `categories/`, `profiles/`, `skills/` are reported as `PACK_ORPHAN_FILE` warnings — they never enter runtime resolution.

Schemas live in `cli/src/types/PackSchemas.ts` (the single decode path); cross-file rules in `cli/src/core/PackChecker.ts` with stable issue codes (`PACK_*`).

## graph.yaml — Stage Contract (2026-08-10)

`graph.yaml` nodes accept two shapes (backward compatible):

- **Legacy**: a dependency array (`shot: [script]`), normalized to `dependsOn` at consumption.
- **Stage object** (`StageNodeSchema` in `PackSchemas.ts`): `inputs`, `outputs.contract`, `completion` (`output_exists | output_contract_valid | document_status_approved`), `quality_guidance` (string or list, must stay inside the pack root), `roles`, `recommended_capabilities`. All fields optional; unknown top-level keys pass through.

The three Pack responsibility layers made explicit:

| Layer | Fields | Enforcement |
|-------|--------|-------------|
| Workflow | graph/stages/profiles: stage inputs/outputs/completion | structural |
| Toolset | `skills`, `recommended_capabilities` | soft recommendation — **never a whitelist**; user/external tools producing contract-satisfying artifacts stay legal |
| Spec constraints | categories / document contracts / gates | hard validation |

`roles` declares per-stage applicability of the four Core roles (`STAGE_ROLES` ≡ `WORK_CONTEXT_ROLES`): `document-author`, `contract-checker`, `production-dispatcher`, `asset-quality-reviewer` — each `required | optional | not_applicable`. Illegal values or unknown role keys fail `opsv pack check` with the stable code `PACK_STAGE_INVALID`; the schema is strict on role keys so typos fail closed.

Consumption: `resolveDocumentContract` (`core/PackContracts.ts`, `loadGraphStages`) reads stages leniently (runtime never throws on graph content — validation belongs to `pack check`); the stage view surfaces in `opsv work context --json` (`manifest.stage`) and drives `ROLE_NOT_APPLICABLE` on `work context --role`.

## Migrating a Legacy graph.yaml (2026-08-10)

Minimal steps to move a dependency-array `graph.yaml` onto the Stage Contract:

1. **Keep the edges byte-identical.** Rewrite each `node: [deps]` array as a mapping whose only change is `depends_on: [deps]` — same nodes, same order, same direction. The dependency DAG is the one thing migration must not alter (the `opsv-multi-ref-pipeline` migration changed +123/-5 lines with edges byte-identical).
2. **Add the Stage Contract fields per node**: `inputs` (use the document vocabulary: Category names, `<stage>_doc` stems, Profile input slots, or `outputs.contract` stems — user-provided/external goals such as `user_script_text` are allowed and only warn in conformance), `outputs.contract` (`<name>-vN`), `completion` (a subset of `output_exists | output_contract_valid | document_status_approved`), and `roles` (declare **all four** Core roles as `required | optional | not_applicable`). Optionally `quality_guidance` (paths must stay inside the pack root) and `recommended_capabilities` (soft — never referenced by gates/completion).
3. **Decide which Stages own an Asset Document.** `document-author: required` only on Stages whose output is a document in `videospec/`; production-only upstream Stages get `document-author: not_applicable` and record review evidence through a review-action Skill or the downstream Pack's review path.
4. **Verify**: `opsv pack check . --json` must report 0 errors; `opsv conformance . --json` must report no failed check (warnings are acceptable — see the six-check judgement rules in [Packs Guidelines](./index.md#conformance--the-six-checks-2026-08-10)).

Backward compatibility:

- Legacy arrays remain legal input — `loadGraphStages` normalizes them to `{ dependsOn }`, and both shapes may coexist in one file.
- All Stage fields are optional; missing fields inherit the legacy lenient behavior, so unmigrated Packs keep passing `pack check`.
- Runtime consumption never throws on graph content; only `pack check` / `conformance` report `PACK_STAGE_INVALID` and matrix findings.
- Stage fields do not change pack digests semantics, but any behavior-file edit changes `content_digest` — projects with a v1 lock see `PACK_LOCK_LEGACY` and must re-run `opsv pack lock`.

Fix pattern — mv-3d-ref (a Stage that owns a document needs its Category/Profile closure):

```yaml
# pack.yaml — export the Category the document-owning Stage is named after
categories: { render: categories/render.yaml }
profiles:   { render-to-real: profiles/render-to-real.yaml }

# categories/render.yaml
default_profile: render-to-real
profiles: [render-to-real]

# profiles/render-to-real.yaml — abstract capability, NEVER a model name
kind: production
capability: image-to-video
skill: render-to-real
outputs: [video]
```

The graph node for a document-owning Stage must be named after an exported Category (`render`), backed by a production Profile with an abstract capability; the upstream Stages (`style-references`, `clay-keyframes`) own no documents, so they declare `document-author: not_applicable` and keep review evidence in the handoff manifest. Migrating without this closure surfaces as `PACK_SCHEMA_INVALID` on `pack check`.

## pack.yaml

Example shape (from `opsv-packs/opsv-multi-ref-pipeline/pack.yaml`):

```yaml
id: opsv-multi-ref            # stable id; projects reference it in .opsv/project.yaml
version: 1.0.0
dependencies: []
policy:                       # Action Policy: agent autonomy per lifecycle step
  draft: auto                 # auto | ask | human
  compile: auto
  execute: ask
  approve: human
  sync: auto
  delete: never               # if present, MUST be `never` (enforced at load)
categories: { shot: categories/shot.yaml }
profiles:   { shot-video: profiles/shot-video.yaml }
skills:     { create-shot: skills/create-shot/skill.yaml }
```

Project configuration may **tighten** the policy, never loosen it. `delete: never` cannot be overridden — history is append-only.

## categories/*.yaml

```yaml
default_profile: shot-video
profiles: [shot-video]        # eligibility: which profiles this category allows
```

The category name is the user-facing `category:` value in Asset Documents. See `packs/short-drama/categories/shot.yaml`.

## profiles/*.yaml — two kinds

Production profile (`packs/short-drama/profiles/shot-video.yaml`):

```yaml
kind: production
capability: video-generation      # abstract capability, NEVER a model name
skill: create-shot
outputs: [video, first, last]
required_ref_categories: [storyboard]   # optional
frame_directive: true                    # optional; only this permits `@FRAME:` refs
```

Workflow profile (`packs/short-drama/profiles/shotlist.yaml`):

```yaml
kind: workflow
skill: create-shotlist
materialize:                         # creates MISSING docs only, never overwrites
  clips: { directory: videospec/clips, category: clip }
  shots: { directory: videospec/shots, category: shot }
```

- Profiles declare a **capability**, not a model. The project binds capability → model key in `.opsv/project.yaml` `bindings:` (resolution: `cli/src/core/PackContracts.ts` `resolveDocumentContract`; schema: `opsv-packs/opsv-skills-creator/references/project-yaml-shape.md`). A production profile without a matching binding blocks the Work Packet with `CAPABILITY_BINDING_MISSING`.
- Capability granularity follows the **input contract**: profiles with different reference inputs need distinct capabilities (one binding cannot select among different workflows — F6). E.g. `image-generation` (generic i2i/t2i) vs `two-reference-character-consistency` vs `scene-character-compositing`.
- Production profiles may declare ordered **`inputs:`** slots (`{ slot, category, ref_type, required }`; `cli/src/types/PackSchemas.ts` `InputSlotSchema`). Declaration order IS the reference order contract: the document's external refs under `refs[ref_type]` must match slots 1:1 in order. Violations block the packet: `PROFILE_INPUT_MISSING` (slot unfilled) / `PROFILE_INPUT_MISMATCH` (wrong category order or extra refs of a constrained type). Caveat: order between slots of the SAME category is not machine-distinguishable — document the intended order in prose for those.
- Projects derive profiles with `extends`; they never silently overwrite a pack profile.

## skills/*/skill.yaml + SKILL.md

Compile-type skill (`packs/short-drama/skills/create-shot/skill.yaml`):

```yaml
action: compile
category: shot
profile: shot-video
gates: [work-check, refs-valid, circle]
completion: task-compiled
```

Review-type skills omit `category`/`profile` and use domain gates (`packs/mv-3d-ref/skills/clay-keyframes/skill.yaml`):

```yaml
action: review
gates: [clay-previs-approved, style-references-approved, geometry-lock-prompt, overlay-reviewed]
completion: keyframes-approved
```

SKILL.md rules (from the pack contract):

- One canonical skill = one action surface; a Work Packet selects exactly one primary skill.
- Every SKILL.md must tell the agent to begin with `opsv work check <asset>`.
- SKILL.md explains domain decisions and correct document examples only. Do not duplicate command-layer knowledge (that lives in `opsv-cli-skill/`) or platform-specific install instructions.
- Platform discovery shims are generated by `opsv pack sync-skills --platform agents` and only **link** to the canonical pack skill — business rules are never copied per platform.

## Relationship to Projects and the CLI

- A project declares its ordered **Pack Stack** in `.opsv/project.yaml` (`packs: [{id, source}]`, `id` must equal the pack's `pack.yaml` `id`).
- `opsv pack lock` refuses to lock contract-invalid packs and writes `.opsv/pack-lock.yaml` **schema v2**: per pack `manifest_digest` (sha256 of `pack.yaml`) + `content_digest` (canonical tree hash over all behavior files: `pack.yaml`, exported manifests, `SKILL.md`, `scripts/`, `templates/`, `references/`, `validation/`) + per-file hashes. v1 locks (digest-only) raise `PACK_LOCK_LEGACY` — re-run `opsv pack lock`. Digest implementation: `cli/src/core/PackDigest.ts` (single owner; Hook cache keys must reuse it).
- Pack skills never name models — model selection is always project-side via `bindings:` + `.opsv/api_config.yaml`.

## Pre-Publish Verification

```bash
opsv pack check . --json          # 0 errors required; stable PACK_* issue codes
opsv pack lock
opsv pack sync-skills --platform agents
opsv work check <fixture-asset> --json
```

Plus the 5-point fixture contract from `pack-contract.md`: `work check` returns the right skill/binding; unapproved refs block; approved `@id:variant` unblocks; Circle orders producer-before-consumer; workflow materialization creates only missing docs.

If the pack ships validation rules (`.opsv/_category_validate.yaml`), document that the file must be **copied into the project's `.opsv/`** — `opsv init` only creates `.sample` files.
