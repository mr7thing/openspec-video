# Design: Character M Data Asset

## Goals
Define the data structure for Character M to ensure compatibility with the game's character system.

## Architecture
This change is purely data-driven. It involves adding a new YAML file to the `assets/characters/` directory.

### Data Model
The file will follow the existing character schema:
- **Keys**: `id`, `name`, `role`, `description`, `visual_traits`, `reference_sheet`.
- **Format**: YAML.

## Non-Goals
- implementing any AI behavior logic (this is just the asset definition).
- creating the actual PNG reference image (just defining the path).
