# OpsV 完整运行流程与依赖关系

---

## 〇、Circle 批次 vs Circle 层级（核心概念）

这是 OpsV 中最容易被误解的设计，请先阅读本节。

```
一个 Circle 批次 (circleN 目录)  ≠  一个 Circle 层级 (layer)
─────────────────────────────      ────────────────────────
opsv-queue/videospec_circle1/      zerocircle  (index 0, 基础资产)
  ├── _manifest.json               firstcircle (index 1, 分镜图像)
  ├── volcengine.seadream_001/     end_circle  (index N, 视频)
  └── volcengine.seedance_001/     ...全部在同一目录下

opsv-queue/videospec_circle2/      仅当依赖层级结构发生变化时才新建
  ├── _manifest.json               (例如角色 R 原来是 firstcircle，
  └── ...                          修改 refs 后变成 zerocircle)
```

- **一个 `_manifest.json` 包含全部层级**：`circles: [{name:"zerocircle",index:0,...}, {name:"firstcircle",index:1,...}]`
- **Zero 层和 First 层在同一个 circle 目录下编译和执行**——先编译 zero，approved 后在同一目录编译 first
- **新 circle 目录只在依赖结构发生变化时创建**：`opsv circle refresh` 检测到任何资产的 index 漂移时，会报错要求执行 `opsv circle create` 新建批次
- **日常迭代**：`opsv circle refresh` 只刷新 status，不改变目录结构

---

## 一、端到端管线

```
                          ┌─────────────────────────────────────────┐
                          │              1. 项目初始化               │
                          │          opsv init [project]             │
                          │   生成 templates/ → .opsv/ → videospec/ │
                          └────────────────┬────────────────────────┘
                                           │
                          ┌────────────────▼────────────────────────┐
                          │           2. 创意文档创作                │
                          │    Creative-Agent 撰写 .md 文档          │
                          │   project.md  story.md  elements/       │
                          │   scenes/  shots/                       │
                          └────────────────┬────────────────────────┘
                                           │
                          ┌────────────────▼────────────────────────┐
                          │           3. 文档校验                    │
                          │    Guardian-Agent 执行 opsv validate     │
                          │    ✅ 通过 → 继续     ❌ 失败 → 回步骤2  │
                          └────────────────┬────────────────────────┘
                                           │
                          ┌────────────────▼────────────────────────┐
                          │        4. 构建依赖图 + Circle            │
                          │    opsv circle create --dir videospec    │
                          │    分析 refs → 拓扑排序 → 全部层级       │
                          │    写入一个 circle1/_manifest.json       │
                          └────────────────┬────────────────────────┘
                                           │
               ┌───────────────────────────┼───────────────────────────┐
               │                           │                           │
    ┌──────────▼──────────┐    ┌───────────▼──────────┐    ┌──────────▼──────────┐
    │  5a. 编译 Zero 层    │    │  5b. 编译 ComfyUI     │    │  5c. 编译浏览器任务  │
    │  opsv imagen         │    │  opsv comfy           │    │  opsv webapp         │
    │  --model <m>         │    │  --model <m>          │    │  --model <m>         │
    │  跳过 approved →     │    │  跳过 approved →      │    │  跳过 approved →     │
    │  编译为 .json         │    │  注入 workflow →      │    │  编译为 .json         │
    └──────────┬───────────┘    └───────────┬───────────┘    └──────────┬───────────┘
               │                           │                           │
               └───────────────────────────┼───────────────────────────┘
                                           │
                          ┌────────────────▼────────────────────────┐
                          │           6. 执行渲染                    │
                          │    opsv run <paths...>                   │
                          │    提交 API → 梯度轮询 → 下载产出        │
                          │    产出: @hero_1.png  shot_01_1.mp4      │
                          └────────────────┬────────────────────────┘
                                           │
                          ┌────────────────▼────────────────────────┐
                          │           7. 可视化审查                  │
                          │    opsv review [--cloud]                 │
                          │    ★ 批准 → status: approved/syncing     │
                          │    ✎ 反馈 → status: drafting             │
                          └────────────────┬────────────────────────┘
                                           │
                          ┌────────────────▼────────────────────────┐
                          │        8. Syncing 对齐（Guardian）       │
                          │    修改任务 approve 后：对齐字段         │
                          │    syncing → approved                    │
                          └────────────────┬────────────────────────┘
                                           │
                          ┌────────────────▼────────────────────────┐
                          │        9. 刷新 Circle 状态               │
                          │    opsv circle refresh                   │
                          │    更新 _manifest.json 中 asset status   │
                          │    检查依赖层级是否漂移                  │
                          └────────────────┬────────────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
             ✅ Zero 全部 approved    ⏳ 部分 approved        🔀 层级漂移
             同一 circle1 内          继续当前零层             需 circle create
             编译 First 层            回到步骤 5               新建 circle2 批次
             (回到步骤 5)
```

---

## 二、依赖层级（在同一 Circle 批次内）

```
┌─────────────────────────────────────────────────────────────────────┐
│              videospec_circle1/_manifest.json  — 包含全部层级        │
│                                                                     │
│  Layer 0: zerocircle (index 0)  ← 无依赖，最先执行                   │
│  ┌────────────────────┐  ┌────────────────────┐                     │
│  │ @hero              │  │ @temple            │                     │
│  │ (角色, refs:       │  │ (场景, refs:       │                     │
│  │  @style:donghua)   │  │  @style:donghua)   │                     │
│  └────────┬───────────┘  └────────┬───────────┘                     │
│           │                       │                                  │
│  ┌────────┴───────────┐          │                                  │
│  │ @villain           │          │                                  │
│  │ (角色, refs:       │          │                                  │
│  │  @style:donghua)   │          │                                  │
│  └────────┬───────────┘          │                                  │
│           │                      │                                  │
│  ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│           │   Layer 1: firstcircle (index 1)                        │
│           │   依赖 zerocircle 全部 approved 后才可编译               │
│           │                                                         │
│  ┌────────┴──────────────────────┴──────────────────────────────┐   │
│  │ @shot_01                                                     │   │
│  │ (分镜, refs: @hero, @temple)                                  │   │
│  └────────┬─────────────────────────────────────────────────────┘   │
│           │                                                         │
│  ┌────────┴─────────────────────────────────────────────────────┐   │
│  │ @shot_02                                                     │   │
│  │ (分镜, refs: @hero, @villain)                                 │   │
│  └────────┬─────────────────────────────────────────────────────┘   │
│           │                                                         │
│  ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│           │   Layer N: end_circle (仅 shotdeck.md 存在时)           │
│           │                                                         │
│  ┌────────┴─────────────────────────────────────────────────────┐   │
│  │ shotdeck.md                                                  │   │
│  │ Shot 01: first_frame=@shot_01:first                          │   │
│  │ Shot 02: first_frame=@FRAME:shot_01_last                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘

目录结构（单一批次内）：
  opsv-queue/videospec_circle1/
    _manifest.json               ← 包含 zerocircle + firstcircle + end_circle
    volcengine.seadream_001/     ← Zero 层编译产出
    volcengine.seedance_001/     ← First 层编译产出（同一目录！）
```

---

## 三、何时新建 Circle 批次

```
opsv circle refresh 检查依赖层级是否漂移 ↓

  ┌─────────────────────────────────────────────────────────────┐
  │  正常情况：层级未变                                          │
  │  → 只更新 manifest 中的 asset status（drafting→approved）    │
  │  → 继续在当前 circle 目录中编译下一层                        │
  └─────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────┐
  │  层级漂移：某个 asset 的 index 变了                          │
  │  例：@hero 原本 refs 包含 @style:donghua (index 0)           │
  │      修改后 refs 为空 (index 0 不变) → 无漂移               │
  │                                                             │
  │  例：@shot_01 原本 refs 包含 @hero (index 1)                 │
  │      用户从外部获得 hero 参考图，删除 @hero 依赖              │
  │      → @shot_01 漂移到 index 0                              │
  │      → refresh 报错：Index topology changed                  │
  │      → 必须 opsv circle create --dir videospec              │
  │      → 新建 videospec_circle2/ 批次                          │
  └─────────────────────────────────────────────────────────────┘
```

---

## 四、文件→Circle→Provider→产出 映射

```
videospec/elements/@hero.md
  │  category: character, status: drafting
  │  refs: { image: { "@style:donghua": [path] } }
  │
  ├─→ opsv circle create ──→ 分配到 zerocircle (index 0)
  │    写入 videospec_circle1/_manifest.json
  │
  ├─→ opsv imagen --model volcengine.seadream
  │    跳过 approved？否 (drafting) → 编译
  │    产出: videospec_circle1/volcengine.seadream_001/@hero.json
  │
  ├─→ opsv run ──→ @hero_1.png
  │
  ├─→ opsv review → ★ Approve → status: approved
  │    ## Approved References 追加
  │
  ├─→ opsv circle refresh ──→ Zero 层 ✅
  │
  │  ═══════════ Zero 层全部 approved，继续同一 circle ═══════════
  │
  └─→ videospec/shots/shot_01.md
        │  refs: { image: { "@hero": [hero_1.png], "@temple": [...] } }
        │  index: 1 (firstcircle)
        │
        ├─→ @hero approved ✅、@temple approved ✅ → Syncing Gate 通过
        │
        └─→ opsv imagen --model volcengine.seadream
              产出: videospec_circle1/volcengine.seadream_001/shot_01.json
              （同一 circle1 目录！不是 circle2）
              └─→ opsv run ──→ shot_01_1.png
                    └─→ review → approve → refresh
```

---

## 五、修改任务迭代流

```
@hero.json (初始)
  │
  ├─→ opsv iterate @hero.json ──→ @hero_2.json (序号递增)
  │     │ prompt 修改, seed 修改
  │     │
  │     └─→ opsv run @hero_2.json ──→ @hero_2_1.png
  │                                      │
  │                                      └─→ review ★ Approve
  │                                            识别: id_N_N.ext → 修改任务
  │                                            status: drafting → syncing
  │                                            │
  │                                            └─→ Guardian syncing 对齐
  │                                                  prompt 覆盖 source.md
  │                                                  visual_detailed 翻译
  │                                                  refs 对齐
  │                                                  status: syncing → approved
  │
  ├─→ 再次修改
  │   opsv iterate @hero.json ──→ @hero_3.json ──→ @hero_3_1.png
  │
  └─→ 批量迭代
      opsv iterate dir/ ──→ dir_it_001/ ──→ 批量修改 + 执行
```

---

## 六、组件依赖关系

```
                          ┌─────────────┐
                          │   CLI Entry  │
                          │   cli.ts     │
                          └──────┬──────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
  ┌──────▼──────┐        ┌──────▼──────┐        ┌──────▼──────┐
  │   commands/ │        │    core/    │        │  executor/  │
  │  circle.ts  │───────→│ Dependency  │        │ QueueRunner │
  │  imagen.ts  │        │    Graph    │        │    .ts      │
  │  animate.ts │        │  (拓扑排序) │        └──────┬──────┘
  │  comfy.ts   │        └──────┬──────┘               │
  │  review.ts  │               │                      │
  │  login.ts   │        ┌──────▼──────┐        ┌──────▼──────┐
  │  run.ts     │        │  Manifest   │        │  providers/ │
  └─────────────┘        │   Reader    │        │ Volcengine  │
         │               │  (读写缓存) │        │ MiniMax     │
  ┌──────▼──────┐        └──────┬──────┘        │ SiliconFlow │
  │  review-ui/ │               │               │ RunningHub  │
  │  Server +   │        ┌──────▼──────┐        │ ComfyLocal  │
  │  controllers│        │   Asset     │        └─────────────┘
  └──────┬──────┘        │   Manager   │
         │               │  (加载资产) │
  ┌──────▼──────┐        └──────┬──────┘
  │   tunnel/   │               │
  │ CloudClient │        ┌──────▼──────┐        ┌─────────────┐
  │ TunnelClient│        │  RefResolver│        │   auth/     │
  │ Cloudflared │        │  RefBinder  │        │ Credential  │
  │  Manager    │        │ DesignRef   │        │ Manager     │
  └─────────────┘        │  Reader     │        │ DeviceFlow  │
                         │ ApprovedRef │        │  Client     │
                         │  Reader     │        └─────────────┘
                         └──────┬──────┘
                                │
                         ┌──────▼──────┐
                         │  compiler/  │
                         │ TaskBuilder │
                         │ PromptComp. │
                         │ InputEval.  │
                         └─────────────┘
```

---

## 七、Agent 协作时序

```
用户        Creative-Agent      Guardian-Agent       Runner-Agent
 │               │                    │                    │
 │  灵感和需求    │                    │                    │
 │──────────────→│                    │                    │
 │               │  脑暴 + 三向提案    │                    │
 │←─────────────→│                    │                    │
 │  确认方向      │                    │                    │
 │──────────────→│                    │                    │
 │               │  创作文档          │                    │
 │               │  project.md        │                    │
 │               │  story.md          │                    │
 │               │  elements/*.md     │                    │
 │               │  scenes/*.md       │                    │
 │               │                    │                    │
 │               │  📋 HANDOFF        │                    │
 │               │───────────────────→│                    │
 │               │                    │  opsv validate     │
 │               │                    │  refs 审查          │
 │               │                    │                    │
 │               │                    │  ✅ CLEARANCE      │
 │               │                    │───────────────────→│
 │               │                    │                    │  circle create
 │               │                    │                    │  imagen --model (Zero)
 │               │                    │                    │  run
 │               │                    │                    │  review → approve
 │               │                    │                    │  circle refresh
 │               │                    │                    │  imagen --model (First)
 │               │                    │                    │  run
 │               │                    │                    │  review → approve
 │               │                    │                    │  circle refresh
 │               │                    │                    │
 │  审查操作      │                    │                    │
 │─────────────────────────────────────────────────────────→│
 │               │                    │                    │  Approve/Draft
 │               │                    │                    │
 │               │                    │  syncing 对齐       │
 │               │                    │←───────────────────│
 │               │                    │                    │
 │               │  🔄 DRAFT ROLLBACK │                    │
 │               │←───────────────────┼────────────────────│
 │               │                    │                    │
 │               │  修改文档          │                    │
 │               │───────────────────→│  (循环)            │
```

---

## 八、状态流转全图

```
                    ┌──────────┐
                    │ drafting │ ←────────────────────────┐
                    └────┬─────┘                          │
                         │                                │
              ┌──────────┼──────────┐                     │
              │          │          │                     │
         opsv imagen  opsv comfy  opsv animate            │
              │          │          │                     │
         ┌────▼────┐ ┌───▼────┐ ┌──▼──────┐              │
         │ opsv run│ │opsv run│ │opsv run │              │
         └────┬────┘ └───┬────┘ └──┬──────┘              │
              │           │         │                     │
         ┌────▼───────────▼─────────▼──────┐              │
         │         opsv review             │              │
         │  ★ Approve          ✎ Draft     │              │
         └───────┬────────────────┬────────┘              │
                 │                │                       │
         ┌───────▼───────┐        │                       │
         │  判断产出模式   │        │                       │
         │ id_1.ext?      │        │                       │
         │ id_N_N.ext?    │        │                       │
         └───┬───────┬───┘        │                       │
             │       │            │                       │
     id_1.ext│       │id_N_N.ext  │                       │
             │       │            │                       │
    ┌────────▼──┐ ┌──▼──────┐    │                       │
    │ approved  │ │syncing  │    │                       │
    │ (就绪)    │ │(待对齐)  │    │                       │
    └───────────┘ └──┬──────┘    │                       │
                     │           │                       │
              ┌──────▼──────┐    │                       │
              │ Guardian    │    │                       │
              │ syncing 对齐│    │                       │
              └──────┬──────┘    │                       │
                     │           │                       │
              ┌──────▼──────┐    │                       │
              │ approved    │    │                       │
              └──────┬──────┘    │                       │
                     │           │                       │
         ┌───────────┴───────────┴────────┐              │
         │     opsv circle refresh        │              │
         │  检查层级漂移 + 更新 status     │              │
         │  ✅ Zero 全部approved → 同目录  │              │
         │     继续编译 First 层           │              │
         │  🔀 层级漂移 → circle create    │              │
         └────────────────────────────────┘              │
                                                        │
         ┌────────────────────────────────────────────┐  │
         │           Draft 回退路径                    │  │
         │  status → drafting                         │  │
         │  Creative 修改文档 → 重新进入管线 ──────────┘  │
         └────────────────────────────────────────────┘
```

---

## 九、Cloud 审查专有流

```
用户机器                                OpsV Cloud 服务
────────                               ──────────────
opsv login
  │  POST /auth/device-code ──────────→ 生成 deviceCode
  │  ← verificationUrl
  │  打开浏览器登录授权
  │  POST /auth/device-token ─────────→ 轮询→approved→返回 token
  │  ← accessToken + refreshToken
  │  存储 ~/.opsv/credentials.json

opsv review --cloud
  │  POST /api/sessions ──────────────→ 创建会话
  │  ← sessionId, sessionToken,
  │    reviewToken, reviewUrl
  │
  │  cloudflared 启动 ─── 公网 URL ──→
  │  PUT /api/sessions/:sid/          → 报告隧道地址
  │    tunnel-url
  │
  │  WebSocket 连接 ──────────────────→ 保持长连接
  │  ← 心跳 PING/PONG
  │  ← HTTP 请求代理
  │  → 访问日志批量上传
  │
  │  打印 reviewUrl + QR ─────────────→ 分享给审查者
  │
  │  [审查者操作...]
  │
  │  SIGINT/Ctrl+C
  │  POST /api/sessions/:sid/close ───→ 关闭会话
  │  WebSocket 断开
  │  cloudflared 停止
```

---

## 十、关键决策速查

| 你想做什么 | 命令 | 前提条件 |
|-----------|------|---------|
| 首次创建项目 | `opsv init` | 无 |
| 创建 Circle 批次 | `opsv circle create --dir videospec` | 文档已写好 |
| 刷新状态 | `opsv circle refresh` | Circle 已创建 |
| 生成 Zero 层图像 | `opsv imagen --model <m>` | Circle 已创建，资产 drafting |
| 生成 First 层图像 | `opsv imagen --model <m>` | Zero 层全部 approved（同一 circle 目录） |
| 生成视频 | `opsv animate --model <m>` | shotdeck.md 存在，上游 approved |
| 执行渲染 | `opsv run <path>` | .json 已编译 |
| 本地审查 | `opsv review` | 渲染产物存在 |
| 远程审查 | `opsv review --cloud` | opsv login 已完成 |
| 微调 prompt 重试 | `opsv iterate <task> → 编辑 → opsv run` | .json 已编译 |
| 修改文档重试 | `编辑 .md → opsv imagen --no-skip-approved → opsv run` | approved 资产需强制重编 |
| 修改依赖重试 | `编辑 .md refs → opsv circle refresh` | 检查层级漂移，必要时 circle create |
| 校验文档 | `opsv validate` | .md 存在 |
| 检查 refs | `opsv refs check <file>` | 文档含 refs 字段 |
