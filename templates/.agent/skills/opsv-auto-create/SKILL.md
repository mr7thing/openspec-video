---
name: opsv-auto-create
description: 鍏ㄨ嚜鍔ㄥ垱寤烘墽琛屾墜鍐屻€傚畾涔変粠姝岃瘝鎴栨蹇靛睍寮€瀹屾暣椤圭洰缁撴瀯鐨勪竴娆℃€ф壒澶勭悊娴佺▼锛氭晠浜嬨€佽祫浜у畾涔変笌鍒濆鍖栭」鐩鏋躲€?
---

# OpsV Auto-Create 鈥?鎵ц鎵嬪唽 (0.3.2)

鏈墜鍐屽畾涔変簡 `AutoCreate Agent` 灏嗛珮灞傚垱鏄愭剰鍥句竴娆℃€у睍寮€涓哄畬鏁撮」鐩鑼冪殑搴忓垪鍖栨墽琛屾祦绋嬨€?

> **瀹氫綅璇存槑**锛氭湰鎵嬪唽鏄揩閫熷睍寮€宸ュ叿锛岄€傚悎浠庨浂寮€濮嬪垱寤洪」鐩€傚浜庨渶瑕佺簿缁嗚皟鎺ф瘡涓樁娈电殑椤圭洰锛屽簲浼樺厛璋冪敤 `opsv-architect` + `opsv-screenwriter` + `opsv-asset-designer` 閫愭杩囨浮銆?

## Workflow

1.  **Analyze Intent**:
    - Input: Lyrics, Song Meaning, or Plot Outline.
    - Output: Breakdown of Scenes, Characters, and Visual Style.

2.  **Draft Script**:
    - Create `videospec/stories/story.md`.
    - Format: detailed shots `**Shot N**: ...`.

3.  **Define Assets**:
    - Extract every character and scene mentioned in the Script.
    - Create `videospec/elements/[id].md` and `videospec/scenes/[id].md`.
    - **Crucial**: Use `generate_image` tool to create the initial `reference_sheet` for each asset immediately.

4.  **Visualize**:
    - For every asset created, generate an image prompt.
    - Call `generate_image` (or `browser_subagent` if using external AI).
    - Save image to `videospec/assets/...`.
    - Update Markdown to point to this image.

5.  **Final Polish**:
    - Run `opsv generate` to validate the entire package.

## Example User Request
"Create a video for my song 'Neon Rain'. It's about a robot crying in the rain."

## Execution Steps
1.  Write Script: "Shot 1: Close up of Robot (@char_robot) face..."
2.  Create Asset: `char_robot.md`.
3.  Gen Image: "Sad cyberpunk robot face, rain, neon lights".
4.  Link Image: `char_robot.md` -> `![Ref](./robot.png)`.
5.  Done.
