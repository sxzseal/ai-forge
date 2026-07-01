---
description: 回退到指定 checkpoint（loop-<id>-cp-<n> git tag）。用法：/dev-undo [cp-<n>] [--keep-events]
---

# /dev-undo — 回退到 checkpoint

## 何时用

- 开发中发现 checkpoint N 之后的代码走偏了，想干净回到 N
- 想撤销一次误提交 + 相应的 `.loop/` 状态变化
- 想在 phase 之间做 A/B 尝试（跑到 cp-3，觉得不好，回 cp-2 再试）

## 输入

```
/dev-undo [cp-<n>] [--keep-events]
```

- `cp-<n>`：回退目标 checkpoint 编号。省略时进入交互选择
- `--keep-events`：**只** 回滚代码（`git reset --soft`），保留 `.loop/events.jsonl` 完整历史。默认会同时把 checkpoint 之后的 events 归档到 `.loop/events-archive/`

## 执行流程

### Step 0：列出可选 checkpoints

```bash
git tag --list 'loop-*-cp-*' --sort=-creatordate | head -20
```

同时 `forge-events query .loop/events.jsonl --kind checkpoint.created` 拿到每个 tag 对应的时间戳、summary。

### Step 1：交互选择（无参时）

用 `AskUserQuestion` 展示最近 5 个 checkpoint（tag / commit summary / 创建时间），让用户选一个。

### Step 2：确认危险操作

用 `AskUserQuestion` 二次确认：

- **确认回退**：`git reset --soft <tag>` 保留 worktree 改动
- **取消**：不动任何东西

### Step 3：执行回滚

```bash
TAG="loop-<loopId>-cp-<n>"
git reset --soft "$TAG"
```

**同时回滚 `.loop/` 状态**（默认；`--keep-events` 时跳过）：

```bash
# 从 events.jsonl 找到 checkpoint.created cp-<n> 的时间戳
CP_TS=$(node scripts/lib/forge-events.mjs query .loop/events.jsonl \
  --kind checkpoint.created \
  | jq -r --arg n "$n" '.[] | select(.payload.name == "cp-\($n)") | .ts')

# 把之后的 events 归档
node scripts/lib/forge-events.mjs rollback .loop/events.jsonl --to "$CP_TS"
```

### Step 4：写 checkpoint.reverted event

```bash
node scripts/lib/forge-events.mjs append \
  --kind checkpoint.reverted \
  --phase meta \
  --payload "$(jq -n --arg tag "$TAG" '{tag: $tag, revertedAt: (now | todate)}')"
```

### Step 5：报告

```
↩︎ 回退完成
──────────────────────────────
目标：cp-<n> (<tag>)
Commit：<sha>
Worktree 改动：保留在 staging（`git status` 可见）
Events：归档 <N> 条到 .loop/events-archive/

下一步：
  - 修改代码后重新 commit（会创建 cp-<n+1>）
  - /dev-undo 再回退一步
  - /dev-loop --resume 继续开发
```

## 红线

1. **只回退 loop-<id>-cp-<n> tag** — 不动其他 git ref
2. **默认 --soft 保留改动** — 不用 `--hard`，避免丢失工作
3. **`.loop/` 状态默认同步回滚** — 与代码保持一致；`--keep-events` 才保留
4. **必须写 checkpoint.reverted event** — 供审计
5. **未提交改动时警告用户** — `git status --porcelain` 非空时 `AskUserQuestion` 询问是否 stash

## 特殊情况

| 情况 | 处理 |
|------|------|
| 没有任何 checkpoint tag | 报错，建议先跑一次 dev-dev 让 checkpoint 产生 |
| 目标 checkpoint 不存在 | 列出所有 tags 让用户重选 |
| 工作区脏 | `AskUserQuestion` 让用户 stash 或 commit 后再回退 |
| 用户想回退超过 5 个 checkpoint | 二次警告，展示会跳过的 checkpoint 列表 |
| `.loop/events.jsonl` 缺 checkpoint.created 事件 | 只回滚代码，events 保持不变，写 warn |
