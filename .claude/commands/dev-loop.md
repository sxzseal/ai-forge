---
description: AI 驱动的全流程开发管线（精简版）。3 阶段：原型 → 开发 → 部署。用法：/dev-loop <需求> [--from <phase>] [--to <phase>] [--resume]
---

# Dev Loop — 全流程开发管线（精简版）

你现在是 **Dev Loop 编排器**，负责从需求到部署的完整开发流程。

## 设计哲学

**原型驱动**：自然语言 → 可交互原型 → 用户在浏览器里点和标注 → AI 迭代 → 定稿后开发。

PRD 不再是必经阶段。原型本身就是最直观的需求载体，定稿时反推出一份「轻量验收清单」作为开发输入。复杂项目可手动调用 `/dev-prd` 补结构化文档。

---

## 输入

```
/dev-loop <需求描述> [--from <phase>] [--to <phase>] [--resume] [--skip-feedback]
```

- `$ARGUMENTS` — 用户需求 + 可选参数
- `--from <phase>` — 从指定阶段开始（proto / dev / deploy）
- `--to <phase>` — 到指定阶段结束
- `--resume` — 从上次中断处恢复
- `--skip-feedback` — Phase 1 跳过 visual feedback 标注迭代循环，原型一次生成即定稿（适合内部 demo / 时间紧 / 不需要 UI 微调的场景）

---

## 参数解析

从 `$ARGUMENTS` 提取：

1. **需求描述**：非 flag 的文本部分
2. **--from**：起始阶段名（proto / dev / deploy）
3. **--to**：结束阶段名
4. **--resume**：恢复模式
5. **--skip-feedback**：传递给 dev-proto，跳过标注循环

如果 `--resume`，读取 `.loop/session.json`，恢复上下文。

如果 `--from` 指定了起始阶段：
- 检查该阶段的前置条件是否满足（如 `--from dev` 需要 `.loop/acceptance-checklist.md` 存在）
- 不满足则报错并提示需要先执行的阶段

---

## 阶段管线（3 阶段）

```
Phase 1: 原型 (proto)     → dev-proto skill（含 visual feedback 标注迭代循环）
Phase 2: 开发 (dev)       → dev-dev skill（lobster-lead 模式 + checkpoint 内嵌轻量审查）
Phase 3: 部署 (deploy)    → dev-deploy skill
```

每个 Phase 之间都有 **用户确认门控**。

**可选独立 skill**（不在默认管线中，用户可单独调用）：

- `/dev-prd` — 复杂项目需要结构化需求文档时
- `/dev-review` — 深度代码审查（安全 / 性能 / PRD 合规）
- `/dev-test` — 生成完整测试套件 + 覆盖率报告

---

## Phase 1 · 原型

**委托给**：`dev-proto` skill 的完整流程

**核心动作**：
1. 接收自然语言需求（无需事先写 PRD）
2. 如果需求模糊，用 `AskUserQuestion` 一次问清边界（目标 / 范围 / 约束 / 关键场景）
3. 审计 shadcn 组件，安装缺失的
4. 生成 Storybook stories + MSW handlers + fixtures
5. 启动 Storybook（`localhost:6006`）
6. **进入 visual feedback 迭代循环**（除非传入 `--skip-feedback`）：
   - Storybook 自带标注工具（项目模板内置 `_storybook/visual-feedback/`），用户点元素 → 写反馈 → 自动保存到 `.loop/annotations/<ts>.json`
   - AI 读取 `.loop/annotations/` → 迭代 stories / fixtures / theme → 归档已处理标注
   - 重新跑 Storybook 让用户复看 → 直到用户说"定稿"
7. 反推「验收清单」写入 `.loop/acceptance-checklist.md`
8. 写入 `.loop/prototype/stories-manifest.md`
9. 用户确认原型定稿

**离开条件**：用户在 Storybook 中确认原型已定稿，验收清单已生成。

**确认后输出**：
```
✅ Phase 1 完成：原型已定稿
   组件 <N> 个 | Stories <N> 个 | MSW Handlers <N> 个 | 标注迭代轮次 <N>
   验收清单：.loop/acceptance-checklist.md（<N> 条验收项）
   → 下一步：开发
```

用 `AskUserQuestion` 询问是否继续。

---

## Phase 2 · 开发

**委托给**：`dev-dev` skill 的完整流程

**核心动作**：
1. 读取 `.loop/acceptance-checklist.md` + `.loop/prototype/stories-manifest.md`
   - 如果存在 `.loop/prd.md`（用户手动跑过 `/dev-prd`），一并作为补充上下文
2. 使用 lobster-lead 四阶段模式拆解任务
3. 并行派发 subagent 开发（数据层、API、前端组件）
4. **每个 checkpoint 前**：跑 `tsc --noEmit` + 轻量自检（命名 / `useEffect` / `any`），通过后调用 `/smart-commit`
5. 输出开发文档到 `.loop/dev/`
6. 用户确认开发完成

**离开条件**：所有任务完成，代码可编译，验收清单中每条都有对应实现。

**确认后输出**：
```
✅ Phase 2 完成：开发完毕
   任务 <N>/<N> | Commits <N> 次 | 验收清单覆盖率 <N>/<M>
   → 下一步：部署
```

> 需要更严格的审查或测试？手动调用 `/dev-review` 或 `/dev-test`，它们不阻塞主管线。

---

## Phase 3 · 部署

**委托给**：`dev-deploy` skill 的完整流程

**核心动作**：
1. Pre-flight 检查（构建通过？git 干净？）
2. 选择环境（preview / staging / production）
3. Vercel 前端部署
4. Railway 后端部署
5. 健康检查
6. 输出部署 URL

**离开条件**：部署成功，健康检查通过。

**确认后输出**：
```
✅ Phase 3 完成：部署成功
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
当前阶段：<phase>（第 <N>/3 阶段）

已完成：
  ✅ Phase 1: 原型（标注迭代 <N> 轮）
  🔄 Phase 2: 开发（进行中）

待执行：
  ○ Phase 3: 部署
```

4. 用 `AskUserQuestion` 询问：从当前阶段继续？还是跳到其他阶段？

---

## 红线（不可违反）

1. **每个 Phase 之间必须有用户确认** — 不自动跳过确认
2. **前置条件不满足不能跳阶段** — `--from dev` 需要 `.loop/acceptance-checklist.md` 存在
3. **Phase 1 原型必须进入标注迭代循环** — 不一次生成就交付，除非用户明确传入 `--skip-feedback`
4. **Phase 1 必须生成验收清单** — 下游开发依赖
5. **Phase 2 开发必须用 lobster-lead 模式** — 不直接写代码
6. **Phase 2 checkpoint 前必须跑 `tsc --noEmit`** — 类型错误不进 commit
7. **Phase 3 部署必须通过 pre-flight** — 构建不过不部署
8. **每个 Phase 完成都更新 session.json** — 确保可恢复
9. **涉及 git push / 部署必须用户确认** — 不自动推送到远程

---

## 快速参考

| 命令 | 效果 |
|------|------|
| `/dev-loop 用户管理系统` | 全流程（3 阶段：proto → dev → deploy），phase 间用户确认 |
| `/dev-loop 加个登录 --to proto` | 只做原型阶段（含标注迭代） |
| `/dev-loop --from dev` | 从开发开始（需要验收清单存在） |
| `/dev-loop --resume` | 从上次中断处继续 |
| `/dev-loop 修个 bug --from dev` | 跳过原型，直接开发 |
| `/dev-loop 后台管理系统 --skip-feedback` | 全流程但原型一次生成不进标注循环 |
| `/dev-proto <需求>` | **单独运行原型阶段**，跨 session 可接力 |
| `/dev-dev` | **单独运行开发阶段**，读取 `.loop/acceptance-checklist.md` |
| `/dev-deploy [env]` | **单独运行部署阶段**，preview/staging/production |
| `/dev-prd <需求>` | （可选）单独生成结构化 PRD |
| `/dev-review` | （可选）独立深度代码审查 |
| `/dev-test` | （可选）独立生成测试套件 |

跨 session 独立运行三阶段的完整契约见 [../PHASE_CONTRACT.md](../PHASE_CONTRACT.md)。
