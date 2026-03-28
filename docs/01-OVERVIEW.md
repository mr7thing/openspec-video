# OpsV 椤圭洰鍏ㄦ櫙 (Project Overview)

> **OpenSpec-Video (OpsV) 0.4.3** 鈥?灏?Markdown 鍙欎簨瑙勮寖缂栬瘧涓鸿棰?鍥惧儚鐢熸垚浠诲姟鐨勮嚜鍔ㄥ寲妗嗘灦

---

## 1. OpsV 鏄粈涔?
OpsV 鏄竴濂?**Spec-as-Code** 瑙嗛鍒朵綔绠＄嚎銆傚畠鍏佽鍒涗綔鑰咃紙瀵兼紨/PM/鑹烘湳鎬荤洃锛夌敤 Markdown 鎾板啓鏁呬簨銆佸畾涔夎祫浜с€佽璁″垎闀滐紝鐒跺悗閫氳繃 CLI 鍛戒护灏嗚繖浜涙枃鏈鑼?缂栬瘧"涓哄彲鎵ц鐨?JSON 浠诲姟闃熷垪锛屾渶缁堥┍鍔?AI 妯″瀷锛圫eaDream銆丼eedance銆丼iliconFlow 绛夛級鎵归噺鐢熸垚鍥惧儚涓庤棰戙€?
**鏍稿績淇℃潯**锛?
- **浠ｇ爜鍗宠鑼?*锛歚.md` 鏂囦欢鏄敮涓€鐨勭湡鐩告簮锛屽浘鍍忓拰瑙嗛鏄叾缂栬瘧浜х墿
- **璧勪骇鍏堣**锛氳鑹?鍦烘櫙/閬撳叿蹇呴』鍏堢嫭绔嬪缓妗ｏ紝鍒嗛暅涓彧鍏佽寮曠敤锛坄@` 璇硶锛?- **鍔ㄩ潤鍒嗙**锛氬浘鍍忕敓鎴愬拰瑙嗛鐢熸垚鏄袱鏉＄嫭绔嬬绾匡紝浜掍笉骞叉壈
- **Markdown 椹卞姩**锛歒AML Frontmatter 瀛樺厓鏁版嵁锛孧arkdown Body 瀛樺弬鑰冨浘寮曠敤鍜屼汉绫诲闃呭唴瀹癸紝涓よ€呭崗鍚?
---

## 2. 鎶€鏈爤

| 灞傜骇 | 鎶€鏈?| 鐢ㄩ€?|
|------|------|------|
| 璇█ | TypeScript | 鏍稿績浠ｇ爜 |
| CLI 妗嗘灦 | Commander.js | 鍛戒护琛岀晫闈?|
| 閫氳 | WebSocket (ws) | 鍚庡彴瀹堟姢杩涚▼ 鈫?娴忚鍣ㄦ彃浠?|
| 閰嶇疆 | dotenv + js-yaml | 鐜鍙橀噺 + YAML 閰嶇疆 |
| 鏍￠獙 | Zod | Job 浠诲姟缁撴瀯鏍￠獙 |
| 鏃ュ織 | Winston | 缁熶竴鏃ュ織绯荤粺 |
| 瑙ｆ瀽 | unified + remark | Markdown/YAML 瑙ｆ瀽 |
| HTTP | Axios | API 璇锋眰 |

---

## 3. 鏍囧噯鐩綍缁撴瀯

`opsv init` 鍒涘缓鐨勯」鐩鏋讹細

```
project/
鈹溾攢鈹€ .agent/                     # AI Agent 閰嶇疆
鈹?  鈹溾攢鈹€ Architect.md            # 鏋舵瀯甯堣鑹插畾涔?鈹?  鈹溾攢鈹€ Screenwriter.md         # 缂栧墽瑙掕壊瀹氫箟
鈹?  鈹溾攢鈹€ AssetDesigner.md        # 璧勪骇璁捐甯堣鑹插畾涔?鈹?  鈹溾攢鈹€ ScriptDesigner.md       # 鍒嗛暅璁捐甯堣鑹插畾涔?鈹?  鈹溾攢鈹€ Animator.md             # 鍔ㄧ敾缂栧瑙掕壊瀹氫箟
鈹?  鈹溾攢鈹€ Supervisor.md           # 璐ㄦ鐩戝埗瑙掕壊瀹氫箟
鈹?  鈹斺攢鈹€ skills/                 # 鎶€鑳芥墜鍐屽簱锛?0 涓?Skill锛?鈹溾攢鈹€ .antigravity/               # Antigravity 宸ュ叿閰嶇疆
鈹?  鈹溾攢鈹€ rules/                  # 琛屼负瑙勫垯
鈹?  鈹斺攢鈹€ workflows/              # 宸ヤ綔娴佹ā鏉匡紙8 涓級
鈹溾攢鈹€ .env/                       # 鐜閰嶇疆锛坓it 蹇界暐锛?鈹?  鈹溾攢鈹€ secrets.env             # API 瀵嗛挜
鈹?  鈹斺攢鈹€ api_config.yaml         # 寮曟搸鍙傛暟閰嶇疆
鈹溾攢鈹€ videospec/                  # 鏍稿績鍙欎簨璧勪骇锛堢湡鐩告簮锛?鈹?  鈹溾攢鈹€ project.md              # 椤圭洰鍏ㄥ眬閰嶇疆涓庤祫浜ц姳鍚嶅唽
鈹?  鈹溾攢鈹€ stories/                # 鏁呬簨澶х翰
鈹?  鈹?  鈹斺攢鈹€ story.md
鈹?  鈹溾攢鈹€ elements/               # 瑙掕壊/閬撳叿璧勪骇瀹氫箟
鈹?  鈹?  鈹溾攢鈹€ @role_hero.md
鈹?  鈹?  鈹斺攢鈹€ @prop_sword.md
鈹?  鈹溾攢鈹€ scenes/                 # 鍦烘櫙璧勪骇瀹氫箟
鈹?  鈹?  鈹斺攢鈹€ @scene_forest.md
鈹?  鈹斺攢鈹€ shots/                  # 鍒嗛暅涓庡姩鐢诲彴鏈?鈹?      鈹溾攢鈹€ Script.md           # 闈欐€佹瀯鍥惧垎闀?鈹?      鈹斺攢鈹€ Shotlist.md         # 鍔ㄦ€佽繍闀滃彴鏈?鈹溾攢鈹€ artifacts/                  # 鐢熸垚浜х墿
鈹?  鈹斺攢鈹€ drafts_N/               # 绗?N 鎵规覆鏌撹崏鍥?鈹溾攢鈹€ queue/                      # 浠诲姟闃熷垪
鈹?  鈹溾攢鈹€ jobs.json               # 鍥惧儚鐢熸垚浠诲姟
鈹?  鈹斺攢鈹€ video_jobs.json         # 瑙嗛鐢熸垚浠诲姟
鈹溾攢鈹€ GEMINI.md                   # Gemini 涓撶敤鍏ㄥ眬浜烘牸閰嶇疆
鈹斺攢鈹€ AGENTS.md                   # OpenCode/Trae 缁熶竴鍗忚
```

---

## 4. 鏍稿績姒傚康璇嶅吀

| 姒傚康 | 鍚箟 |
|------|------|
| **Spec-as-Code** | 鐢ㄧ粨鏋勫寲 Markdown 浣滀负瑙嗛鍒朵綔鐨勬簮浠ｇ爜 |
| **Asset-First** | 璧勪骇鍏堜簬鍒嗛暅瀛樺湪锛屽垎闀滃彧寮曠敤涓嶆弿杩?|
| **d-ref (Design References)** | 鐢熸垚杈撳叆鍙傝€冨浘銆俙opsv generate` 鐢熸垚鏈疄浣撴椂浣滀负 img2img 杈撳叆 |
| **a-ref (Approved References)** | 瀹氭。杈撳嚭鍙傝€冨浘銆傚叾浠栧疄浣撻€氳繃 `@` 寮曠敤鏃讹紝鎻愪緵姝ゅ弬鑰冨浘 |
| **鍙樹綋閾?* | 灏?A 鐨?a-ref 浣滀负 B 鐨?d-ref锛岀敓鎴愬熀浜?A 鐨勬柊鍙樹綋锛堝鑰佸勾鐗堛€佸崱閫氱増锛?|
| **@ 寮曠敤璇硶** | 鐢?`@role_K`銆乣@scene_bar` 绛夋爣绛惧紩鐢ㄧ嫭绔嬬殑璧勪骇鏂囦欢 |
| **global_style_postfix** | 鍦?`project.md` 涓畾涔夌殑鍏ㄥ眬娓叉煋椋庢牸鍚庣紑锛岀紪璇戝櫒鑷姩娉ㄥ叆姣忎釜浠诲姟 |
| **鍔ㄩ潤鍒嗙** | 鍥惧儚绠＄嚎锛圫cript.md 鈫?jobs.json锛変笌瑙嗛绠＄嚎锛圫hotlist.md 鈫?video_jobs.json锛変簰鐩哥嫭绔?|
| **鍏抽敭甯у缂?* | `@FRAME:<shot_id>_last` 寤惰繜鎸囬拡锛屽悗涓€闀滃ご棣栧抚鑷姩缁ф壙鍓嶄竴闀滃ご灏惧抚 |
| **鐗瑰緛娉勬紡 (Concept Bleeding)** | 鍒嗛暅涓笉鎱庢弿杩颁簡瑙掕壊澶栬矊缁嗚妭锛屽鑷存覆鏌撳啿绐?|

---

## 5. 蹇€熷紑濮?
```bash
# 1. 鍏ㄥ眬瀹夎
npm install -g videospec

# 2. 鍒涘缓鏂伴」鐩?opsv init my-mv-project

# 3. 閰嶇疆 API 瀵嗛挜
echo "VOLCENGINE_API_KEY=your_key_here" > .env/secrets.env

# 4. 缂栧啓璧勪骇鍜屽垎闀滐紙鍙傝€冨伐浣滄祦鏂囨。锛?
# 5. 缂栬瘧骞剁敓鎴愬浘鍍?opsv generate
opsv gen-image

# 6. 灏嗙粨鏋滃洖鍐欐枃妗ｅ苟瀹￠槄
opsv review

# 7. 缂栬瘧骞剁敓鎴愯棰?opsv animate
opsv gen-video
```

---

## 6. 鐩稿叧鏂囨。

| 鏂囨。 | 璇存槑 |
|------|------|
| [宸ヤ綔娴佺▼璇存槑](./02-WORKFLOW.md) | 浜旀寰幆瀹屾暣娴佺▼ |
| [CLI 鍛戒护鍙傝€僝(./03-CLI-REFERENCE.md) | 鍏ㄩ儴 8 涓懡浠ょ殑璇︾粏鐢ㄦ硶 |
| [Agent 涓?Skill 浣撶郴](./04-AGENTS-AND-SKILLS.md) | 6 涓鑹?+ 10 涓妧鑳?|
| [鏂囨。鏍煎紡瑙勮寖](./05-DOCUMENT-STANDARDS.md) | YAML 妯℃澘銆丂 璇硶銆佸懡鍚嶇害瀹?|
| [閰嶇疆浣撶郴](./06-CONFIGURATION.md) | .env 鐩綍涓庡紩鎿庡弬鏁?|
| [API 鎺ュ彛瑙勮寖](./07-API-REFERENCE.md) | 澶氭ā鍨嬫帴鍙ｅ崗璁?|
| [Schema 閫熸煡琛╙(./schema/QUICK_REFERENCE.md) | 瀛楁涓庢灇涓惧€奸€熸煡 |

---

> *"浠ｇ爜鏄啓缁欎汉鐪嬬殑锛屽彧鏄『渚胯鏈哄櫒杩愯銆?*
> *OpsV 0.4.3 | 鏈€鍚庢洿鏂? 2026-03-28*
