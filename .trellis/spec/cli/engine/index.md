# CLI (opsv engine) Guidelines

> Coding guidelines for `cli/` — the TypeScript package published as `videospec` (binary `opsv`). This is the core engine: it parses Markdown Asset Documents, validates them, compiles them into provider Tasks, and executes those Tasks against AI APIs.

---

## Guidelines Index

| Guide | Description |
|-------|-------------|
| [Directory Structure](./directory-structure.md) | Module map of `cli/src/`, entry point, command registration |
| [Document Pipeline](./document-pipeline.md) | parse → validate → compile → execute data flow, provider contracts |
| [Config System](./config-system.md) | Three-tier config, `.env` loading, project root resolution |
| [Error Handling](./error-handling.md) | `OpsVError` taxonomy, dual-channel logging, JSONL task logs |
| [Testing](./testing.md) | Jest conventions, fixture patterns, trusted example tests |
| [Quality Guidelines](./quality-guidelines.md) | Coding conventions, known anti-patterns, deprecated surfaces |

---

## Before You Code In `cli/`

1. Read [Directory Structure](./directory-structure.md) to find the owning module — do not create new top-level `src/` folders without checking the map.
2. If you touch commands, providers, config, or errors, read the matching guide above.
3. Follow the domain vocabulary in `../../architecture.md` (Asset Document, Task, Artifact, Circle, Variant). Do not invent synonyms like "asset_type" or "job document".

---

## Verification Commands

```bash
cd cli
npm run build    # tsc + copy review-ui assets; must pass before commit
npm test         # jest --passWithNoTests
```

Note: `npm run lint` works again — baseline is 0 errors / ~87 warnings of documented debt; keep errors at 0 and do not grow the warning count.

New command surface (2026-08, stage A): `opsv work context` and `validate --inline` are specced in [Document Pipeline](./document-pipeline.md); `opsv hook install|uninstall` and the four standard roles in [architecture.md](../../architecture.md) §Standard Roles and the Injection Channel.

---

**Language**: All spec documentation is written in **English**.
