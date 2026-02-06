# OpenSpec-Video Automation System Specification

## 1. System Overview
This repository contains the **OpenSpec-Video Automation System**.
It acts as a bridge between **Video Documentation** (in `project-demo/videospec`) and **Generative AI Tools** (Nano Banana Pro, Veo 3.1).

## 2. Architecture
- **Root**: System Source Code (`src/`).
- **project-demo/**: A sample workspace demonstrating the standard OpenSpec-Video project structure.

### Standard Project Structure
```text
my-video-project/
├── videospec/              # Documentation Source (Single Source of Truth)
│   ├── project.md          # Project Context & Style
│   ├── config.yaml         # Automation Config
│   ├── assets/             # Asset Definitions
│   │   ├── characters/     # Character Reference Sheets
│   │   └── locations/      # Location Definitions
│   ├── stories/            # Scripts & Storyboards
│   └── changes/            # Proposal Tracking
├── .antigravity/           # Agent Configuration (Rules & Workflows)
└── artifacts/              # Generated Outputs (Images/Videos)
```

## 3. Core Modules
- `SpecParser`: Reads `videospec/project.md` and `videospec/config.yaml`.
- `JobGenerator`: Converts `videospec/stories/*.md` into JSON jobs.
- `BrowserAgent`: Executes the jobs using Antigravity's browser capabilities.

## 4. Usage
To run the demo:
1. Configure `project-demo/videospec/project.md`.
2. Run `npm start -- --project ./project-demo`.
3. Watch the Agent generate artifacts in `project-demo/artifacts/`.

