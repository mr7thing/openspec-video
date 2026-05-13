# OpsV Compilation Flow

## Overview

`opsv imagen`, `opsv animate`, `opsv comfy`, `opsv webapp` all follow the same compilation pattern: read manifests, load assets, build jobs, write task JSONs.

## Prompt Resolution (Priority)

```typescript
const prompt = frontmatter.prompt
  || frontmatter.visual_brief
  || FrontmatterParser.extractFirstParagraph(body);
```

1. `prompt` — explicit English prompt field
2. `visual_brief` — structured brief field
3. Body first paragraph — auto-extracted from markdown body

## Reference Images — Two Sources

### 1. `refs` in body → Approved References

When the document body contains `@assetId` or `@assetId:variant` references, `RefResolver.parseAll()` reads those referenced documents' `## Approved References` section.

```typescript
if (frontmatter.refs && frontmatter.refs.length > 0) {
  const refs = await refResolver.parseAll(body);
  referenceImages = refs
    .filter((r) => r.resolvedImagePath)
    .map((r) => r.resolvedImagePath!);
}
```

### 2. `## Design References` → Own Document's Design Refs

`DesignRefReader.getAll(filePath)` reads the current document's `## Design References` section.

```typescript
const designRefs = await designRefReader.getAll(filePath);
if (designRefs.length > 0) {
  referenceImages = [...referenceImages, ...designRefs.map((r) => r.filePath)];
}
```

## Full Compilation Flow

```
opsv imagen --model volcengine.seadream
  │
  ├─ resolveManifestPath()
  │     → finds .circleN/_manifest.json
  │
  ├─ assetManager.loadCircleAssets(circleDir)
  │     → reads manifest.assets to get asset list
  │     → finds source .md file paths via AssetManager.findAssetFilePathUnder()
  │
  ├─ buildImageJob()  [per asset]
  │     ├─ reads @assetId.md
  │     ├─ extracts prompt (prompt > visual_brief > body首段)
  │     ├─ RefResolver.parseAll() → Approved References from referenced docs
  │     ├─ DesignRefReader.getAll() → Design References from own doc
  │     └─ returns Job { id, type, prompt, payload, reference_images }
  │
  └─ TaskBuilder.compileToDir()
        ├─ selects ProviderCompiler (volcengine/siliconflow/minimax/runninghub/comfyui/webapp)
        ├─ compiler.compile(ctx) → provider-specific TaskJson
        └─ writes {id}.json to circleDir/modelKey_NNN/
```

## Job Structure (imagen)

```typescript
{
  id: "shot_01_frame_04",
  type: "imagen",
  prompt: "洞穴内部，摇曳火把...",
  payload: {
    prompt: "洞穴内部，摇曳火把...",
    global_settings: {
      aspect_ratio: frontmatter.aspect_ratio,
      quality: frontmatter.quality || "standard"
    }
  },
  reference_images: [
    "/abs/path/to/approved_ref.png",
    "/abs/path/to/design_ref.png"
  ]
}
```

## Provider Compilers

| Provider | Compiler |
|----------|----------|
| volcengine | VolcengineCompiler |
| siliconflow | SiliconFlowCompiler |
| minimax | MinimaxCompiler |
| runninghub | RunningHubCompiler |
| comfyui / comfylocal | ComfyUICompiler |
| webapp | WebappCompiler |

## Output Naming

```
circleDir/provider.model_NNN/
├── @hero.json          ← original task
├── @hero_1.png         ← original output
├── @hero_m1.json        ← iterated (modified) task
└── @hero_m1_1.png      ← iterated output
```
