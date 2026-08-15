# Capability Contract

> OPSV asks *"what capability do you have?"*, not *"what skill do you have?"* A Skill is one implementation of a Capability. The Capability Registry is a **read-only view** over existing configuration — it adds no new storage and no third execution registry.

---

## 1. Contract Shape

```yaml
capability:
  id: video.generate        # semantic capability, NOT a provider
  version: 1
  input: { type: opsv.shot }          # a Canonical type
  output: { type: artifact.video }    # an artifact type
```

| Field | Meaning |
|-------|---------|
| `id` | stable semantic capability name, e.g. `video.generate`, `image.generate`, `audio.tts`, `video.edit` |
| `input` | the Canonical type a task must express before this capability applies |
| `output` | the artifact type this capability produces |

The existing `ProfileContract.capability` value (e.g. `video-generation`) is retained as `declared`; v1 resolves it to a semantic id such as `video.generate`. The alias/type maps and compatibility decision are owned only by `core/PackContracts.ts`; the Capability Registry imports them and remains a projection, not a second source of mapping truth.

## 2. Data Sources (read-only, no new storage)

The registry is computed from existing configuration:

1. `cli/.opsv/api_config.yaml` → `models:` registry: `provider`, `type` (`imagen|video|audio|comfy|webapp`), capability flags (`supports_reference_images`, `max_reference_images`, `supports_first_image`, …).
2. `.opsv/project.yaml` → `bindings:` (capability → model key).
3. Pack `recommended_capabilities` (soft guidance, never a whitelist — conformance check 5).

No new YAML files, no DB. The registry is a projection.

## 3. `opsv capabilities`

```text
opsv capabilities            # human-readable: capability → provider bindings
opsv capabilities --json     # { "video.generate": { "available": bool, "providers": [...] } }
```

An agent starts by discovering what it can do; OPSV does not need to know *how* a capability is implemented (Skill, MCP, REST, CLI, ComfyUI).

## 4. Validation

- A capability's explicit `input` / `output` types must match known Canonical types. An unrecognized type fails with `CAPABILITY_CONTRACT_INVALID`.
- Known specialized model types fail closed when clearly incompatible with the resolved semantic capability: for example `imagen` cannot satisfy `continuous-i2v → video.generate`; resolution reports `CAPABILITY_MODEL_INCOMPATIBLE` before Snapshot/provider compilation.
- `comfy` and `webapp` are generic transports and cannot be rejected from `model.type` alone. Unknown capability ids, unknown model types, or a missing model configuration remain compatibility-preserving at this resolution layer; later availability/execution checks may still reject them.
- Binding lookup first uses the Profile's declared capability and may fall back to its resolved semantic id. The resolved value records `{declared, id, boundModel?, provider?, modelType?}`.
- `recommended_capabilities` is never part of this validation path and never acts as a whitelist.

## 5. Relationship to the Provider Registry Debt

- `08-02-provider-registry-cleanup` (converge the dual compiler/executor registries) remains a separate debt. The Capability Registry does **not** add a third execution registry — it reads existing config and exposes a view.
- Compilers still resolve through the existing `TaskBuilder` compiler map / `Container` executors; capability resolution is a planning/validation layer above them.

## 6. Implementation Notes

1. `cli/src/core/PackContracts.ts` — `CAPABILITY_ALIASES`, `MODEL_TYPE_TO_CAPABILITY`, `resolveCapabilityId`, compatibility checks, and resolved binding ownership.
2. `cli/src/canonical/capabilities/CapabilityRegistry.ts` — read-only projection and compatibility re-exports; `commands/capabilities.ts` — command face.
3. `input`/`output` types reference `cli/src/canonical/schema/` type names.
4. Keep `recommended_capabilities` soft: it informs the Work Packet, it never blocks (`recommended-not-whitelist` conformance check).
