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

The existing `ProfileContract.capability` value (e.g. `video-generation`) is retained as the capability name. v1 provides an alias table mapping pack/profile capability names to the semantic `video.generate` style where useful — the alias table is a declaration, not a new registry.

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

- A capability's `input` / `output` types must match known Canonical types. An unrecognized type fails with `CAPABILITY_CONTRACT_INVALID`.
- A project binding that points a capability at a model whose `provider`/`type` cannot satisfy the capability's output fails the same way (fail-closed for hard contracts; `recommended_capabilities` stays advisory).
- Unknown capability id in a binding → `CAPABILITY_UNKNOWN`.

## 5. Relationship to the Provider Registry Debt

- `08-02-provider-registry-cleanup` (converge the dual compiler/executor registries) remains a separate debt. The Capability Registry does **not** add a third execution registry — it reads existing config and exposes a view.
- Compilers still resolve through the existing `TaskBuilder` compiler map / `Container` executors; capability resolution is a planning/validation layer above them.

## 6. Implementation Notes

1. `cli/src/canonical/capabilities/CapabilityRegistry.ts` — projection over config; `commands/capabilities.ts` — command face.
2. `input`/`output` types reference `cli/src/canonical/schema/` type names.
3. Keep `recommended_capabilities` soft: it informs the Work Packet, it never blocks (`recommended-not-whitelist` conformance check).
