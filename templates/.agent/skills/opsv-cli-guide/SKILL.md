---
name: opsv-cli-guide
description: 鎸囧濡備綍鍦ㄨ棰戝埗浣滄祦绋嬩腑浣跨敤 OpsV CLI 鍛戒护杩涜鑷姩鍖栫紪鎺掋€傜悊瑙?opsv generate, gen-image, animate, gen-video 涔嬮棿鐨勬祦姘寸嚎閫昏緫鍙婂叾璋冪敤鏈€浣冲疄璺点€?
---

# OpsV CLI 鍛戒护浣跨敤鎸囧崡

璇ユ妧鑳戒綔涓?OpenSpec-Video (OpsV) 鐨勬牳蹇?CLI 鏋舵瀯浣跨敤鎵嬪唽锛屼换浣曟秹鍙婄敓鎴愶紙鍥惧儚/瑙嗛锛夊拰绠＄嚎缂栨帓鐨?Agent锛屽湪璋冪敤鍓嶆鎶€鑳戒綔涓洪閫夊弬鑰冦€?

## 鏍稿績绠＄嚎鐢熷懡鍛ㄦ湡

 OpsV 鐨勭敓鎴愰噰鐢?**"鍙樺紓-鎵ц-鍙嶅啓" (Compile -> Execute -> Review)** 宸ヤ綔娴侊紝褰诲簳瑙ｈ€︿汉绫荤殑鍒涙剰璁捐涓?AI 鐨勬壒閲忔墽琛屻€傛墍鏈夌殑娓叉煋鎸囦护骞朵笉鏄洿鎺ョ敱 Agent 璋冪敤鐨?API 鍙戣捣锛岃€屾槸锛?

1. Agent 淇敼 `.md` 澹版槑鏂囦欢銆?
2. 璋冨害 CLI 鎶?`.md` "缂栬瘧"鎴?`jobs.json` 闃熷垪鏂囦欢銆?
3. 鎵ц涓撶敤鐨?CLI 璋冨害 AI 鎵归噺娓叉煋闃熷垪骞惰惤鐩樸€?
4. Review 灏嗚祫婧愯矾寰勫洖鍐欏埌 `.md`銆?

## 馃幆 鍏抽敭鍛戒护璇﹁В

### 1. OpsV 鍒濆鍖栦笌鍚庡彴
- **`opsv init`**: 鍦ㄤ竴涓┖鐩綍鎵ц浠ユ惌寤鸿鑼冩枃浠朵綋绯荤粨鏋勩€?
- **`opsv serve`**: 鍚姩 WebSocket 鐩戝惉锛屽畧鎶よ繘绋嬮┗瀛樺悗鍙?(鍦ㄤ换浣曟墽琛岀敓鎴愮殑鏈哄櫒鍓嶇疆纭繚瀹冭繍琛?銆?

### 2. 鍥惧儚鐢熸垚绠＄嚎 (Image Pipeline)

鍥惧儚鐢熸垚璐┛鍏冪礌銆佸満鏅瀹氬浘鐨勮璁¤繃绋嬨€?

- **缂栬瘧**: `opsv generate [鐩爣璺緞]`
  - 瑙ｆ瀽鎵€鏈夌殑 `.md`锛屽皢 Frontmatter 閲岀殑鍙傛暟杞寲鎴愬叿浣撶殑 Job JSON 闃熷垪 (瀛樺叆 `queue/jobs.json`)銆?
  - *鎶€宸?: `opsv generate --preview` 鍙敓鎴愭瀬绠€瑙嗗浘锛岃妭鐪佽祫婧愩€?
- **鎵ц**: `opsv gen-image` 
  - (鏇夸唬浜嗘棫鐗堢殑 `execute-image`) 鎵归噺璋冪敤 `queue/jobs.json` 涓殑浠诲姟骞舵妸鍥句笅杞藉€?`artifacts/drafts_X/`銆?
  - 鍙傛暟鏀寔 `-m <model>` 鍙婂苟鍙?`-c`銆?
- **鍙嶅啓**: `opsv review`
  - 姝ゅ懡浠ら潪甯稿叧閿€傚浘鍍忕敓鎴愬悗锛岃鍛戒护浼氭煡鎵惧埌瀵瑰簲璧勪骇鐨?`Script.md` 鎴?`.md` 涓紝瀵绘壘鐢诲粖浣嶇敋鑷虫浛鎹紝浠ヤ究鍦ㄤ唬鐮佺紪杈戝櫒鐩存帴灞曠幇鍑洪瑙堝浘鍍忋€傚婕旈殢鍚庡彲鍦?`## Approved References` 鎵嬪姩璐村叆鐪嬩腑鐨勮矾寰勫疄鐜扳€滃畾妗ｂ€濄€?

### 3. 瑙嗛鐢熸垚绠＄嚎 (Video Pipeline)

瑙嗛鐢熸垚鍙戠敓鍦ㄥ墽鏈€佸垎闀滅殑瀹氱骇銆佸浘鐗囪祫浜у畬澶囦箣鍚庛€備富瑕佽В鏋?`videospec/shots/Shotlist.md`銆?

- **缂栨帓**: `opsv animate`
  - 鎻愬彇姣忎竴涓暅澶?(Shot) 涓殑 `motion_prompt_en` 鍔ㄤ綔鎻愮ず璇嶏紝鍙婇甯с€佸熬甯у拰寤舵椂甯ч攣瀹氬紩鐢?`@FRAME`)鐨勫叧绯婚摼锛岃緭鍑哄埌 `queue/video_jobs.json`銆?
- **鎵ц**: `opsv gen-video`
  - 璇诲彇涓婅堪鐨勯槦鍒楀苟涓茶鍠傞€佺粰鏍稿績瑙嗘晥妯″瀷锛堝 Seedance 1.5 Pro锛夈€?
  - 鍥犱负闀块暅澶寸殑杩炵画鎬т緷璧栦簬鐢卞墠涓€闀滃ご鐨勫熬甯х敓鎴愮殑锛屽洜姝や笉鏀寔 `--skip-failed` 鏃惰烦杩囧悗缁己鐩稿叧浠诲姟銆?

## 馃洜锔?鍦ㄥ伐浣滄祦涓殑鍗忓悓绀轰緥 

**鍦烘櫙 1锛氳璁¤鑹茬敓鎴愪笁瑙嗗浘**
褰撲綘锛圓gent锛夊啓瀹屼簡 `videospec/elements/CharacterA.md`銆?
- 鎵ц `opsv generate videospec/elements/CharacterA.md`銆?
- 鎵ц `opsv gen-image -m seadream-5.0-lite -c 3`銆?
- 鎵ц `opsv review`銆?
- 璇峰婕旇繘 IDE 鐪嬪浘銆?

**鍦烘櫙 2锛氱敓鎴愯棰戞渶缁堟垚鐗?*
瀵兼紨宸茬粡纭瀹屾垚浜?`videospec/shots/Script.md` 骞跺湪 IDE 涓寚瀹氫簡鎵€鏈夌殑瀹氭。鍙傝€冨浘 (`a-ref`)銆?
- 鎵ц `opsv animate` 閿佸畾鍒嗛暅鍔ㄤ綔鍜屾椂闂村抚銆?
- 鎵ц `opsv gen-video -m seedance-1.5-pro`銆?

## 鈿狅笍 闃查敊娉ㄦ剰浜嬮」

1. **涓嶅彲璺ㄧ骇璋冪敤**锛氬垏鍕跨洿鎺ヨ烦杩?`generate`/`animate` 鑰屾墽琛?`gen-image`/`gen-video`锛屽洜涓?CLI 璁捐涓ユ牸璇诲彇鍦?`queue` 閲屾渶鏂扮紪璇戠殑浠诲姟銆?
2. **瀵嗛挜缂哄け鎷︽埅**锛氬鏋滃湪鎵ц `gen-image`/`gen-video` 鏃舵彁绀?API 閿欒鎴栫己灏?Key锛岄』寮曞鐢ㄦ埛妫€鏌?`templates/.env/api_config.yaml` 鎴栧叾瀵瑰簲鐨?`secrets.env` 璁剧疆銆?

