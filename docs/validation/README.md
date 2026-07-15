# OpsV Category Validation System (v0.11.0+)

Machine-readable validation contracts for OpsV documents. Decouples "what fields exist" (Zod schema) from "what values are allowed" (category rules).

## TL;DR

```bash
# Quick start
mkdir -p /my/project/.opsv
cp /path/to/opsv-mv-pipeline/.opsv/_category_validate.yaml /my/project/.opsv/category_validate.yaml
cd /my/project
opsv validate
```

If `opsv validate` reports errors, fix them. If it reports a "Multiple configs found" error, you have a naming conflict — resolve it (see [Disambiguation](#disambiguation)).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [The Two Validation Layers](#the-two-validation-layers)
3. [Config File Discovery](#config-file-discovery)
4. [Writing a Category Validation Config](#writing-a-category-validation-config)
5. [Supported Rule Types (Generic Field Schema)](#supported-rule-types-generic-field-schema)
6. [Default Checks (Always-On)](#default-checks-always-on)
7. [Unknown Rules Handling](#unknown-rules-handling)
8. [Migration: from `_category_validate.yaml` to `category_validate.yaml`](#migration-from-_category_validateyaml-to-category_validateyaml)
9. [CLI Reference](#cli-reference)
10. [Examples by Use Case](#examples-by-use-case)
11. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ opsv validate <doc.md>                                          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Zod Schema (FrontmatterSchema.ts)                      │
│   - "Does this frontmatter have the REQUIRED FIELDS at all?"    │
│   - Hardcoded for: project, shot-design, shot-production        │
│   - All other categories use BaseFrontmatterSchema (loose)      │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼ (only if Layer 1 passed)
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: CategoryConfigDiscoverer + CategoryValidateLoader      │
│   - Discovers & loads <project>/.opsv/category_validate.yaml   │
│   - Applies category-specific rules from `field_schema`         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: CategoryValidator (this doc's focus)                   │
│   - Generic rule executor: type, enum, min, max, min_items...  │
│   - No field names hardcoded — rules come from config           │
│   - Unknown rules in config → warning (not silent)              │
└─────────────────────────────────────────────────────────────────┘
```

**Why two layers?** Zod is great for "this field must exist", but writing a Zod schema per category for every project is painful. Category rules are YAML — easier to author, copy from Skill Packs, and iterate.

---

## The Two Validation Layers

| Layer | Where | What it checks | Hardcoded? |
|---|---|---|---|
| **Zod Schema** | `cli/src/types/FrontmatterSchema.ts` | Required base fields per category (`status`, `refs`, etc.) | Yes (per category) |
| **Category Validator** | `cli/src/core/CategoryValidator.ts` + `category_validate.yaml` | Field types, enum values, length ranges, required items | **No — fully generic** |

**Key principle (v0.11.0+)**: The validator is fully generic. It has no idea what `camera_count` or `mood` means. Field names and business semantics come **only** from the YAML config. This makes the validator reusable across Skill Packs (MV Pipeline, Multi-Ref Pipeline, etc.) without code changes.

---

## Config File Discovery

The validator looks for a config file in two places:

| Location | Priority | Use case |
|---|---|---|
| `<projectRoot>/.opsv/category_validate.yaml` | **Highest** | Project-specific rules |
| `~/.opsv/category_validate.yaml` | Fallback | User-level global defaults |

### Filename Matching

The discoverer uses this regex:

```
^_?([a-z][a-z0-9]*[-_])?category_validate\.ya?ml$
```

**Accepted filenames:**

| Filename | Variant | Notes |
|---|---|---|
| `category_validate.yaml` | canonical | Recommended |
| `category_validate.yml` | canonical | Alternate extension |
| `_category_validate.yaml` | underscore-prefix | **Skill Pack convention** (works with warning) |
| `_category_validate.yml` | underscore-prefix | Skill Pack alternate |
| `opsv-category_validate.yaml` | other | Prefixed variants (e.g., per-Skill-Pack) |

**Rejected filenames** (will NOT be loaded):

- `category-validate.yaml` (wrong separator)
- `categoryvalidation.yaml` (no separator)
- `validate_category.yaml` (tokens in wrong order)
- `something_category_validate_other.yaml` (suffix after validate)
- `category_validate.txt` (wrong extension)

### Disambiguation

#### ✅ Single candidate

Found exactly one config → **load it**.

If it's a non-canonical name (e.g., `_category_validate.yaml`), a **warning** is printed:

```
[opsv validate] warning: Config filename "_category_validate.yaml" is non-canonical.
Consider renaming to category_validate.yaml for clarity.
```

The validator still uses the config — warnings don't block validation.

#### ⚠️ Multiple candidates (CONFLICT)

Found more than one config at the same level → **validation halts with exit code 2**.

```
[opsv validate] error: Multiple category validate configs found in project .opsv/:
  .opsv/category_validate.yaml, .opsv/_category_validate.yaml.
Resolve the conflict or use --category-config <path> to select one.

Resolve the category validate config conflict above before running validate.
```

**How to resolve:**

1. **Delete one** (if the duplicate is unintentional):
   ```bash
   rm /my/project/.opsv/_category_validate.yaml
   ```

2. **Rename one** to a prefix variant (e.g., `mv-mv-pipeline-category_validate.yaml`) — then both can coexist, with `category_validate.yaml` taking priority as canonical.

3. **Use `--category-config <path>` to be explicit**:
   ```bash
   opsv validate --category-config /my/project/.opsv/_category_validate.yaml
   ```
   This bypasses discovery and uses exactly the file you specified.

#### ❌ No candidates

Found no configs → no category rules are loaded. Only Zod schema + default checks (`prompt`, `brief`) run.

---

## Writing a Category Validation Config

### File Location

Create the file at:

```
<projectRoot>/.opsv/category_validate.yaml
```

### File Structure

```yaml
# Each top-level key is a category (matches `category:` in frontmatter).
# A category's value is a rule object with three sections:

<category-name>:
  # 1) Default-severity override for this category
  severity: error  # or "warning"

  # 2) Required fields that must exist (and not be empty)
  required_fields:
    - status
    - prompt
    - brief

  # 3) Per-field rules (the meat of the config)
  field_schema:
    <field-name>:
      type: integer        # type check
      min: 1               # numeric range
      max: 100
      enum: [a, b, c]      # allowed values
      min_length: 10       # string length lower bound
      max_length: 500      # string length upper bound
      min_items: 1         # array length lower bound
      max_items: 10        # array length upper bound
      must_include: [x]    # array must contain these values
      no_placeholder: true # reject TODO/FIXME/XXX/TBD
      severity: error      # per-field severity override

  # 4) Skip switches
  skip_prompt_check: false  # set true to disable default prompt check
  skip_brief_check: false   # set true to disable default brief check

  # 5) Refs ⇄ prompt bidirectional check
  refs_in_prompt_must_match_refs: true  # declare on `refs` field OR `prompt` field
```

### Minimal Example

```yaml
# /my/project/.opsv/category_validate.yaml

character:
  required_fields: [status, prompt, brief]
  field_schema:
    role:
      enum: [hero, heroine, villain, supporting]
    age:
      type: integer
      min: 0
      max: 999
```

### Full-Featured Example (MV Pipeline style)

```yaml
# Copy from opsv-mv-pipeline/.opsv/_category_validate.yaml and rename to category_validate.yaml

project:
  required_fields: [status]
  skip_prompt_check: true

concept:
  required_fields: [status, brief, prompt]
  severity: error
  field_schema:
    duration_ms:
      type: integer
      min: 10000
      max: 600000
      severity: error
    mood:
      type: string
      enum: [bright, dark, dreamy, intense, melancholy, upbeat]
    visual_mode:
      type: string
      enum: [cinematic, anime, realistic, illustrated]
    characters:
      type: array
      min_items: 1
    cast:
      type: array
      must_include: [hero, heroine]

music:
  required_fields: [status, brief, prompt]
  field_schema:
    duration_ms:
      type: integer
      min: 30000
      max: 600000
    lyrics:
      type: array
      min_items: 1
    tempo_bpm:
      type: integer
      min: 40
      max: 240
    segments:
      type: array
      min_items: 1
      must_include: [intro, verse, chorus]

shot:
  required_fields: [status, brief, prompt]
  field_schema:
    shot_type:
      enum: [wide, medium, close-up, extreme-close-up, tracking, aerial]
    duration_ms:
      type: integer
      min: 500
      max: 30000
    camera_count:
      type: integer
      min: 1
      max: 8
    refs:
      refs_in_prompt_must_match_refs: true
```

---

## Supported Rule Types (Generic Field Schema)

All rules below are **fully generic** — the validator doesn't care about field names. You can apply any rule to any field.

| Rule | Applies to | What it does | Example |
|---|---|---|---|
| `type` | any | Checks JSON type | `type: integer` |
| `enum` | any | Value must be one of the listed | `enum: [a, b, c]` |
| `min` | number | Numeric lower bound (inclusive) | `min: 1` |
| `max` | number | Numeric upper bound (inclusive) | `max: 100` |
| `min_length` | string | String length lower bound | `min_length: 10` |
| `max_length` | string | String length upper bound | `max_length: 500` |
| `no_placeholder` | string | Reject TODO/FIXME/XXX/TBD/placeholder | `no_placeholder: true` |
| `min_items` | array | Array length lower bound | `min_items: 1` |
| `max_items` | array | Array length upper bound | `max_items: 10` |
| `must_include` | array | Array must contain all listed items | `must_include: [hero, heroine]` |
| `refs_in_prompt_must_match_refs` | `refs` OR `prompt` | Bidirectional check: all `@tokens` in prompt must be in refs, and vice versa | `refs_in_prompt_must_match_refs: true` |
| `severity` | rule | Override default severity for this rule | `severity: warning` |

### Allowed `type` values

- `string`
- `integer`
- `number` (float OK)
- `boolean`
- `array`
- `object`

### Combining rules

You can put multiple rules on the same field — they're all checked:

```yaml
prompt:
  type: string
  min_length: 10
  max_length: 500
  no_placeholder: true
  severity: error
```

If any rule fails, the issue is reported with the rule that failed.

---

## Default Checks (Always-On)

Even with NO `field_schema` defined, these checks always run unless explicitly skipped:

| Field | Default check | Skip with |
|---|---|---|
| `prompt` | Required, length ≥ 10, no placeholder text | `skip_prompt_check: true` |
| `brief` | Recommended (warning), length ≥ 4 | `skip_brief_check: true` |

If you define `field_schema.prompt`, the default prompt check is **disabled** (your schema takes over). This is by design — your `min_length`/`max_length` overrides the default 10.

---

## Unknown Rules Handling

If your config contains a rule key the validator doesn't recognize, it produces a **warning** at load time:

```yaml
# BAD: "min_word_count" is not a supported rule
prompt:
  min_word_count: 10  # ← unknown rule
```

→ On `opsv validate`, you'll see:

```
[opsv validate] warning: unsupported rule: min_word_count (in field prompt)
```

The validator does NOT silently ignore unknown rules. If you see this warning, either:

1. **Remove the unknown rule** if you don't need it
2. **Use a supported rule** (see [Supported Rule Types](#supported-rule-types-generic-field-schema))
3. **File a feature request** if you think the rule should be supported

---

## Migration: from `_category_validate.yaml` to `category_validate.yaml`

### Why this matters

**Before v0.11.0**, OpsV looked for `category_validate.yaml` but Skill Packs distributed `_category_validate.yaml`. This naming mismatch meant rules were silently never loaded.

**After v0.11.0**, the discoverer accepts both. But **`category_validate.yaml` is recommended** because:

1. It's the canonical name (no warning printed)
2. It's what's documented everywhere
3. It's what `opsv pack init` will scaffold (future)

### Migrate in 3 steps

```bash
# 1. Rename
mv /my/project/.opsv/_category_validate.yaml /my/project/.opsv/category_validate.yaml

# 2. Verify no duplicates
ls /my/project/.opsv/category_validate.yaml  # should exist
ls /my/project/.opsv/_category_validate.yaml # should NOT exist

# 3. Run validate
cd /my/project && opsv validate
```

If you keep both, the discoverer will **refuse to run** with a conflict error — this is intentional, not a bug.

---

## CLI Reference

```bash
opsv validate [options]

Options:
  -d, --dir <paths...>           Directories to scan (default: videospec/scenes, shots, elements)
  --category <cat>               Only validate docs of this category
  --exclude <patterns...>        Exclude paths matching these patterns
  --max-depth <number>           Max scan depth (default: 1, -1=unlimited, 0=root only)
  --skip-category-rules          Skip ALL category_validate.yaml checks (only Zod schema runs)
  --category-config <path>       Use explicit config path (resolves conflicts; skips discovery)
  --strict                       Treat warnings as errors (non-zero exit)
  --circle [path]                Validate only docs in a specific circle
```

### Exit codes

| Code | Meaning |
|---|---|
| 0 | All docs valid |
| 1 | Validation errors found (Zod schema or category rules) |
| 2 | Config discovery failed (conflict, bad filename, missing explicit path) |

---

## Examples by Use Case

### Example 1: Copy from a Skill Pack

```bash
# Discover the MV Pipeline pack
ls /path/to/opsv-mv-pipeline/.opsv/

# Copy the validation config
cp /path/to/opsv-mv-pipeline/.opsv/_category_validate.yaml /my/project/.opsv/category_validate.yaml

# Validate
cd /my/project && opsv validate
```

### Example 2: Custom rules for a single project

```yaml
# /my/project/.opsv/category_validate.yaml

# Override default MV rules
shot:
  required_fields: [status, brief, prompt, refs]
  field_schema:
    shot_type:
      enum: [wide, medium, close-up]   # stricter than the pack
    duration_ms:
      type: integer
      min: 1000                         # longer than the pack's 500
      max: 15000
    camera_count:
      type: integer
      min: 1
      max: 4                            # my style uses few cameras
```

### Example 3: Resolve a conflict

```bash
# You have BOTH files (e.g., from two different Skill Packs)
ls /my/project/.opsv/
# _category_validate.yaml
# category_validate.yaml

# Pick one with --category-config
opsv validate --category-config /my/project/.opsv/_category_validate.yaml
```

### Example 4: Validate only one category

```bash
# Skip everything except `concept` docs
opsv validate --category concept
```

---

## Troubleshooting

### "Multiple category validate configs found"

You have two config files at the same level. Either delete one, rename one to a prefix variant, or use `--category-config <path>`.

### "Config filename does not match pattern"

Your filename doesn't match `^_?([a-z][a-z0-9]*[-_])?category_validate\.ya?ml$`. Common mistakes:

- `category-validate.yaml` (hyphen between tokens)
- `categoryvalidate.yaml` (no separator)
- `validate_category.yaml` (wrong order)
- `category_validate.json` (wrong extension)

### "Explicit --category-config filename does not match pattern"

You passed `--category-config /path/to/wrong-name.yaml`. Rename the file or pass a valid one.

### "Required field 'status' is missing or empty"

You forgot `status` in your frontmatter. Every OpsV doc needs it (it's in the Zod schema). Example:

```yaml
---
category: concept
status: drafting       # ← required
brief: ...
prompt: ...
---
```

### Warnings about "unsupported rule: xxx"

Your config uses a rule the validator doesn't know. Either remove it, replace with a supported rule, or file a feature request.

### "Validated: 0/0 files" but docs exist

The validator only scans default dirs (`videospec/scenes`, `videospec/shots`, `videospec/elements`) unless you specify `--dir`. Use `--dir <path>` to point at your docs:

```bash
opsv validate --dir /my/project/notes/
```

---

## See Also

- [Architecture Overview](../README.md) — how OpsV works
- [Skill Pack Authoring Guide](../../opsv-packs/opsv-skills-creator/SKILL.md) — how to author a Skill Pack with `_category_validate.yaml`
- [API Reference](../../cli/src/core/CategoryValidator.ts) — TypeScript implementation