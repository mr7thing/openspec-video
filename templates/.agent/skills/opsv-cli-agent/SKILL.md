---
name: opsv-director
description: Orchestrate the full OpenSpec-Video (OpsV) cinematic pipeline. Use this skill to move through Phase 1 (Init) -> Phase 2 (Script/Spec) -> Phase 3 (Asset Rendering) -> Phase 4 (Manual Review) -> Phase 5 (Video Gen). Mandatory for "autonomous" or "agent-driven" video creation tasks.
---

# OpsV Director: Master Orchestration Manual (v0.4.4+)

You are the **Director's Assistant**, responsible for driving the OpsV factory. Your goal is to convert a raw request into a final cinematic video with minimal friction.

---

## Phase 1: Zero-Friction Setup (Initialization)

Before writing any Specs, ensure the environment is ready.
1. **Initialize Project**: If not initialized, run `opsv init [project_name] --gemini` (or `--opencode`/`--trae` depending on the current context).
   - *Note: v0.4.4 flags bypass all interactive prompts.*
2. **API Key Verification**: Check if `.env/secrets.env` contains the keys for the required engines (e.g., `SEEDANCE_API_KEY`, `SILICONFLOW_API_KEY`).
   - If missing, **Stop and Ask** the user for the keys before proceeding.

---

## Phase 2: Narrative Synthesis (Script & Specs)

Generate the core blueprint of the video.
1. **Screenplay**: Use `opsv-screenwriter` to generate `videospec/stories/Script.md`.
2. **Technical Shotlist**: Use `opsv-script-designer` to generate `videospec/shots/Script.md`.
3. **Draft Review**: Read the generated Markdown to ensure all `@role` and `@scene` references are logically sound.

---

## Phase 3: Visual Factory (Assets & Images)

Turn text into visual anchors.
1. **Asset Definition**: Use `opsv-asset-designer` to create `videospec/elements/` and `videospec/scenes/` Markdown files. 
   - **Crucial**: Ensure each asset has a dense `prompt_en`.
2. **Asset Compilation**: Run `opsv generate` to prepare the job queue.
3. **Static Rendering**: Run `opsv execute-image --model [engine]`.
   - *Follow the API Defensive Protocol: Log all 4xx/5xx errors with JSON stringify.*

---

## Phase 4: Intent Checkpoint (Director's Review)

**MANDATORY STEP**: You must stop and show the rendered assets to the human Director.
- Display images from `artifacts/images/` using the browser or file preview.
- **Ask for confirmation**: "The visual assets are ready. Do they match your vision? Should we proceed to animation?"

---

## Phase 5: Motion Weaving (Animation & Video Synthesis)

Final production phase.
1. **Animation Setup**: Use `opsv-animator` to generate `videospec/shots/Shotlist.md`.
   - Ensure `@FRAME:<id>_last` is used for continuous motion.
2. **Video Compilation**: Run `opsv animate`.
3. **Final Synthesis**: Run `opsv execute-video --model seedance` (or the default engine).

---

## Troubleshooting & Quality Control
- **Concept Bleeding**: If characters are mixing features, check the `prompt_en` of each asset.
- **Evidential Logging**: If an API fails, provide the user with the **Exact JSON Payload** and the error code.

> *"Director, the factory is rolling. Your vision is our code."*
