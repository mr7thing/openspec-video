---
name: opsv-script-designer
description: 鍒嗛暅鑴氭湰璁捐鎵ц鎵嬪唽銆傚皢鏁呬簨澶х翰缈昏瘧鎴愬甫 YAML 缁撴瀯鐨?Script.md 鏂囦欢锛屽寘鍚弗璋ㄦ椂闀跨害鏉熶笌鐢诲粖鍗犱綅绗︽ā鏉匡紝鏀寔 d-ref/a-ref锛屼緵 ScriptDesigner Agent 璋冪敤銆?
---

# OpsV Script Designer 鈥?鎵ц鎵嬪唽 (0.4.3)

鏈墜鍐屽畾涔変簡 `ScriptDesigner Agent` 鍦?OpenSpec-Video 鏋舵瀯涓嬬敓鎴?`videospec/shots/Script.md` 鐨勫畬鏁存墽琛岃鑼冦€傝緭鍏ヤ负 `story.md`锛岃緭鍑轰负 YAML 椹卞姩鐨勭紪璇戝氨缁垎闀滆剼鏈€?

## 鏍稿績鍑嗗垯 (0.4.3)

**瑙勫垯 1锛氭椂闂存槸缁濆绾︽潫銆?* 姣忎釜 Shot 蹇呴』鏈夋槑纭殑 `duration`銆傚崟闀滃ご鐞嗘兂 3-5 绉掞紝**涓婇檺涓?15 绉?*銆傝秴杩?15 绉掑繀椤绘媶鎴愬涓?Shot銆?
**瑙勫垯 2锛氳瑙夎瑷€锛岄潪鏂囧瓧鍙欎簨銆?* 瑕佹弿杩扮殑鏄€屾憚鍍忔満鐪嬪埌鐨勫唴瀹广€嶏細鏈轰綅銆佽繍鍔ㄣ€佷富浣撳姩浣溿€佸厜褰便€?
**瑙勫垯 3锛歒AML 浼樺厛锛堝己鍒堕搧寰嬶級銆?* **蹇呴』**灏嗘墍鏈?Shot 瀹氫箟鍦ㄦ枃妗?frontmatter 鐨?`shots:` YAML 鏁扮粍涓€侻arkdown 姝ｆ枃浠呬緵浜虹被闃呰瀹￠槄銆?
**瑙勫垯 4锛氬弻璇垎绂昏緭鍑恒€?* YAML 瀛楁锛坄camera`, `environment`, `subject`锛変笌 Markdown 姝ｆ枃浣跨敤**涓枃**锛沗prompt_en` 瀛楁浣跨敤**绾嫳鏂?*銆?
**瑙勫垯 5锛歛-ref 涓?d-ref 鐨勮竟鐣屻€?* 鍒嗛暅涓昏寮曠敤鍏冪礌鐨?`Approved References (a-ref)`锛屽垎闀滆嚜韬殑鍥剧墖娓叉煋灏嗗湪 `Script.md` 鐨?`Design References (d-ref)` 鎴栬€呭叿浣撶殑鐢诲粖涓‘璁ゃ€?

## Workflow Execution

When the user asks you to cut shots or create a storyboard based on a story:

### Phase 1: Context Acquisition
Read `videospec/project.md` to grasp the global style and aspect ratio.
Read `videospec/stories/[StoryName].md` to get the narrative beats.

### Phase 2: The `<thinking>` Constraint
Before generating the file, output a `<thinking>` block:
```xml
<thinking>
1. Source Material: The user wants to convert [Act X/The Story] into shots.
2. Timing Budget: Act 1 has 3 major events. I need to break this into visual moments: Shot 1 (4s), Shot 2 (3s), Shot 3 (3s). Total: 10s.
3. Entities: I must carry over all `@` tags mentioned in the story into both the YAML and the Body.
4. Prompt Formulation: For each shot, I will translate the visual action into a dense English prompt (`prompt_en`) suitable for ComfyUI.
</thinking>
```

### Phase 3: Generation
Use `write_to_file` to create/append to a `.md` file inside `videospec/shots/`.
**CRITICAL**: You must strictly follow the format shown in `references/example-script.md`.

**0.3.2 澧炲己锛氳嚜鍔ㄩ摼鎺ュ寲涓庣敾寤婃ā鏉?*锛?
- 褰撲綘鍦?Markdown Body 涓彁鍒?`@role_K` 鏃讹紝**蹇呴』**灏濊瘯灏嗗叾鍐欐垚 `[@role_K](../videospec/elements/role_K.md)`銆?
- 涓烘瘡涓?Shot 棰勭暀涓€涓?HTML 鎴?Markdown 鐢诲粖鍖哄煙锛屾柟渚?`opsv review` 鍥炲啓鍥剧墖閾炬帴銆?

### Phase 4: Intent Sync (0.3.2)
鍦ㄤ綘缂栬緫瀹?`Script.md` 渚涘婕斿闃呭悗锛屽鏋滀綘闇€瑕佷慨鏀?`Shotlist.md` 鐨勬妧鏈墽琛屽弬鏁帮紝浣犲繀椤荤‘淇濆畠鎸囧悜瀵兼紨鍦?`Script.md` 涓€氳繃 review 宸ュ叿纭畾鐨勬渶鏂板浘鐗囪矾寰勩€?

## Formatting Rules for Shots (YAML Array)

1. The file MUST begin with frontmatter containing a `shots:` array.
2. Every item in the `shots:` array MUST have the following keys:
   - `id`: e.g., "shot_1"
   - `duration`: integer (seconds)
   - `camera`: string (e.g., "Wide shot, pan down" - 涓枃鎴栧崟渚ц嫳鏂囧潎鍙?
   - `environment`: string (鑳屾櫙鎻忚堪锛屼繚鐣?`@` 瀹炰綋)
   - `subject`: string (涓讳綋鍔ㄤ綔锛屼繚鐣?`@` 瀹炰綋)
   - `prompt_en`: string (**绾嫳鏂?*瀵嗛泦鐨勭敓鍥炬彁绀鸿瘝)

3. Below the frontmatter (`---`), you can generate the Markdown body for the director to read, grouping shots under Acts (e.g., `## Act 1`). The compiler will ignore the Markdown body, but the director relies on it for review.

## Reference Alignment
Always cross-reference the exact markdown structure found in your local `references/example-script.md` file before generating.

## 0.3.1 鏂板锛氬叧閿抚濉岀缉鍗忚 (Keyframe Resolution Protocol)

鍦?OpsV 0.3.1 涓紝鍒嗛暅琛ㄦ柊澧炰簡浠ヤ笅 YAML 鍙€夊瓧娈碉紝浣犲繀椤诲湪閫傚綋鏃舵満涓诲姩浣跨敤瀹冧滑锛?

### 鏂板鍙€夌殑 YAML 瀛楁

| 瀛楁                 | 绫诲瀷   | 璇存槑                                                    |
| -------------------- | ------ | ------------------------------------------------------- |
| `first_image`        | string | 棣栧抚鍙傝€冨浘鐨勮矾寰勶紝鎴栬€?`@FRAME:<shot_id>_last` 寤惰繜鎸囬拡 |
| `middle_image`       | string | 涓棿甯у弬鑰冨浘璺緞锛堝鐢級                                |
| `last_image`         | string | 灏惧抚鍙傝€冨浘璺緞                                          |
| `target_last_prompt` | string | 闈跺悜璇遍サ璇嶏紝绯荤粺鑷姩涓烘鐢熸垚 `<shot_id>_last` 鍥惧儚浠诲姟  |
| `motion_prompt_zh`   | string | 涓枃鍔ㄤ綔鎻忚堪锛堜緵浜虹被鏍稿鎴?LLM 鍒嗘瀽锛?                  |
| `motion_prompt_en`   | string | 鑻辨枃 API 鍞竴鍔ㄤ綔鎸囦护锛堢粰搴曞眰瑙嗛澶фā鍨嬭瘑鍒級           |

### 闀块暅澶寸户鎵胯鍒?

褰撳彊浜嬮渶瑕佽繛缁繍鍔ㄧ殑闀块暅澶存晥鏋滄椂锛?*鍚庣画 Shot 鐨?`first_image` 蹇呴』鍐欎负 `@FRAME:<鍓嶄竴涓猻hot_id>_last`**锛岃€岄潪閲嶅鎸囧畾涓€寮犵嫭绔嬪浘鐗囥€傚簳灞傛墽琛屽櫒浼氬湪鍓嶄竴涓棰戞覆鏌撳畬鎴愬悗鐢?FFmpeg 鑷姩鎴彇鐪熷疄灏惧抚浣滀负涓嬩竴涓暅澶寸殑棣栧抚銆?

```yaml
  - shot: 5
    duration: 5s
    first_image: "artifacts/drafts_2/corridor.png"
    motion_prompt_en: "Tracking shot following subject down corridor."

  - shot: 6
    duration: 5s
    first_image: "@FRAME:shot_5_last"
    motion_prompt_en: "Subject reaches door, pushes it open. Light floods in."
```

### 鏂偣淇瑙勫垯

濡傛灉鏌愪釜 Shot 鍐呴儴鍙戠敓鍓х儓鍙樺寲锛堝180搴︽棆杞€佽鑹茬姸鎬佺獊鍙橈級锛屼綘闇€瑕佷富鍔ㄤ负璇?Shot 棰勫啓 `target_last_prompt`銆傜郴缁熶細鑷姩灏嗗叾杞寲涓轰竴涓ˉ甯у浘鍍忕敓鎴愪换鍔★紝鍛藉悕涓?`<shot_id>_last`銆?

```yaml
  - shot: 7
    duration: 8s
    first_image: "artifacts/drafts_2/shot_7.png"
    motion_prompt_en: "Camera orbits around subject 180 degrees."
    target_last_prompt: "浠庝富瑙掕儗鍚庢媿鎽勭殑鐢靛奖绾ф瀯鍥撅紝鏁屼汉涓炬灙瀵瑰硻锛屾槒鏆楅湏铏圭伅鍏?
```
## 0.3.2 鏂板锛氳瑙夊闃呬笌鐢诲粖瑙勮寖

涓轰簡璁╁婕旀嫢鏈夌洿瑙傜殑瑙嗚瀹￠槄浣撻獙锛屼綘鍦ㄧ敓鎴?`Script.md` 鐨?Markdown Body 鏃跺簲閬靛惊浠ヤ笅甯冨眬锛?

```markdown
## Shot [搴忓彿] ([鏃堕暱]s)
[杩欓噷鏄瑙夊姩浣滄弿杩帮紝瀹炰綋濡?[@瑙掕壊鍚峕(../videospec/elements/瑙掕壊鍚?md) 闇€閾炬帴鍖朷

### 馃柤锔?瑙嗚瀹￠槄寤?
| 鐢婚潰 1 | 鐢婚潰 2 |
|:---:|:---:|
| (绛夊緟 opsv review 鍥炲啓) | (绛夊緟 opsv review 鍥炲啓) |

### 馃幆 瀹氬悜琛ュ抚
| 鐩爣灏惧抚鍊欓€?|
|:---:|
| (绛夊緟 opsv review 鍥炲啓) |
```

### 寤惰繜缁戝畾鍘熷垯
鐢熸垚鐨勫浘鐗囩粺涓€鍛藉悕涓?`shot_X_draft_N`銆?*浣狅紙Shot Designer锛変笉璐熻矗鏈€缁堥攣瀹氬摢寮犲浘鏄甯?*銆備綘鐨勪换鍔℃槸鎻愪緵瓒冲澶氱殑鍊欓€夛紙Drafts锛夛紝骞跺紩瀵煎婕斿湪 `Script.md` 涓繘琛屾壒娉ㄣ€?

