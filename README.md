# Videospec (OpsV) 0.4.3 鈥?宸ヤ笟绾х數褰辨劅娴佹按绾?(Cinematic Workflow Evolution)

> 绾厓锛歚0.3` 鈫?`0.4.3` | 浠庘€滃垱浣滃疄楠屸€濆悜鈥滃伐涓氱骇璧勪骇缂栬瘧鍣ㄢ€濈殑缁堟瀬璺冭縼

## 0.4.x 鏍稿績浣垮懡
0.4 绯诲垪鐗堟湰閫氳繃寮曞叆 **d-ref (Design) / a-ref (Approved)** 鍙岄€氶亾鍙傝€冧綋绯诲拰**绾ц仈寮忕幆澧冩牎楠?(Cascading Config)**锛屽交搴曡В鍐充簡澶фā鍨嬪垱浣滀腑鈥滈鏍奸绉烩€濆拰鈥滈厤缃贩涔扁€濈殑鐥涚偣銆傝繖鏄竴涓负鈥淎I 瀵兼紨鈥濋噺韬畾鍒剁殑鍩虹煶鐗堟湰銆?

---

## 瀹夎涓庨儴缃?(Installation)

### 1. 鍏ㄥ眬瀹夎 (鎺ㄨ崘)
鐩存帴浠?npm 瀹樻柟浠撳簱瀹夎锛屼竴閿幏鍙?`opsv` 鍏ㄥ眬鎸囦护锛?
```bash
npm install -g videospec
```
瀹夎瀹屾垚鍚庯紝鍦ㄤ换鎰忕粓绔緭鍏ワ細
```bash
opsv --version  # 杩斿洖 0.4.3
```

### 2. 鏈湴寮€鍙戝畨瑁?
濡傛灉鎮ㄩ渶瑕佹繁搴﹀畾鍒舵垨鍙備笌寮€鍙戯細
```bash
git clone https://github.com/mr7thing/openspec-video.git
npm install
npm run build
```

---

## 0.4.3 閲嶅ぇ鐗规€?(Major Highlights)

### 1. d-ref / a-ref 鍙岄€氶亾浣撶郴
*   **d-ref (Design References)**: 鍦ㄨ祫浜ц璁￠樁娈碉紝浣滀负鈥滅伒鎰熷簳鑹测€濊娓叉煋寮曟搸娑堣垂銆?
*   **a-ref (Approved References)**: 鍦ㄨ瘎瀹￠€氳繃鍚庯紝浣滀负鈥滃敮涓€瑙嗚閿氱偣鈥濊嚜鍔ㄦ敞鍏ュ悗缁垎闀滀笌瑙嗛鐢熸垚浠诲姟锛岀‘淇濊鑹?鍦烘櫙鍦ㄥ叏鍓т腑鐨勮瑙変竴鑷存€с€?
*   *涓嶅啀渚濊禆闅愭櫐鐨?`has_image` 瀛楁锛屽叏闈㈣浆鍚?Markdown 閾炬帴瑙ｆ瀽銆?

### 2. 绾ц仈寮忕幆澧冩牎楠?(Robust Provider Engine)
*   **涓ユ牸 Key 鏍￠獙**锛氭墍鏈?Provider 鍦ㄦ墽琛屽墠鍧囦細杩涜 `required_env` 寮烘牎楠岋紝閬垮厤鍥犵己澶?API Key 瀵艰嚧鐨勬棤鎰忎箟閲嶈瘯銆?
*   **寮傚父绌块€忛€昏緫**锛氶拡瀵?NSFW 灞忚斀鎴栦綑棰濅笉瓒崇瓑杩滅▼閿欒锛屽紩鎿庝細绔嬪嵆缁堟浠诲姟骞惰褰曠簿鍑嗘棩蹇楋紝涓嶅啀闄峰叆姝诲惊鐜€?
*   **SeaDream 5.0 澧炲己**锛氭敮鎸佸浘鐢熷浘 (I2I)銆佺粍鍥捐繛缁敓鎴?(Max Images) 鍙婂鍙傝€冨浘铻嶅悎銆?

### 3. 妯″潡鍖?CLI 鏋舵瀯
*   **鏍稿績瑙ｈ€?*锛氬師濮嬭噧鑲跨殑 `src/cli.ts` 宸叉媶鍒嗕负 `src/commands/` 涓嬬殑鐙珛妯″潡锛坓en-image, gen-video, daemon 绛夛級銆?
*   **鎸囦护瀵归綈**锛氬叏闈慨姝ｄ簡鍛戒护鍛藉悕瑙勮寖锛屼娇鍏舵洿绗﹀悎 Unix 寮€鍙戜範鎯笌 Agent 鑷姩鍖栬皟鐢ㄣ€?

---

## 鐪熺浉婧?(Source of Truth) 鐩綍缁撴瀯

```text
/
鈹溾攢鈹€ .env/                   # 鐜閰嶇疆 (宸插拷鐣ワ紝鏈湴鍞竴)
鈹?  鈹溾攢鈹€ api_config.yaml     # 寮曟搸鍙傛暟 (绾ц仈鏍￠獙锛歳equired_env)
鈹?  鈹斺攢鈹€ secrets.env         # API 瀵嗛挜 (椤圭洰涓嶈窡韪?
鈹溾攢鈹€ .agent/                 # AI 鏅哄泭鍥?(Architect, Screenwriter...)
鈹溾攢鈹€ docs/schema/            # 0.4.x 宸ヤ笟绾у崗璁鑼?
鈹溾攢鈹€ videospec/              # 鏍稿績鍓ф湰璧勪骇
鈹?  鈹溾攢鈹€ elements/           # 浣跨敤 d-ref 鎻忚堪鐨勫疄浣撹祫浜?
鈹?  鈹斺攢鈹€ shots/
鈹?      鈹溾攢鈹€ Script.md       # 閿氬畾 a-ref 鐨勯潤鎬佸垎闀?
鈹?      鈹斺攢鈹€ Shotlist.md     # 閿佸畾 a-ref 鐨勫姩鎬佽繍闀滃彴鏈?
鈹斺攢鈹€ artifacts/              # 缂栬瘧浜х墿 (Images & Videos)
```

---

## 鏍稿績缂栬瘧鍣ㄦ寚浠?(CLI)

| 鍛戒护                 | 鑱岃矗           | 0.4.3 鏋佺畝鐗规€?                                     |
| -------------------- | -------------- | --------------------------------------------------- |
| `opsv init`          | 鐜鑴氭墜鏋堕儴缃?| 鑷姩鍚屾 `.agent` 鎶€鑳藉簱涓庢妧鑳藉弬鑰冪ず渚?             |
| `opsv generate`      | 缂栬瘧闈欐€佷换鍔?  | 瑙ｆ瀽 Markdown 閾炬帴锛岃嚜鍔ㄥ尯鍒?d-ref 涓?a-ref         |
| `opsv execute-image` | 鎵ц娓叉煋       | 寮哄姏娉ㄥ叆 `style_postfix` 涓庡弬鑰冨浘璺緞               |
| `opsv review`        | 瑙嗚璧勪骇璇勫   | 鑷姩鍖栧洖鏄炬渶鏂拌崏鍥捐嚦 `.md` 瀵瑰簲绔犺妭                 |
| `opsv animate`       | 缂栬瘧瑙嗛浠诲姟   | 绾ц仈鍚堝苟 `global_settings` 涓庡垎闀滅骇 `motion_prompt` |

---

> *鈥滀唬鐮佹槸鍐欑粰浜虹湅鐨勶紝鍙槸椤轰究璁╂満鍣ㄨ繍琛屻€傗€?   
> *鈥溾€斺€?OpsV锛岃鍒涗綔鍍忕紪璇戜唬鐮佷竴鏍风簿鍑嗐€傗€?  
> *鈥溾€斺€?鏌掑彅 & Antigravity鈥?

