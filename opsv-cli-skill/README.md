# OPSV CLI Skill

The agent-facing entry point is `SKILL.md`. It directs every asset action through
`opsv work check`, then follows the selected canonical Pack Skill.

Read `references/agent-contract.md` for Asset Document, reference, lifecycle, and command
contracts. Install this folder in the agent's normal Skill discovery path. Pack-provided
Skills are synchronized through:

```bash
opsv pack sync-skills --platform agents
```
