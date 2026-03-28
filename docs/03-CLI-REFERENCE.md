# OpsV CLI 鍛戒护鍙傝€冩墜鍐?(CLI Reference)

> 瑕嗙洊鍏ㄩ儴 CLI 鍛戒护鐨勮娉曘€佸弬鏁般€侀€夐」鍜屼娇鐢ㄧず渚嬨€?
---

## 鍛戒护閫熸煡琛?
| 鍛戒护 | 鑱岃矗 | 鍏抽敭閫夐」 |
|------|------|---------|
| `opsv init` | 鍒濆鍖栭」鐩?| `[projectName]` |
| `opsv serve` | 鍚姩鍚庡彴鏈嶅姟 | 鈥?|
| `opsv start` | `serve` 鍒悕 | 鈥?|
| `opsv stop` | 鍋滄鍚庡彴鏈嶅姟 | 鈥?|
| `opsv status` | 鏌ョ湅鏈嶅姟鐘舵€?| 鈥?|
| `opsv generate` | 缂栬瘧鍥惧儚浠诲姟 | `--preview`, `--shots` |
| `opsv gen-image` | 鎵ц鍥惧儚鐢熸垚 | `--model`, `-c`, `--dry-run` |
| `opsv review` | 鍥炲啓鏂囨。 | `--all`, `[path]` |
| `opsv animate` | 缂栬瘧瑙嗛浠诲姟 | 鈥?|
| `opsv gen-video` | 鎵ц瑙嗛鐢熸垚 | `--model`, `--dry-run` |

---

## 1. `opsv init [projectName]`

鍒濆鍖栦竴涓柊鐨?OpsV 瑙嗛椤圭洰銆?
### 璇硶
```bash
opsv init              # 鍦ㄥ綋鍓嶇洰褰曞垵濮嬪寲
opsv init my-mv        # 鍒涘缓骞跺垵濮嬪寲 my-mv 鐩綍
```

### 浜や簰娴佺▼
鎵ц鍚庝細寮瑰嚭浜や簰寮忛€夋嫨鑿滃崟锛?```
? Select the AI assistants you want to support:
  鈼?Gemini (Legacy - GEMINI.md)
  鈼?OpenCode (AGENTS.md + .opencode)
  鈼?Trae (AGENTS.md + .trae)
```

### 鎵ц鍔ㄤ綔
1. 鍒涘缓鐩爣鐩綍锛堝涓嶅瓨鍦級
2. 澶嶅埗鍩虹妯℃澘锛歚.agent/`銆乣.antigravity/`銆乣.env/`
3. 鎸夐€夋嫨澶嶅埗 `GEMINI.md`銆乣AGENTS.md`銆乣.opencode/`銆乣.trae/`
4. 鍒涘缓瑙勮寖鐩綍缁撴瀯锛歚videospec/stories|elements|scenes|shots`銆乣artifacts/`銆乣queue/`

### 娉ㄦ剰浜嬮」
- 濡傛灉鐩爣鐩綍宸插瓨鍦紝鍛戒护浼氭姤閿欑粓姝?- 妯℃澘鏉ユ簮浜?npm 鍖呭唴鐨?`templates/` 鐩綍

---

## 2. `opsv serve`

鍚姩 OpsV 鍚庡彴 WebSocket 瀹堟姢杩涚▼锛屽苟灏嗗綋鍓嶉」鐩敞鍐屽埌鍏ㄥ眬鏈嶅姟銆?
### 璇硶
```bash
opsv serve
```

### 琛屼负
1. 妫€鏌ュ畧鎶よ繘绋嬫槸鍚﹀凡杩愯锛堥€氳繃 `~/.opsv/daemon.pid` 鏂囦欢锛?2. 濡傛湭杩愯锛屼互 `detached` 妯″紡鍚姩 `daemon.js`
3. 灏嗗綋鍓嶉」鐩敞鍐屽埌鍏ㄥ眬瀹堟姢杩涚▼锛圵ebSocket `ws://127.0.0.1:3061`锛?
### PID 鏂囦欢
- 璺緞锛歚~/.opsv/daemon.pid`
- 瀹堟姢杩涚▼鐩戝惉锛歚ws://127.0.0.1:3061`

> **`opsv start`** 鏄?`serve` 鐨勫畬鍏ㄧ瓑浠峰埆鍚嶃€?
---

## 3. `opsv stop`

鍋滄 OpsV 鍚庡彴瀹堟姢杩涚▼銆?
### 璇硶
```bash
opsv stop
```

### 琛屼负
1. 璇诲彇 `~/.opsv/daemon.pid` 鑾峰彇杩涚▼ ID
2. 鍙戦€?kill 淇″彿缁堟杩涚▼
3. 鍒犻櫎 PID 鏂囦欢

---

## 4. `opsv status`

鏌ョ湅 OpsV 鍚庡彴瀹堟姢杩涚▼鐨勮繍琛岀姸鎬併€?
### 璇硶
```bash
opsv status
```

### 杈撳嚭绀轰緥
```
鉁?OpsV Server is RUNNING (PID: 12345)
   Listening on: ws://127.0.0.1:3061
```
鎴?```
馃敶 OpsV Server is STOPPED
```

---

## 5. `opsv generate [targets...]`

灏?Markdown 鍙欎簨瑙勮寖"缂栬瘧"涓?JSON 浠诲姟闃熷垪銆傝繖鏄浘鍍忕敓鎴愮绾跨殑鏍稿績鍏ュ彛銆?
### 璇硶
```bash
opsv generate                     # 缂栬瘧鍏ㄩ儴瑙勮寖鐩綍
opsv generate videospec/elements  # 鍙紪璇戣祫浜х洰褰?opsv generate Script.md           # 鍙紪璇戠壒瀹氭枃浠?```

### 閫夐」

| 閫夐」 | 璇存槑 |
|------|------|
| `-p, --preview` | 棰勮妯″紡锛氫粎鐢熸垚鍏抽敭闀滃ご/鍗曞紶瑙掕壊璁惧畾鍥?|
| `--shots <list>` | 鎸囧畾闀滃ご ID锛岄€楀彿鍒嗛殧锛堝 `--shots 1,5,12`锛?|

### 琛屼负
1. 瑙ｆ瀽鐩爣璺緞涓嬬殑 `.md` 鏂囦欢
2. 鎻愬彇 YAML Frontmatter 涓殑闀滃ご/璧勪骇瀹氫箟
3. 瑙ｆ瀽 `@` 寮曠敤锛屽皢瀹炰綋鐗瑰緛娉ㄥ叆鎻愮ず璇?4. 娉ㄥ叆 `project.md` 涓?`global_style_postfix` 鍏ㄥ眬鍚庣紑
5. 杈撳嚭 `queue/jobs.json`
6. 鑷姩鍚姩瀹堟姢杩涚▼锛堝鏈繍琛岋級
7. 娉ㄥ唽椤圭洰鍒板叏灞€鏈嶅姟

### 浣跨敤绀轰緥

```bash
# 缂栬瘧鍏ㄩ儴锛岀敓鎴愬畬鏁寸殑 jobs.json
opsv generate

# 棰勮妯″紡锛屽揩閫熻瘯鐪嬪叧閿暅澶?opsv generate --preview

# 鍙紪璇戠 1銆?銆? 鍙烽暅澶?opsv generate --shots 1,3,7

# 鍙紪璇戣祫浜х洰褰曚腑鐨勮鑹插畾涔?opsv generate videospec/elements
```

### 浜х墿
- `queue/jobs.json` 鈥?鍖呭惈鎵€鏈夊緟鎵ц鐨勫浘鍍忕敓鎴愪换鍔?
---

## 6. `opsv gen-image`

鎵ц鍥惧儚鐢熸垚浠诲姟銆傝鍙?`queue/jobs.json` 涓殑鍥惧儚浠诲姟锛岃皟鐢?AI 娓叉煋寮曟搸鎵归噺鐢熸垚鍥惧儚銆?
> **0.4.3 鍙樻洿**锛氱敱 `execute-image` 閲嶅懡鍚嶄负 `gen-image`銆傛棫鍛戒护浠嶅彲浣跨敤锛堥殣钘忓埆鍚嶏級銆?
### 璇硶
```bash
opsv gen-image [options]
```

### 閫夐」

| 閫夐」 | 榛樿鍊?| 璇存槑 |
|------|--------|------|
| `-m, --model <model>` | `seadream-5.0-lite` | 鐩爣娓叉煋妯″瀷鍚嶇О |
| `-c, --concurrency <num>` | `1` | 骞跺彂浠诲姟鏁?|
| `-s, --skip-failed` | `false` | 鍗曚换鍔″け璐ユ椂缁х画鎵ц |
| `--dry-run` | `false` | 浠呮牎楠屼换鍔＄粨鏋勶紝涓嶅疄闄呮墽琛?|

### 鍓嶇疆鏉′欢
- `queue/jobs.json` 蹇呴』瀛樺湪锛堝厛鎵ц `opsv generate`锛?- API 瀵嗛挜蹇呴』宸查厤缃紙`SEADREAM_API_KEY` 鎴?`VOLCENGINE_API_KEY`锛?
### 浣跨敤绀轰緥

```bash
# 浣跨敤榛樿妯″瀷鐢熸垚鍥惧儚
opsv gen-image

# 浣跨敤鎸囧畾妯″瀷锛? 骞跺彂
opsv gen-image -m seadream-5.0-lite -c 2

# 浠呮牎楠屼笉鎵ц锛堟帓鏌ラ厤缃棶棰橈級
opsv gen-image --dry-run

# 瀹归敊妯″紡锛氬崟涓け璐ヤ笉涓柇鏁翠綋
opsv gen-image --skip-failed -c 3
```

### 浜х墿
- `artifacts/drafts_N/` 鈥?绗?N 鎵规鐨勬覆鏌撳浘鍍?
### 鍏宠仈妯″瀷
鏌ョ湅 `api_config.yaml` 涓?`gen_command: "gen-image"` 鐨勬ā鍨嬨€?
---

## 7. `opsv review [path]`

灏嗙敓鎴愮殑鍥惧儚/瑙嗛缁撴灉"鍙嶅摵"鍥炴簮 Markdown 鏂囨。锛屾柟渚垮婕斿湪 IDE 涓洿鎺ュ闃呫€?
### 璇硶
```bash
opsv review              # 鍥炲啓鏈€鏂颁竴鎵?opsv review --all         # 鍥炲啓鎵€鏈夊巻鍙叉壒娆?opsv review Script.md     # 鍙鐞嗙壒瀹氭枃浠?```

### 閫夐」

| 閫夐」 | 璇存槑 |
|------|------|
| `--all` | 鍖呭惈鎵€鏈夊巻鍙叉壒娆★紙涓嶄粎闄愪簬鏈€鏂扮殑锛?|
| `[path]` | 鎸囧畾瑕佸鐞嗙殑鏂囨。璺緞 |

### 瀹￠槄鏂瑰紡
鍥炲啓瀹屾垚鍚庯紝鍦?IDE锛堝 VS Code銆丆ursor锛変腑鎵撳紑 `.md` 鏂囦欢鐨勯瑙堟ā寮忥紝鍗冲彲鐩存帴鐪嬪埌鎵€鏈夊€欓€夊浘鍍忋€?
---

## 8. `opsv animate`

灏?`Shotlist.md` 涓殑鍔ㄦ€佽繍闀滄寚浠ょ紪璇戜负瑙嗛鐢熸垚浠诲姟闃熷垪銆?
### 璇硶
```bash
opsv animate
```

### 琛屼负
1. 璇诲彇 `videospec/shots/Shotlist.md` 鐨?YAML Frontmatter
2. 鎻愬彇姣忎釜 Shot 鐨?`motion_prompt_en`銆乣reference_image`銆乣duration` 绛夊瓧娈?3. 灏嗙浉瀵硅矾寰勮嚜鍔ㄨ浆鎹负缁濆璺緞
4. 鏀寔澶氬弬鑰冨浘锛堥甯с€佸熬甯с€佺壒寰佸浘锛夌殑鏁扮粍寮忎紶閫?5. 杈撳嚭 `queue/video_jobs.json`
6. 鑷姩鍚姩瀹堟姢杩涚▼骞舵敞鍐岄」鐩?
### 浜х墿
- `queue/video_jobs.json` 鈥?鍖呭惈鎵€鏈夊緟鎵ц鐨勮棰戠敓鎴愪换鍔?
---

## 9. `opsv gen-video`

> **0.4.3 鏂板鍛戒护**銆傛墽琛岃棰戠敓鎴愪换鍔★紝璋冪敤 Seedance / SiliconFlow 绛夎棰戞ā鍨嬨€?
### 璇硶
```bash
opsv gen-video [options]
```

### 閫夐」

| 閫夐」 | 榛樿鍊?| 璇存槑 |
|------|--------|------|
| `-m, --model <model>` | `seedance-1.5-pro` | 鐩爣瑙嗛妯″瀷鍚嶇О |
| `-s, --skip-failed` | `false` | 澶辫触鏃剁殑鎻愮ず锛堣棰戠绾夸负涓茶锛屼笉鍙烦杩囷級 |
| `--dry-run` | `false` | 浠呮牎楠屼换鍔＄粨鏋勶紝涓嶅疄闄呮墽琛?|

### 鍓嶇疆鏉′欢
- `queue/video_jobs.json` 蹇呴』瀛樺湪锛堝厛鎵ц `opsv animate`锛?- 瀵瑰簲 API 瀵嗛挜宸查厤缃細
  - Seedance: `VOLCENGINE_API_KEY` 鎴?`SEEDANCE_API_KEY`
  - SiliconFlow: `SILICONFLOW_API_KEY`

### 鎵ц妯″紡
**涓茶鎵ц**锛堥潪骞跺彂锛夈€傚師鍥狅細瑙嗛浠诲姟闂村彲鑳藉瓨鍦?`@FRAME` 渚濊禆閾锯€斺€斿悗涓€闀滃ご鐨勯甯ч渶瑕佹埅鍙栧墠涓€闀滃ご鐨勫熬甯с€俙VideoModelDispatcher` 浼氳嚜鍔ㄥ鐞嗭細

```
shot_1 鐢熸垚瀹屾瘯 鈫?鎴彇 shot_1_last.jpg 鈫?娉ㄥ叆 shot_2.first_image 鈫?shot_2 寮€濮嬬敓鎴?```

### 浣跨敤绀轰緥

```bash
# 浣跨敤榛樿妯″瀷锛圫eedance 1.5 Pro锛夌敓鎴愯棰?opsv gen-video

# 浣跨敤 SiliconFlow Wan 2.1 妯″瀷
opsv gen-video -m wan2.2-i2v

# 浠呮牎楠屼笉鎵ц
opsv gen-video --dry-run
```

### 浜х墿
- `artifacts/videos/` 鈥?鐢熸垚鐨勮棰戞枃浠讹紙.mp4锛?
### 鍏宠仈妯″瀷
鏌ョ湅 `api_config.yaml` 涓?`gen_command: "gen-video"` 鐨勬ā鍨嬨€?
---

## 瀹屾暣绠＄嚎鍛戒护娴?
```bash
# 鍥惧儚绠＄嚎
opsv generate 鈫?opsv gen-image 鈫?opsv review

# 瑙嗛绠＄嚎
opsv animate  鈫?opsv gen-video
```

---

## 鐜鍙橀噺

CLI 鍚姩鏃舵寜浠ヤ笅浼樺厛绾у姞杞界幆澧冨彉閲忥細

| 浼樺厛绾?| 璺緞 | 璇存槑 |
|--------|------|------|
| 1锛堟渶楂橈級 | `.env/secrets.env` | 鎺ㄨ崘鐨勫瘑閽ュ瓨鏀句綅缃?|
| 2 | `.env`锛堟枃浠讹級 | 鏍囧噯 dotenv 鏂囦欢锛堥潪鐩綍锛?|
| 3 | 绯荤粺鐜鍙橀噺 | `process.env` 鍏滃簳 |

### 鍏抽敭鐜鍙橀噺

| 鍙橀噺鍚?| 鐢ㄩ€?| 鍏宠仈鍛戒护 |
|--------|------|---------|
| `VOLCENGINE_API_KEY` | 鐏北寮曟搸 API 瀵嗛挜锛圫eaDream / Seedance锛?| `gen-image` / `gen-video` |
| `SEADREAM_API_KEY` | SeaDream 鐙珛瀵嗛挜 | `gen-image` |
| `SEEDANCE_API_KEY` | Seedance 鐙珛瀵嗛挜 | `gen-video` |
| `SILICONFLOW_API_KEY` | SiliconFlow API 瀵嗛挜 | `gen-video` |

---

> *OpsV 0.4.3 | 鏈€鍚庢洿鏂? 2026-03-28*
