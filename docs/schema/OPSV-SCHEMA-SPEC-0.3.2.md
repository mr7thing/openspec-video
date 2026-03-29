# OpenSpec-Video Schema 瑙勮寖鏂囨。 (v0.3.2)

> **鐗堟湰**: 0.3.2  
> **鏃ユ湡**: 2026-03-15  
> **鐘舵€?*: 姝ｅ紡鐗? 
> **閫傜敤**: OpsV CLI, Agent Skills, 绗笁鏂归泦鎴?

---

## 鐩綍

1. [姒傝堪](#1-姒傝堪)
2. [Schema 璁捐鍘熷垯](#2-schema-璁捐鍘熷垯)
3. [璧勪骇 Schema (Asset Schema)](#3-璧勪骇-schema-asset-schema)
4. [浠诲姟 Schema (Job Schema)](#4-浠诲姟-schema-job-schema)
5. [椤圭洰閰嶇疆 Schema](#5-椤圭洰閰嶇疆-schema)
6. [鍒嗛暅 Schema (Shot Schema)](#6-鍒嗛暅-schema-shot-schema)
7. [鍔ㄦ€佸彴鏈?Schema (Shotlist Schema)](#7-鍔ㄦ€佸彴鏈?schema-shotlist-schema)
8. [鏋氫妇绫诲瀷瀹氫箟](#8-鏋氫妇绫诲瀷瀹氫箟)
9. [楠岃瘉瑙勫垯](#9-楠岃瘉瑙勫垯)
10. [鐗堟湰鍏煎鎬(#10-鐗堟湰鍏煎鎬?
11. [绀轰緥闆嗗悎](#11-绀轰緥闆嗗悎)

---

## 1. 姒傝堪

### 1.1 浠€涔堟槸 OpsV Schema

OpsV Schema 鏄竴濂?*涓ユ牸绫诲瀷鍖?*鐨勬暟鎹粨鏋勮鑼冿紝鐢ㄤ簬瀹氫箟锛?
- 瑙嗚璧勪骇锛堣鑹层€佸満鏅€侀亾鍏凤級鐨勫厓鏁版嵁
- AI 鐢熸垚浠诲姟鐨勮緭鍏ヨ緭鍑烘牸寮?
- 椤圭洰绾ч厤缃弬鏁?
- 鍒嗛暅鍜屽姩鎬佸彴鏈殑鏁版嵁缁撴瀯

### 1.2 Schema 灞傜骇

```
鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
鈹?                    Schema 灞傜骇鏋舵瀯                          鈹?
鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
鈹? L1: 璧勪骇灞?(Asset Layer)                                    鈹?
鈹?     鈹溾攢 Character Schema (瑙掕壊)                              鈹?
鈹?     鈹溾攢 Scene Schema (鍦烘櫙)                                  鈹?
鈹?     鈹斺攢 Prop Schema (閬撳叿)                                   鈹?
鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
鈹? L2: 浠诲姟灞?(Job Layer)                                      鈹?
鈹?     鈹溾攢 ImageGenerationJob (鍥惧儚鐢熸垚)                        鈹?
鈹?     鈹斺攢 VideoGenerationJob (瑙嗛鐢熸垚)                        鈹?
鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
鈹? L3: 椤圭洰灞?(Project Layer)                                  鈹?
鈹?     鈹斺攢 ProjectConfig (椤圭洰閰嶇疆)                             鈹?
鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
鈹? L4: 鍙欎簨灞?(Narrative Layer)                                鈹?
鈹?     鈹溾攢 Script Schema (闈欐€佸垎闀?                             鈹?
鈹?     鈹斺攢 Shotlist Schema (鍔ㄦ€佸彴鏈?                           鈹?
鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
```

### 1.3 鏍煎紡绾﹀畾

- **鏂囦欢鏍煎紡**: YAML frontmatter + Markdown body
- **缂栫爜**: UTF-8
- **鎹㈣**: LF (\n)
- **缂╄繘**: 2 涓┖鏍?(YAML)
- **鍛藉悕瑙勮寖**: snake_case (YAML keys), @prefix_id (璧勪骇寮曠敤)

---

## 2. Schema 璁捐鍘熷垯

### 2.1 鍗曚竴鐪熺浉婧?(Single Source of Truth)

姣忎釜鏁版嵁瀹炰綋鍙湪涓€涓綅缃畾涔夛紝閫氳繃 `@寮曠敤` 寤虹珛鍏宠仈銆?

### 2.2 鍚戝悗鍏煎 (Backward Compatibility)

- 鏂板瀛楁蹇呴』鏄?`optional`
- 搴熷純瀛楁淇濈暀鑷冲皯 2 涓富鐗堟湰鍛ㄦ湡
- 浣跨敤 `version` 瀛楁鏍囪 Schema 鐗堟湰

### 2.3 娓愯繘寮忓寮?(Progressive Enhancement)

鍩虹瀛楁淇濊瘉鏍稿績鍔熻兘锛屾墿灞曞瓧娈垫彁渚涘寮鸿兘鍔涖€?

### 2.4 浜虹被鍙 (Human Readable)

YAML/Markdown 鏍煎紡浼樺厛锛屼究浜庣増鏈帶鍒跺拰浜哄伐缂栬緫銆?

---

## 3. 璧勪骇 Schema (Asset Schema)

### 3.1 鍩虹璧勪骇鎺ュ彛 (BaseAsset)

鎵€鏈夎祫浜х被鍨嬬殑鍏卞悓鍩虹锛?

```typescript
interface BaseAsset {
  // === 鏍囪瘑瀛楁 ===
  /** 鍞竴鏍囪瘑绗︼紝蹇呴』浠?@ 寮€澶?*/
  name: string;                    // 绀轰緥: "@role_hero", "@scene_forest"
  
  /** 璧勪骇绫诲瀷 */
  type: AssetType;                 // character | scene | prop | costume
  
  /** 鏄剧ず鍚嶇О锛堝彲閫夛紝榛樿浠?name 鎻愬彇锛?*/
  display_name?: string;           // 绀轰緥: "涓昏 - 鏉庢槑"
  
  // === 鐘舵€佸瓧娈?===
  /** 鏄惁鏈夌‘璁ょ殑瑙嗚鍙傝€冨浘 */
  has_image: boolean;              // 鍏抽敭寮€鍏筹紝鍐冲畾缂栬瘧绛栫暐
  
  /** 璧勪骇鐘舵€?*/
  status?: AssetStatus;            // draft | confirmed | deprecated
  
  // === 鍏冩暟鎹?===
  /** 鍒涘缓鏃堕棿 */
  created_at?: string;             // ISO 8601: "2026-01-15T10:30:00Z"
  
  /** 鏈€鍚庝慨鏀规椂闂?*/
  updated_at?: string;             // ISO 8601
  
  /** 鍒涘缓鑰?鏉ユ簮 */
  author?: string;                 // 绀轰緥: "opsv-asset-designer"
  
  /** Schema 鐗堟湰 */
  schema_version?: string;         // 榛樿: "0.3.2"
  
  /** 鏍囩鏁扮粍 */
  tags?: string[];                 // 绀轰緥: [" protagonist", "cyberpunk"]
}
```

### 3.2 瑙掕壊璧勪骇 (Character)

```typescript
interface CharacterAsset extends BaseAsset {
  type: 'character';
  
  // === 瑙掕壊璁惧畾 ===
  /** 瑙掕壊鍦ㄦ晠浜嬩腑鐨勫畾浣?*/
  role?: string;                   // 绀轰緥: "protagonist", "antagonist", "supporting"
  
  /** 瑙掕壊鑳屾櫙鎻忚堪 */
  backstory?: string;
  
  /** 鎬ф牸鐗瑰緛 */
  personality?: string[];          // 绀轰緥: ["brave", "reckless", "loyal"]
  
  // === 瑙嗚鐗瑰緛 ===
  visual_traits: {
    /** 骞撮緞闃舵 */
    age_group?: string;            // 绀轰緥: "young adult", "middle-aged"
    
    /** 鎬у埆琛ㄧ幇 */
    gender?: string;               // 绀轰緥: "male", "female", "androgynous"
    
    /** 韬珮浣撳瀷 */
    build?: string;                // 绀轰緥: "tall and athletic", "petite"
    
    /** 鑲よ壊 */
    skin_tone?: string;
    
    /** 鐪肩潧棰滆壊 */
    eye_color?: string;            // 绀轰緥: "deep blue with flecks of gold"
    
    /** 鍙戝瀷鎻忚堪 */
    hair_style?: string;           // 绀轰緥: "short undercut, silver-white"
    
    /** 鍙戣壊 */
    hair_color?: string;
    
    /** 鏈嶈鎻忚堪 */
    clothing?: string;             // 璇︾粏鎻忚堪鏈嶈椋庢牸鍜屾潗璐?
    
    /** 閰嶉グ */
    accessories?: string[];        // 绀轰緥: ["red scarf", "leather bracer"]
    
    /** 鏄捐憲鐗瑰緛 */
    distinctive_features?: string[]; // 绀轰緥: ["scar on left cheek", "mechanical arm"]
    
    /** 琛ㄦ儏鐗瑰緛 */
    default_expression?: string;   // 绀轰緥: "stoic", "cheerful"
  };
  
  // === 鍙傝€冨浘 ===
  /** 鍙傝€冨浘璺緞鏁扮粍锛堢浉瀵逛簬椤圭洰鏍圭洰褰曪級 */
  reference_images?: string[];     // 绀轰緥: ["artifacts/hero_ref.png"]
  
  /** 鍙傝€冨浘鐘舵€?*/
  reference_status?: {
    [imagePath: string]: {
      status: 'draft' | 'confirmed' | 'rejected';
      source?: string;             // 鐢熸垚宸ュ叿: "gemini", "midjourney"
      prompt?: string;             // 鐢熸垚鎻愮ず璇嶏紙鐢ㄤ簬杩芥函锛?
    }
  };
}
```

**Markdown 绀轰緥**:

```markdown
---
name: "@role_cyber_detective"
type: "character"
has_image: true
role: "protagonist"
schema_version: "0.3.2"
tags: ["cyberpunk", "detective", "noir"]
visual_traits:
  age_group: "35-40"
  gender: "male"
  eye_color: "glowing red cybernetic left eye, natural brown right eye"
  hair_style: "slicked back, gray at temples"
  clothing: "worn charcoal trench coat over tactical vest"
  distinctive_features:
    - "visible neural port at base of skull"
    - "tattooed circuit patterns on forearms"
reference_images:
  - "artifacts/detective_main.png"
  - "artifacts/detective_profile.png"
---

# Subject Identity
璧勬繁璧涘崥渚︽帰锛岄€€褰硅瀹橈紝鍦ㄩ湏铏归棯鐑佺殑涓嬪煄鍖虹粡钀ョ浜鸿皟鏌ヤ簨鍔℃墍銆?

# Detailed Description
## Physical Appearance
涓瓑韬潗锛岀暐寰┘鑳岋紝甯稿勾鎶界儫鐣欎笅鐨勭棔杩广€傚乏鐪兼槸寤変环浣嗗彲闈犵殑涔夌溂锛屽湪鏆楀浼氬彂鍑哄井寮辩殑绾㈠厜銆傚彸鐪肩殑鐤叉儷閫忛湶鍑烘棤鏁颁笉鐪犱箣澶溿€?

## Clothing Style
鏍囧織鎬х殑榛戣壊楂橀澶ц。锛屽唴琛槸鏀硅杩囩殑闃插脊鏉愯川銆傝叞闂村埆鐫€鏀硅杩囩殑鐢电鑴夊啿鎵嬫灙銆?

## 鍙傝€冨浘
![Main Reference](../artifacts/detective_main.png)
![Profile View](../artifacts/detective_profile.png)
```

### 3.3 鍦烘櫙璧勪骇 (Scene)

```typescript
interface SceneAsset extends BaseAsset {
  type: 'scene';
  
  // === 鍦烘櫙璁惧畾 ===
  /** 鍦烘櫙绫诲瀷 */
  scene_type?: string;             // interior | exterior | transitional
  
  /** 鏃堕棿娈?*/
  time_of_day?: string;            // dawn | morning | noon | afternoon | dusk | night | midnight
  
  /** 澶╂皵/姘斿€?*/
  weather?: string;                // 绀轰緥: "heavy rain", "clear sky"
  
  /** 鍦扮悊浣嶇疆 */
  location?: string;               // 绀轰緥: "downtown tokyo", "abandoned space station"
  
  // === 瑙嗚姘涘洿 ===
  atmosphere: {
    /** 鏁翠綋姘涘洿鎻忚堪 */
    mood: string;                  // 绀轰緥: "tense and mysterious", "serene and peaceful"
    
    /** 涓昏壊璋?*/
    color_palette?: string[];      // 绀轰緥: ["deep blues", "neon purples", "pitch black"]
    
    /** 鍏夌収鏉′欢 */
    lighting?: string;             // 绀轰緥: "low-key dramatic", "soft diffused"
    
    /** 鍏夌収鏉ユ簮 */
    light_sources?: string[];      // 绀轰緥: ["neon signs", "street lamps", "moonlight"]
    
    /** 闆炬皵/绮掑瓙鏁堟灉 */
    atmospheric_effects?: string[]; // 绀轰緥: ["thick fog", "falling ash", "light dust"]
  };
  
  // === 鐜缁嗚妭 ===
  environment_details?: {
    /** 寤虹瓚椋庢牸 */
    architecture?: string;
    
    /** 鍏抽敭鐗╀綋 */
    key_objects?: string[];
    
    /** 绾圭悊鏉愯川 */
    textures?: string[];           // 绀轰緥: ["rusted metal", "cracked concrete"]
    
    /** 鎹熷潖/闄堟棫绋嬪害 */
    condition?: string;            // 绀轰緥: "dilapidated", "pristine", "under construction"
  };
  
  // === 澹伴煶璁捐锛堝弬鑰冿級===
  audio_notes?: {
    /** 鐜闊?*/
    ambient?: string[];            // 绀轰緥: ["distant traffic", "rain on metal"]
    
    /** 闊充箰鎯呯华 */
    musical_mood?: string;
  };
  
  reference_images?: string[];
}
```

### 3.4 閬撳叿璧勪骇 (Prop)

```typescript
interface PropAsset extends BaseAsset {
  type: 'prop';
  
  // === 閬撳叿鍒嗙被 ===
  /** 閬撳叿绫诲埆 */
  prop_category?: string;          // weapon | tool | vehicle | furniture | wearable | consumable
  
  /** 閲嶈鎬х骇鍒?*/
  significance?: 'key' | 'supporting' | 'background'; // 鍏抽敭閬撳叿 | 杈呭姪閬撳叿 | 鑳屾櫙閬撳叿
  
  // === 鐗╃悊灞炴€?===
  physical_properties?: {
    /** 鏉愯川 */
    material?: string[];           // 绀轰緥: ["brushed steel", "polished wood"]
    
    /** 灏哄锛堢浉瀵规弿杩帮級 */
    size?: string;                 // 绀轰緥: "palm-sized", "life-sized", "towering"
    
    /** 閲嶉噺鎰?*/
    weight?: string;               // 绀轰緥: "heavy and solid", "lightweight"
    
    /** 鐘舵€?*/
    condition?: string;            // 绀轰緥: "brand new", "ancient and worn"
  };
  
  // === 瑙嗚鐗瑰緛 ===
  visual_description: {
    /** 褰㈢姸姒傝堪 */
    shape?: string;
    
    /** 棰滆壊 */
    color?: string;
    
    /** 瑁呴グ缁嗚妭 */
    decorations?: string[];
    
    /** 鐗规畩鏁堟灉 */
    effects?: string[];            // 绀轰緥: ["glowing runes", "steam venting"]
  };
  
  // === 鏁呬簨鍏宠仈 ===
  /** 鍏宠仈瑙掕壊 */
  associated_characters?: string[]; // @role_name 鏁扮粍
  
  /** 鍏宠仈鍦烘櫙 */
  associated_scenes?: string[];     // @scene_name 鏁扮粍
  
  /** 鍓ф儏鍔熻兘 */
  narrative_function?: string;
  
  reference_images?: string[];
}
```

---

## 4. 浠诲姟 Schema (Job Schema)

### 4.1 鍩虹浠诲姟鎺ュ彛

```typescript
interface BaseJob {
  // === 鏍囪瘑 ===
  /** 浠诲姟鍞竴ID */
  id: string;                      // 绀轰緥: "shot_001", "role_hero_main"
  
  /** 浠诲姟绫诲瀷 */
  type: JobType;                   // image_generation | video_generation
  
  /** 浠诲姟鎵规 */
  batch_id?: string;               // 绀轰緥: "batch_20260315_001"
  
  // === 鎻愮ず璇嶏紙鍙岄€氶亾鏋舵瀯锛?==
  /** 鑻辨枃娓叉煋鎻愮ず璇嶏紙缁?SD/Flux/ComfyUI锛?*/
  prompt_en?: string;
  
  /** 缁撴瀯鍖?Payload锛堢粰澶氭ā鎬佸ぇ妯″瀷锛?*/
  payload: PromptPayload;
  
  // === 鍙傝€冭祫婧?===
  /** 鍙傝€冨浘缁濆璺緞鏁扮粍 */
  reference_images?: string[];
  
  /** 宸ヤ綔娴侀厤缃紙ComfyUI锛?*/
  workflow?: WorkflowConfig;
  
  // === 杈撳嚭閰嶇疆 ===
  /** 杈撳嚭鏂囦欢缁濆璺緞 */
  output_path: string;
  
  /** 杈撳嚭鏍煎紡 */
  output_format?: OutputFormat;    // png | jpg | webp | mp4 | mov
  
  // === 鍏冩暟鎹?===
  /** 浼樺厛绾?*/
  priority?: number;               // 1-10, 榛樿 5
  
  /** 渚濊禆浠诲姟ID鏁扮粍 */
  dependencies?: string[];         // 鐢ㄤ簬渚濊禆鍥捐氨
  
  /** 浠诲姟鍏冩暟鎹?*/
  meta?: JobMeta;
  
  // === 杩愯鏃剁姸鎬侊紙涓嶅簭鍒楀寲锛?==
  /** UI 璺宠繃鏍囪 */
  _skip?: boolean;
  
  /** UI 閫変腑鏍囪 */
  _selected?: boolean;
}
```

### 4.2 鍥惧儚鐢熸垚浠诲姟

```typescript
interface ImageGenerationJob extends BaseJob {
  type: 'image_generation';
  
  payload: ImagePromptPayload;
  
  /** 杈撳嚭蹇呴』鏄浘鍍忔牸寮?*/
  output_format: 'png' | 'jpg' | 'webp';
  
  /** 绉嶅瓙鍊硷紙鐢ㄤ簬澶嶇幇锛?*/
  seed?: number;
}

interface ImagePromptPayload {
  /** 涓枃鍙欎簨鎻愮ず璇?*/
  prompt: string;
  
  /** 鍏ㄥ眬璁剧疆 */
  global_settings: {
    aspect_ratio: AspectRatio;     // 16:9 | 9:16 | 1:1 | 21:9 | 4:3
    quality: Quality;              // 2K | 4K | 8K | 1080p
    style_preset?: string;         // cinematic | anime | photographic
  };
  
  /** 涓讳綋鎻忚堪 */
  subject?: {
    description: string;
    pose?: string;
    expression?: string;
  };
  
  /** 鐜鎻忚堪 */
  environment?: {
    description: string;
    depth_of_field?: 'shallow' | 'deep';
  };
  
  /** 鐩告満璁剧疆 */
  camera?: {
    type: CameraType;              // wide_shot | close_up | medium_shot | etc.
    angle?: CameraAngle;           // eye_level | low_angle | high_angle
    movement?: CameraMovement;     // static | pan | tilt | dolly
  };
  
  /** 0.3.2 鎵╁睍 Schema */
  schema_0_3_2?: {
    /** 棣栧抚鍙傝€冿紙鐢ㄤ簬鍥剧敓鍥撅級 */
    first_image?: string;
    
    /** 灏惧抚鍙傝€冿紙鐢ㄤ簬搴忓垪锛?*/
    last_image?: string;
    
    /** 鍙傝€冨浘鏁扮粍 */
    reference_images?: string[];
    
    /** ControlNet 鍙傛暟 */
    controlnet?: {
      type: 'canny' | 'depth' | 'pose' | 'openpose';
      image: string;
      strength: number;            // 0.0 - 1.0
    }[];
  };
}
```

### 4.3 瑙嗛鐢熸垚浠诲姟

```typescript
interface VideoGenerationJob extends BaseJob {
  type: 'video_generation';
  
  payload: VideoPromptPayload;
  
  /** 杈撳嚭蹇呴』鏄棰戞牸寮?*/
  output_format: 'mp4' | 'mov' | 'webm';
}

interface VideoPromptPayload {
  /** 涓枃鍙欎簨鎻愮ず璇?*/
  prompt: string;
  
  /** 鍏ㄥ眬璁剧疆 */
  global_settings: {
    aspect_ratio: AspectRatio;
    quality: Quality;
    duration: Duration;            // 5s | 10s | 15s (鏈€澶?
    fps?: number;                  // 24 | 30 | 60
  };
  
  /** 涓讳綋杩愬姩鎻忚堪 */
  subject?: {
    description: string;
    motion: string;                // "walking slowly from left to right"
    entrance?: string;             // "fade in" | "enter from left"
    exit?: string;                 // "fade out" | "exit to right"
  };
  
  /** 鐜鍙樺寲 */
  environment?: {
    description: string;
    lighting_change?: string;      // "gradual sunset transition"
    weather_change?: string;       // "rain starts falling"
  };
  
  /** 鐩告満杩愬姩 */
  camera: {
    type: CameraType;
    motion: CameraMovement;        // 蹇呭～锛岃棰戝叧閿?
    speed?: 'slow' | 'normal' | 'fast';
    easing?: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';
  };
  
  /** 鏃堕暱 */
  duration: string;                // "5s", "10s"
  
  /** 0.3.2 鎵╁睍 Schema */
  schema_0_3_2: {
    /** 棣栧抚鍥撅紙鍥剧敓瑙嗛蹇呭～锛?*/
    first_image: string;
    
    /** 涓棿甯у弬鑰冿紙鍙€夛紝鐢ㄤ簬澶嶆潅杩愬姩锛?*/
    middle_image?: string;
    
    /** 灏惧抚鍙傝€冿紙鍙€夛紝鐢ㄤ簬绮剧‘缁撴潫锛?*/
    last_image?: string;
    
    /** 棰濆鍙傝€冨浘 */
    reference_images?: string[];
    
    /** @FRAME 鎸囬拡锛堝洜鏋滀緷璧栵級 */
    frame_pointer?: {
      source_job_id: string;
      frame_type: 'first' | 'middle' | 'last';
    };
  };
  
  /** 鍚戝悗鍏煎鐨?0.3 Schema */
  schema_0_3?: {
    first_image?: string;
    middle_image?: string;
    last_image?: string;
    reference_images?: string[];
  };
}
```

---

## 5. 椤圭洰閰嶇疆 Schema

### 5.1 ProjectConfig

```typescript
interface ProjectConfig {
  // === 椤圭洰鏍囪瘑 ===
  /** 椤圭洰鍚嶇О */
  name: string;
  
  /** 椤圭洰鐗堟湰 */
  version?: string;                // 榛樿: "0.1.0"
  
  /** 椤圭洰鎻忚堪 */
  description?: string;
  
  // === 瑙嗚瑙勮寖 ===
  /** 鐢诲箙姣斾緥 */
  aspect_ratio: AspectRatio;       // 椤圭洰鍏ㄥ眬榛樿
  
  /** 鍒嗚鲸鐜?*/
  resolution: Resolution;          // 2K | 4K | 1080p
  
  /** 娓叉煋寮曟搸 */
  engine?: string;                 // "wan2.2", "veo", "luma"
  
  /** 鍏ㄥ眬椋庢牸鍚庣紑 */
  global_style_postfix?: string;   // 鑷姩杩藉姞鍒版墍鏈?prompt_en
  
  /** 瑙嗚鎰挎櫙 */
  vision?: string;                 // 棣栨潯浠诲姟鐨勭郴缁熸彁绀鸿瘝
  
  // === 椋庢牸鎸囧崡 ===
  style?: {
    /** 瑙嗚椋庢牸 */
    visual_style?: string;         // "cinematic noir", "anime"
    
    /** 绫诲瀷 */
    genre?: string;                // "sci-fi", "fantasy", "documentary"
    
    /** 涓昏壊璋?*/
    palette?: string[];
    
    /** 鍙傝€冧綔鍝?*/
    references?: string[];         // 绀轰緥: ["Blade Runner 2049", "Ghost in the Shell"]
  };
  
  // === 鎶€鏈厤缃?===
  technical?: {
    /** 榛樿杈撳嚭鏍煎紡 */
    default_image_format?: 'png' | 'jpg';
    
    /** 榛樿瑙嗛鏃堕暱 */
    default_video_duration?: string; // "5s"
    
    /** 鎵瑰鐞嗗ぇ灏?*/
    batch_size?: number;           // 榛樿: 1 (淇濆畧)
    
    /** 鑷姩閲嶈瘯娆℃暟 */
    retry_attempts?: number;       // 榛樿: 3
    
    /** 骞跺彂闄愬埗 */
    concurrency?: number;          // 榛樿: 1
  };
  
  // === 鍏冩暟鎹?===
  /** 鍒涘缓鏃堕棿 */
  created_at?: string;
  
  /** 鏈€鍚庢洿鏂?*/
  updated_at?: string;
  
  /** Schema 鐗堟湰 */
  schema_version: string;          // "0.3.2"
}
```

**Markdown 绀轰緥**:

```markdown
---
name: "Cyberpunk Detective"
version: "0.1.0"
aspect_ratio: "16:9"
resolution: "2K"
engine: "wan2.2"
global_style_postfix: "cinematic lighting, film grain, 8k resolution, highly detailed"
vision: "Create visually stunning cyberpunk noir imagery with dramatic lighting"
style:
  visual_style: "cinematic noir with cyberpunk elements"
  genre: "sci-fi neo-noir"
  palette: ["deep blues", "neon purples", "warm oranges", "pitch blacks"]
  references:
    - "Blade Runner 2049"
    - "Altered Carbon"
    - "Ghost in the Shell (1995)"
technical:
  default_image_format: "png"
  default_video_duration: "5s"
  batch_size: 1
  retry_attempts: 3
schema_version: "0.3.2"
---

# Project Overview
## Logline
In a rain-soaked megacity where memories can be bought and sold, a retired cyber-detective takes on one last case that threatens to unravel his own fragmented past.

## Visual Philosophy
High contrast, low-key lighting with selective neon accents. Focus on reflective surfaces and atmospheric haze.
```

---

## 6. 鍒嗛暅 Schema (Shot Schema)

### 6.1 Shot 瀹氫箟

```typescript
interface Shot {
  // === 鏍囪瘑 ===
  /** 鍒嗛暅ID */
  id: string;                      // 鏍煎紡: "shot_{number}", 绀轰緥: "shot_001"
  
  /** 骞?鍦烘 */
  act?: number;
  scene?: number;
  
  /** 鍦ㄥ墽鏈腑鐨勯『搴?*/
  sequence?: number;
  
  // === 鍐呭鎻忚堪 ===
  /** 鍒嗛暅鎻忚堪锛堜腑鏂囷級 */
  description: string;
  
  /** 鍒嗛暅鎻忚堪锛堣嫳鏂囷紝鐢ㄤ簬鐢熸垚锛?*/
  description_en?: string;
  
  // === 瑙嗚瑙勮寖 ===
  /** 鍦烘櫙寮曠敤 */
  environment: string;             // @scene_name 鎴栫洿鎺ユ弿杩?
  
  /** 涓讳綋鎻忚堪 */
  subject: string;                 // 鍙寘鍚?@role_name 寮曠敤
  
  /** 鐩告満璁剧疆 */
  camera: CameraConfig;
  
  /** 鍏夌収鎻忚堪 */
  lighting?: string;
  
  // === 鍔ㄦ€佷俊鎭?===
  /** 鏃堕暱 */
  duration: Duration;              // 闈欐€佸浘鍙拷鐣ワ紝瑙嗛蹇呭～
  
  /** 鍔ㄤ綔/杩愰暅 */
  motion?: string;
  motion_en?: string;              // 鑻辨枃鎻忚堪鐢ㄤ簬瑙嗛鐢熸垚
  
  // === 鍙傝€冨浘锛堝闃呭悗濉厖锛?==
  /** 纭鐨勯甯?*/
  confirmed_first_image?: string;
  
  /** 纭鐨勫熬甯э紙鐢ㄤ簬搴忓垪琛旀帴锛?*/
  confirmed_last_image?: string;
  
  /** 鐢诲粖鍊欓€夊浘 */
  candidate_images?: string[];
  
  // === 鐢熸垚鎻愮ず璇嶏紙鑷姩缂栬瘧锛?==
  /** 鑷姩鐢熸垚鐨勮嫳鏂囨彁绀鸿瘝 */
  prompt_en?: string;
  
  /** 闈跺悜琛ュ抚鎻愮ず璇?*/
  target_last_prompt?: string;     // 鐢ㄤ簬鐢熸垚绮剧‘鐨勫熬甯?
  
  // === 鐘舵€?===
  status?: ShotStatus;             // pending | draft | approved | revision
  
  /** 澶囨敞 */
  notes?: string;
}

interface CameraConfig {
  /** 鏅埆 */
  shot_type: CameraType;
  
  /** 瑙掑害 */
  angle?: CameraAngle;
  
  /** 楂樺害 */
  height?: 'eye' | 'low' | 'high' | 'bird' | 'worm';
  
  /** 闀滃ご鐒﹁窛鎰?*/
  lens?: 'wide' | 'normal' | 'telephoto' | 'macro';
  
  /** 鐗规畩闀滃ご */
  special?: 'POV' | 'OTS' | 'aerial' | 'dutch';
  
  /** 鐒︾偣 */
  focus?: string;                  // "on protagonist's face"
  
  /** 鏅繁 */
  depth_of_field?: 'shallow' | 'deep';
}
```

### 6.2 Script.md 缁撴瀯

Script.md 鏄垎闀滅殑闈欐€佺編鏈増鏈細

```markdown
---
act: 1
scene: 3
location: "Neon Alley"
schema_version: "0.3.2"
shots:
  - id: "shot_001"
    environment: "@scene_neon_alley"
    subject: "@role_detective stands under flickering neon sign"
    camera:
      shot_type: "medium_shot"
      angle: "eye_level"
      lens: "normal"
    lighting: "low-key, neon rim lighting"
    duration: "5s"
    motion: "Detective lights a cigarette, smoke drifts upward"
    motion_en: "A man lights a cigarette, smoke slowly rising"
    prompt_en: "medium shot, man in trench coat lighting cigarette under neon sign, smoke rising"
    target_last_prompt: "close-up of cigarette ember glowing red"
    
  - id: "shot_002"
    environment: "@scene_neon_alley"
    subject: "@role_detective walking away, rain falling"
    camera:
      shot_type: "wide_shot"
      angle: "low_angle"
      lens: "wide"
    duration: "5s"
    motion: "Camera dollies back as detective walks into shadows"
    motion_en: "Slow dolly back, man walks away into dark alley"
    prompt_en: "wide shot from low angle, man walking away into dark alley, heavy rain"
---

# Act 1, Scene 3 - The Alley

## Shot 1
**Setup**: 渚︽帰鍦ㄩ棯鐑佺殑闇撹櫣鐏笅鍋滀笅锛岀偣鐕冧竴鏀儫銆?

**Mood**: 瀛ょ嫭銆佹矇鎬濄€侀洦澶滅殑蹇ч儊銆?

## Shot 2
**Setup**: 渚︽帰鎺愮伃鐑熷ご锛岃蛋杩涢粦鏆楃殑灏忓贩娣卞銆?

**Mood**: 鍐崇粷銆佺绉樸€佹湭鐭ョ殑鍗遍櫓銆?
```

---

## 7. 鍔ㄦ€佸彴鏈?Schema (Shotlist Schema)

### 7.1 Shotlist.md 缁撴瀯

Shotlist.md 鏄満鍣ㄦ墽琛岀殑鍔ㄦ€佺増鏈紝涓?Script.md 鍒嗙锛?

```typescript
interface Shotlist {
  // === 鍏冩暟鎹?===
  version: string;                 // "0.3.2"
  generated_at: string;            // ISO 8601
  generator: string;               // "opsv-animator"
  
  // === 鏃堕棿杞撮厤缃?===
  timeline?: {
    total_duration: string;        // "2m 30s"
    fps: number;                   // 24
  };
  
  // === 鍒嗛暅鏁扮粍 ===
  shots: ShotlistItem[];
  
  // === 渚濊禆鍥捐氨 ===
  dependencies?: {
    [jobId: string]: string[];     // jobId -> [dependencyJobIds]
  };
}

interface ShotlistItem {
  // === 鏍囪瘑 ===
  id: string;                      // 缁ф壙鑷?Script.md
  shot: number;                    // 搴忓彿 (1-based)
  
  // === 鍥惧儚閿氱偣锛堝叧閿級===
  /** 棣栧抚鍥捐矾寰?*/
  first_image: string;             // 缁濆璺緞鎴?@FRAME:鎸囬拡
  
  /** 涓棿甯э紙澶嶆潅杩愬姩锛?*/
  middle_image?: string;
  
  /** 灏惧抚鍥捐矾寰?*/
  last_image?: string;
  
  // === 鍔ㄦ€佹弿杩?===
  /** 涓枃鍔ㄤ綔鎻忚堪 */
  motion_prompt_zh: string;
  
  /** 鑻辨枃鍔ㄤ綔鎻忚堪锛圓PI 浣跨敤锛?*/
  motion_prompt_en: string;
  
  // === 鎶€鏈弬鏁?===
  /** 鏃堕暱 */
  duration: string;                // "5s"
  
  /** 甯х巼 */
  fps?: number;
  
  // === 鍙傝€冨浘鏁扮粍 ===
  reference_images?: string[];
  
  // === 杈撳嚭閰嶇疆 ===
  output_path: string;             // 瑙嗛杈撳嚭璺緞
  
  // === 鐗规畩鏍囪 ===
  /** 鏄惁鏄叧閿抚 */
  is_keyframe?: boolean;
  
  /** 鏄惁鍚敤琛ュ抚 */
  use_frame_interpolation?: boolean;
}
```

### 7.2 绀轰緥

```markdown
---
version: "0.3.2"
generated_at: "2026-03-15T14:30:00Z"
generator: "opsv-animator v0.3.2"
timeline:
  total_duration: "45s"
  fps: 24
shots:
  - id: "shot_001"
    shot: 1
    first_image: "artifacts/drafts_1/shot_001_draft_1.png"
    last_image: "@FRAME:shot_002_first"  # 寤惰繜鎸囬拡锛岃繍琛屾椂瑙ｆ瀽
    motion_prompt_zh: "渚︽帰鐐圭噧棣欑儫锛岀儫闆剧紦缂撲笂鍗囷紝闇撹櫣鐏厜鍦ㄦ箍婕夋級鐨勫湴闈笂鍙嶅皠"
    motion_prompt_en: "A man lights a cigarette, smoke slowly rising, neon lights reflecting on wet ground"
    duration: "5s"
    reference_images:
      - "videospec/elements/@role_detective_ref.png"
    output_path: "artifacts/videos/shot_001.mp4"
    is_keyframe: true
    
  - id: "shot_002"
    shot: 2
    first_image: "@FRAME:shot_001_last"  # 鎵挎帴涓婁竴闀滃熬甯?
    middle_image: "artifacts/drafts_2/shot_002_mid.png"
    motion_prompt_zh: "渚︽帰杞韩璧板叆榛戞殫锛岄暅澶寸紦缂撳悗鎷?
    motion_prompt_en: "Man turns and walks into darkness, camera slowly dollies back"
    duration: "5s"
    output_path: "artifacts/videos/shot_002.mp4"
    use_frame_interpolation: true
---

# Shotlist - Act 1 Sequence

> 姝ゆ枃浠剁敱 `/opsv-animator` 鑷姩鐢熸垚
> 鎵嬪姩缂栬緫鍙兘瀵艰嚧缂栬瘧閿欒
```

---

## 8. 鏋氫妇绫诲瀷瀹氫箟

### 8.1 AssetType

```typescript
enum AssetType {
  CHARACTER = 'character',       // 瑙掕壊
  SCENE = 'scene',               // 鍦烘櫙
  PROP = 'prop',                 // 閬撳叿
  COSTUME = 'costume',           // 鏈嶈
  VEHICLE = 'vehicle',           // 杞藉叿
  WEAPON = 'weapon',             // 姝﹀櫒
  CREATURE = 'creature',         // 鐢熺墿
  FX = 'fx'                      // 鐗规晥
}
```

### 8.2 AssetStatus

```typescript
enum AssetStatus {
  DRAFT = 'draft',               // 鑽夌
  CONFIRMED = 'confirmed',       // 宸茬‘璁?
  DEPRECATED = 'deprecated',     // 宸插簾寮?
  ARCHIVED = 'archived'          // 宸插綊妗?
}
```

### 8.3 JobType

```typescript
enum JobType {
  IMAGE_GENERATION = 'image_generation',
  VIDEO_GENERATION = 'video_generation'
}
```

### 8.4 CameraType (鏅埆)

```typescript
enum CameraType {
  EXTREME_WIDE = 'extreme_wide',     // 澶ц繙鏅?
  WIDE_SHOT = 'wide_shot',           // 鍏ㄦ櫙
  LONG_SHOT = 'long_shot',           // 杩滄櫙
  MEDIUM_LONG = 'medium_long',       // 涓繙鏅?
  MEDIUM_SHOT = 'medium_shot',       // 涓櫙
  MEDIUM_CLOSE = 'medium_close',     // 涓繎鏅?
  CLOSE_UP = 'close_up',             // 鐗瑰啓
  EXTREME_CLOSE = 'extreme_close',   // 澶х壒鍐?
  INSERT = 'insert'                  // 鎻掑叆闀滃ご
}
```

### 8.5 CameraAngle

```typescript
enum CameraAngle {
  EYE_LEVEL = 'eye_level',           // 骞宠
  LOW_ANGLE = 'low_angle',           // 浠版媿
  HIGH_ANGLE = 'high_angle',         // 淇媿
  DUTCH = 'dutch',                   // 鑽峰叞瑙?
  OVERHEAD = 'overhead',             // 姝ｄ刊瑙?
  WORM = 'worm'                      // 浠拌鏋佸ぇ
}
```

### 8.6 CameraMovement

```typescript
enum CameraMovement {
  STATIC = 'static',                 // 鍥哄畾
  PAN_LEFT = 'pan_left',             // 宸︽憞
  PAN_RIGHT = 'pan_right',           // 鍙虫憞
  TILT_UP = 'tilt_up',               // 涓婃憞
  TILT_DOWN = 'tilt_down',           // 涓嬫憞
  DOLLY_IN = 'dolly_in',             // 鎺?
  DOLLY_OUT = 'dolly_out',           // 鎷?
  TRUCK_LEFT = 'truck_left',         // 宸︾Щ
  TRUCK_RIGHT = 'truck_right',       // 鍙崇Щ
  CRANE_UP = 'crane_up',             // 鍗?
  CRANE_DOWN = 'crane_down',         // 闄?
  HANDHELD = 'handheld',             // 鎵嬫寔
  STEADICAM = 'steadicam',           // 鏂潶灏煎悍
  GIMBAL = 'gimbal'                  // 浜戝彴
}
```

### 8.7 AspectRatio

```typescript
enum AspectRatio {
  WIDESCREEN = '16:9',               // 瀹藉睆
  VERTICAL = '9:16',                 // 绔栧睆
  SQUARE = '1:1',                    // 鏂瑰舰
  ULTRAWIDE = '21:9',                // 瓒呭
  CLASSIC = '4:3',                   // 缁忓吀
  CINEMASCOPE = '2.39:1'             // 鐢靛奖瀹藉睆
}
```

### 8.8 Quality

```typescript
enum Quality {
  SD = '480p',
  HD = '1080p',
  TWO_K = '2K',                      // 2048px
  FOUR_K = '4K',                     // 4096px
  EIGHT_K = '8K'                     // 8192px
}
```

### 8.9 Duration

```typescript
enum Duration {
  THREE_SEC = '3s',
  FIVE_SEC = '5s',
  TEN_SEC = '10s',
  FIFTEEN_SEC = '15s'                // 瑙嗛涓婇檺
}
```

### 8.10 ShotStatus

```typescript
enum ShotStatus {
  PENDING = 'Pending',               // 寰呭鐞?
  DRAFT = 'Draft',                   // 鑽夌
  APPROVED = 'Approved',             // 宸叉壒鍑?
  REVISION = 'Revision'              // 闇€淇敼
}
```

---

## 9. 楠岃瘉瑙勫垯

### 9.1 璧勪骇楠岃瘉瑙勫垯

```yaml
瑙勫垯闆?
  - id: asset_name_format
    鎻忚堪: "璧勪骇鍚嶇О蹇呴』浠?@ 寮€澶达紝鍙兘鍖呭惈瀛楁瘝銆佹暟瀛椼€佷笅鍒掔嚎"
    姝ｅ垯: "^@[a-zA-Z][a-zA-Z0-9_]*$"
    閿欒鐮? E1001
    
  - id: has_image_consistency
    鎻忚堪: "has_image=true 鏃跺繀椤绘彁渚?reference_images"
    鏉′欢: "has_image == true"
    瑕佹眰: "reference_images != null && reference_images.length > 0"
    閿欒鐮? E1002
    
  - id: image_exists
    鎻忚堪: "鍙傝€冨浘璺緞蹇呴』瀛樺湪"
    鏉′欢: "has_image == true"
    瑕佹眰: "鎵€鏈?reference_images 璺緞瀛樺湪"
    閿欒鐮? E1003
    
  - id: visual_traits_required
    鎻忚堪: "character 绫诲瀷蹇呴』鎻愪緵 visual_traits"
    鏉′欢: "type == 'character'"
    瑕佹眰: "visual_traits != null"
    閿欒鐮? E1004
```

### 9.2 浠诲姟楠岃瘉瑙勫垯

```yaml
瑙勫垯闆?
  - id: job_id_unique
    鎻忚堪: "浠诲姟ID鍦ㄥ悓涓€鎵规蹇呴』鍞竴"
    鑼冨洿: "batch"
    閿欒鐮? E3001
    
  - id: image_job_format
    鎻忚堪: "鍥惧儚浠诲姟杈撳嚭蹇呴』鏄浘鐗囨牸寮?
    鏉′欢: "type == 'image_generation'"
    瑕佹眰: "output_path 浠?.png/.jpg/.webp 缁撳熬"
    閿欒鐮? E3002
    
  - id: video_job_duration
    鎻忚堪: "瑙嗛浠诲姟蹇呴』鏈夋椂闀?
    鏉′欢: "type == 'video_generation'"
    瑕佹眰: "payload.duration != null"
    閿欒鐮? E3003
    
  - id: video_first_image
    鎻忚堪: "瑙嗛浠诲姟棣栧抚鍥惧繀椤诲瓨鍦?
    鏉′欢: "type == 'video_generation'"
    瑕佹眰: "schema_0_3_2.first_image 瀛樺湪涓旈潪 @FRAME: 鎸囬拡鏃跺彲璁块棶"
    閿欒鐮? E3004
    
  - id: dependency_exists
    鎻忚堪: "渚濊禆鐨勪换鍔D蹇呴』瀛樺湪"
    鏉′欢: "dependencies != null"
    瑕佹眰: "鎵€鏈?dependency IDs 鍦ㄩ」鐩腑瀛樺湪"
    閿欒鐮? E3005
```

### 9.3 椤圭洰閰嶇疆楠岃瘉瑙勫垯

```yaml
瑙勫垯闆?
  - id: aspect_ratio_valid
    鎻忚堪: "鐢诲箙姣斾緥蹇呴』鏄璁惧€间箣涓€"
    鍏佽鍊? ["16:9", "9:16", "1:1", "21:9", "4:3"]
    閿欒鐮? E2001
    
  - id: schema_version_match
    鎻忚堪: "Schema 鐗堟湰蹇呴』鍏煎"
    瑕佹眰: "schema_version 涓?CLI 鐗堟湰鍏煎"
    閿欒鐮? E2002
```

---

## 10. 鐗堟湰鍏煎鎬?

### 10.1 鐗堟湰绛栫暐

| 鐗堟湰鍙樻洿 | 璇存槑 | 绀轰緥 |
|----------|------|------|
| **Major** (X.0.0) | 鐮村潖鎬у彉鏇达紝涓嶅悜鍚庡吋瀹?| 1.0.0 鈫?2.0.0 |
| **Minor** (0.X.0) | 鍔熻兘鏂板锛屽悜鍚庡吋瀹?| 0.2.0 鈫?0.3.0 |
| **Patch** (0.0.X) | Bug淇锛屽畬鍏ㄥ吋瀹?| 0.3.1 鈫?0.3.2 |

### 10.2 0.3.x 鐗堟湰婕旇繘

```
0.3.0 (鎵ц鏃朵唬)
鈹溾攢鈹€ 鏂板: VideoModelDispatcher
鈹溾攢鈹€ 鏂板: SiliconFlow 闆嗘垚
鈹斺攢鈹€ 鍙樻洿: 缁濆璺緞杈撳嚭

0.3.1 (鍥犳灉鏃朵唬)
鈹溾攢鈹€ 鏂板: @FRAME 寤惰繜鎸囬拡
鈹溾攢鈹€ 鏂板: FrameExtractor
鈹斺攢鈹€ 鏂板: 渚濊禆鍥捐氨鎵ц

0.3.2 (瀹￠槄鏃朵唬) [褰撳墠]
鈹溾攢鈹€ 鏂板: target_last_prompt
鈹溾攢鈹€ 鏂板: Draft 寤惰繜缁戝畾
鈹溾攢鈹€ 鏂板: Script.md 鐢诲粖鍖?
鈹斺攢鈹€ 鏂板: JobValidator
```

### 10.3 鍚戝悗鍏煎淇濊瘉

- **0.3.2** 鍙互瀹屽叏璇诲彇 **0.3.0** 鍜?**0.3.1** 鐨勯」鐩?
- **0.3.2** 鏂板鐨勫瓧娈甸兘鏄?`optional`
- 搴熷純瀛楁淇濈暀鍒?**0.4.0**

---

## 11. 绀轰緥闆嗗悎

### 11.1 鏈€灏忓彲鐢ㄩ」鐩?

```markdown
# project.md
---
name: "Minimal Project"
aspect_ratio: "16:9"
resolution: "2K"
schema_version: "0.3.2"
---
```

```markdown
# videospec/elements/@role_actor.md
---
name: "@role_actor"
type: "character"
has_image: false
visual_traits:
  age_group: "adult"
  clothing: "casual t-shirt and jeans"
---

Simple character for testing.
```

```markdown
# videospec/shots/Script.md
---
shots:
  - id: "shot_001"
    environment: "simple studio background"
    subject: "@role_actor standing still"
    camera:
      shot_type: "medium_shot"
    duration: "3s"
---
```

### 11.2 澶嶆潅椤圭洰绀轰緥

鍙傝 `templates/` 鐩綍涓殑绀轰緥椤圭洰銆?

---

## 闄勫綍

### A. JSON Schema 瀹氫箟

瀹屾暣鐨?JSON Schema 鏂囦欢浣嶄簬 `docs/schema/json/` 鐩綍锛?
- `character-asset.schema.json`
- `scene-asset.schema.json`
- `job.schema.json`
- `project-config.schema.json`

### B. TypeScript 绫诲瀷瀵煎嚭

```typescript
// 浠?PromptSchema.ts 瀵煎嚭鎵€鏈夌被鍨?
export * from './src/types/PromptSchema';
export * from './src/errors/OpsVError';
```

### C. 楠岃瘉宸ュ叿

```bash
# 楠岃瘉椤圭洰缁撴瀯
opsv validate

# 楠岃瘉鍗曚釜鏂囦欢
opsv validate ./videospec/elements/@role_hero.md

# 楠岃瘉浠诲姟闃熷垪
opsv validate ./queue/jobs.json --schema job
```

---

**鏂囨。缁撴潫**

*Schema 鐗堟湰: 0.3.2*  
*鏈€鍚庢洿鏂? 2026-03-15*  
*缁存姢鑰? OpsV Core Team*

