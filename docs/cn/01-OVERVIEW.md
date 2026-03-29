# OpsV 椤圭洰鍏ㄦ櫙 (Project Overview)

> **OpenSpec-Video (OpsV) 0.4.3** — 将 Markdown 叙事规范编译为视频/图像生成任务的自动化框架

---

## 1. OpsV 鏄粈涔?

OpsV 是一套 **Spec-as-Code** 视频制作管线。它允许创作者（导演/PM/艺术总监）用 Markdown 撰写故事、定义资产、设计分镜，然后通过 CLI 命令将这些文本规范"编译"为可执行的 JSON 任务队列，最终驱动 AI 模型（SeaDream、Seedance、Minimax、SiliconFlow 等）并发批量生成图像与视频。

**鏍稿績淇℃潯**锛?

- **浠ｇ爜鍗宠鑼?*锛歚.md` 鏂囦欢鏄敮涓€鐨勭湡鐩告簮锛屽浘鍍忓拰瑙嗛鏄叾缂栬瘧浜х墿
- **璧勪骇鍏堣**锛氳鑹?鍦烘櫙/閬撳叿蹇呴』鍏堢嫭绔嬪缓妗ｏ紝鍒嗛暅涓彧鍏佽寮曠敤锛坄@` 璇硶锛?
- **鍔ㄩ潤鍒嗙**锛氬浘鍍忕敓鎴愬拰瑙嗛鐢熸垚鏄袱鏉＄嫭绔嬬绾匡紝浜掍笉骞叉壈
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
鈹?  鈹溾攢鈹€ Architect.md            # 鏋舵瀯甯堣鑹插畾涔?
鈹?  鈹溾攢鈹€ Screenwriter.md         # 缂栧墽瑙掕壊瀹氫箟
鈹?  鈹溾攢鈹€ AssetDesigner.md        # 璧勪骇璁捐甯堣鑹插畾涔?
鈹?  鈹溾攢鈹€ ScriptDesigner.md       # 鍒嗛暅璁捐甯堣鑹插畾涔?
鈹?  鈹溾攢鈹€ Animator.md             # 鍔ㄧ敾缂栧瑙掕壊瀹氫箟
鈹?  鈹溾攢鈹€ Supervisor.md           # 璐ㄦ鐩戝埗瑙掕壊瀹氫箟
鈹?  鈹斺攢鈹€ skills/                 # 鎶€鑳芥墜鍐屽簱锛?0 涓?Skill锛?
鈹溾攢鈹€ .antigravity/               # Antigravity 宸ュ叿閰嶇疆
鈹?  鈹溾攢鈹€ rules/                  # 琛屼负瑙勫垯
鈹?  鈹斺攢鈹€ workflows/              # 宸ヤ綔娴佹ā鏉匡紙8 涓級
鈹溾攢鈹€ .env/                       # 鐜閰嶇疆锛坓it 蹇界暐锛?
鈹?  鈹溾攢鈹€ secrets.env             # API 瀵嗛挜
鈹?  鈹斺攢鈹€ api_config.yaml         # 寮曟搸鍙傛暟閰嶇疆
鈹溾攢鈹€ videospec/                  # 鏍稿績鍙欎簨璧勪骇锛堢湡鐩告簮锛?
鈹?  鈹溾攢鈹€ project.md              # 椤圭洰鍏ㄥ眬閰嶇疆涓庤祫浜ц姳鍚嶅唽
鈹?  鈹溾攢鈹€ stories/                # 鏁呬簨澶х翰
鈹?  鈹?  鈹斺攢鈹€ story.md
鈹?  鈹溾攢鈹€ elements/               # 瑙掕壊/閬撳叿璧勪骇瀹氫箟
鈹?  鈹?  鈹溾攢鈹€ @role_hero.md
鈹?  鈹?  鈹斺攢鈹€ @prop_sword.md
鈹?  鈹溾攢鈹€ scenes/                 # 鍦烘櫙璧勪骇瀹氫箟
鈹?  鈹?  鈹斺攢鈹€ @scene_forest.md
鈹?  鈹斺攢鈹€ shots/                  # 鍒嗛暅涓庡姩鐢诲彴鏈?
鈹?      鈹溾攢鈹€ Script.md           # 闈欐€佹瀯鍥惧垎闀?
鈹?      鈹斺攢鈹€ Shotlist.md         # 鍔ㄦ€佽繍闀滃彴鏈?
鈹溾攢鈹€ artifacts/                  # 鐢熸垚浜х墿
鈹?  鈹斺攢鈹€ drafts_N/               # 绗?N 鎵规覆鏌撹崏鍥?
鈹溾攢鈹€ queue/                      # 浠诲姟闃熷垪
鈹?  鈹溾攢鈹€ jobs.json               # 鍥惧儚鐢熸垚浠诲姟
鈹?  鈹斺攢鈹€ video_jobs.json         # 瑙嗛鐢熸垚浠诲姟
鈹溾攢鈹€ GEMINI.md                   # Gemini 涓撶敤鍏ㄥ眬浜烘牸閰嶇疆
鈹斺攢鈹€ AGENTS.md                   # OpenCode/Trae 缁熶竴鍗忚
```

---

## 4. 鏍稿績姒傚康璇嶅吀

| 姒傚康 | 鍚箟 |
|------|------|
| **平行宇宙沙箱** | 0.4.3 引入，根据 `api_config.yaml` 启用的多模型并发执行，不同引擎的结果被严格隔离在 `artifacts/drafts_N/[引擎名]/` 中 |
| **Spec-as-Code** | 用结构化 Markdown 作为视频制作的源代码 |
| **Asset-First** | 资产先于分镜存在，分镜只引用不描述 |
| **d-ref (Design References)** | 生成输入参考图。`opsv generate` 生成本实体时作为 img2img 输入 |
| **a-ref (Approved References)** | 定档输出参考图。其他实体通过 `@` 引用时，提供此参考图 |
| **变体链** | 将 A 的 a-ref 作为 B 的 d-ref，生成基于 A 的新变体（如老年版、卡通版） |
| **@ 引用语法** | 用 `@role_K`、`@scene_bar` 等标签引用独立的资产文件 |
| **global_style_postfix** | 在 `project.md` 中定义的全局渲染风格后缀，编译器自动注入每个任务 |
| **动静分离** | 图像管线（Script.md → jobs.json）与视频管线（Shotlist.md → video_jobs.json）互相独立 |
| **关键帧塌缩** | `@FRAME:<shot_id>_last` 延迟指针，后一镜头首帧自动继承前一镜头尾帧 |
| **特征泄漏 (Concept Bleeding)** | 分镜中不慎描述了角色外貌细节，导致渲染冲突 |

---

## 5. 蹇€熷紑濮?

```bash
# 1. 鍏ㄥ眬瀹夎
npm install -g videospec

# 2. 鍒涘缓鏂伴」鐩?
opsv init my-mv-project

# 3. 閰嶇疆 API 瀵嗛挜
echo "VOLCENGINE_API_KEY=your_key_here" > .env/secrets.env

# 4. 缂栧啓璧勪骇鍜屽垎闀滐紙鍙傝€冨伐浣滄祦鏂囨。锛?

# 5. 缂栬瘧骞剁敓鎴愬浘鍍?
opsv generate
opsv gen-image

# 6. 灏嗙粨鏋滃洖鍐欐枃妗ｅ苟瀹￠槄
opsv review

# 7. 缂栬瘧骞剁敓鎴愯棰?
opsv animate
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

> *"代码是写给人看的，只是顺便让机器运行。"*
> *OpsV 0.4.3 | 最后更新: 2026-03-28*
