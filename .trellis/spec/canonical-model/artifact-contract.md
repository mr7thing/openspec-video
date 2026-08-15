# Artifact Contract

> The contract that decides *"what becomes an asset"*. It does not prescribe how an artifact is generated — it prescribes what an artifact must satisfy to be registered as an OPSV asset through the **Commit Boundary**.

---

## 1. The Commit Boundary

```text
External work (Agent / Skill / API / ComfyUI / Blender / human Photoshop)
   │  produces a file
   ▼
opsv commit <artifact> --task <taskId>      ← the ONLY gate into OPSV
   ▼
Resolve task → load Artifact Contract (task.contract or category default)
   ▼
Validate: type / duration tolerance / codec / resolution / provenance
   ├── accept  → Artifact Record written → Asset State = candidate
   └── reject  → structured errors returned; nothing is written
```

Analogy: like `git commit`, `opsv commit` is a state transition, not a file copy. An agent can produce anything outside OPSV; only committed artifacts become OPSV assets. `opsv import` is the normalization variant for artifacts that need task / timeline / reference attribution inferred before commit.

## 2. Contract Shape (v1)

Declared in `profiles/<profile>.yaml` under an `artifact:` block; the Core built-in minimal contract is the default when a profile declares none.

```yaml
# profiles/<profile>.yaml
artifact:
  contract: video-shot/v1
  output:
    type: video
  required: { uri: true, media_info: true, provenance: true }
  validation:
    - duration: { tolerance: 0.1 }        # vs the task's expected duration
    - codec:    { allowed: [h264, h265] }
    - resolution: { min: { w: 1280, h: 720 } }
  metadata: { provider: optional, model: optional, prompt: optional }
```


## 2.1 Typed Decode and Resolution

- `ArtifactContractSchema` is strict at the contract, `output`, `required`, validation-rule, and nested rule-object boundaries. Unknown hard-contract fields are rejected before Document compilation; `output.type` must be non-empty.
- Schema defaults make omitted `required`, `validation`, and `metadata` explicit. Runtime resolution then calls `loadArtifactContract(profile.artifact)` once, merging the typed declaration over `DEFAULT_ARTIFACT_CONTRACT`.
- `resolveDocumentContract()` always returns `{source: 'profile' | 'builtin', value: ArtifactContract}`. `source: 'builtin'` is required when the Profile omitted `artifact`; a downstream compiler must never apply an unlabelled fallback.
- For production Profiles, a non-wildcard `artifact.output.type` must also be declared in `outputs`; otherwise Profile decode fails before Snapshot/provider compilation.
- The Canonical Snapshot stores the resolved value plus `canonicalDigest(value, 'artifact-contract', 1)`. The digest domain is distinct from prompt/task contract-reference domains.

## 3. Validation Rules

| Rule | Behavior |
|------|----------|
| `type` | must match the contract's `output.type`; mismatch → reject |
| `duration` | compare artifact mediaInfo duration against task expectation within `tolerance`; out of tolerance → reject |
| `codec` | allowed set; only enforced when ffprobe is available (see degradation) |
| `resolution` | minimum bounds; enforced when mediaInfo is available |
| `provenance` | `actor` + `capability` required; `provider/model/prompt` optional unless the contract marks them required |

**ffprobe degradation**: codec/resolution checks depend on ffprobe availability. If ffprobe is missing, those checks downgrade to `warn` **unless** the contract marks them `required: true` — in that case commit fails with an explicit `ARTIFACT_PROBE_UNAVAILABLE` infrastructure error (fail-closed for required probes, per the three-state valid/invalid/infrastructure rule).

## 4. Reject Response (structured errors)

```json
{
  "status": "rejected",
  "asset": null,
  "errors": [
    { "rule": "duration", "expected": 4, "actual": 5.7 },
    { "rule": "codec", "expected": ["h264", "h265"], "actual": "av1" }
  ]
}
```

The agent sees exactly what failed and re-runs / re-generates / re-commits. `opsv commit --force` may override, but it must record a `review_override` entry (`{human, reason}`) in the Transition Log — never a silent override.

## 5. `opsv import` (Normalization Layer)

For artifacts produced outside a task context:

```text
External artifact / intent
   │ opsv import ./foo.mp4
   ▼
Normalizer: infer type → resolve refs (ask, or same-dir conventions) →
            normalize timeline → validate schema
   ▼
Canonical Spec → Asset State (candidate)   (reuses commit validation)
```

`import` collects task attribution (`task`, `timeline`, `references`) and then runs the same Artifact Contract validation as `commit`. It is distinct from `iterate` (which clones an existing OPSV task); `import` introduces an external artifact.

## 6. Implementation Notes

1. `cli/src/canonical/artifacts/ArtifactContract.ts` — schema + loader; `ArtifactValidator.ts` — validator.
2. `commands/commit.ts` and `commands/import.ts` are thin command faces over these modules.
3. Media-info probing via ffprobe where available; never hard-fail the pipeline on a probe-capable check that was not marked required.
