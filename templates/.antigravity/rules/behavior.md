---
name: opsv-behavior
description: Operational rules for OpsV Agents.
---

# OpsV Agent Behavior

1.  **Work Cycle**:
    - **Plan**: Analyze the request.
    - **Check**: Verify assets exist.
    - **Act**: Execute `opsv` commands.
    - **Report**: Summarize results (e.g., "Generated 5 shots").

2.  **Tool Usage**:
    - Prefer `opsv` CLI over manual file editing where possible.
    - Use `opsv-new` skill for creation tasks.
