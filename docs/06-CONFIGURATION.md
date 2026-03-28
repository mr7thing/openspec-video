# OpsV 閰嶇疆浣撶郴 (Configuration Guide)

> 鍙岄噸閰嶇疆浣撶郴锛氬瘑閽ュ綊瀵嗛挜锛屽弬鏁板綊鍙傛暟銆備竴鍒囩敓鎴愯涓虹敱閰嶇疆鏂囦欢椹卞姩銆?
---

## 1. 閰嶇疆鏋舵瀯鎬昏

```
project/
鈹斺攢鈹€ .env/                       # 鐜閰嶇疆鐩綍锛坓it 蹇界暐锛?    鈹溾攢鈹€ secrets.env             # API 瀵嗛挜锛堢粷瀵嗭級
    鈹斺攢鈹€ api_config.yaml         # 寮曟搸鍙傛暟锛堝彲鍏变韩锛?```

| 鏂囦欢 | 瀛樺偍鍐呭 | Git 璺熻釜 | 淇敼棰戠巼 |
|------|---------|---------|---------|
| `secrets.env` | API Key 绛夋晱鎰熶俊鎭?| 鉂?蹇界暐 | 鏋佸皯锛堝垵濮嬪寲鍚庝笉鍙橈級 |
| `api_config.yaml` | 妯″瀷鍙傛暟銆侀粯璁ゅ€笺€佽兘鍔涙弿杩?| 鉂?蹇界暐 | 鍋跺皵锛堝垏鎹㈡ā鍨?璋冨弬鏃讹級 |

---

## 2. API 瀵嗛挜閰嶇疆 (`secrets.env`)

### 鏍煎紡

```env
# 鐏北寮曟搸 API Key锛圫eaDream 鍥惧儚 + Seedance 瑙嗛锛?VOLCENGINE_API_KEY=your_volcengine_key_here

# SeaDream 鐙珛 Key锛堝涓庣伀灞卞紩鎿庝笉鍚岋級
SEADREAM_API_KEY=your_seadream_key_here

# SiliconFlow API Key锛圵an2.1 瑙嗛锛?SILICONFLOW_API_KEY=your_siliconflow_key_here
```

### 鍔犺浇浼樺厛绾?
CLI 鍚姩鏃舵寜浠ヤ笅浼樺厛绾у姞杞界幆澧冨彉閲忥細

```
1 (鏈€楂? 鈫?.env/secrets.env    # 鎺ㄨ崘瀛樻斁浣嶇疆
2        鈫?.env (鏂囦欢)          # 鏍囧噯 dotenv 鏂囦欢锛堥潪鐩綍锛?3 (鏈€浣? 鈫?绯荤粺鐜鍙橀噺         # process.env 鍏滃簳
```

### 楠岃瘉鏂瑰紡

```bash
# 鏌ョ湅鐜鍙橀噺鍔犺浇鐘舵€?opsv gen-image --dry-run
```

杈撳嚭灏嗘樉绀猴細
```
馃攳 Environment Check:
   - Config Source: .env/secrets.env
   - VOLCENGINE_API_KEY: Present (****abc1)
   - SEADREAM_API_KEY: Missing
```

---

## 3. 寮曟搸鍙傛暟閰嶇疆 (`api_config.yaml`)

### 瀹屾暣閰嶇疆妯℃澘

```yaml
# OpsV 0.4 澶氭ā鎬佽棰戝紩鎿庤皟搴﹂厤缃枃浠?# 璋冨害鍣?(Dispatcher) 鍦ㄥ彂鍑鸿姹傚墠涓ユ牸鏍规嵁姝よ〃鏄犲皠鍙傛暟
# gen_command 鏍囨敞璇ユā鍨嬬敱鍝釜 CLI 鍛戒护鎵ц

models:

  # ==========================================
  # 鍥惧儚妯″瀷锛氱伀灞卞紩鎿?SeaDream 5.0 Lite
  # CLI: opsv gen-image -m seadream-5.0-lite
  # ==========================================
  seadream-5.0-lite:
    provider: "seadream"
    model: "doubao-seedream-5-0-260128"
    gen_command: "gen-image"
    required_env: ["VOLCENGINE_API_KEY"]       # 鈫?0.4.3 澹版槑鎵€闇€ Key
    fallback_env: ["SEADREAM_API_KEY"]         # 鈫?澶囬€?Key锛堜换涓€瀛樺湪鍗冲彲锛?    features: ["txt2img", "img2img", "negative_prompt", "seed_control", "aspect_ratio", "sequential_generation"]
    defaults:
      quality: "2K"
      aspect_ratio: "1:1"
      max_images: 4
      steps: 30
      cfg_scale: 7.5
      negative_prompt: "blurry, low quality, distorted, deformed, ugly, bad anatomy, text, watermark"
    max_size:
      width: 2048
      height: 2048
    max_batch: 12

  # ==========================================
  # 瑙嗛妯″瀷锛歋iliconFlow Wan 2.1
  # CLI: opsv gen-video -m wan2.2-i2v
  # ==========================================
  wan2.2-i2v:
    provider: "siliconflow"
    model: "wan-ai/Wan2.1-T2V-14B"
    api_url: "https://api.siliconflow.cn/v1/video/submit"
    api_status_url: "https://api.siliconflow.cn/v1/video/status"
    gen_command: "gen-video"
    required_env: ["SILICONFLOW_API_KEY"]
    defaults:
      size: "1280x720"
      fps: 24
      duration: 5
    supports_first_image: true
    supports_middle_image: false
    supports_last_image: false
    supports_reference_images: false

  # ==========================================
  # 瑙嗛妯″瀷锛歋eedance 1.5 Pro (鐏北寮曟搸)
  # CLI: opsv gen-video -m seedance-1.5-pro
  # ==========================================
  seedance-1.5-pro:
    provider: "seedance"
    model: "doubao-seedance-1-5-pro"
    api_url: "https://ark.cn-beijing.volces.com/api/v3/video/submit"
    gen_command: "gen-video"
    required_env: ["VOLCENGINE_API_KEY"]
    fallback_env: ["SEEDANCE_API_KEY"]
    quality_map:
      "480p": "480p"
      "720p": "720p"
      "1080p": "1080p"
    defaults:
      quality: "720p"
      aspect_ratio: "16:9"
      duration: 5
      fps: 24
      sound: true
    supports_first_image: true
    supports_middle_image: false
    supports_last_image: true
    supports_reference_images: true
```

---

## 4. 妯″瀷鑳藉姏鐭╅樀

| 鑳藉姏 | SeaDream 5.0 | Wan 2.1 | Seedance 1.5 Pro |
|------|:---:|:---:|:---:|
| **绫诲瀷** | 鍥惧儚 | 瑙嗛 | 瑙嗛 |
| **棣栧抚鍙傝€?* | N/A | 鉁?| 鉁?|
| **灏惧抚鍙傝€?* | N/A | 鉂?| 鉁?|
| **涓棿甯?* | N/A | 鉂?| 鉂?|
| **瑙掕壊鍙傝€冨浘** | N/A | 鉂?| 鉁?|
| **缁勫浘妯″紡** | 鉁?(1-12) | 鉂?| 鉂?|
| **璐熼潰鎻愮ず璇?* | 鉁?| 鉂?| 鉂?|
| **绉嶅瓙鎺у埗** | 鉁?| 鉂?| 鉂?|
| **绌洪棿闊抽** | N/A | 鉂?| 鉁?|
| **鐢诲箙閫夐」** | 5 绉?| 鍥哄畾 | 7 绉?|
| **鍒嗚鲸鐜?* | 2K-4K | 720p | 480p-1080p |

---

## 5. 鍏抽敭鍙傛暟瑙ｈ

### `max_images`锛堢粍鍥炬暟閲忥級

褰?`max_images > 1` 鏃讹紝娓叉煋寮曟搸鑷姩婵€娲?杩炵画鐢熸垚"妯″紡锛?- 绯荤粺鍚?Prompt 娉ㄥ叆杩炶疮鎬у紩瀵艰瘝
- 鍚屼竴瀹炰綋鐨勫寮犲浘鐗囦繚鎸侀珮搴︾壒寰佷竴鑷存€?- **鎺ㄨ崘鍊?*锛歚4`锛堝吋椤炬晥鐜囦笌澶氭牱鎬э級
- **涓婇檺**锛歚12`

### `global_style_postfix`锛堝叏灞€椋庢牸鍚庣紑锛?
瀹氫箟鍦?`videospec/project.md` 涓紝缂栬瘧鍣ㄥ湪 `opsv generate` 鏃惰嚜鍔ㄦ敞鍏ユ瘡涓换鍔＄殑 Prompt 鏈熬锛?
```
[Shot Prompt] + [Asset Description] + [global_style_postfix]
```

绀轰緥锛歚"cinematic lighting, ultra detailed, masterpiece, arri alexa 65, 8k"`

### `quality_map`锛堣川閲忔槧灏勶級

涓嶅悓妯″瀷鐨勫垎杈ㄧ巼鍙傛暟鍚嶇О涓嶇粺涓€銆俙quality_map` 灏?OpsV 鏍囧噯鍖栫殑璐ㄩ噺绛夌骇鏄犲皠鍒板悇妯″瀷鐨勫師鐢熷弬鏁般€?
---

## 6. 妯℃澘涓庢湰鍦伴厤缃殑鍏崇郴

```
瀹夎鍖咃紙npm 鍖咃級               鐢ㄦ埛椤圭洰
templates/.env/                 .env/
鈹溾攢鈹€ api_config.yaml      鈫掆啋鈫?  鈹溾攢鈹€ api_config.yaml   (opsv init 澶嶅埗)
鈹斺攢鈹€ secrets.env          鈫掆啋鈫?  鈹斺攢鈹€ secrets.env        (opsv init 澶嶅埗)
```

- `opsv init` 灏?`templates/.env/` 浣滀负绉嶅瓙妯℃澘澶嶅埗鍒版柊椤圭洰
- 鐢ㄦ埛淇敼鏈湴 `.env/` 涓嶅奖鍝嶅叏灞€妯℃澘
- 鎵嬪姩鍗囩骇鏃跺彲瀵规瘮 `templates/.env/api_config.yaml` 鑾峰彇鏂板弬鏁?
---

## 7. 娣诲姞鏂版ā鍨?
1. 鍦?`api_config.yaml` 涓坊鍔犳柊妯″瀷閰嶇疆鍧楋紙鍚?`required_env`锛?2. 鍦?`secrets.env` 涓坊鍔犲搴旂殑 API Key
3. 鍦?`src/executor/providers/` 涓疄鐜板搴旂殑 Provider 绫?4. 鍦?`ImageModelDispatcher` 鎴?`VideoModelDispatcher` 涓敞鍐屾柊 Provider
5. 鏇存柊 `docs/07-API-REFERENCE.md` 娣诲姞鎺ュ彛鏂囨。

```yaml
# api_config.yaml 鏂板绀轰緥
models:
  my-new-model:
    provider: "custom"
    model: "model-endpoint-id"
    api_url: "https://api.example.com/v1/generate"
    gen_command: "gen-image"          # 鎴?"gen-video"
    required_env: ["MY_MODEL_API_KEY"]
    defaults:
      quality: "720p"
      duration: 5
    supports_first_image: true
    supports_last_image: false
```

### `required_env` / `fallback_env` 瀛楁

澹版槑妯″瀷鎵€闇€鐨?API Key 鐜鍙橀噺鍚嶃€侰LI 鍦ㄦ墽琛屽墠鏌ヨ〃鏍￠獙锛屾棤闇€纭紪鐮併€?
| 瀛楁 | 鍚箟 | 绀轰緥 |
|------|------|------|
| `required_env` | 蹇呴渶鐨?Key锛堣嚦灏戜竴涓瓨鍦級 | `["VOLCENGINE_API_KEY"]` |
| `fallback_env` | 澶囬€?Key锛坮equired 涓嶅瓨鍦ㄦ椂灏濊瘯锛?| `["SEADREAM_API_KEY"]` |

---

> *"閰嶇疆鍗冲懡浠わ紝鍙傛暟鍗崇邯寰嬨€?*
> *OpsV 0.4.3 | 鏈€鍚庢洿鏂? 2026-03-28*
