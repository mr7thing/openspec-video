# OpenSpec-Video Schema 蹇€熷弬鑰?

> 涓€浠界畝娲佺殑 OpsV 0.3.2 Schema 閫熸煡琛?

---

## 鏂囦欢缁撴瀯閫熸煡

```
project/
鈹溾攢鈹€ videospec/
鈹?  鈹溾攢鈹€ project.md           # 椤圭洰閰嶇疆 (ProjectConfig)
鈹?  鈹溾攢鈹€ stories/
鈹?  鈹?  鈹斺攢鈹€ story.md         # 鏁呬簨澶х翰
鈹?  鈹溾攢鈹€ elements/            # 瑙掕壊/閬撳叿璧勪骇
鈹?  鈹?  鈹溾攢鈹€ @role_hero.md    # Character Schema
鈹?  鈹?  鈹斺攢鈹€ @prop_sword.md   # Prop Schema
鈹?  鈹溾攢鈹€ scenes/              # 鍦烘櫙璧勪骇
鈹?  鈹?  鈹斺攢鈹€ @scene_forest.md # Scene Schema
鈹?  鈹斺攢鈹€ shots/
鈹?      鈹溾攢鈹€ Script.md        # 闈欐€佸垎闀?(Shot Schema)
鈹?      鈹斺攢鈹€ Shotlist.md      # 鍔ㄦ€佸彴鏈?(Shotlist Schema)
鈹溾攢鈹€ queue/
鈹?  鈹溾攢鈹€ jobs.json            # 鍥惧儚浠诲姟闃熷垪 (Job Schema)
鈹?  鈹斺攢鈹€ video_jobs.json      # 瑙嗛浠诲姟闃熷垪 (Job Schema)
鈹斺攢鈹€ artifacts/
    鈹斺攢鈹€ drafts_N/            # 鐢熸垚浜х墿
```

---

## YAML Frontmatter 妯℃澘

### 椤圭洰閰嶇疆 (project.md)

```yaml
---
name: "Project Name"
aspect_ratio: "16:9"
resolution: "2K"
schema_version: "0.3.2"
---
```

### 瑙掕壊璧勪骇 (@role_*.md)

```yaml
---
name: "@role_name"
type: "character"
has_image: false
visual_traits:
  age_group: "young adult"
  clothing: "description"
schema_version: "0.3.2"
---
```

### 鍦烘櫙璧勪骇 (@scene_*.md)

```yaml
---
name: "@scene_name"
type: "scene"
has_image: false
atmosphere:
  mood: "tense and mysterious"
schema_version: "0.3.2"
---
```

### 閬撳叿璧勪骇 (@prop_*.md)

```yaml
---
name: "@prop_name"
type: "prop"
has_image: false
prop_category: "weapon"
significance: "key"
schema_version: "0.3.2"
---
```

### 鍒嗛暅 (Script.md)

```yaml
---
shots:
  - id: "shot_001"
    environment: "@scene_name or description"
    subject: "@role_name action"
    camera:
      shot_type: "medium_shot"
    duration: "5s"
---
```

---

## 鍏抽敭瀛楁閫熸煡琛?

### 璧勪骇瀛楁

| 瀛楁 | 绫诲瀷 | 蹇呭～ | 璇存槑 |
|------|------|------|------|
| `name` | string | 鉁?| `@identifier` 鏍煎紡 |
| `type` | enum | 鉁?| character/scene/prop/... |
| `has_image` | boolean | 鉁?| 鏄惁鏈夊弬鑰冨浘 |
| `reference_images` | array | 鏉′欢 | `has_image=true` 鏃跺繀濉?|
| `visual_traits` | object | 鏉′欢 | character 绫诲瀷蹇呭～ |
| `atmosphere` | object | 鏉′欢 | scene 绫诲瀷蹇呭～ |

### 浠诲姟瀛楁

| 瀛楁 | 绫诲瀷 | 蹇呭～ | 璇存槑 |
|------|------|------|------|
| `id` | string | 鉁?| 鍞竴鏍囪瘑 |
| `type` | enum | 鉁?| image_generation/video_generation |
| `prompt_en` | string | - | 鑻辨枃娓叉煋鎻愮ず璇?|
| `payload` | object | 鉁?| 缁撴瀯鍖栨暟鎹?|
| `output_path` | string | 鉁?| 杈撳嚭缁濆璺緞 |
| `reference_images` | array | - | 鍙傝€冨浘璺緞 |

### 鍒嗛暅瀛楁

| 瀛楁 | 绫诲瀷 | 蹇呭～ | 璇存槑 |
|------|------|------|------|
| `id` | string | 鉁?| `shot_NNN` 鏍煎紡 |
| `environment` | string | 鉁?| 鍦烘櫙寮曠敤鎴栨弿杩?|
| `subject` | string | 鉁?| 涓讳綋鎻忚堪锛堝彲鍚獲寮曠敤锛?|
| `camera.shot_type` | enum | 鉁?| 鏅埆 |
| `duration` | string | - | 瑙嗛蹇呭～ (e.g., "5s") |

---

## @寮曠敤璇硶

### 鍩烘湰璇硶

```markdown
# 鏂规嫭鍙峰紩鐢紙鎺ㄨ崘锛?
[entity_id]           # 渚嬪: [@role_hero]

# @鐩存帴寮曠敤
@entity_id            # 渚嬪: @role_hero

# 鍦?YAML 涓?
subject: "[@role_hero] enters [@scene_bar]"
```

### 寮曠敤瑙ｆ瀽浼樺厛绾?

1. `videospec/elements/{id}.md` - 瑙掕壊/閬撳叿
2. `videospec/scenes/{id}.md` - 鍦烘櫙
3. 鍐呰仈鎻忚堪锛坒allback锛?

---

## 鐩告満鏈琛?

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
| `eye_level` | 骞宠锛屾渶甯哥敤 |
| `low_angle` | 浠版媿锛屾樉楂樺ぇ |
| `high_angle` | 淇媿锛屾樉娓哄皬 |
| `dutch` | 鑽峰叞瑙掞紝鍊炬枩涓嶅畨 |

### 杩愬姩 (Movement)

| 鏈 | 璇存槑 |
|------|------|
| `static` | 鍥哄畾鏈轰綅 |
| `dolly_in/out` | 鎺?鎷?|
| `pan_left/right` | 宸﹀彸鎽?|
| `truck_left/right` | 宸﹀彸绉?|
| `crane_up/down` | 鍗囬檷 |

---

## 鏋氫妇鍊奸€熸煡

### 鐢诲箙姣斾緥
```yaml
aspect_ratio:
  - "16:9"    # 瀹藉睆锛堥粯璁わ級
  - "9:16"    # 绔栧睆
  - "1:1"     # 鏂瑰舰
  - "21:9"    # 瓒呭
  - "4:3"     # 缁忓吀
  - "2.39:1"  # 鐢靛奖瀹藉睆
```

### 鍒嗚鲸鐜?
```yaml
resolution:
  - "480p"
  - "1080p"
  - "2K"      # 榛樿
  - "4K"
  - "8K"
```

### 瑙嗛鏃堕暱涓婇檺
```yaml
duration:
  - "3s"
  - "5s"      # 鎺ㄨ崘
  - "10s"
  - "15s"     # 涓婇檺
```

---

## 楠岃瘉鍛戒护

```bash
# 楠岃瘉鏁翠釜椤圭洰
opsv validate

# 楠岃瘉鐗瑰畾鏂囦欢
opsv validate ./videospec/elements/@role_hero.md

# 楠岃瘉浠诲姟闃熷垪
opsv validate ./queue/jobs.json --type job

# 浣跨敤 JSON Schema 楠岃瘉
npx ajv-cli validate \
  -s docs/schema/json/job.schema.json \
  -d queue/jobs.json
```

---

## 甯歌閿欒鐮?

| 閿欒鐮?| 鍚箟 | 瑙ｅ喅鏂规 |
|--------|------|----------|
| E1001 | 璧勪骇涓嶅瓨鍦?| 妫€鏌?`@name` 鏄惁鏈夊搴旀枃浠?|
| E1002 | 缂哄皯鍙傝€冨浘 | `has_image=true` 鏃舵彁渚?`reference_images` |
| E2001 | 閰嶇疆鏃犳晥 | 妫€鏌?`aspect_ratio` 鏄惁鍦ㄥ厑璁稿€间腑 |
| E3001 | 浠诲姟ID閲嶅 | 纭繚鍚屼竴鎵规鍐匢D鍞竴 |
| E3003 | 瑙嗛缂哄皯鏃堕暱 | 瑙嗛浠诲姟蹇呴』璁剧疆 `duration` |

---

## 鎵╁睍闃呰

- [瀹屾暣 Schema 瑙勮寖](./OPSV-SCHEMA-SPEC-0.3.2.md)
- [JSON Schema: Job](./json/job.schema.json)
- [JSON Schema: Asset](./json/asset.schema.json)
- [JSON Schema: Project Config](./json/project-config.schema.json)

---

*鐗堟湰: 0.3.2 | 鏈€鍚庢洿鏂? 2026-03-15*

