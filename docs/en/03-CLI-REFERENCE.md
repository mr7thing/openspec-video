# CLI Reference (v0.5)

## Command Overview

| Command | Description | Phase |
|---------|-------------|-------|
| `opsv init` | Initialize project structure | Setup |
| `opsv generate` | Compile documents to image generation jobs | Image Pipeline |
| `opsv gen-image` | Execute image generation (call APIs) | Image Pipeline |
| `opsv review` | Launch Review page service | Review |
| `opsv deps` | Analyze asset dependency graph | Analysis |
| `opsv animate` | Compile Shotlist to video jobs | Video Pipeline |
| `opsv gen-video` | Execute video generation (call APIs) | Video Pipeline |
| `opsv daemon` | Global background service management | Infrastructure |

## opsv init

Initialize OpsV project structure.

```bash
opsv init
```

## opsv generate

Compile Markdown documents into image generation jobs (`jobs.json`).

```bash
opsv generate                        # Compile all normative directories
opsv generate videospec/elements     # Compile specific directory
opsv generate -p                     # Preview mode (first shot only)
opsv generate --shots 1,5,12         # Specific shots
```

**v0.5 Changes**:
- Integrated DependencyGraph strict mode — unapproved dependencies are auto-blocked
- Integrated compile-time validation (quote sanitization, required field checks)
- Script.md parsed from body `## Shot NN` headers, not frontmatter `shots[]`
- Outputs batch-numbered `jobs_batch_N.json`

| Option | Description |
|--------|-------------|
| `-p, --preview` | Preview mode, first shot only |
| `--shots <list>` | Comma-separated shot IDs |

## opsv gen-image

Execute image generation jobs.

```bash
opsv gen-image                       # All enabled models
opsv gen-image -m flux-pro           # Specific model
opsv gen-image -m flux-pro,sdxl      # Multiple models
opsv gen-image --dry-run             # Validate only
opsv gen-image -s                    # Skip failed, continue
```

**v0.5 Changes**:
- New `--dry-run` mode for two-stage validation only
- Auto model-specific validation before API dispatch (pixel limits, aspect ratios, prompt length)
- Comma-separated multi-model specification

| Option | Description | Default |
|--------|-------------|---------|
| `-m, --model <model>` | Target model(s), comma-separated or "all" | `all` |
| `-c, --concurrency <num>` | Concurrency | `1` |
| `-s, --skip-failed` | Skip failed jobs | `false` |
| `--dry-run` | Validate only | `false` |

## opsv review

**v0.5 New**: Launch local Review page service.

```bash
opsv review                          # Default port 3456
opsv review -p 8080                  # Custom port
opsv review -b 3                     # Specific batch
```

Review Page Features:
- 📸 Candidate images grouped by job (multi-model comparison)
- ✅ Multi-select approve (custom variant name or auto-numbered)
- 📋 Format check (detect missing frontmatter fields)
- 🔄 Automatic `git commit`

Approve auto-executes:
1. Copy selected image to `artifacts/` with new name
2. Write-back `## Approved References` to source document
3. Update `status: approved`
4. Append `reviews` record
5. Execute `git add . && git commit`

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <port>` | Service port | `3456` |
| `-b, --batch <num>` | Batch number (default: latest) | latest |

## opsv deps

**v0.5 New**: Analyze asset dependencies and display recommended generation order.

```bash
opsv deps
```

## opsv animate

Compile Shotlist.md to video generation jobs.

```bash
opsv animate
```

**v0.5 Changes**: Uses `frame_ref` instead of `schema_0_3`. Removed `middle_image`.

## opsv gen-video

Execute video generation jobs.

```bash
opsv gen-video                       # All enabled video models
opsv gen-video -m seedance           # Specific model
```

| Option | Description | Default |
|--------|-------------|---------|
| `-m, --model <model>` | Target model | `all` |
| `-s, --skip-failed` | Skip failed jobs | `false` |

## Typical Workflow

```bash
opsv init                            # 1. Initialize
# Write documents (elements/*.md, scenes/*.md, Script.md)
opsv deps                            # 3. Analyze dependencies
opsv generate                        # 4. Compile jobs
opsv gen-image --dry-run             # 5a. Validate
opsv gen-image                       # 5b. Execute
opsv review                          # 6. Review & Approve
opsv animate                         # 7. Video pipeline
opsv gen-video                       # 8. Generate videos
```
