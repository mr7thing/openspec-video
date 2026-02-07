# OpenSpec-Video (OpsV) 🎬

Transform your stories into video productions with AI Agents.

## Overview
OpenSpec-Video is an autonomous video production system that treats **"Spec as Code"**. It parses structured markdown scripts, generates character and scene assets, creates storyboards using image generation AI, and synthesizes video using tools like Veo.

## Features
- **Story-First Workflow**: Start with `Script.md`.
- **Visual Asset Management**: Character and Scene references (`.md` + images) ensure consistency.
- **Automated Directing**: Agents handle the "Shoot" (Job Generation) and "Action" (Execution) phases.
- **Production-Ready Templates**: Includes standard skills, rules, and file structures.

## Installation
```bash
npm install -g openspec-video
```

## Quick Start
1.  **Initialize a Project**:
    ```bash
    opsv init MyMovie
    cd MyMovie
    ```
2.  **Define Your Assets**:
    - Edit `videospec/assets/characters/` and `videospec/assets/scenes/`.
3.  **Write Your Script**:
    - Edit `videospec/stories/Script.md`.
4.  **Shoot**:
    ```bash
    opsv generate
    ```
    (This creates `queue/jobs.json`)

## Architecture
- **`.agent/`**: Contains skills (`opsv-director`, etc.) and rules for the AI Agent.
- **`.antigravity/`**: IDE-level configs and workflows.
- **`videospec/`**: The single source of truth for your creative project.

## License
MIT
