# OPSV-ASSET-0.4 璧勪骇瑙勮寖

> 瀹氫箟鎵€鏈夎瑙夎祫浜э紙瑙掕壊銆佸満鏅€侀亾鍏凤級鐨勬枃妗ｆ牸寮忋€傛湰鐗堟湰寮曞叆 **d-ref / a-ref 鍙岄€氶亾鍙傝€冨浘浣撶郴**锛屽簾寮?0.3.2 鐨?`has_image` 浜屽厓寮€鍏炽€?

---

## 鏍稿績瑙勫垯

```
鐢熸垚鑷韩 鈫?浣跨敤鑷繁鐨?Design References (d-ref)
琚紩鐢ㄦ椂 鈫?鎻愪緵鑷繁鐨?Approved References (a-ref)
```

姝よ鍒欑粺涓€閫傜敤浜?element銆乻cene銆乻hot 鎵€鏈夊疄浣撶被鍨嬨€?

---

## 1. 鏂囦欢缁撴瀯

姣忎釜璧勪骇鏂囦欢鐢?**YAML Frontmatter + Markdown Body** 缁勬垚锛?

```markdown
---
# YAML 鍏冩暟鎹紙鏈哄櫒娑堣垂锛?
---
# Markdown Body锛堜汉绫?鏈哄櫒鍙屾秷璐癸級
```

---

## 2. YAML Frontmatter

### 蹇呭～瀛楁

```yaml
---
name: "@prefix_identifier"       # 鍞竴鏍囪瘑锛園 + 绫诲瀷鍓嶇紑 + 鍚嶇О锛?
type: "character"                # character | scene | prop
brief_description: "涓€鍙ヨ瘽鎻忚堪"   # 鈮?20 瀛?
prompt_en: >                     # 鑻辨枃娓叉煋鎻愮ず璇?
  Dense English prompt for generation models...
---
```

### 鍙€夊瓧娈?

```yaml
detailed_description: >          # 鏃犲弬鑰冨浘鏃剁殑璇﹀敖鎻忚堪
schema_version: "0.4"            # Schema 鐗堟湰
```

> **`has_image` 宸插簾寮?*銆傛槸鍚︽湁鍙傝€冨浘鐢?Markdown Body 涓殑 `## Approved References` 鑺傛槸鍚﹀瓨鍦ㄤ笖闈炵┖鑷姩鎺ㄥ銆?

---

## 3. Markdown Body 鈥?鍙岄€氶亾鍙傝€冨浘

### 3.1 `## Design References`锛坉-ref锛氱敓鎴愯緭鍏ワ級

**鐢ㄩ€?*锛氬綋 `opsv generate` 鐢熸垚**鏈疄浣撹嚜韬?*鏃讹紝灏嗘鑺備腑鐨勫浘鐗囦綔涓?img2img 杈撳叆鍙傝€冨浘浼犵粰妯″瀷銆?

**浣跨敤鍦烘櫙**锛?
- 澶栭儴鐏垫劅鍥撅紙鏈嶈鍙傝€冦€侀厤鑹插弬鑰冦€佹儏缁澘锛?
- 宸叉湁璧勪骇鐨?a-ref锛堢敤浜庣敓鎴愬彉浣擄細鑰佸勾鐗堛€佸崱閫氱増銆佽亴涓氬舰璞＄瓑锛?
- 鑽夊浘/鎵嬬粯绋?

**鏍煎紡**锛氭爣鍑?Markdown 閾炬帴锛宍[鐢ㄩ€旀弿杩癩(鍥剧墖璺緞)`

```markdown
## Design References
- [鏈嶈鐏垫劅 - 璧涘崥鏈嬪厠椋庤。](refs/costume_mood.png)
- [骞磋交鐗堝師鍨?- 鐢ㄤ簬鐢熸垚鑰佸勾鍙樹綋](../elements/@role_K.md 鈫?a-ref)
```

### 3.2 `## Approved References`锛坅-ref锛氬畾妗ｈ緭鍑猴級

**鐢ㄩ€?*锛氬綋**鍏朵粬瀹炰綋寮曠敤鏈疄浣?*鏃讹紙濡?Shot 涓?`@role_K`锛夛紝灏嗘鑺備腑鐨勫浘鐗囨敞鍏ュ紩鐢ㄦ柟鐨?`reference_images`銆?

**浣跨敤鍦烘櫙**锛?
- 缁忓婕斿鎵圭‘璁ょ殑瀹氭。鍥?
- 瑙掕壊涓夎鍥?/ 姝ｈ劯鐗瑰啓
- 鍦烘櫙鍏ㄦ櫙瀹氱

**鏍煎紡**锛氬悓涓?

```markdown
## Approved References
- [瑙掕壊涓夎鍥綸(artifacts/drafts_3/role_K_turnaround.png)
- [瑙掕壊姝ｈ劯鐗瑰啓](artifacts/drafts_3/role_K_closeup.png)
```

### 3.3 `has_image` 鑷姩鎺ㄥ

```
## Design References 鎴?## Approved References 浠讳竴瀛樺湪涓斿寘鍚湁鏁堥摼鎺?
  鈫?绛変环 has_image: true

涓よ妭鍧囦笉瀛樺湪鎴栦负绌?
  鈫?绛変环 has_image: false 鈫?渚濊禆 detailed_description 鍏ㄦ枃鎻忚堪
```

---

## 4. 瀹屾暣绀轰緥

### 绀轰緥 A锛氭湁鍙傝€冨浘鐨勮鑹?

```markdown
---
name: "@role_K"
type: "character"
brief_description: "30澶氬瞾璧涘崥渚︽帰锛岄粦鑹查珮棰嗗ぇ琛?
prompt_en: >
  A cyber detective in his 30s, wearing a black turtleneck coat,
  left eye glowing with red cybernetic implant, rain-soaked,
  moody cinematic lighting, 8k ultra detailed.
---

## Design References
- [鏈嶈鐏垫劅 - 璧涘崥鏈嬪厠椋庤。](refs/costume_mood.png)
- [涔夌溂鍙傝€?- 绾㈣壊鍏夋晥](refs/cyber_eye_ref.jpg)

## Approved References
- [瑙掕壊涓夎鍥綸(artifacts/drafts_3/role_K_turnaround.png)
- [瑙掕壊姝ｈ劯鐗瑰啓](artifacts/drafts_3/role_K_closeup.png)
```

### 绀轰緥 B锛氱函鏂囧瓧鎻忚堪鐨勫満鏅紙鏃犲弬鑰冨浘锛?

```markdown
---
name: "@scene_neon_alley"
type: "scene"
brief_description: "璧涘崥鏈嬪厠闇撹櫣灏忓贩"
detailed_description: >
  璧涘崥鏈嬪厠椋庢牸鐨勭嫮绐勫菇鏆楀皬宸凤紝鎸佺画涓嶆柇鐨勫ぇ闆紝
  鍦伴潰姘存醇鍊掓槧鐫€闂儊鐨勭传鑹插拰闈掕壊闇撹櫣鐏嫑鐗屻€?
  涓や晶鏄敓閿堢殑閲戝睘绠￠亾鍜屾弧鏄秱楦︾殑鐮栧銆?
prompt_en: >
  Narrow cyberpunk alley, heavy rain, neon reflections in puddles,
  rusty pipes, graffiti walls, purple and cyan neon signs...
---
```

> 鏃?`## Design References` 鍜?`## Approved References` 鈫?鑷姩绛変环 `has_image: false`銆傜紪璇戝櫒浣跨敤 `detailed_description` + `prompt_en` 绾枃鐢熷浘銆?

### 绀轰緥 C锛氬彉浣撻摼锛堜粠宸叉湁瑙掕壊鐢熸垚鏂板舰璞★級

```markdown
---
name: "@role_K_old"
type: "character"
brief_description: "60宀佽€佸勾鐗?K锛岀伆鐧藉ご鍙戯紝浼ょ枻绱疮"
prompt_en: >
  An aged version of the cyber detective K, now 60 years old,
  gray-white hair, deep facial scars, worn leather coat...
---

## Design References
- [骞磋交鐗堝畾妗ｅ浘 - 浣滀负鐢熸垚鍩虹](artifacts/drafts_3/role_K_turnaround.png)
- [鑰佸寲鍙傝€?- 鐨辩汗涓庝激鐤ょ汗鐞哴(refs/aging_reference.jpg)
```

> d-ref 寮曠敤浜?`@role_K` 鐨?a-ref锛屽舰鎴愬彉浣撻摼銆俙opsv generate` 浼氬皢杩欎簺鍥剧墖浼犵粰妯″瀷鍋?img2img銆?

---

## 5. 缂栬瘧绾︽潫

### 鐢熸垚鑷韩锛坄opsv generate` 澶勭悊 elements/ 鍜?scenes/锛?

1. 妫€鏌?`## Design References` 鑺?鈫?鎻愬彇鍥剧墖璺緞 鈫?璁句负 `reference_images`
2. 鏃?d-ref 鏃?鈫?绾枃鐢熷浘锛坱xt2img锛?
3. 鏂囧瓧閮ㄥ垎锛氭湁 a-ref 鏃剁敤 `brief_description`锛屽惁鍒欑敤 `detailed_description`

### 琚紩鐢紙Shot 鍒嗛暅涓?`@entity` 瑙ｆ瀽锛?

1. 瑙ｆ瀽琚紩鐢ㄥ疄浣撶殑 `## Approved References` 鈫?鎻愬彇绗竴寮犲浘 鈫?娉ㄥ叆 Shot 鐨?`reference_images`
2. 鏃?a-ref 鏃?鈫?fallback锛氭悳绱?`artifacts/drafts_*` 涓渶鏂扮敓鎴愮殑瀵瑰簲鏂囦欢
3. 浠嶆湭鎵惧埌 鈫?鍛婅 `[WARN] No approved ref for @xxx`

---

## 6. 鍚戝悗鍏煎

| 鏃ф牸寮?| 鏂扮郴缁熻涓?|
|--------|-----------|
| `has_image: true` + body `![img](path)` | 鎸?`## Approved References` 澶勭悊 |
| `has_image: false` 鏃犲浘鐗?| `detailed_description` 绾枃鐢熷浘 |
| 鏃?d-ref / a-ref 鑺?| 瀹屽叏鍏煎鏃ч€昏緫 |

---

> *OPSV-ASSET-0.4 | OpsV 0.4.3 | 2026-03-24*

