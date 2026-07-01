---
description: 单独运行开发阶段：读取验收清单 + 原型，按「拆解 → 并行 → checkpoint」模式开发。可独立 session 调用，不依赖 /dev-loop。
---

# /dev-dev — 独立开发阶段

你现在被显式要求**单独执行开发阶段**（Phase 2），不进入 `/dev-loop` 全流程。

## 输入

```
/dev-dev [可选补充说明]
```

- `$ARGUMENTS` — 可为空（直接按现有 `.loop/` 状态开发），也可包含补充说明

## 前置条件（硬要求 — 不满足直接报错）

至少一项满足：

- ✅ `.loop/acceptance-checklist.md` 存在（**主输入**，由 `/dev-proto` 生成）
- ✅ `.loop/prototype/stories-manifest.md` 存在
- ✅ `.loop/prd.md` 存在（用户跑过 `/dev-prd` 的兼容路径）

如果三者都不存在，**不要凭空开发**。停下来提示用户：

```
✗ 开发阶段需要验收清单或 PRD 作为输入，现在 .loop/ 是空的。

请先选择：
  1. 跑 /dev-proto <需求> 生成原型 + 验收清单（推荐，原型驱动）
  2. 跑 /dev-prd <需求> 生成结构化 PRD（适合复杂项目，需要正式文档）
  3. 手动放一份 .loop/acceptance-checklist.md（应急路径）
```

## 上下文约定（重要 — 独立运行场景）

可能场景：
1. **接力**：上一个 session 跑完了 `/dev-proto`，今天接着开发
2. **并发**：同事/AI 已经放好 `.loop/acceptance-checklist.md`，直接开干
3. **重启**：开发被打断，现在恢复

在任何场景下都必须遵守 [PHASE_CONTRACT.md](../PHASE_CONTRACT.md) 的输入/输出契约。

## 行为

**完全委托给 `dev-dev` skill 执行**，不要自己实现拆解和编码逻辑。

调用前的预检（**必做**）：

1. 检查 `.loop/acceptance-checklist.md` / `.loop/prototype/stories-manifest.md` / `.loop/prd.md`，至少一项存在
2. 检查 `.loop/session.json`（用 `node scripts/lib/forge-state.mjs read .loop/session.json`）：
   - `currentPhase === "prototype"` 且原型未完成 → 提示用户「原型阶段未结束，是否仍要进入开发？」
   - `currentPhase === "deploy"` 或 `"done"` → 提示用户「已部署完成，重新进入开发会创建新的开发产物，是否继续？」
3. **优先检查 `.loop/dev/task-state.json`**（per-task checkpoint，跨 session resume 主入口）：
   - 存在且有 `status: "in_progress"` 或 `"pending"` 的任务 → 用 `AskUserQuestion` 提示「检测到未完成任务 `[T00X title]`，从断点续跑？」
   - 存在但全部 `done` → 提示「上次开发已全部完成，重新进入会追加任务，是否继续？」
   - 不存在 → 检查旧的 `.loop/dev/task-breakdown.md`（兼容路径），有则询问重新拆解，无则新拆
4. 检查 forge-state CLI 可用：`node scripts/lib/forge-state.mjs --install-deps` 应输出 `deps OK`（首次运行会自动装 ajv）

预检通过后调用：

```
Skill(skill="dev-dev", args="<原始 $ARGUMENTS>")
```

## 离开后

dev-dev skill 会写入：
- `.loop/dev/task-state.json`（per-task checkpoint，schema 校验）
- `.loop/dev/task-breakdown.md`
- `.loop/dev/component-map.md`
- `.loop/dev/api-contracts.md`
- `.loop/dev/acceptance-coverage.md`
- `.loop/dev/checkpoint-findings.md`（Step 3 自检 findings，dev-deploy 生产闸门依赖）
- `.loop/session.json`（`currentPhase: "deploy"`）— 通过 `forge-state update --schema session` 写入

独立运行场景下**不自动进入 dev-deploy**，只输出：

```
✅ 开发阶段完成
   下一步可选：
   - 部署：/dev-deploy
   - 深度审查：/dev-review
   - 生成测试：/dev-test
   - 跑完整管线：/dev-loop --resume
```

---

详细的状态契约见 [PHASE_CONTRACT.md](../PHASE_CONTRACT.md)。
