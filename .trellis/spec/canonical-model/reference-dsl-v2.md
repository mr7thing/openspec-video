# Reference DSL v2

> The `@`-reference language upgraded from the current `RefSyntaxParser` token grammar to a `ReferenceExpression` AST with optional member selectors — while staying **fully backward compatible**.

---

## 1. Grammar

```text
@[namespace:]id[.selector][:variant][[state]]
```

| Form | Meaning | Example |
|------|---------|---------|
| `@id` | External Asset Reference (valid when target has exactly one approved output) | `@alice` |
| `@id:variant` | Explicit external Approved Reference | `@alice:v3` |
| `@:key` | Local Design Reference owned by the current document | `@:casual` |
| `@FRAME:shotId_first` | Shotsdeck continuity directive (Profile-scoped) | `@FRAME:shot_001_first` |
| `@id.selector` | **New**: member access into an approved artifact | `@alice.face`, `@shot-023.output` |
| `@id[state]` | **New**: state pin | `@scene.temple[approved]` |
| `@id.selector:variant[state]` | Combined (all optional parts) | `@alice.face:v2[approved]` |

## 2. Backward Compatibility Matrix

The current token class (`RefSyntaxParser.ts:24`) **explicitly excludes `.`** "to avoid swallowing trailing punctuation in prose". v2 must not break that.

| Existing form | v2 behavior |
|---|---|
| `@alice` | unchanged — `{namespace: 'asset', id: 'alice'}` |
| `@alice:v3` | unchanged — `{namespace: 'asset', id: 'alice', variant: 'v3'}` |
| `@:key` | unchanged — `{namespace: 'asset', id: '', selector/key: 'key'}` (doc/design kind) |
| `@FRAME:shotId_first` | unchanged — `{namespace: 'FRAME', id: 'shotId_first'}` |
| `@alice.walks` (selector not in allowlist) | **falls back to today's behavior** — parses `@alice`, leaves `.walks` as prose punctuation |
| `@shot.output` (no allowlist declared) | falls back — `@shot` + `.output` prose |

## 3. Selector Allowlist (the only sanctioned member access)

Member selectors resolve **only** when a Pack declares them. No selector is hard-coded in Core.

```yaml
# packs/<id>/pack.yaml or profiles/<profile>.yaml
selectors:
  - face          # approved reference's face image
  - costume       # approved reference's costume shot
  - output        # a task's final output artifact
  - first         # first frame
  - last          # last frame
```

Parsing rule: after `@id`, a `.` is treated as a selector **only if** the following identifier is in the active allowlist (from the resolved Pack stack). Otherwise the `.` retains its existing "trailing punctuation in prose" semantics. This keeps every existing document valid.

Mechanism parity: the allowlist is a declaration layer exactly like `input_types` / `categories` — resolved through the Pack stack, never a second registry.

## 4. Parse Chain

```text
text / frontmatter refs
   │  RefExpressionParser (v2 grammar + allowlist)
   ▼
CanonicalReference[]  (AST)
   │  ReferenceResolver (deterministic)
   ▼
Dependency Graph  (reuses DependencyGraph.ts batch / cycle logic)
```

- Dependency edges come from the AST deterministically — **never guessed by an LLM**.
- `@id:variant` pinning rules (0/1/2+ approved variants) and `@FRAME:` Profile-scoped rules from the architecture blueprint remain unchanged.
- The `raw` field on every `CanonicalReference` preserves the exact original text for round-trip.

## 5. Implementation Notes

1. Extend `RefSyntaxParser` in place — do not fork a second parser. The v2 grammar is a superset.
2. The allowlist lookup is the *only* new behavior that changes parse outcomes; gate it behind the allowlist being present.
3. New parser must keep passing every existing `RefSyntaxParser` / `RefBinder` test case verbatim.
4. `RefEngine` (`core/RefEngine.ts`) stays the facade for the ref subsystem.
