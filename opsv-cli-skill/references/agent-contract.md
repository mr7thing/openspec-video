# OPSV Agent Contract

## Asset Document

```yaml
---
id: stable-semantic-id
category: clip
profile: clip-keyframe
status: drafting
refs:
  image:
    "@look-library:night": [reference/look-night.png]
---
```

`id` is globally unique and carries no category, position, or version attribute.
`category` selects allowed Profiles. `profile` may select an allowed override.

## Reference Forms

| Form | Meaning | Circle edge |
| --- | --- | --- |
| `@id` | One approved external output | Yes |
| `@id:variant` | Explicit approved external output | Yes |
| `@:key` | This document's Design Reference | No |
| `@FRAME:...` | Profile-scoped continuity reference | Profile-defined |

Use a Variant whenever the target Asset has more than one Approved Reference. The target
document records those outputs under `## Approved References`:

```markdown
## Approved References

![day](reference/look-day.png)
![night](reference/look-night.png)
```

`refs` never contains Music, Concept, Shotlist, or another workflow prerequisite merely
to describe authoring order. A Profile and its canonical Skill define that relation.

## Lifecycle

```text
drafting --approve original task--> approved
drafting --approve revision--> syncing --sync--> approved
```

Use `opsv approve <output> --variant <semantic-name>`. An approved Asset is safe for
external consumption. A `syncing` Asset is blocked for consumption until `opsv sync`.

## Command Selection

| Need | Command |
| --- | --- |
| Validate documents | `opsv validate` |
| Resolve one next action | `opsv work check <asset>` |
| See available work | `opsv work next` |
| Create Pack-declared production docs | `opsv materialize <workflow-doc>` |
| Capture execution schedule | `opsv circle create ...` |
| Record chosen output | `opsv approve <output> --variant <name>` |
| Reconcile approved revision | `opsv sync <asset>` |
| Link Pack Skills for an agent platform | `opsv pack sync-skills --platform agents` |

## Do Not Do

- Do not delete documents, tasks, circles, artifacts, or prior output.
- Do not use `opsv approved`.
- Do not substitute a plain file path for an Approved Reference.
- Do not omit a Variant when target outputs are multiple.
- Do not make a global authoring DAG from `refs`.
