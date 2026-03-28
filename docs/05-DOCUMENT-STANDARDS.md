# OpsV 鏂囨。瑙勮寖涓庢牸寮忚鏄?(Document Standards)

> 鎵€鏈?`.md` 鏂囦欢鐨勬牸寮忕害瀹氥€乊AML 妯℃澘銆丂 寮曠敤璇硶鍜屽懡鍚嶈鑼冦€?
---

## 1. 閫氱敤鏍煎紡鍑嗗垯

### 1.1 YAML Frontmatter 寮哄埗瑙勮寖

鎵€鏈?OpsV 鏂囨。锛堣祫浜с€佸垎闀溿€侀」鐩厤缃級**蹇呴』**浠?YAML Frontmatter 寮€澶达細

```yaml
---
key: value
---
```

- 缂栬瘧鍣?*鍙 YAML 鍖哄煙**
- Markdown 姝ｆ枃浠呬緵浜虹被瀹￠槄锛岀紪璇戝櫒蹇界暐
- YAML 蹇呴』鍚堟硶锛堟敞鎰忕缉杩涖€佸紩鍙枫€佸啋鍙峰悗鐨勭┖鏍硷級

### 1.2 璇█瑙勮寖

| 浣嶇疆 | 璇█ | 璇存槑 |
|------|------|------|
| 姝ｆ枃/鎻忚堪/娉ㄩ噴 | 涓枃 | 闄嶄綆瀵兼紨鐨勮鐭ユ懇鎿?|
| `prompt_en` | 鑻辨枃 | 渚涙墿鏁ｆā鍨嬶紙SD/Flux/ComfyUI锛夋覆鏌?|
| `motion_prompt_en` | 鑻辨枃 | 渚涜棰戝ぇ妯″瀷锛圫eedance/Sora锛夎瘑鍒?|
| `global_style_postfix` | 鑻辨枃 | 鍏ㄥ眬娓叉煋淇グ璇?|
| YAML 閿悕 | 鑻辨枃 | 淇濇寔缂栫▼涓€鑷存€?|

### 1.3 鏂囦欢鍛藉悕绾﹀畾

| 绫诲瀷 | 鍛藉悕鏍煎紡 | 绀轰緥 |
|------|---------|------|
| 瑙掕壊璧勪骇 | `@role_<name>.md` | `@role_hero.md` |
| 閬撳叿璧勪骇 | `@prop_<name>.md` | `@prop_sword.md` |
| 鍦烘櫙璧勪骇 | `@scene_<name>.md` | `@scene_forest.md` |
| 闈欐€佸垎闀?| `Script.md` | 鍥哄畾鍚嶇О |
| 鍔ㄦ€佸彴鏈?| `Shotlist.md` | 鍥哄畾鍚嶇О |
| 椤圭洰閰嶇疆 | `project.md` | 鍥哄畾鍚嶇О |
| 鏁呬簨澶х翰 | `story.md` | 鍥哄畾鍚嶇О |
| 娓叉煋鑽夊浘 | `shot_X_draft_N.png` | `shot_1_draft_2.png` |
| 瀹氬悜琛ュ抚 | `shot_X_target_last_N.png` | `shot_3_target_last_1.png` |

---

## 2. 璧勪骇鏂囨。鏍煎紡 (elements/ 鍜?scenes/)

> 璇︾粏瑙勮寖瑙?[OPSV-ASSET-0.4](schema/OPSV-ASSET-0.4.md)

### 2.1 YAML Frontmatter

```yaml
---
name: "@role_hero"           # @ 鍓嶇紑 + 绫诲瀷鍓嶇紑 + 鏍囪瘑绗?type: "character"             # character | scene | prop
brief_description: "涓€鍙ヨ瘽绠€鐣ユ弿杩?
detailed_description: >       # 鏃犲弬鑰冨浘鏃剁殑璇﹀敖鎻忓啓
  鑷村瘑鐨勪腑鏂囩壒寰佹弿鍐欙紝鑷冲皯3-5鍙ヨ瘽銆?prompt_en: >                  # 鑻辨枃娓叉煋鎻愮ず璇?  Dense English prompt for image generation models.
---
```

> **`has_image` 宸插簾寮?*锛?.4.1锛夈€傚弬鑰冨浘鐘舵€佺敱 Markdown Body 鐨?d-ref / a-ref 鑺傝嚜鍔ㄦ帹瀵笺€?
### 2.2 鍙岄€氶亾鍙傝€冨浘浣撶郴 (d-ref / a-ref)

杩欐槸 OpsV 0.4 鏈€鏍稿績鐨勬牸寮忓崌绾с€傜粺涓€瑙勫垯锛?
```
鐢熸垚鑷韩 鈫?浣跨敤鑷繁鐨?Design References (d-ref)
琚紩鐢ㄦ椂 鈫?鎻愪緵鑷繁鐨?Approved References (a-ref)
```

#### `## Design References`锛坉-ref锛氱敓鎴愯緭鍏ワ級

`opsv generate` 鐢熸垚**鏈疄浣撹嚜韬?*鏃讹紝灏嗘鑺備腑鐨勫浘鐗囦綔涓?img2img 杈撳叆鍙傝€冦€?
鍏稿瀷鏉ユ簮锛?- 澶栭儴鐏垫劅鍥撅紙鏈嶈銆侀厤鑹层€佹儏缁澘锛?- 宸叉湁璧勪骇鐨?a-ref锛堢敤浜庣敓鎴愬彉浣擄細鑰佸勾鐗?/ 鍗￠€氱増 / 鑱屼笟褰㈣薄锛?- 鑽夊浘鎴栨墜缁樼

```markdown
## Design References
- [鏈嶈鐏垫劅 - 璧涘崥鏈嬪厠椋庤。](refs/costume_mood.png)
- [骞磋交鐗堝師鍨?- 鐢ㄤ簬鑰佸勾鍙樹綋鐢熸垚](artifacts/drafts_3/role_K_turnaround.png)
```

#### `## Approved References`锛坅-ref锛氬畾妗ｈ緭鍑猴級

**鍏朵粬瀹炰綋寮曠敤鏈疄浣?*鏃讹紙濡?Shot 涓?`@role_K`锛夛紝灏嗘鑺備腑鐨勫浘鐗囨敞鍏ュ紩鐢ㄦ柟鐨?`reference_images`銆?
浠ｈ〃缁忓婕斿鎵圭‘璁ょ殑鏈€缁堝舰璞°€?
```markdown
## Approved References
- [瑙掕壊涓夎鍥綸(artifacts/drafts_3/role_K_turnaround.png)
- [瑙掕壊姝ｈ劯鐗瑰啓](artifacts/drafts_3/role_K_closeup.png)
```

#### 鑷姩鎺ㄥ瑙勫垯

| 鏉′欢 | 绛変环 | 缂栬瘧琛屼负 |
|------|------|---------|
| d-ref **鎴?* a-ref 浠讳竴瀛樺湪涓旈潪绌?| `has_image: true` | 浣跨敤 `brief_description` + 鍙傝€冨浘 |
| 涓よ妭鍧囦笉瀛樺湪鎴栦负绌?| `has_image: false` | 浣跨敤 `detailed_description` 绾枃鐢熷浘 |

### 2.3 瀹屾暣绀轰緥

```markdown
---
name: "@role_K"
type: "character"
brief_description: "30澶氬瞾璧涘崥渚︽帰锛岄粦鑹查珮棰嗗ぇ琛?
prompt_en: >
  A cyber detective in his 30s, black turtleneck coat,
  red cybernetic eye, moody cinematic lighting, 8k.
---

## Design References
- [鏈嶈鐏垫劅 - 璧涘崥鏈嬪厠椋庤。](refs/costume_mood.png)
- [涔夌溂鍙傝€?- 绾㈣壊鍏夋晥](refs/cyber_eye_ref.jpg)

## Approved References
- [瑙掕壊涓夎鍥綸(artifacts/drafts_3/role_K_turnaround.png)
- [瑙掕壊姝ｈ劯鐗瑰啓](artifacts/drafts_3/role_K_closeup.png)

## subject
璧涘崥渚︽帰 K

## environment
闆ㄥ闇撹櫣琛楀ご

## camera
Medium Close-Up
```

### 2.4 鍙樹綋閾?
宸叉湁璧勪骇鐨?a-ref 鍙綔涓烘柊璧勪骇鐨?d-ref锛屽疄鐜板彉浣撶敓鎴愶細

```
@role_K 鐨?a-ref (骞磋交鐗堝畾妗ｅ浘)
   鈫?浣滀负 @role_K_old 鐨?d-ref
   鈫?opsv generate 鈫?鐢熸垚鑰佸勾鐗?   鈫?review 鈫?approve
   鈫?鍐欏叆 @role_K_old 鐨?a-ref
```

---

## 3. 椤圭洰閰嶇疆鏍煎紡 (project.md)

```yaml
---
aspect_ratio: "16:9"          # 鐢诲箙锛?6:9 | 9:16 | 1:1 | 21:9 | 4:3 | 2.39:1
engine: ""                     # 榛樿娓叉煋寮曟搸
vision: "涓€鍙ヨ瘽鍏ㄥ眬鎻忚堪锛堜腑鏂囷級"
global_style_postfix: "cinematic lighting, ultra detailed, masterpiece, 8k"
resolution: "2K"               # 480p | 1080p | 2K | 4K | 8K
---

# Asset Manifest (璧勪骇鑺卞悕鍐?

## Main Characters (涓昏瑙掕壊)
- @role_K
- @role_Emma

## Extras (缇ゆ紨)
- @role_ThugA

## Scenes (鍦烘櫙)
- @scene_NeonBar
- @scene_Wasteland

## Props (閬撳叿)
- @prop_Gun
```

**绾︽潫**锛?- 涓€涓」鐩彧鏈変竴涓?`project.md`
- 鏈櫥璁扮殑 `@` 瀹炰綋瑙嗕负璇硶杩濊
- `global_style_postfix` 浼氳缂栬瘧鍣ㄨ嚜鍔ㄦ敞鍏ユ瘡涓敓鎴愪换鍔?
---

## 4. 鍒嗛暅鑴氭湰鏍煎紡 (Script.md)

### 4.1 YAML 鍖哄煙

```yaml
---
shots:
  - id: "shot_1"
    duration: 5                       # 绉掓暟锛?-15 鑼冨洿锛?    camera: "鏋佽嚧寰窛鐗瑰啓"              # 鏅埆涓庤繍闀滐紙涓枃锛?    environment: "@scene_cocoon 钖勯浘涓? # 鍦烘櫙锛堝惈 @ 寮曠敤锛?    subject: "@role_butterfly 鐮磋導"    # 涓讳綋锛堝惈 @ 寮曠敤锛?    prompt_en: >                       # 绾嫳鏂囨覆鏌撴彁绀鸿瘝
      Extreme macro shot, butterfly emerging from chrysalis,
      morning dew trembles, soft backlighting, 8k cinematic.
    # 鍙€夊瓧娈?    first_image: "artifacts/drafts_1/shot_1.png"
    last_image: ""
    target_last_prompt: ""
---
```

### 4.2 Markdown 姝ｆ枃瀹￠槄鍖?
```markdown
## Shot 1 (5s)
[@role_butterfly](../elements/@role_butterfly.md) 鍦?[@scene_cocoon](../scenes/@scene_cocoon.md) 涓牬鑼ц€屽嚭銆?
### 馃柤锔?瑙嗚瀹￠槄寤?| 鐢婚潰 1 | 鐢婚潰 2 |
|:---:|:---:|
| (绛夊緟 opsv review 鍥炲啓) | (绛夊緟 opsv review 鍥炲啓) |

### 馃幆 瀹氬悜琛ュ抚
| 鐩爣灏惧抚鍊欓€?|
|:---:|
| (绛夊緟 opsv review 鍥炲啓) |
```

---

## 5. 鍔ㄧ敾鍙版湰鏍煎紡 (Shotlist.md)

```yaml
---
shots:
  - id: shot_1
    duration: 5s
    reference_image: "../artifacts/drafts_1/shot_1_draft_2.png"
    motion_prompt_en: >
      Slow dolly in, chrysalis slowly cracks open,
      tiny legs push through, morning dew drops tremble,
      ultra smooth cinematic motion.
  - id: shot_2
    duration: 4s
    reference_image: "../artifacts/drafts_1/shot_2_draft_1.png"
    first_image: "@FRAME:shot_1_last"
    motion_prompt_en: >
      Camera slowly pulls back, butterfly spreads wings,
      sunlight catches iridescent scales, gentle breeze.
---
```

**鍏抽敭绾︽潫**锛?- `duration` 浠?Script.md 鍘熸牱閫忎紶锛屼笉鍙嚜琛岃ˉ鍏?- `motion_prompt_en` 涓ョ鍖呭惈澶栬矊鐗瑰緛
- `@FRAME:<shot_id>_last` 鐢ㄤ簬闀块暅澶撮灏惧抚缁ф壙

---

## 6. @ 寮曠敤璇硶璇﹁В

### 6.1 鍩烘湰璇硶

```markdown
# 鐩存帴寮曠敤
@role_K 璧板悜鍚у彴

# 鏂规嫭鍙峰紩鐢紙鎺ㄨ崘锛屼究浜庤秴閾炬帴鍖栵級
[@role_K] 璧板悜鍚у彴

# 瓒呴摼鎺ュ寲寮曠敤锛圫cript.md 姝ｆ枃鎺ㄨ崘锛?[@role_K](../elements/@role_K.md) 璧板悜鍚у彴

# YAML 涓娇鐢?subject: "@role_K walks toward the bar"
environment: "@scene_neon_alley in heavy rain"
```

### 6.2 鍛藉悕瑙勮寖

| 鍓嶇紑 | 鍚箟 | 瀛樻斁浣嶇疆 |
|------|------|---------|
| `@role_` | 瑙掕壊锛堜富瑙?閰嶈/缇ゆ紨锛?| `videospec/elements/` |
| `@scene_` | 鍦烘櫙/鐜 | `videospec/scenes/` |
| `@prop_` | 閬撳叿/鍏抽敭鐗╁搧 | `videospec/elements/` |

### 6.3 寮曠敤瑙ｆ瀽浼樺厛绾?
缂栬瘧鍣ㄦ寜浠ヤ笅椤哄簭鏌ユ壘 `@` 寮曠敤瀵瑰簲鐨勫畾涔夋枃浠讹細
1. `videospec/elements/{id}.md` 鈥?瑙掕壊/閬撳叿
2. `videospec/scenes/{id}.md` 鈥?鍦烘櫙
3. 鍐呰仈鎻忚堪锛坒allback锛屾湭鎵惧埌鏂囦欢鏃剁敤鍘熷鏂囨湰锛?
---

## 7. 鐩告満鏈閫熸煡琛?
### 鏅埆 (Shot Type)

| 鏈 | 缂╁啓 | 璇存槑 |
|------|------|------|
| `extreme_wide` | EWS | 澶ц繙鏅紝鐜涓轰富 |
| `wide_shot` | WS | 鍏ㄦ櫙锛屼汉鐗╁叏韬?|
| `medium_shot` | MS | 涓櫙锛岃啙鐩栦互涓?|
| `medium_close` | MCU | 涓繎鏅紝鑳搁儴浠ヤ笂 |
| `close_up` | CU | 鐗瑰啓锛岄潰閮?|
| `extreme_close` | ECU | 澶х壒鍐欙紝灞€閮ㄧ粏鑺?|

### 瑙掑害 (Angle)

| 鏈 | 璇存槑 |
|------|------|
| `eye_level` | 骞宠锛堟渶甯哥敤锛?|
| `low_angle` | 浠版媿锛堟樉楂樺ぇ锛?|
| `high_angle` | 淇媿锛堟樉娓哄皬锛?|
| `dutch` | 鑽峰叞瑙掞紙鍊炬枩涓嶅畨锛?|

### 杩愬姩 (Movement)

| 鏈 | 璇存槑 |
|------|------|
| `static` | 鍥哄畾鏈轰綅 |
| `dolly_in/out` | 鎺?鎷?|
| `pan_left/right` | 宸﹀彸鎽?|
| `truck_left/right` | 宸﹀彸绉?|
| `crane_up/down` | 鍗囬檷 |
| `orbit` | 鐜粫 |
| `tracking` | 璺熻釜 |

---

## 8. 鏋氫妇鍊奸€熸煡

### 鐢诲箙姣斾緥
`16:9` | `9:16` | `1:1` | `21:9` | `4:3` | `3:4` | `2.39:1`

### 鍒嗚鲸鐜?`480p` | `720p` | `1080p` | `2K` | `3K` | `4K` | `8K`

### 瑙嗛鏃堕暱
`3s`锛堟渶鐭級| `5s`锛堟帹鑽愶級| `10s` | `15s`锛堜笂闄愶級

### 璧勪骇绫诲瀷
`character` | `scene` | `prop`

---

> *"鏍煎紡鍗虫硶寰嬶紝YAML 鍗崇湡鐞嗐€?*
> *OpsV 0.4.3 | 鏈€鍚庢洿鏂? 2026-03-28*
