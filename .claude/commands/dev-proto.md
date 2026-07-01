---
description: 单独运行原型阶段：自然语言 → Storybook 可交互原型 + 标注迭代 → 验收清单。可独立 session 调用，不依赖 /dev-loop。
---

# /dev-proto — 独立原型阶段

你现在被显式要求**单独执行原型阶段**（Phase 1），不进入 `/dev-loop` 全流程。

## 输入

```
/dev-proto <需求描述> [--skip-feedback] [--resume]
```

- `$ARGUMENTS` — 用户需求（自然语言）+ 可选 flag
- `--skip-feedback` — 跳过 visual feedback 标注循环，一次生成定稿
- `--resume` — 检测到 `.loop/annotations/` 还有未处理标注时，直接进入迭代循环而不重新生成

## 上下文约定（重要 — 独立运行场景）

这是**独立 slash command**，可能在以下场景被调用：
1. **冷启动**：`.loop/` 不存在，从零开始
2. **续接**：上次跑完 dev-proto 关掉 session，今天换一个 session 接着标注迭代
3. **回炉**：已经跑过 dev-dev 了，发现需求要改，回来重做原型

在任何场景下都必须遵守 [PHASE_CONTRACT.md](../PHASE_CONTRACT.md) 中定义的**输入产物 / 输出产物 / session.json 写入规则**。

## 行为

**完全委托给 `dev-proto` skill 执行**，不要自己实现原型生成逻辑。直接通过 Skill 工具调用：

```
Skill(skill="dev-proto", args="<原始 $ARGUMENTS>")
```

调用前先做以下检查并报告给用户：

1. `.loop/session.json` 是否存在？
   - 不存在 → 全新流程，直接开始
   - 存在且 `currentPhase` 是 `dev` 或 `deploy` → 提示用户：「检测到已进入后续阶段，重做原型会让 dev/deploy 产物失效，是否继续？」用 `AskUserQuestion` 确认
2. `.loop/annotations/` 是否有未处理标注？
   - 有 → 提示用户可加 `--resume` 直接进入迭代循环

## 离开后

dev-proto skill 会写入：
- `.loop/acceptance-checklist.md`
- `.loop/prototype/stories-manifest.md`
- `.loop/api-contracts.json`
- `.loop/session.json`（`currentPhase: "dev"`，标记 prototype 阶段完成）

独立运行场景下**不自动进入 dev-dev**，只输出：

```
✅ 原型阶段完成
   下一步可选：
   - 继续开发：/dev-dev
   - 单独审查：/dev-review
   - 单独测试：/dev-test
   - 跑完整管线：/dev-loop --resume
```

## 与 /dev-loop 的差异

| 维度 | /dev-loop | /dev-proto |
|------|-----------|------------|
| 完成后是否自动询问进入下阶段 | 是 | 否（用户主动调下一个 slash） |
| 是否写 `session.json.currentPhase` | 是 | 是（按 PHASE_CONTRACT 写） |
| 是否支持 `--from / --to` | 是 | 否（本身就是单阶段） |

---

详细的状态契约见 [PHASE_CONTRACT.md](../PHASE_CONTRACT.md)。
