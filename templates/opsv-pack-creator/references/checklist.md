# OPSV 技能包创建清单

## 前置条件

- [ ] 已理解"做什么"（原始材料类型 → 成品类型）
- [ ] 已理解"为谁做"（目标用户画像写入 USER.md）

## 脚手架阶段

### Step 0: 初始化
- [ ] `mkdir -p opsv-packs/<pack-name>/.agent/{skills,guides}`
- [ ] `mkdir -p opsv-packs/<pack-name>/videospec/directive`
- [ ] 给技能包起一个有意义的名称

### Step 1: 用户画像
- [ ] 创建 `.agent/USER.md`（身份/风格/痛点/质量标杆）
- [ ] 明确用户对质量的期望等级

### Step 2: 代理人设
- [ ] 创建 `.agent/AGENTS.md`
- [ ] 定义角色生态（生产角色 + Guardian + Runner）
- [ ] 每个角色绑定一个技能 SKILL.md
- [ ] 定义交互协议（称呼、语言、范式声明）

### Step 3: 管线定义
- [ ] 创建 `skills/pipeline/SKILL.md`
- [ ] 定义生产阶段（建议 4-7 个）
- [ ] 每阶段绑定技能（≤3）
- [ ] 每阶段定义输入、输出、验收命令

### Step 4: 分类注册
- [ ] 列出所有文档类型 → 分配 category 命名
- [ ] 创建 `videospec/_category_validate.yaml`
- [ ] 创建 `.opsv/category_validate.yaml`（源文件，标注同步说明）
- [ ] 每个 category 定义 required_fields
- [ ] 区分视觉类（prompt 检查）与非视觉类（skip_prompt_check: true）
- [ ] 运行 `opsv validate` 确认零错误

### Step 5: 技能编写
- [ ] 为每个阶段创建 `skills/<name>/SKILL.md`
- [ ] 每个技能标注管线位置、输入、产物、验收
- [ ] 定义职责边界（我做/我不做）
- [ ] 创建工作流程（至少 2 个步骤，最后一步包含 `opsv validate`）
- [ ] 提供输出文档模板
- [ ] 运行 `grep -r "管线位置" skills/*/SKILL.md | wc -l` 确认所有技能已标注

### Step 6: 指南编写
- [ ] 提取核心规范到 `guides/*.md`
- [ ] 提示词书写规范（视觉类可选）
- [ ] 工作流方法论（可选）
- [ ] 文档模板规范（可选）

### Step 7: 验收闭环
- [ ] `opsv validate` 通过
- [ ] `opsv refs check` 通过（如有 refs 字段）
- [ ] 模拟创建一份最小测试文档，验证 category 规则生效
- [ ] Guardian 能正确阻断不合格产物

## 质量门控

- [ ] 每阶段 ≤3 技能
- [ ] 每个 category 有验证规则
- [ ] 每个 SKILL.md 有职责边界
- [ ] 所有文档在 videospec/ 目录下
- [ ] .opsv/ 与 videospec/ 的 category_validate.yaml 同步

## 实战验证

- [ ] 运行一个真实案例，走通所有阶段
- [ ] 记录复盘报告
- [ ] 根据复盘迭代 category 规则
- [ ] 更新 SKILL.md 中的经验教训
