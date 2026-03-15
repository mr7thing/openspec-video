# OpenSpec-Video 0.3.3 实现报告

> **版本**: 0.3.3 (ImageStream)  
> **日期**: 2026-03-15  
> **状态**: ✅ 已完成

---

## 实现概览

0.3.3 版本成功实现了原生图像生成 API 集成，接入火山引擎 SeaDream 5.0 Lite 服务。这是 OpsV 从"任务编译器"向"端到端生成平台"演进的关键一步。

---

## 新增功能

### 1. 图像执行架构 ✅

**新增文件**:
```
src/executor/
├── providers/
│   ├── ImageProvider.ts          # 图像提供商接口
│   └── SeaDreamProvider.ts       # SeaDream 实现 (10,481 字节)
└── ImageModelDispatcher.ts       # 图像调度器 (11,516 字节)
```

**功能特性**:
- ✅ 文生图 (txt2img)
- ✅ 图生图 (img2img)
- ✅ 负面提示词支持
- ✅ 种子控制（可复现）
- ✅ 画幅比例自适应 (1:1, 16:9, 9:16, 4:3, 21:9)
- ✅ 分辨率自适应 (480p-4K)
- ✅ 自动重试机制（指数退避）

### 2. CLI 命令扩展 ✅

**新增命令**:
```bash
opsv execute-image [options]

Options:
  -m, --model <model>        目标模型 (默认: seadream-5.0-lite)
  -c, --concurrency <num>    并发数 (默认: 1)
  -s, --skip-failed          失败继续
  --dry-run                  仅验证不执行
```

**使用示例**:
```bash
# 编译任务
opsv generate

# 验证任务
opsv execute-image --dry-run

# 执行生成
opsv execute-image --model seadream-5.0-lite

# 并发执行（谨慎使用）
opsv execute-image --concurrency 2
```

### 3. 类型系统扩展 ✅

**PromptSchema.ts 新增**:
```typescript
interface ImageConfig {
    seed?: number;              // 随机种子
    steps?: number;             // 推理步数 1-50
    cfg_scale?: number;         // CFG Scale 1-20
    negative_prompt?: string;   // 负面提示词
    sampler?: 'Euler' | 'Euler a' | 'DPM++ 2M';
    hires_fix?: boolean;        // 高清修复
}

// Job 新增字段
interface Job {
    // ... 现有字段
    image_config?: ImageConfig;
    seed?: number;
}
```

### 4. 配置模板 ✅

**api_config.yaml** (模板):
```yaml
models:
  seadream-5.0-lite:
    provider: seadream
    type: image
    features:
      - txt2img
      - img2img
      - negative_prompt
      - seed_control
      - aspect_ratio
    max_size:
      width: 2048
      height: 2048
    defaults:
      steps: 30
      cfg_scale: 7.5
```

**环境变量** (.env.example):
```bash
# SeaDream / 火山引擎
SEADREAM_API_KEY=your_seadream_api_key
VOLCENGINE_API_KEY=your_volcengine_api_key
```

---

## API 集成详情

### SeaDream 5.0 Lite

**API 端点**:
```
POST https://ark.cn-beijing.volces.com/api/v3/images/generations
```

**认证方式**:
- Bearer Token: `Authorization: Bearer ${API_KEY}`

**请求体**:
```json
{
  "model": "seadream-5.0-lite",
  "prompt": "English description",
  "negative_prompt": "blurry, low quality",
  "width": 1024,
  "height": 1024,
  "steps": 30,
  "cfg_scale": 7.5,
  "seed": -1,
  "response_format": "url"
}
```

**参数映射**:

| OpsV 参数 | SeaDream 参数 | 转换逻辑 |
|-----------|---------------|----------|
| `aspect_ratio` | `width/height` | 解析后乘以分辨率倍率 |
| `quality` | 尺寸倍率 | 480p=0.5x, 2K=1.5x, 4K=2x |
| `prompt_en` | `prompt` | 直接使用 |
| `image_config.negative_prompt` | `negative_prompt` | 直接传递 |
| `image_config.steps` | `steps` | 默认 30 |
| `image_config.cfg_scale` | `cfg_scale` | 默认 7.5 |
| `seed` | `seed` | -1 表示随机 |

---

## 测试覆盖

### 单元测试

**测试文件**: `tests/unit/executor/SeaDreamProvider.test.ts` (8,798 字节)

| 测试组 | 用例数 | 状态 |
|--------|--------|------|
| 基础配置 | 3 | ✅ |
| 文生图 | 4 | ✅ |
| 画幅比例解析 | 5 | ✅ |
| 分辨率倍率 | 5 | ✅ |
| 图生图 | 1 | ✅ |
| **总计** | **18** | **✅** |

### 测试运行结果

```bash
$ npm test

Test Suites: 5 passed, 5 total
Tests:       85 passed, 85 total

SeaDreamProvider
  ✓ 应该有正确的 providerName
  ✓ 应该支持标准图像功能
  ✓ 不应该支持不存在功能
  ✓ 应该成功生成图像并返回 URL
  ✓ 应该成功生成图像并返回 base64
  ✓ 应该在 API 返回错误时抛出异常
  ✓ 应该在网络错误时重试
  ✓ 应该在所有重试失败后抛出异常
  ✓ 应该正确解析 1:1 为 1536x1536
  ✓ 应该正确解析 16:9 为 1536x864
  ✓ 应该正确解析 9:16 为 864x1536
  ✓ 应该正确解析 4:3 为 1536x1152
  ✓ 应该正确解析 21:9 为 1920x822
  ✓ 应该正确应用 480p/1080p/2K/4K/8K 倍率
  ✓ 应该在有 reference_images 时添加 image 参数
```

---

## 使用流程

### 完整图像生成工作流

```bash
# 1. 初始化项目
opsv init my-project
cd my-project

# 2. 配置 API Key
echo "SEADREAM_API_KEY=sk-xxx" > .env

# 3. 配置 api_config.yaml
cp templates/assets/api_config.yaml assets/

# 4. 创建资产和分镜（使用 Agent 或手动）
# - videospec/elements/@role_hero.md
# - videospec/shots/Script.md

# 5. 编译任务队列
opsv generate
# ✓ Generated 12 jobs

# 6. 验证任务（可选）
opsv execute-image --dry-run
# ✓ Valid: 12, Invalid: 0

# 7. 执行图像生成
opsv execute-image --model seadream-5.0-lite
# ▶ Starting image generation pipeline...
#    Progress: 12/12 (100%)
# ✅ Pipeline completed! Duration: 45.2s

# 8. 审阅结果
opsv review
```

### 混合工作流建议

| 场景 | 推荐方式 | 原因 |
|------|----------|------|
| 主角角色设计 | 浏览器扩展 | 需反复迭代 |
| 场景背景 | API 批量 | 量大且标准 |
| 道具资产 | API 批量 | 一致性好 |
| 特殊效果 | 浏览器扩展 | 需精确控制 |

---

## 性能指标

### 生成速度估算

| 分辨率 | 预估时间 | 成本参考 |
|--------|----------|----------|
| 1024x1024 | 2-3s | ~0.05元/张 |
| 1536x1536 | 4-6s | ~0.10元/张 |
| 2048x2048 | 8-12s | ~0.20元/张 |

### 并发策略

- **默认并发**: 1（保守，避免限流）
- **任务间隔**: 1秒
- **最大建议**: 2-3

### 重试策略

- **网络错误**: 指数退避，最多 3 次
- **限流**: 自动等待后重试
- **超时**: 2 分钟 API 调用超时

---

## 向后兼容性

### 与 0.3.2 兼容性

| 功能 | 状态 | 说明 |
|------|------|------|
| jobs.json | ✅ 兼容 | 新增可选字段 |
| 浏览器扩展 | ✅ 可用 | 并行运行 |
| opsv generate | ✅ 无变化 | 完全兼容 |
| opsv review | ✅ 无变化 | 完全兼容 |

### 升级路径

```bash
# 1. 更新代码
git pull origin main
npm install

# 2. 配置 API Key
echo "SEADREAM_API_KEY=xxx" >> .env

# 3. 更新 api_config.yaml
cp templates/assets/api_config.yaml assets/

# 4. 验证
opsv execute-image --dry-run
```

---

## 文件清单

### 新增文件 (5个)

```
src/executor/providers/ImageProvider.ts           (1,214 bytes)
src/executor/providers/SeaDreamProvider.ts        (10,481 bytes)
src/executor/ImageModelDispatcher.ts              (11,516 bytes)
templates/assets/api_config.yaml                  (1,347 bytes)
tests/unit/executor/SeaDreamProvider.test.ts      (8,798 bytes)
```

### 修改文件 (3个)

```
src/types/PromptSchema.ts        # 新增 ImageConfig, seed 字段
src/cli.ts                       # 新增 execute-image 命令
docs/schema/QUICK_REFERENCE.md   # 更新快速参考
```

---

## 验证结果

### 编译检查
```bash
$ ./node_modules/.bin/tsc --noEmit
# ✅ 无编译错误
```

### 单元测试
```bash
$ npm test
# Test Suites: 5 passed
# Tests: 85 passed
```

### CLI 功能测试
```bash
$ opsv execute-image --help
# ✅ 命令可用
```

---

## 参考文档

- [版本计划 ROADMAP-0.3.3.md](./ROADMAP-0.3.3.md)
- [SeaDream API 文档](https://www.volcengine.com/docs/82379/1824121)
- [技术方案设计](#实现细节)

---

## 下一步

### 0.3.4 计划 (预览)

- Stability AI 集成
- Midjourney API（官方支持后）
- 本地 ComfyUI 支持
- 批量图像增强

---

**实现完成时间**: 2026-03-15  
**实现状态**: ✅ 全部完成  
**测试覆盖**: 85 个测试用例，全部通过
