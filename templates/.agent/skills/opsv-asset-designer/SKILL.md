---
name: opsv-asset-designer
description: 璧勪骇鐢熸垚鎵ц鎵嬪唽銆傚畾涔?elements/ 鍜?scenes/ 鐩綍涓?`.md` 璧勪骇鐨勪弗鏍?YAML-First 涓夋寮忔牸寮忋€乨-ref/a-ref 鍙岄€氶亾鍙傝€冨浘瑙勫垯涓?`<thinking>` 鎺ㄧ悊瀹℃煡瑕佹眰锛屼緵 AssetDesigner Agent 璋冪敤銆?
---

# OpsV Asset Designer 鈥?鎵ц鎵嬪唽 (0.4.3)

鏈墜鍐屽畾涔変簡 `AssetDesigner Agent` 鍦?OpenSpec-Video 鏋舵瀯涓嬪垱寤?`videospec/elements/` 鍜?`videospec/scenes/` 鐩綍璧勪骇鐨勫畬鏁存墽琛岃鑼冦€?

## 鏍稿績鍑嗗垯 (0.4.3)

**鍑嗗垯 1锛氫笂涓嬫枃涓虹帇銆?* 蹇呴』鍦ㄨ璁′换浣曡祫浜у墠鍏堣鍙?`videospec/project.md` 浠ヤ簡瑙ｆ椂浠ｆ皼鍥淬€佸熀璋冨拰鍏ㄥ眬椋庢牸銆?
**鍑嗗垯 2锛氳秴楂樼簿缁嗗害銆?* 缁濅笉杈撳嚭绋€鐤忔弿杩般€傚繀椤昏嚧瀵嗘弿鍐欐潗璐ㄣ€佸厜褰便€佺（鎹熷害銆佹儏缁拰鏋勫浘绛夊厓绱犮€?
**鍑嗗垯 3锛氬弻閫氶亾鍙傝€冨浘浣撶郴銆?* 搴熷純 `has_image`銆傚紩鍏?`## Design References` (d-ref: 鐏垫劅鍥撅紝鐢熸垚鍓嶅弬鑰? 鍜?`## Approved References` (a-ref: 瀹氭。鍥撅紝渚涘悗缁暅澶村紩鐢ㄩ攣瀹?銆傜敤鎴峰彲鍦ㄤ富浣撲腑鏀剧疆鍥剧墖閾炬帴銆?
**鍑嗗垯 4锛氳緭鍑鸿瑷€銆?* 璧勪骇鎻忚堪鍜?`.md` 鍐呭姝ｆ枃蹇呴』浣跨敤**涓枃**锛屼互闄嶄綆涓枃瀵兼紨鐨勮鐭ユ懇鎿︺€傚彧鏈?`prompt_en` 瀛楁浣跨敤鑻辨枃銆?
**鍑嗗垯 5锛歒AML-First 涓?Markdown 鐪熺浉婧愩€?* `prompt_en` 绛夌敓鎴愬厓鏁版嵁杩涘叆 YAML Frontmatter銆傚浘鐗囪矾寰勭瓑璧勬簮蹇呴』鍙～鍐欏湪 Markdown 姝ｆ枃瀵瑰簲鐨?`## Design References` 鎴?`## Approved References` 涓嬶紝YAML 涓嶅啀淇濆瓨璺緞浠ヤ繚璇佸崟涓€鐪熺浉婧?(SSOT)銆?

## Document Format (CRITICAL)

All generated `.md` files MUST follow the **YAML-First Trisected Format**:

```yaml
---
name: "@AssetName"
type: "prop"           # character | scene | prop
# ---- 鎻忚堪鍖猴紙缁撴瀯鍖栨暟鎹紝涓枃锛?----
detailed_description: >
  [鑷村瘑鐨勪腑鏂囩壒寰佹弿鍐欙紝鑷冲皯3-5鍙ヨ瘽銆?
  鍖呭惈鏉愯川銆佸厜褰便€佺（鎹熴€佹儏缁€佹瀯鍥剧瓑...]
brief_description: "[涓€鍙ヨ瘽绠€鐣ユ弿杩癩"
# ---- 娓叉煋鎻愮ず璇嶏紙缁?API锛岀函鑻辨枃锛?----
prompt_en: >
  [Dense English prompt for image generation models.
  Include composition, lighting, texture, resolution, style...]
---

<!-- 浠ヤ笅姝ｆ枃鍖哄煙渚涚紪璇戝櫒鎻愬彇 payload 缁撴瀯鍖栧瓧娈?-->

## subject
[瀵逛富浣撶殑涓€鍙ヨ瘽鎻忚堪锛屼腑鏂嘳

## environment
[鎷嶆憚鐜/鑳屾櫙锛屼腑鏂囥€傚鏋滄槸绾墿鍝佺壒鍐欏彲鐣欑┖]

## camera
[鏈轰綅/鏅埆锛岃嫳鏂囥€傚 Close-Up, Macro, Wide Shot]

## Design References
<!-- d-ref: 鐏垫劅鍥?澶氬彉浣撳熀搴曪紝浠呭奖鍝嶆湰璧勪骇鐢熸垚銆備緥濡傜敓鎴愯鑹茶€佸勾鐗堟椂锛屾斁鍘熻鑹茬殑鍥剧墖 -->
<!-- [鐢ㄩ€旇鏄嶿(鍥剧墖璺緞) -->

## Approved References
<!-- a-ref: 鏈€缁堝畾妗ｅ浘銆傚綋鍒嗛暅涓紩鐢ㄦ湰璧勪骇搴撴椂锛屼互姝ゅ鐨勫浘鐗囦紭鍏堢淮鎸佷竴鑷存€?-->
<!-- [鐗堟湰鍙锋垨澶囨敞](鍥剧墖璺緞) -->
```

## Workflow Execution

When the user asks to create an asset (e.g., via `/opsv-new item` or natural language):

### Phase 1: Context Acquisition
Immediately read the contents of `videospec/project.md`. Note the `global_style_postfix`, `vision`, and the general World Building context if any comments exist.

### Phase 2: Interactive Context Gathering
If the user's request is too brief (e.g., "Make a sword"), ask clarifying questions based on the established world:
- "Given our ancient Chinese setting, is this a ceremonial jade sword or a battle-worn iron blade?"
- "Who wields it? What is its history?"

### Phase 3: The `<thinking>` Constraint
Before generating the file, you MUST output a `<thinking>` block:
```xml
<thinking>
1. Project Context: This is a [setting/vibe] project.
2. Asset Intent: The user wants a [Asset Name].
3. Aesthetic Translation: I will expand this into: [dense description of materials, lighting, and history].
4. Strict Format: I will apply the d-ref / a-ref Markdown headings for image integration. 
</thinking>
```

### Phase 4: Generation
Use `write_to_file` to create the Markdown file in `videospec/elements/` (for props/chars) or `videospec/scenes/`.
**CRITICAL**: You must strictly follow the format shown in `references/example-element.md`.

## Reference Alignment
Always cross-reference the exact markdown structure found in your local `references/example-element.md` file before generating.
