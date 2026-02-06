# 开发任务分解 (Task Breakdown)

## 阶段一：基础设施搭建 (Infrastructure)
- [ ] **项目初始化**
    - [x] 创建目录结构 (`.antigravity`, `openspec`, `src`, `assets`)
    - [x] 初始化 `package.json` 与 TypeScript 配置
    - [ ] 安装核心依赖 (`unified`, `zod`, `js-yaml`)
- [ ] **OpenSpec 定义**
    - [x] 编写 `project.md` (项目定义)
    - [x] 编写 `architecture.md` (架构文档)
    - [ ] 编写示例资产文件 (`assets/characters/example.yaml`)

## 阶段二：核心逻辑开发 (Brain Layer)
- [ ] **Spec 解析器开发**
    - [ ] 实现 `SpecParser.ts`：解析 Markdown Frontmatter
    - [ ] 实现 `AssetManager.ts`：加载 YAML 资产配置
- [ ] **Prompt 编译器开发**
    - [ ] 定义 `PromptSchema` (Zod Schema)
    - [ ] 实现 `JobGenerator.ts`：Script -> JSON Job 转换逻辑
- [ ] **单元测试**
    - [ ] 验证解析器对非法文档的报错机制
    - [ ] 验证 Prompt 生成的结构正确性

## 阶段三：自动化工作流设计 (Hand Layer)
- [ ] **代理规则配置**
    - [ ] 编写 `.antigravity/rules/style-guide.md`
    - [ ] 编写 `.antigravity/workflows/executor.md` (Agent 操作手册)
- [ ] **集成测试**
    - [ ] 模拟通过 Agent 执行单一任务（Job -> Browser -> Artifact）
    - [ ] 调试 Browser Subagent 的稳定性

## 阶段四：全链路演示 (Demo)
- [ ] **制作 "Hello World" 视频**
    - [ ] 编写测试剧本（3个镜头）
    - [ ] 运行全流程生成
    - [ ] 输出演示报告
