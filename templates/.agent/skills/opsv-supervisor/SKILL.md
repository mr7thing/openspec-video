---
name: opsv-supervisor
description: Supervisor/QA execution manual. Defines inspection standards for asset reconciliation, dead link scanning, concept bleeding alerts, and payload assertions for the Supervisor Agent.
---

# OpsV Supervisor — Execution Manual (v0.4.3)

This manual defines the automated inspection standards for the `Supervisor Agent`. Following the principle of "Eliminating Mechanical Labor," the director will no longer manually verify directory structures or YAML data.

## Invocation Rules

When the human director enters the following Slash Commands, you are activated to perform "Execution-style" audits:

- `/opsv-qa act1`: Asset manifest reconciliation (Post-Screenwriting).
- `/opsv-qa act2`: Link and placeholder scanning (Post-Review).
- `/opsv-qa act3`: Concept bleeding and jump-cut pre-audit (Post-Storyboarding).
- `/opsv-QA act4`: Engine configuration audit (Check `api_config.yaml`).
- `/opsv-qa final`: Payload and injection testing (Post-Compilation).

---

## QA Routines

### 1. Asset Manifest Audit (`/opsv-qa act1`)
**Actions**:
1. Read all `.md` files in `videospec/elements/` and `videospec/scenes/`.
2. Extract their YAML `name: "@entity_name"`.
3. Read the `Asset Manifest` in `videospec/project.md`.
**Check (PASS/FAIL)**:
- [ ] Are all files in the directory registered in `project.md`? Report any "unregistered entities."
- [ ] Are there duplicate entity names?

### 2. Link & Placeholder Verification (`/opsv-qa act2`)
**Actions**:
Extract all image links `[Name](Path)` within `Script.md` or asset files.
**Check (PASS/FAIL)**:
- [ ] Do the extracted system paths exist on disk (size > 0 bytes)?
- [ ] Are all `@entity` tags in `Script.md` hyperlinked to their definition files?
- [ ] Are "Visual Gallery" placeholders correctly formatted?

### 3. Concept Bleeding Alert (`/opsv-qa act3`)
**Actions**:
Scan `videospec/shots/` storyboard files.
**Check (PASS/FAIL)**:
- [ ] Search for appearance words (e.g., "blue eyes", "black coat") following an `@entity_name`. Flag these as **Concept Bleeding** attempts.

### 4. Payload Assertion (`/opsv-qa final`)
**Actions**:
Read the compiled `queue/jobs.json`.
**Check (PASS/FAIL)**:
- [ ] Assert that `global_style_postfix` and `aspect_ratio` from `project.md` are injected at the end of every prompt.
- [ ] Cross-check that the `attachments` path matches the correct source path for the first `@entity` mentioned in the prompt.

---

## Reporting Format

Output results using a traffic light 🚦 system:
- `🟢 PASS: Everything is tightly aligned.`
- `🔴 FAIL: Detected 2 unregistered entities: @xxx, @yyy.`

---

## 中分参考 (Chinese Reference)
<!--
定义监制质检执行手册：资产对账、死链扫描、特征泄漏预警。
act1: 资产清单结构完整性。
act2: 坏链、占位符核查。
act3: 特征越界/偷渡预警。
final: Jobs.json 风格注入与参考图对齐断言。
-->
