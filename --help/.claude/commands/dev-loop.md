---
description: AI 驱动的全流程开发管线。从需求到部署，支持跳过阶段和恢复。用法：/dev-loop <需求> [--from <phase>] [--to <phase>] [--resume]
---

# Dev Loop — 全流程开发管线

你现在是 **Dev Loop 编排器**，负责从需求到部署的完整开发流程。

## 输入

```
/dev-loop <需求描述> [--from <phase>] [--to <phase>] [--resume]
```

- `$ARGUMENTS` — 用户需求 + 可选参数
- `--from <phase>` — 从指定阶段开始（跳过前面的阶段）
- `--to <phase>` — 到指定阶段结束（跳过后面的阶段）
- `--resume` — 从上次中断处恢复

---

## 参数解析

从 `$ARGUMENTS` 提取：

1. **需求描述**：非 flag 的文本部分
2. **--from**：起始阶段名（clarify / prd / proto / dev / review / test / deploy）
3. **--to**：结束阶段名
4. **--resume**：恢复模式

如果 `--resume`，读取 `.loop/session.json`，恢复上下文。

如果 `--from` 指定了起始阶段：
- 检查该阶段的前置条件是否满足（如 `--from proto` 需要 `.loop/prd.md` 存在）
- 不满足则报错并提示需要先执行的阶段

---

## 阶段管线

```
Phase 0: 澄清 (clarify)     → 需求不够明确时执行
Phase 1: PRD (prd)          → dev-prd skill
Phase 2: 原型 (proto)       → dev-proto skill
Phase 3: 开发 (dev)         → dev-dev skill（lobster-lead 模式）
Phase 4: 审查 (review)      → dev-review skill
Phase 5: 测试 (test)        → dev-test skill
Phase 6: 部署 (deploy)      → dev-deploy skill
```

每个 Phase 之间都有 **用户确认门控**。

---

## Phase 0 · 澄清

**触发条件**：需求不够明确，或没有 `--from` 跳过

**目标**：把需求钳定到边界清晰。

用 `AskUserQuestion` 一次性问清 4 个维度：

| 维度 | 问题 |
|------|------|
| 目标 | 最终交付物是什么？核心解决什么问题？ |
| 范围 | 涉及哪些功能？不做什么？ |
| 约束 | 技术栈、性能、兼容性限制？ |
| 成功指标 | 怎么判断做完了？ |

**离开条件**：需求足够清晰，可以写 PRD。

---

## Phase 1 · PRD

**委托给**：`dev-prd` skill 的完整流程

**核心动作**：
1. 分析需求，生成结构化 PRD
2. 写入 `.loop/prd.md`
3. 用户确认 PRD

**离开条件**：用户对 PRD 满意，确认通过。

**确认后输出**：
```
✅ Phase 1 完成：PRD 已生成
   用户故事 <N> 个 | 功能需求 <N> 条 | API 端点 <N> 个
   → 下一步：原型设计
```

用 `AskUserQuestion` 询问是否继续。

---

## Phase 2 · 原型

**委托给**：`dev-proto` skill 的完整流程

**核心动作**：
1. 读取 `.loop/prd.md`
2. 审计 shadcn 组件，安装缺失的
3. 生成 Storybook stories + MSW handlers
4. 启动 Storybook 验证
5. 写入 `.loop/prototype/stories-manifest.md`
6. 用户确认原型

**离开条件**：用户在 Storybook 中确认原型满意。

**确认后输出**：
```
✅ Phase 2 完成：原型已生成
   组件 <N> 个 | Stories <N> 个 | MSW Handlers <N> 个
   → 下一步：正式开发
```

---

## Phase 3 · 开发

**委托给**：`dev-dev` skill 的完整流程

**核心动作**：
1. 读取 `.loop/prd.md` + `.loop/prototype/stories-manifest.md`
2. 使用 lobster-lead 四阶段模式拆解任务
3. 并行派发 subagent 开发（数据层、API、前端组件）
4. checkpoint 时调用 `/smart-commit`
5. 输出开发文档到 `.loop/dev/`
6. 用户确认开发完成

**离开条件**：所有任务完成，代码可编译。

---

## Phase 4 · 代码审查

**委托给**：`dev-review` skill 的完整流程

**核心动作**：
1. 并行派发 code-reviewer + security-reviewer agent
2. PRD 验收标准合规检查
3. 合并审查结果到 `.loop/review/findings.md`
4. 处理 CRITICAL/HIGH issues
5. 用户确认审查结果

**离开条件**：无 CRITICAL issue，用户确认通过。

**确认后输出**：
```
✅ Phase 4 完成：代码审查通过
   CRITICAL: 0 | HIGH: 0 | MEDIUM: <n> | LOW: <n>
   PRD 合规：<N>/<M> 验收标准已实现
   → 下一步：测试
```

---

## Phase 5 · 测试

**委托给**：`dev-test` skill 的完整流程

**核心动作**：
1. 从 PRD 验收标准生成测试场景
2. **人工验证 STOP POINT** — 用户确认业务逻辑正确性
3. 生成 Vitest + Playwright 测试代码
4. 运行测试，确保全部通过
5. 输出覆盖率报告到 `.loop/test/`

**离开条件**：测试全部通过，覆盖率达标（≥ 80%）。

**确认后输出**：
```
✅ Phase 5 完成：测试通过
   测试 <N> 个 | 通过率 100% | 覆盖率 <N>%
   → 下一步：部署
```

---

## Phase 6 · 部署

**委托给**：`dev-deploy` skill 的完整流程

**核心动作**：
1. Pre-flight 检查（测试通过？审查无 CRITICAL？）
2. 选择环境（preview / staging / production）
3. Vercel 前端部署
4. Railway 后端部署
5. 健康检查
6. 输出部署 URL

**离开条件**：部署成功，健康检查通过。

**确认后输出**：
```
✅ Phase 6 完成：部署成功
   前端：https://xxx.vercel.app
   后端：https://xxx.up.railway.app
   健康检查：✅ 通过
```

---

## 恢复机制 (--resume)

当使用 `--resume` 时：

1. 读取 `.loop/session.json`
2. 找到 `currentPhase`
3. 总结已完成的工作：

```
📋 Loop 恢复
──────────────────────────────
Loop ID: loop-YYYYMMDD-NNN
需求：<requirement>
当前阶段：<phase>（第 <N>/7 阶段）

已完成：
  ✅ Phase 0: 澄清
  ✅ Phase 1: PRD
  ✅ Phase 2: 原型
  🔄 Phase 3: 开发（进行中）

待执行：
  ○ Phase 4: 代码审查
  ○ Phase 5: 测试
  ○ Phase 6: 部署
```

4. 用 `AskUserQuestion` 询问：从当前阶段继续？还是跳到其他阶段？

---

## 红线（不可违反）

1. **每个 Phase 之间必须有用户确认** — 不自动跳过确认
2. **前置条件不满足不能跳阶段** — `--from proto` 需要 PRD 存在
3. **Phase 3 开发必须用 lobster-lead 模式** — 不直接写代码
4. **Phase 4 审查必须并行派发 agent** — 不跳过安全审查
5. **Phase 5 测试必须有人工验证 STOP POINT** — 不跳过业务逻辑确认
6. **Phase 6 部署必须通过 pre-flight** — 测试不过不部署
7. **每个 Phase 完成都更新 session.json** — 确保可恢复
8. **涉及 git push / 部署必须用户确认** — 不自动推送到远程

---

## 快速参考

| 命令 | 效果 |
|------|------|
| `/dev-loop 用户管理系统` | 全流程（6 个阶段） |
| `/dev-loop 加个登录 --to proto` | 只做需求→原型 |
| `/dev-loop --from review` | 从代码审查开始（需要前面阶段已完成） |
| `/dev-loop --resume` | 从上次中断处继续 |
| `/dev-loop 修个 bug --from dev` | 跳过 PRD 和原型，直接开发 |
