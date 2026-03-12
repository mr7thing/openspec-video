---
name: opsv-apply-change
description: Implement changes defined in a proposal. Reads the proposal and executes tasks to modify assets or scripts.
---

# OpsV Apply Change Skill

Use this skill when the user wants to "apply" a proposal or a set of changes to the video project.

## Workflow

1.  **Identify Proposal**:
    - Look in `videospec/changes/` for the relevant markdown file.
    - If no specific proposal is named, ask the user or pick the most recent.

2.  **Read & Plan**:
    - Read the proposal file.
    - Identify the **Action Items** or **Tasks** listed.

3.  **Execute (Loop)**:
    - For each task (e.g., "Update K's coat to black"):
        1.  Locate the target asset (e.g., `videospec/elements/K.md`).
        2.  Modify the content using `replace_file_content` or `write_to_file`.
        3.  **Mark as Done**: Update the proposal file (`- [ ]` -> `- [x]`).

4.  **Verify**:
    - If assets were modified, suggesting running `opsv generate` to refresh the job queue.

## Guardrails
- **Visual Consistency**: If changing a visual trait, remind the user that the Reference Image might need updating.
- **Reference Integrity**: If renaming an ID, check `Script.md` for broken references.
