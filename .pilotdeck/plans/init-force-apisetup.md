# Plan: `init .sample` + `run --force` + `api-setup` 命令

## 1. `opsv init` — 生成 .sample 配置文件

### 改动文件
- `cli/src/commands/init.ts`

### 改动内容

在现有 init 逻辑中（创建目录结构、写 `.gitignore`、git init 之后），追加：

```typescript
// 从内置 .opsv/ 复制配置文件为 .sample 版本
const builtinOpsvDir = path.join(__dirname, '..', '..', '.opsv');
const projectOpsvDir = path.join(targetDir, '.opsv');
const sampleFiles = ['api_config.yaml', 'category_validate.yaml', 'input_types.yaml'];

for (const file of sampleFiles) {
  const src = path.join(builtinOpsvDir, file);
  if (fs.existsSync(src)) {
    const dest = path.join(projectOpsvDir, `${file}.sample`);
    fs.copyFileSync(src, dest);
    console.log(chalk.gray(`  Created ${path.relative(targetDir, dest)}`));
  }
}
```

同时生成 `.env.sample`，提取所有 `required_env` 去重：

```typescript
// 扫描内置 api_config.yaml 提取所有 required_env 去重
const apiConfigPath = path.join(builtinOpsvDir, 'api_config.yaml');
if (fs.existsSync(apiConfigPath)) {
  const config = yaml.load(fs.readFileSync(apiConfigPath, 'utf8'));
  const models = (config as any)?.models || {};
  const envVars = new Set<string>();
  for (const [key, model] of Object.entries(models)) {
    const req = (model as any)?.required_env;
    if (Array.isArray(req)) req.forEach((v: string) => envVars.add(v));
  }

  const envSampleLines = [
    '# .env.sample — 由 opsv init 自动生成',
    '# 复制为 .env 并填入你的 API Key',
    '',
  ];
  for (const envVar of envVars) {
    envSampleLines.push(`${envVar}=your_key_here`);
  }
  envSampleLines.push('');
  fs.writeFileSync(path.join(targetDir, '.env.sample'), envSampleLines.join('\n'));
  console.log(chalk.gray('  Created .env.sample'));
}
```

**注意**：`yaml` 已通过 `js-yaml` 在依赖中，直接 import 即可。需要在 `init.ts` 顶部加 import。

---

## 2. `run --force` — 强制重新运行

### 改动文件
- `cli/src/commands/run.ts`
- `cli/src/executor/QueueRunner.ts`

### run.ts 改动

```typescript
// 在 interface RunCommandOptions 加
interface RunCommandOptions {
  retry?: boolean;
  dryRun?: boolean;
  concurrency?: number;
  force?: boolean;  // ★ 新增
}

// 注册命令时加 option
.option('--force', 'Force re-run all tasks, ignoring previous success')

// 传递到 runner
const results = await runner.runPaths(paths, {
  retry: options.retry || false,
  dryRun: options.dryRun || false,
  concurrency: options.concurrency,
  force: options.force || false,   // ★ 新增
});
```

### QueueRunner.ts 改动

**RunOptions 接口**：

```typescript
interface RunOptions {
  retry?: boolean;
  dryRun?: boolean;
  concurrency?: number;
  force?: boolean;  // ★
}
```

**`runPaths()` 签名**：`options` 参数类型更新。

**`collectTasks()` 逻辑**（第 203 行附近）：

在检查 `retry` 之前，先判断 `force`：

```typescript
private collectTasks(
  paths: string[],
  retry?: boolean,
  force?: boolean  // ★ 新增参数
): Array<{ task: BaseTaskJson<unknown>; path: string }> {
  for (const p of paths) {
    // ...
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile() && resolved.endsWith('.json')) {
      try {
        const task = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
        if (task._opsv) {
          // ★ force 模式：跳过所有检查，直接加入
          if (force) {
            results.push({ task, path: resolved });
            continue;
          }
          if (retry) { /* ... 原有逻辑 ... */ }
          if (!this.shouldSkipTask(...)) { /* ... 原有逻辑 ... */ }
        }
      }
    } else if (/* isDirectory */) {
      this.collectFromDir(resolved, results, retry, force); // ★ 传递 force
    }
  }
}
```

**`collectFromDir()` 逻辑**（第 238 行附近）：

```typescript
private collectFromDir(
  dir: string,
  results: Array<{ task: BaseTaskJson<unknown>; path: string }>,
  retry?: boolean,
  force?: boolean  // ★
): void {
  for (const entry of entries) {
    // ...
    if (entry.endsWith('.json') && !entry.startsWith('_')) {
      const task = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      if (task._opsv) {
        // ★ force 模式：跳过所有检查
        if (force) {
          results.push({ task, path: fullPath });
          continue;
        }
        // 原有 retry/hasOutput/shouldSkipTask 逻辑...
      }
    }
  }
}
```

**关于输出文件**：`resolveNextOutputIndex()`（`naming.ts` 第 53 行）已实现增量保存——每次执行自动取 `maxIndex + 1`。所以 `--force` **不会覆盖旧输出**，而是产生新文件：

```
第一次 run:     @hero_1.png, @hero_2.png
--force 重跑:   @hero_3.png, @hero_4.png  (旧文件保留)
```

这已经是预期行为，不需要额外改动。

**在 `runTask()` 中清理旧 checkpoint**（第 128 行附近）：

只清理 `.log`（轮询 checkpoint）和 `_error.log`，让任务从全新状态开始：

```typescript
private async runTask(
  task: BaseTaskJson<unknown>,
  taskPath: string,
  handler: ProviderExecutor,
  results: ProviderResult[]
): Promise<void> {
  // ★ force: 清理旧 checkpoint，不清理输出文件（增量保存）
  if (this.forceMode) {
    const logFile = taskPath.replace(/\.json$/, '.log');
    if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
    const errorLog = taskPath.replace(/\.json$/, '_error.log');
    if (fs.existsSync(errorLog)) fs.unlinkSync(errorLog);
  }

  // ... 原有 execute 逻辑不变
}
```

**实现方式**：`QueueRunner` 类上加 `private forceMode = false`，在 `runPaths()` 开头根据 `options.force` 设置。

---

## 3. `opsv api-setup` 命令

### 新增文件
- `cli/src/commands/apiSetup.ts` — 命令注册 + option 解析
- `cli/src/utils/envManager.ts` — .env 读写/更新/去重
- `cli/src/utils/configWriter.ts` — YAML 追加 model + 校验

### 注册到 cli.ts

```typescript
import { registerApiSetupCommand } from './commands/apiSetup';
registerApiSetupCommand(program);
```

### envManager.ts

```typescript
export interface EnvEntry {
  key: string;
  value: string;
}

/**
 * 读取 .env 文件，解析为 key-value 映射
 */
export function readEnvFile(envPath: string): Record<string, string> { /* ... */ }

/**
 * 设置/更新一个 key，保留其他行和注释
 */
export function setEnvKey(envPath: string, key: string, value: string): void { /* ... */ }

/**
 * 批量设置多个 key
 */
export function setEnvKeys(envPath: string, entries: EnvEntry[]): void { /* ... */ }

/**
 * 检查哪些 required_env key 缺失
 */
export function getMissingEnvKeys(requiredVars: string[], envPath: string): string[] { /* ... */ }
```

**`setEnvKey` 逻辑**：
1. 如果 `.env` 不存在，创建并写入 `KEY=VALUE`
2. 如果存在，逐行扫描：
   - 找到 `KEY=` 开头的行 → 替换为 `KEY=VALUE`
   - 没找到 → 在文件末尾追加 `KEY=VALUE`
   - 保留注释和空行

### configWriter.ts

```typescript
export interface AddModelInput {
  modelKey: string;
  config: Record<string, any>;
}

/**
 * 验证 model 配置结构
 */
export function validateModelConfig(modelKey: string, config: Record<string, any>): string[] {
  const errors: string[] = [];
  const provider = config.provider;

  if (!['comfylocal', 'runninghub'].includes(provider)) {
    errors.push(`provider must be "comfylocal" or "runninghub", got "${provider}"`);
    return errors;
  }

  if (provider === 'comfylocal') {
    if (!config.node_mappings) errors.push('node_mappings is required for comfylocal');
    if (config.required_env) errors.push('comfylocal does not use required_env');
  }

  if (provider === 'runninghub') {
    if (!config.workflowId) errors.push('workflowId is required for runninghub');
    if (!config.node_mappings) errors.push('node_mappings is required for runninghub');
    // 自动确保 required_env 存在
    if (!config.required_env) config.required_env = ['RUNNINGHUB_API_KEY'];
  }

  return errors;
}

/**
 * 向项目 .opsv/api_config.yaml 追加 model
 */
export function appendModelToConfig(
  configPath: string,
  modelKey: string,
  config: Record<string, any>
): void { /* ... */ }
```

**`appendModelToConfig` 逻辑**：
1. 读取现有 YAML 解析为对象
2. 检查 `modelKey` 是否已存在（在三层 merge 后）
3. 不重复则追加到 `models` 下
4. 写回 YAML 文件（保留注释较难，最小方案：用 `js-yaml` dump 整个文件）

### apiSetup.ts

```typescript
export function registerApiSetupCommand(program: Command): void {
  program
    .command('api-setup')
    .description('Configure API providers and keys')
    .option('--list', 'List all models and their key status')
    .option('--set-key <kv>', 'Set/update an API key (e.g. RH_API_KEY=sk-xxx)')
    .option('--add-model <json>', 'Add a new comfylocal or runninghub model config (JSON)')
    .option('--sync-env', 'Scan api_config and add missing keys to .env as placeholders')
    .action(async (options) => {
      // 模式分发
    });
}
```

**交互模式**（无参数）：

```
$ opsv api-setup

🔍 扫描到 12 个模型，涉及 4 个 API Key：

  Provider     │ Key                  │ Status
  ─────────────┼──────────────────────┼──────────
  火山引擎      │ ARK_API_KEY         │ ✅ 已配置
  SiliconFlow  │ SILICONFLOW_API_KEY  │ ❌ 未设置
  MiniMax      │ MINIMAX_API_KEY      │ ❌ 未设置
  RunningHub   │ RUNNINGHUB_API_KEY   │ ✅ 已配置

  可扩展 Provider：
  comfylocal   │ comfylocal.workflow  │ (不需要 key)
  runninghub   │ runninghub.default   │ ✅ 已配置

→ 是否补全缺失的 API Key？[Y/n]
→ 请输入 SILICONFLOW_API_KEY: [输入，不回显]
→ 请输入 MINIMAX_API_KEY: [输入，不回显]

✅ 已写入 /home/user/project/.env
```

---

## 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `cli/src/commands/init.ts` | 修改 | init 时复制 .sample 文件 + 生成 .env.sample |
| `cli/src/commands/run.ts` | 修改 | 加 `--force` option |
| `cli/src/executor/QueueRunner.ts` | 修改 | force 跳过检查 + 清理 checkpoint |
| `cli/src/commands/apiSetup.ts` | **新建** | api-setup 命令 |
| `cli/src/utils/envManager.ts` | **新建** | .env 工具函数 |
| `cli/src/utils/configWriter.ts` | **新建** | YAML 追加 + 校验 |
| `cli/src/cli.ts` | 修改 | 注册 api-setup 命令 |

---

## 执行顺序

1. `init.ts` — 最独立，先改
2. `QueueRunner.ts` + `run.ts` — 只涉及 force 逻辑
3. `envManager.ts` + `configWriter.ts` — 工具模块先写
4. `apiSetup.ts` — 依赖 envManager 和 configWriter，最后写
5. `cli.ts` — 注册命令，最后改
