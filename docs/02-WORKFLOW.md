# OpsV 宸ヤ綔娴佺▼璇存槑 (Workflow Guide)

> 浠庣伒鎰熷埌鎴愮墖鐨勪簲姝ュ惊鐜紝鐞嗚В Agent 鍗忎綔涓?CLI 鍛戒护鐨勫畬鏁翠氦浜掗€昏緫銆?
---

## 鍏ㄦ櫙娴佺▼鍥?
```mermaid
flowchart TD
    START["馃挕 鍒涙剰鐏垫劅"] --> INIT["opsv init"]
    INIT --> ARCH["馃彌锔?Architect Agent"]
    ARCH -->|"project.md + story.md"| WRITE["鉁嶏笍 Screenwriter Agent"]
    WRITE -->|"story.md + @ 閿氱偣"| ASSET["馃帹 AssetDesigner Agent"]
    ASSET -->|"elements/ + scenes/"| SCRIPT["馃搻 ScriptDesigner Agent"]
    SCRIPT -->|"Script.md"| GEN["opsv generate"]
    GEN -->|"jobs.json"| EXEC["opsv gen-image"]
    EXEC -->|"artifacts/drafts_N/"| REVIEW["opsv review"]
    REVIEW -->|"鍥惧啓鍥?Script.md"| QA2["馃攳 Supervisor /opsv-qa act2"]
    QA2 -->|"PASS 鉁?| ANIM["馃幀 Animator Agent"]
    ANIM -->|"Shotlist.md"| COMPILE["opsv animate"]
    COMPILE -->|"video_jobs.json"| VIDGEN["opsv gen-video"]
    VIDGEN -->|"artifacts/videos/"| DONE["馃幀 瑙嗛鐢熸垚"]

    style START fill:#f9f,stroke:#333
    style DONE fill:#9f9,stroke:#333
```

---

## 闃舵涓€锛氶」鐩垵濮嬪寲 (Init)

### 瑙﹀彂鍛戒护
```bash
opsv init [projectName]
```

### 鍙戠敓浜嗕粈涔?1. **浜や簰寮忛€夋嫨** AI 鍔╂墜锛圙emini / OpenCode / Trae锛?2. **澶嶅埗妯℃澘**锛?   - `.agent/` 鈥?Agent 瑙掕壊瀹氫箟 + Skills 鎶€鑳芥墜鍐?   - `.antigravity/` 鈥?宸ヤ綔娴佸拰琛屼负瑙勫垯
   - `.env/` 鈥?API 閰嶇疆妯℃澘
   - `GEMINI.md` / `AGENTS.md` 鈥?鎸夐€夋嫨澶嶅埗
3. **鍒涘缓鐩綍楠ㄦ灦**锛?   - `videospec/stories/`銆乣videospec/elements/`銆乣videospec/scenes/`銆乣videospec/shots/`
   - `artifacts/`銆乣queue/`

### 浜х墿
```
my-project/
鈹溾攢鈹€ .agent/skills/...
鈹溾攢鈹€ .env/api_config.yaml
鈹溾攢鈹€ videospec/
鈹?  鈹溾攢鈹€ stories/
鈹?  鈹溾攢鈹€ elements/
鈹?  鈹溾攢鈹€ scenes/
鈹?  鈹斺攢鈹€ shots/
鈹溾攢鈹€ artifacts/
鈹斺攢鈹€ queue/
```

---

## 闃舵浜岋細鍒涙剰閿氬畾 (Concept Anchoring)

### 璐熻矗 Agent
**Architect** 鈫?璋冪敤 `opsv-architect` 鎶€鑳?
### 涓ら樁娈靛伐浣滄祦

#### Phase 1锛氭蹇靛彂鏁?- 杈撳叆锛氫竴鍙ユ瓕璇嶃€佷竴娈垫棆寰嬫弿杩版垨涓€涓ā绯婃蹇?- 杈撳嚭锛?*3 涓樊寮傚寲鐨勬晠浜嬫柟妗?*锛屾瘡涓柟妗堝寘鍚細
  - 鏂规鏍囬锛堜竴鍙ヨ瘽锛?  - 鏍稿績鎯呰妭锛?-5 鍙ヨ瘽锛?  - 瑙嗚椋庢牸鍏抽敭璇?  - 鏍稿績瑙掕壊娓呭崟
  - 棰勪及闀滃ご鏁?- **姝ら樁娈典笉鐢熸垚浠讳綍鏂囦欢**

#### Phase 2锛氫笘鐣岃閿氬畾
- 瀵兼紨閫夋嫨鏂规鍚庯紝鐢熸垚涓や釜鏍稿績鏂囦欢锛?  - `videospec/project.md` 鈥?鍏ㄥ眬鍙傛暟 + 璧勪骇鑺卞悕鍐?  - `videospec/stories/story.md` 鈥?鍙欎簨澶х翰锛堝惈 `@` 瀹炰綋閿氱偣锛?
### 绀轰緥

瀵兼紨璇达細"涓€棣栧叧浜庤澊铦剁殑姝岋紝寰堢┖鐏?

鈫?Architect 浜у嚭锛?```yaml
# videospec/project.md
---
aspect_ratio: "16:9"
engine: ""
vision: "涓€鍙牬鑼ц澊铦剁殑瀛ょ嫭椋炶锛岀┛瓒婂洓瀛ｇ殑鏋佺畝涔嬬編"
global_style_postfix: "ethereal atmosphere, minimalist composition, soft bokeh, dreamlike quality, 8k"
---

# Asset Manifest
## Main Characters
- @role_butterfly
## Scenes
- @scene_cocoon
- @scene_spring_forest
```

### 璐ㄦ闂ㄧ
瀹屾垚鍚庡彲杩愯 `/opsv-qa act1`锛岀敱 Supervisor 鏍告煡璧勪骇娓呭崟鏄惁瀹屾暣銆?
---

## 闃舵涓夛細璧勪骇璁捐 (Asset Design)

### 璐熻矗 Agent
**AssetDesigner** 鈫?璋冪敤 `opsv-asset-designer` 鎶€鑳?
### 鏍稿績浠诲姟
涓?`project.md` 鑺卞悕鍐屼腑鍒楀嚭鐨勬瘡涓疄浣撳垱寤虹嫭绔嬬殑 `.md` 瀹氫箟鏂囦欢銆?
### 宸ヤ綔瑙勫垯

> 璇︾粏瑙勮寖瑙?[OPSV-ASSET-0.4](schema/OPSV-ASSET-0.4.md)

1. **鍏堣鍏ㄥ眬涓婁笅鏂?*锛氬繀椤昏鍙?`project.md` 浜嗚В鏃朵唬姘涘洿鍜岄鏍?2. **鍙岄€氶亾鍙傝€冨浘浣撶郴**锛?   - `## Design References`锛坉-ref锛夛細鏀惧叆鐢熸垚鏈疄浣撴椂闇€瑕佺殑杈撳叆鍙傝€冨浘锛堢伒鎰熷浘銆佸凡鏈夎祫浜х殑 a-ref 鐢ㄤ簬鍙樹綋鐢熸垚锛?   - `## Approved References`锛坅-ref锛夛細鏀惧叆瀹氭。鍚庣殑姝ｅ紡鍙傝€冨浘锛堢粡 `opsv review` 瀹℃壒纭锛?   - 涓よ妭鍧囦负绌烘椂 鈫?绾枃鐢熷浘锛屼娇鐢?`detailed_description`
   - 浠讳竴鑺傞潪绌烘椂 鈫?浣跨敤 `brief_description` + 鍙傝€冨浘
3. **YAML 瀛樺厓鏁版嵁锛孧arkdown Body 瀛樺弬鑰冨浘閾炬帴** 鈥?鐢ㄦ埛鍙淮鎶や竴澶?
### 浜х墿绀轰緥

```markdown
# videospec/elements/@role_butterfly.md
---
name: "@role_butterfly"
type: "character"
detailed_description: >
  涓€鍙繀鑶€濡傚僵鑹茬幓鐠冭埇鐨勫嚖铦讹紝缈煎睍绾?5鍘樼背銆備笂缈呬负娣遍們鐨勯潧钃濊壊锛?  杈圭紭娓愬彉涓虹惀鐝€鑹诧紝甯冩弧缁嗗瘑鐨勯噾鑹查碁绮?..
brief_description: "闈涜摑娓愬彉鐞ョ弨鑹茬殑鍑よ澏锛岀繀鑶€濡傚僵鑹茬幓鐠?
prompt_en: >
  A swallowtail butterfly with indigo-to-amber gradient wings,
  golden scale dust, glass-like transparency, macro photography,
  ethereal backlighting, 8k ultra detailed...
---

## Design References
- [铦磋澏缈呰唨绾圭悊鍙傝€僝(refs/butterfly_wing_texture.jpg)
- [鐞ョ弨鑹茶皟鍏夊奖鍙傝€僝(refs/amber_lighting_mood.png)

## Approved References
<!-- opsv review 瀹℃壒鍚庡洖鍐?鈫?- [铦磋澏涓夎鍥綸(artifacts/drafts_2/role_butterfly_turnaround.png)
-->
```

### 鍙樹綋閾剧ず渚?
```markdown
# videospec/elements/@role_butterfly_aged.md 鈥?鑰佸寲鐗堣澊铦?---
name: "@role_butterfly_aged"
type: "character"
brief_description: "缈呰唨瑜壊鐮存崯鐨勮€佸勾鍑よ澏"
prompt_en: "An aged swallowtail butterfly, faded colors, torn wing edges..."
---

## Design References
- [骞磋交鐗堝畾妗ｅ浘 - 浣滀负鑰佸寲鍩虹](artifacts/drafts_2/role_butterfly_turnaround.png)
- [鑰佸寲绾圭悊鍙傝€僝(refs/aged_wing_texture.jpg)
```

### 璐ㄦ闂ㄧ
`/opsv-qa act1` 鈥?鏍告煡鎵€鏈夋枃浠舵槸鍚﹀凡鍦?`project.md` 鑺卞悕鍐屼腑鐧昏銆?
---

## 闃舵鍥涳細鍒嗛暅缂栬瘧涓庡闃?(Script 鈫?Generate 鈫?Review)

杩欐槸鏈€鏍稿績鐨勫惊鐜紝鍖呭惈 3 涓瓙姝ラ銆?
### 4.1 鍒嗛暅璁捐

**璐熻矗 Agent**锛?*ScriptDesigner** 鈫?璋冪敤 `opsv-script-designer` 鎶€鑳?
- 闃呰 `story.md`锛屽皢鍙欎簨杞寲涓虹粨鏋勫寲闀滃ご璇█
- 杈撳嚭 `videospec/shots/Script.md`锛圷AML 鏁扮粍 + Markdown 瀹￠槄姝ｆ枃锛?- 姣忎釜 Shot 璁捐鏃堕暱 **3-5 绉?*锛屼笂闄?**15 绉?*
- 鍒嗛暅涓?*涓ョ鍒荤敾瑙掕壊澶栬矊**锛屽繀椤荤敤 `@瀹炰綋鍚峘 寮曠敤

```yaml
# videospec/shots/Script.md (YAML 鍖?
---
shots:
  - id: "shot_1"
    duration: 5
    camera: "鏋佽嚧寰窛锛岀揣璐磋導澹宠〃闈?
    environment: "@scene_cocoon 鐮存檽钖勯浘涓?
    subject: "@role_butterfly 鐮磋導鐬棿"
    prompt_en: "Extreme macro shot of a butterfly emerging from chrysalis..."
  - id: "shot_2"
    duration: 4
    camera: "骞胯浠版媿"
    environment: "@scene_spring_forest"
    subject: "@role_butterfly 棣栨鎸繀"
    prompt_en: "Low angle wide shot, butterfly's first wing spread..."
---
```

### 4.2 鍥惧儚鐢熸垚

```bash
# 缂栬瘧 Markdown 涓?JSON 浠诲姟
opsv generate

# 鎵ц鍥惧儚娓叉煋
opsv gen-image

# 鍙€夛細棰勮妯″紡锛堝彧鐢熸垚鍏抽敭闀滃ご锛?opsv generate --preview

# 鍙€夛細鍙敓鎴愭寚瀹氶暅澶?opsv generate --shots 1,3,5
```

### 4.3 鏂囨。瀹￠槄

```bash
# 灏嗘渶鏂扮殑鐢熸垚缁撴灉鍥炲啓鍒?.md 鏂囨。
opsv review

# 鍥炲啓鎵€鏈夊巻鍙叉壒娆?opsv review --all
```

鎵ц `opsv review` 鍚庯紝`Script.md` 鐨?Markdown 姝ｆ枃鍖轰細鍑虹幇鍥剧墖閾炬帴锛?
```markdown
## Shot 1 (5s)
[@role_butterfly](../elements/@role_butterfly.md) 鍦?[@scene_cocoon] 涓牬鑼ц€屽嚭

### 馃柤锔?瑙嗚瀹￠槄寤?| 鐢婚潰 1 | 鐢婚潰 2 |
|:---:|:---:|
| ![Draft 1](../../artifacts/drafts_1/shot_1_draft_1.png) | ![Draft 2](../../artifacts/drafts_1/shot_1_draft_2.png) |
```

瀵兼紨鍦?IDE 棰勮涓€夊嚭鏈€浣宠崏鍥撅紝鎵规敞纭銆?
### 璐ㄦ闂ㄧ
- `/opsv-qa act2` 鈥?鎵弿姝婚摼銆佹鏌ヨ秴閾炬帴瀹屾暣鎬?- `/opsv-qa act3` 鈥?棰勮鍒嗛暅涓殑鐗瑰緛娉勬紡

---

## 闃舵浜旓細鍔ㄧ敾缂栧 (Animation)

### 璐熻矗 Agent
**Animator** 鈫?璋冪敤 `opsv-animator` 鎶€鑳?
### 鏍稿績浠诲姟
璇诲彇宸插闃呯‘璁ょ殑 `Script.md`锛屾彁鍙栫函鍔ㄦ€佹帶鍒舵寚浠わ紝杈撳嚭 `Shotlist.md`銆?
### 鍔ㄩ潤鍒嗙鍘熷垯
- **涓嶆弿杩?*绌夸粈涔堣。鏈嶏紙宸叉湁鍙傝€冨浘锛?- **鍙弿杩?*锛氶暅澶存€庝箞鍔紵瑙掕壊鎬庝箞鍔紵鍦烘櫙鏈変粈涔堝姩鎬佸彉鍖栵紵
- `motion_prompt_en` 蹇呴』**鍏ㄨ嫳鏂?*

### 浜х墿绀轰緥

```yaml
# videospec/shots/Shotlist.md
---
shots:
  - id: shot_1
    duration: 5s
    reference_image: "../artifacts/drafts_1/shot_1_draft_2.png"
    motion_prompt_en: "Extreme macro, chrysalis slowly cracks open, tiny legs push through, morning dew drops tremble on the surface, ultra smooth cinematic motion."
  - id: shot_2
    duration: 4s
    reference_image: "../artifacts/drafts_1/shot_2_draft_1.png"
    first_image: "@FRAME:shot_1_last"
    motion_prompt_en: "Camera slowly pulls back to wide angle, butterfly spreads wings for the first time, sunlight catches the iridescent scales, gentle breeze rustles leaves."
---
```

### 缂栬瘧鍙戝竷

```bash
# 灏?Shotlist.md 缂栬瘧涓鸿棰戜换鍔￠槦鍒?opsv animate

# 鎵ц瑙嗛鐢熸垚
opsv gen-video
```

### 闀块暅澶寸户鎵?褰撹繛缁繍鍔ㄩ渶瑕佹棤缂濊鎺ユ椂锛屽悗缁?Shot 鐨?`first_image` 璁句负 `@FRAME:<鍓嶄竴涓猻hot_id>_last`锛岀郴缁熶細鑷姩鎴彇鍓嶄竴瑙嗛鐨勫熬甯т綔涓轰笅涓€闀滃ご鐨勯甯с€?
### 璐ㄦ闂ㄧ
`/opsv-qa final` 鈥?Payload 鏂█妫€鏌ワ紝纭鍏ㄥ眬椋庢牸鍚庣紑娉ㄥ叆涓庡弬鑰冨浘璺緞涓€鑷存€с€?
---

## 璐ㄦ浣撶郴鎬昏

| Slash 鍛戒护 | 闃舵 | 妫€鏌ュ唴瀹?|
|-----------|------|---------|
| `/opsv-qa act1` | 缂栧墽鍚?| 璧勪骇鑺卞悕鍐屾槸鍚﹀畬鏁达紝鏃犻粦鎴锋棤閲嶅 |
| `/opsv-qa act2` | 閫夊浘鍚?| 姝婚摼鎵弿锛屽弬鑰冨浘璺緞鏄惁瀛樺湪 |
| `/opsv-qa act3` | 鍒嗛暅鍚?| 鐗瑰緛娉勬紡棰勮锛岄槻姝㈠璨屾弿鍐欐笚閫忓垎闀?|
| `/opsv-qa final` | 缂栬瘧鍚?| Payload 鏂█锛岄鏍煎悗缂€娉ㄥ叆 + 鍙傝€冨浘瀵归綈 |

鎵€鏈夎川妫€鐢?**Supervisor Agent** 鎵ц锛岃緭鍑虹孩缁跨伅鎶ュ憡锛?- 馃煝 `PASS: 閽堣剼涓ヤ笣鍚堢紳`
- 馃敶 `FAIL: 鎵嚭 2 涓湭鐧昏榛戞埛锛欯xxx, @yyy`

---

## 寰幆杩唬

浠ヤ笂浜斾釜闃舵骞堕潪涓€娆￠€氳繃銆傚疄闄呭満鏅腑锛屽婕斾細鍩轰簬瀹￠槄缁撴灉鍙嶅杩唬锛?
```
Script 鈫?Generate 鈫?gen-image 鈫?Review 鈫?(涓嶆弧鎰? 鈫?淇敼璧勪骇/鍒嗛暅 鈫?Generate 鈫?gen-image 鈫?Review 鈫?(OK)
                                                          鈫?                                                    opsv-apply 鎵归噺淇敼
```

`opsv-apply` 鎶€鑳藉彲浠ユ壒閲忚鍙栧彉鏇存彁妗堬紙`videospec/changes/*.md`锛夊苟鑷姩鎵ц璧勪骇鏇存柊銆?
---

> *"璁╁垱鎰忓娴佹按鑸祦娣岋紝璁╄鑼冨鍫ゅ潩鑸潥鍥恒€?*
> *OpsV 0.4.3 | 鏈€鍚庢洿鏂? 2026-03-28*
