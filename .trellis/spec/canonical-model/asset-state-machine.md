# Asset State Machine

> The artifact-side lifecycle that enforces *"OPSV controls what becomes an asset"*. Documents keep their existing lifecycle; the state machine governs artifacts. Every legal transition is recorded in an append-only Transition Log; every illegal transition is rejected.

---

## 1. Two Layers (keep them distinct)

| Layer | States | Owner | Authority |
|-------|--------|-------|-----------|
| **Document lifecycle** (existing, unchanged) | `drafting → syncing → approved` | Asset Document frontmatter | document is the source of truth |
| **Asset state machine** (new) | `draft → candidate → review → approved → released`, `review → rejected → candidate`, `approved → superseded` | `.opsv/state/<asset>.jsonl` + events | Transition Log is the artifact-side truth |

Coordination rule: the document lifecycle is the *author-side* fact; the asset state machine is the *artifact-side* fact. `opsv approve` advances both sides from **one implementation** — never two copies of the logic. A `review revise` produces a `rejected` / `candidate` artifact without touching the document status until `opsv sync`.

## 2. Transition Matrix (v1)

| from | to | trigger | illegal counter-example |
|------|----|---------|--------------------------|
| draft | candidate | `commit` accepted | `approved → generating` (rejected) |
| candidate | review | submitted for review | `approved → review` (re-review requires `supersede` first) |
| review | approved | `approve` | `released → draft` (rejected) |
| review | rejected | `review reject` | `generating → approved` (rejected) |
| rejected | candidate | `iterate` / re-`commit` | `draft → released` (rejected) |
| approved | superseded | new variant declares `supersedes` | — |
| approved | released | `release` (or Pack policy) | — |

Semantics that matter:

- **`approved → generating` is illegal.** Once approved, an artifact must be `superseded` before a replacement enters the pipeline. This enforces "approval is a state, not a step".
- **`review → rejected → candidate` is the normal revision loop.** A rejected artifact returns to `candidate` through `iterate` or a fresh `commit` — nothing is deleted (append-only).
- **`approved → superseded`** aligns with the existing `supersedes` variant marker (`## Approved References` + `<!-- opsv:supersedes=old -->`). The old artifact remains traceable; a new variant takes its place.

## 3. Transition Log Contract

Stored at `.opsv/state/<asset>.jsonl` — append-only, git-trackable, same storage philosophy as `.opsv/execution/`.

```json
{
  "asset": "shot-023",
  "artifact": "shot-023:v4",
  "from": "review",
  "to": "approved",
  "actor": { "type": "human", "id": "user@example.com" },
  "reason": "looks good",
  "review": "review-928",
  "timestamp": "2026-08-14T10:00:00.000Z"
}
```

Rules:

1. A state change is legal **only if** a matching Transition Log entry exists. There is no silent status mutation.
2. The log is append-only; entries are never edited or removed.
3. Concurrency uses the same advisory lock / seq reconciliation pattern as `.opsv/execution/` (`core/execution/lock.ts`, `seq.ts`).
4. The derived projection (current state per asset) is recomputed from the log; the log is the truth.

## 4. Implementation Notes

1. `cli/src/canonical/state/AssetStateMachine.ts` owns the transition matrix; `TransitionStore.ts` owns the log + projection.
2. Wire `opsv approve` to write the Transition Log (one implementation, dual-side update).
3. Reuse the `.opsv/execution/` lock/seq helpers — do not write a third concurrency mechanism.
