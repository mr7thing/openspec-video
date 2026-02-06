# Workflow: Generate Storyboard

This workflow orchestrates the end-to-end process of generating a storyboard from a script.

## Steps

### 1. Build Job Queue
Launch the terminal and run the generation command to parse the latest scripts.
```bash
npx opsv generate
```
> **Verify**: Check that `project-demo/queue/jobs.json` is created or updated.

### 2. Execute Batch Generation
Proceed to run the **Executor Workflow** to process the generated jobs.
> Ref: `.antigravity/workflows/executor.md`

1. Open `project-demo/__antigravity/workflows/executor.md` and follow the instructions.
2. Ensure you are using the `browser_subagent` to login and generate images.

### 3. Review Artifacts
Once execution is complete:
1. List files in `project-demo/artifacts/`
2. Update the `videospec/stories/storyboard/` directory with the new images if approved.
