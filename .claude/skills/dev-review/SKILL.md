---
name: dev-review
description: 开发完成后的综合代码审查，并行派发 code-reviewer + security-reviewer agent + PRD 合规检查。触发词："代码审查"、"review 一下"、"dev-review"、"审查代码"、"代码检查"。
---

# Dev Review — 代码审查编排器

## 何时启用

用户说出以下任意表达时立即激活：

- 「代码审查」「审查代码」「review 一下」
- 「dev-review」「代码检查」「检查代码」
- 被 `/dev-loop` 作为 Phase 4 调用

**前置条件**：

- 当前目录是 git 仓库
- 有已提交但未合并的改动（对比 base branch）

**不启用**：

- 没有代码改动
- 用户只想快速看一眼（用 `simplify` 更合适）

---

## 完整执行流程

### Step 0：确定审查范围

```bash
# 当前分支
git branch --show-current

# 找到 base branch（main 或 master）
BASE=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $NF}')
BASE=${BASE:-main}

# 查看改动范围
git diff ${BASE}...HEAD --stat
git log ${BASE}...HEAD --oneline
```

如果 base branch 不可用，对比最近 N 个 commit：

```bash
git diff HEAD~5...HEAD --stat
```

**读取 PRD**（如果存在）：

```bash
cat .loop/prd.md
```

提取验收标准（Section 4 的 AC-xxx 条目），用于后续合规检查。

---

### Step 1：并行审查（3 路并行 Agent）

在同一条消息中并行派发 3 个 Agent：

**Agent 1: code-reviewer（代码质量）**

```
Prompt: 对以下改动进行代码审查，关注：
1. 代码质量和可读性
2. 设计模式和架构合理性
3. 错误处理完整性
4. 类型安全（TypeScript strict mode）
5. 性能隐患
6. 重复代码 / 可复用性

改动范围：git diff <base>...HEAD
```

**Agent 2: security-reviewer（安全扫描）**

```
Prompt: 对以下改动进行安全审查，关注：
1. 硬编码密钥/token/密码
2. SQL 注入风险
3. XSS 风险
4. 认证/授权缺陷
5. 输入验证缺失
6. 敏感数据泄露（日志、错误消息）

改动范围：git diff <base>...HEAD
```

**Agent 3: PRD 合规检查（自己执行）**

对比代码改动与 PRD 验收标准：

```
对每条验收标准 AC-xxx：
1. 是否有对应代码实现？
2. 实现是否完整覆盖验收条件？
3. 是否有额外的未定义行为？
```

---

### Step 2：合并审查结果

将 3 路审查结果合并为结构化报告：

```markdown
# Code Review Report

> 审查时间：YYYY-MM-DD
> 审查范围：<base>...HEAD (<N> commits, <N> files)
> 关联 PRD：<PRD 标题>

## 审查摘要

| 级别 | 数量 | 已修复 | 待处理 |
|------|------|--------|--------|
| CRITICAL | <n> | <n> | <n> |
| HIGH | <n> | <n> | <n> |
| MEDIUM | <n> | <n> | <n> |
| LOW | <n> | <n> | <n> |

## CRITICAL Issues

### CRIT-001: <问题标题>
- **文件**：`<file:line>`
- **类别**：安全 / 逻辑 / 数据
- **描述**：<问题描述>
- **建议**：<修复方案>
- **来源**：security-reviewer / code-reviewer

## HIGH Issues
...

## MEDIUM Issues
...

## LOW Issues
...

## PRD 合规检查

| 验收标准 | 状态 | 对应代码 | 备注 |
|---------|------|---------|------|
| AC-001 | ✅ 已实现 | src/app/... | — |
| AC-002 | ⚠️ 部分实现 | src/app/... | 缺少错误处理 |
| AC-003 | ❌ 未实现 | — | 需要补充 |

## PRD 歧义/缺陷

> 审查过程中发现的 PRD 本身描述问题（不是实现问题）。
> 这些问题记录在此处，由用户在部署前决定是否修订 PRD 并同步 api-contracts.json。

| # | 类型 | 描述 | 关联 AC | 影响范围 | 建议处理方式 |
|---|------|------|--------|---------|------------|
| PRD-ISSUE-001 | 歧义 | AC-002 中"错误处理"未指定具体错误码和消息格式 | AC-002 | dev-test 无法生成精确测试 | 补充 AC 描述 |
| PRD-ISSUE-002 | 缺陷 | PRD API 契约未包含分页参数定义，但实现已支持 | FR-001 | api-contracts.json 不完整 | 补充 API 契约 |
| PRD-ISSUE-003 | 矛盾 | Section 5 说"支持批量删除"，但 Section 7 API 契约只有单条 DELETE | FR-003, AC-005 | 实现可能缺失功能 | 澄清需求范围 |

> **处理流程**：
> 1. Review 发现 PRD 歧义 → 记录在 findings.md
> 2. 用户确认后 → 回到 dev-prd 更新 PRD + api-contracts.json
> 3. 受影响的 dev-test 测试场景需重新生成
> 4. session.json `prdRevisions[]` 记录此次修订

## 总体评价
<1-3 句话总结代码质量和风险>
```

写入 `.loop/review/findings.md`。

---

### Step 3：处理 CRITICAL/HIGH Issues

**自动修复 CRITICAL**：

对于可以安全自动修复的 CRITICAL 问题（如缺少输入验证、缺少错误处理）：
1. 直接修改代码
2. 告知用户修复了什么

**HIGH 问题处理**：

用 `AskUserQuestion` 询问：

选项：
- **全部修复**：我来修复所有 HIGH 问题
- **选择修复**：列出问题让用户勾选要修的
- **跳过**：记录但不修复（不推荐）

---

### Step 4：展示结果 + 确认

向用户展示审查概要：

```
🔍 代码审查完成
──────────────────────────────
发现问题：CRITICAL <n> | HIGH <n> | MEDIUM <n> | LOW <n>
PRD 合规：<已实现 N/M 条验收标准>
PRD 歧义/缺陷：<n> 条（需用户确认是否修订 PRD）
已修复：<n> 个问题
待处理：<n> 个问题

报告位置：.loop/review/findings.md
```

用 `AskUserQuestion` 询问：
- **确认，继续**：审查通过，进入测试阶段
- **修复后重审**：修复完所有问题后再审查一次
- **查看详情**：展示具体 findings

---

### Step 5：更新 session.json

```json
{
  "currentPhase": "test",
  "phases": {
    "review": { "status": "completed", "completedAt": "<ISO timestamp>" }
  },
  "artifacts": {
    "reviewFindings": ".loop/review/findings.md"
  },
  "prdRevisions": [
    {
      "issueId": "PRD-ISSUE-001",
      "type": "歧义",
      "description": "AC-002 中错误处理未指定具体格式",
      "affectedAC": ["AC-002"],
      "status": "pending_user_decision",
      "detectedAt": "<ISO timestamp>"
    }
  ]
}
```

> `prdRevisions[].status` 取值：
> - `pending_user_decision`：已发现，等待用户决定是否修订
> - `revised`：用户确认修订，PRD + api-contracts.json 已更新
> - `accepted_as_is`：用户确认当前实现正确，PRD 无需修改

---

## 审查检查清单

### 代码质量
- [ ] 函数不超过 50 行
- [ ] 文件不超过 800 行
- [ ] 没有深层嵌套（> 4 层）
- [ ] 命名清晰、一致
- [ ] 没有 `any` 类型（TypeScript 项目）
- [ ] 没有 `@ts-ignore` / `@ts-nocheck`
- [ ] 没有 `console.log`（用 logger 替代）

### 错误处理
- [ ] API 路由有 try-catch
- [ ] 用户输入有校验
- [ ] 错误消息不泄露内部细节
- [ ] 前端有 Error Boundary

### 安全
- [ ] 没有硬编码密钥
- [ ] SQL 使用参数化查询
- [ ] 用户输入有 XSS 防护
- [ ] API 端点有认证/授权检查
- [ ] 敏感数据不在 URL/日志中暴露

### PRD 合规
- [ ] 每条 P0 验收标准都有对应实现
- [ ] API 路由与 PRD 契约一致
- [ ] 组件结构与 PRD UI 规格一致

---

## 红线（不可违反）

1. **CRITICAL 问题不能跳过** — 必须修复或明确标记为用户接受
2. **审查必须并行派发** — code-reviewer + security-reviewer + PRD 合规检查三路并行
3. **审查结果必须写入 `.loop/review/findings.md`**
4. **不跳过 PRD 合规检查** — 每条验收标准都要对照
5. **修复后必须重新验证** — 自动修复的代码也要检查
6. **PRD 歧义/缺陷必须记录在 findings.md** — 不默默忽略，写入 PRD 歧义表并同步 session.json `prdRevisions[]`
7. **读取 API 契约优先使用 `.loop/api-contracts.json`** — 字段以 JSON 为准，PRD Markdown 为降级路径

---

## 特殊情况处理

| 情况 | 处理方式 |
|------|---------|
| 没有 base branch | 对比最近 N 个 commit，告知用户 |
| PRD 不存在 | 跳过 PRD 合规检查，只做代码质量+安全审查 |
| 改动很小（< 3 个文件） | 简化审查流程，不派 agent，直接自检 |
| 改动很大（> 30 个文件） | 建议分批审查，按模块分组 |
| 已有 PR 且被 review 过 | 只审查增量改动 |
