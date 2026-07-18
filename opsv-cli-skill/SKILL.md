---
name: opsv-cli-skill
description: Operate an OPSV asset-production project. Use when an agent must inspect, create, validate, materialize, schedule, compile, approve, synchronize, or iterate an OPSV Asset Document or Pack.
---

# OPSV CLI Operator

Treat the Asset Document as the source of truth for one asset's specification,
generation references, review record, and approved results. Run the CLI from the
project root. Read [agent-contract.md](references/agent-contract.md) before writing
frontmatter or a reference.

## Start Every Asset Action

```bash
opsv work check <asset>
```

Follow its one primary Skill, gates, action policy, binding, and candidate command.
Use `opsv validate` for document/schema validation; use `opsv work check` for
workflow readiness. Do not infer a production workflow from a document's location.

For a new project or a changed Pack Stack:

```bash
opsv pack list
opsv pack lock
opsv pack sync-skills --platform agents
```

Discovery shims only link to canonical Pack Skills. Never copy business rules into
`.agents/` or `.codex/` shims.

## Required Operating Rules

- Do not delete Asset Documents, Tasks, Circles, Artifacts, or output history.
- Do not call generation APIs directly. Let OPSV compile and execute the selected Task.
- Do not use the removed `opsv approved` command or filename scanning for approval.
- Approve one selected output with a semantic Variant:
  `opsv approve <output> --variant <name>`.
- After an approved revision enters `syncing`, freely reconcile the Asset Document,
  then run `opsv sync <asset>`. Do not reverse-compile a payload.
- `opsv iterate` is a focused conversation path for a runnable payload. It may change
  its payload freely; the next asset action resolves any `syncing` state first.

## References And Scheduling

`refs` contains only media supplied to generation. Workflow/document prerequisites
belong to the selected Profile and Skill, never to `refs`.

- `@asset` or `@asset:variant` is an external Approved Reference.
- With two or more approved outputs, `@asset:variant` is mandatory.
- `@:name` is this document's Design Reference and creates no Circle dependency.
- `@FRAME:` is valid only when the selected Profile enables it.
- A Materialized Design Reference deliberately removes the external scheduling edge.

Create or inspect a Circle only for external-reference execution ordering. A Circle is
an immutable Task snapshot; it does not represent authoring workflow prerequisites.

## Workflows

For a workflow document, use the Work Packet's `materialize` action. It creates only
missing production documents declared by the Profile. Write actual generation `refs`
only after selecting real reference assets. Empty `refs` is valid when no media is
being supplied to a model.

For a production document, resolve the packet's blockers, create a Circle if requested,
then compile with its bound model. Respect `draft`, `compile`, `execute`, `approve`,
and `sync` policy values. `delete: never` cannot be relaxed.

## Pack Authors

Use the `opsv-skills-creator` Pack to create or revise a Pack. A Pack exports categories,
Profiles, and canonical Skill manifests; it must not add arbitrary executable pipeline
code. Run its contract checks before publishing a Pack change.

## Verification

At the narrowest useful scope, run:

```bash
opsv validate --dir <document-directory> --max-depth -1
opsv work check <asset> --json
```

Report blockers precisely. Never manufacture approved references or a successful review
to bypass a gate.
