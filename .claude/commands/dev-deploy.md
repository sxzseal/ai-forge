---
description: 单独运行部署阶段：Pre-flight 检查 + Vercel/Railway 部署 + 健康检查。可独立 session 调用，不依赖 /dev-loop。
---

# /dev-deploy — 独立部署阶段

你现在被显式要求**单独执行部署阶段**（Phase 3），不进入 `/dev-loop` 全流程。

## 输入

```
/dev-deploy [preview|staging|production]
```

- `$ARGUMENTS` — 可选环境名，默认 `preview`

## 前置条件（硬要求 — 不满足直接报错）

- ✅ 代码可编译（`npm run build` / `tsc --noEmit` 通过）
- ✅ Git 工作区干净（无未提交变更，或用户明确确认要带未提交变更部署）
- ✅ Vercel / Railway CLI 已安装并登录

**软前置**（缺失时警告但不阻断）：
- `.loop/api-contracts.json` 不存在 → 警告「API 契约未机器化，前后端可能不一致」
- `.loop/dev/acceptance-coverage.md` 不存在 → 警告「无验收覆盖报告，无法确认本次部署对应哪些 AC」
- `.loop/review/findings.md` 中含 CRITICAL → 警告并要求用户确认

## 上下文约定（重要 — 独立运行场景）

可能场景：
1. **接力**：上一个 session 跑完了 `/dev-dev`，今天部署
2. **修复部署**：线上 bug 修完了，跑一次 `/dev-deploy production`
3. **冷启动部署**：项目根本没跑过 /dev-loop，但代码可编译，直接部署

冷启动部署是合法路径，**不要因为 `.loop/` 不完整就拒绝部署**，只警告即可。

## 行为

**完全委托给 `dev-deploy` skill 执行**：

```
Skill(skill="dev-deploy", args="<原始 $ARGUMENTS>")
```

调用前的预检：

1. 跑 `npm run build`（或 `tsc --noEmit`），失败直接终止并报错
2. 跑 `git status`，有未提交变更则用 `AskUserQuestion` 确认是否继续
3. 检查 `.loop/session.json`：
   - 不存在 → 标记本次为「冷启动部署」，仍可继续
   - `currentPhase === "prototype"` → 用 `AskUserQuestion` 警告「尚未开发，确认要直接部署？」

预检通过后调用 skill。

## 离开后

dev-deploy skill 会写入：
- `.loop/deploy/checklist.md`
- `.loop/session.json`（`currentPhase: "done"`）

输出：

```
✅ 部署阶段完成
   前端：<url>
   后端：<url>
   下一步可选：
   - 归档当前 Loop：将 .loop/ 移到 .loop/archive/YYYY-MM-DD-<feature>/
   - 开始新 Loop：/dev-loop <新需求> 或 /dev-proto <新需求>
```

---

详细的状态契约见 [PHASE_CONTRACT.md](../PHASE_CONTRACT.md)。
