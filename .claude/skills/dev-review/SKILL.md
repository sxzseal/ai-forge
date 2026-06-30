---
name: dev-review
description: 开发完成后的综合代码审查。先用 seal-code-review (L3) 做确定性静态扫描，再并行派发 code-reviewer + security-reviewer agent + PRD 合规检查。触发词："代码审查"、"review 一下"、"dev-review"、"审查代码"、"代码检查"。
---

# Dev Review — 代码审查编排器

## 审查策略（双层）

dev-review 采用**确定性扫描 + LLM 深度分析**双层策略，覆盖 AI 生成代码的典型问题：

| 层级 | 工具 | 关注点 | 特性 |
|------|------|--------|------|
| **L1: 静态扫描** | `seal-code-review` (L3 模式) | 幻觉包、硬编码密钥、危险 API、死代码、空 catch、长函数、深嵌套、floating promise、`as any`、`async` 无 `await` | 纯 regex + 包注册表查询，零误差、可缓存、SARIF 输出 |
| **L2: LLM 审查** | code-reviewer / security-reviewer / PRD 合规 | 业务逻辑、设计合理性、安全语义、PRD 验收对齐 | 上下文感知，理解意图 |

**为什么先静态后 LLM**：静态扫描的发现是确定性的（无幻觉），可作为 LLM 审查的事实基线；LLM 不再浪费 token 重复发现机械问题，专注于逻辑和契约合规。

## 何时启用

用户说出以下任意表达时立即激活：

- 「代码审查」「审查代码」「review 一下」
- 「dev-review」「代码检查」「检查代码」
- 用户主动调用此 skill 做深度审查（**独立 skill**，不在 `/dev-loop` 默认管线中）

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

**确定改动文件清单**（用于静态扫描定向）：

```bash
git diff ${BASE}...HEAD --name-only > .loop/review/changed-files.txt
```

只对改动文件做扫描比全量扫描快、噪音小；若改动 > 30 文件则改为扫整个 `src/`。

---

### Step 1：静态扫描层（seal-code-review L3）

**目标**：用 `seal-code-review` 跑 L3 模式，拿到确定性发现 + 评分 + SARIF 报告，作为后续 LLM 审查的事实基线。

**调用方式**：通过 Skill 工具触发 `seal-code-review`，让其扫描改动范围：

```
Skill: seal-code-review
Args: scan ./src --sla L3 --format json --output .loop/review/seal-report.json
      （多语言项目追加 --lang typescript python ...）
      （CI 场景同时输出 SARIF: --format sarif --output .loop/review/seal.sarif）
```

> 若已知改动集中在某个子目录（如 `src/app/api`），把 path 收窄到该目录可显著加速。
> L2 的包注册表查询有 24h 磁盘缓存，**不要**加 `--no-cache`，除非用户明确要求强制刷新。

**读取结果**：

```bash
cat .loop/review/seal-report.json
```

提取关键字段：
- `score` — 总分（CRITICAL 直接 0 分）
- `findings[]` — 每条带 `severity`、`rule`、`file:line`、`message`
- `hallucinatedPackages[]` — L2 发现的幻觉/未声明依赖（**AI 生成代码高危项**）

**预过滤策略**：

| seal 严重度 | 处理 |
|------------|------|
| CRITICAL（密钥泄露、幻觉包、`eval`） | 直接列入 CRITICAL，不再询问 agent |
| HIGH（dangerous API、空 catch、unhandled promise） | 列入 HIGH，传给 agent 做语义二次评估 |
| MEDIUM/LOW（长函数、深嵌套、`as any`） | 列入 MEDIUM，agent 可去重 |

**短路条件**：

- 如果 `seal score < 60` 且包含 CRITICAL → 先告知用户并询问是否先修这些再继续 LLM 审查（修完再跑一次 seal，避免 LLM 浪费 token 在已知问题上）
- 如果 `seal score >= 95` 且无 HIGH+ → 仍然继续 LLM 审查（seal 不覆盖业务逻辑/PRD 合规）

**自动修复**：

如果 seal 报告中只有 `unused-import` 类 LOW 问题，通过 Skill 工具触发：

```
Skill: seal-code-review
Args: scan ./src --sla L1 --fix
```

> 仅清理 unused import，其余问题不自动修。修复后 git diff 给用户看一眼。
> 不要直接调用 seal-review.js 的绝对路径——seal-code-review skill 已在 user/global 层注册，统一通过 Skill 工具触发。

---

### Step 2：并行审查（3 路并行 Agent）

把 Step 1 的 seal 报告作为输入，在同一条消息中并行派发 3 个 Agent：

**Agent 1: code-reviewer（代码质量）**

```
Prompt: 对以下改动进行代码审查，关注 seal-code-review 静态扫描未覆盖的语义问题：
1. 业务逻辑正确性（seal 看不到意图）
2. 设计模式和架构合理性
3. 错误处理是否符合业务语义（不是有 try-catch 就够）
4. 类型设计是否表达业务约束
5. 性能隐患（N+1 查询、不必要的重渲染等 seal 检测不到的）
6. 重复代码 / 可复用性（跨文件层面）

改动范围：git diff <base>...HEAD
静态扫描基线：.loop/review/seal-report.json（机械问题已覆盖，请勿重复发现）
```

**Agent 2: security-reviewer（安全语义）**

```
Prompt: 对以下改动进行安全审查。seal-code-review 已扫过硬编码密钥/危险 API/幻觉包，请聚焦语义层：
1. 认证/授权逻辑缺陷（绕过、越权）
2. SQL/NoSQL 注入风险（即便用了 ORM 也要看拼接）
3. XSS / CSRF / SSRF 业务面风险
4. 输入验证是否覆盖所有边界（不只是有没有验证，而是验证够不够）
5. 敏感数据流（日志、错误消息、URL、缓存）
6. 鉴权 middleware 是否对所有受保护路由生效

改动范围：git diff <base>...HEAD
静态扫描基线：.loop/review/seal-report.json
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

### Step 3：合并审查结果

将 **seal 静态扫描 + 3 路 LLM 审查** 合并为结构化报告，按文件+行号去重（同一行的 seal 和 LLM 发现合并为一条，标注双重来源）：

```markdown
# Code Review Report

> 审查时间：YYYY-MM-DD
> 审查范围：<base>...HEAD (<N> commits, <N> files)
> 关联 PRD：<PRD 标题>
> seal-code-review 评分：<score>/100（阈值 85）

## 审查摘要

| 级别 | 数量 | 已修复 | 待处理 | 来源分布 |
|------|------|--------|--------|---------|
| CRITICAL | <n> | <n> | <n> | seal <a> / agent <b> / 双重 <c> |
| HIGH | <n> | <n> | <n> | seal <a> / agent <b> / 双重 <c> |
| MEDIUM | <n> | <n> | <n> | seal <a> / agent <b> / 双重 <c> |
| LOW | <n> | <n> | <n> | seal <a> / agent <b> / 双重 <c> |

## 静态扫描发现（seal-code-review L3）

- **总分**：<score>/100
- **幻觉包**：<n>（详见下表）
- **硬编码密钥**：<n>
- **危险 API**：<n>
- **报告文件**：`.loop/review/seal-report.json`（SARIF 可选 `.loop/review/seal.sarif`）

### 幻觉/未声明依赖（如有）

| 包名 | 出现文件 | 注册表查询结果 | 建议 |
|------|---------|--------------|------|
| `foo-bar` | src/app/x.ts:3 | 不存在于 npm | 检查是否拼写错误或漏装 |

## CRITICAL Issues

### CRIT-001: <问题标题>
- **文件**：`<file:line>`
- **类别**：安全 / 逻辑 / 数据
- **描述**：<问题描述>
- **建议**：<修复方案>
- **来源**：seal:<rule-id> / security-reviewer / code-reviewer / 双重

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

### Step 4：处理 CRITICAL/HIGH Issues

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

### Step 5：展示结果 + 确认

向用户展示审查概要：

```
🔍 代码审查完成
──────────────────────────────
seal 评分：<score>/100  (阈值 85，<PASS|FAIL>)
发现问题：CRITICAL <n> | HIGH <n> | MEDIUM <n> | LOW <n>
  ├─ 静态扫描发现：<n>（含幻觉包 <n>）
  ├─ LLM 审查发现：<n>
  └─ 双重命中（高置信度）：<n>
PRD 合规：<已实现 N/M 条验收标准>
PRD 歧义/缺陷：<n> 条（需用户确认是否修订 PRD）
已修复：<n> 个问题
待处理：<n> 个问题

报告位置：
  - .loop/review/findings.md       （合并报告）
  - .loop/review/seal-report.json  （静态扫描详细 JSON）
  - .loop/review/seal.sarif        （CI 可选）
```

用 `AskUserQuestion` 询问：
- **确认完成**：审查结束，把结果带回主流程
- **修复后重审**：修复完所有问题后再审查一次
- **查看详情**：展示具体 findings

---

### Step 6：更新 session.json

dev-review 是**独立 skill**，不接管 `/dev-loop` 的阶段流转。只在 `lastReview` 字段记录本次审查结果，**不覆写** `currentPhase`：

```json
{
  "lastReview": {
    "completedAt": "<ISO timestamp>",
    "findings": ".loop/review/findings.md",
    "summary": { "critical": <n>, "high": <n>, "medium": <n>, "low": <n> },
    "sealReport": {
      "path": ".loop/review/seal-report.json",
      "sarif": ".loop/review/seal.sarif",
      "score": <0-100>,
      "threshold": 85,
      "passed": <boolean>,
      "hallucinatedPackages": [<list>]
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
}
```

> `prdRevisions[].status` 取值：
> - `pending_user_decision`：已发现，等待用户决定是否修订
> - `revised`：用户确认修订，PRD + api-contracts.json 已更新
> - `accepted_as_is`：用户确认当前实现正确，PRD 无需修改
>
> **不要**写入 `currentPhase: "test"` 或类似字段 — `/dev-loop` 当前只编排 proto/dev/deploy 三个阶段，dev-review 是补充审查工具。

---

## 审查检查清单

> 标 🛠 的项 seal-code-review L3 已自动覆盖，agent 不必重复发现；标 🧠 的项需要 LLM 语义判断。

### 代码质量
- [ ] 🛠 没有 `unused-import` / 死代码
- [ ] 🛠 没有空 catch 块
- [ ] 🛠 没有 `async` 函数不带 `await`
- [ ] 🛠 没有深嵌套（> 4 层）
- [ ] 🛠 没有超长函数（> 60 行）
- [ ] 🛠 没有 floating promise
- [ ] 🧠 函数不超过 50 行（业务复杂度判断，与 seal 60 行阈值并存）
- [ ] 🧠 文件不超过 800 行
- [ ] 🧠 命名清晰、一致
- [ ] 🛠 没有 `any` / `as any`（TypeScript 项目）
- [ ] 🧠 没有 `@ts-ignore` / `@ts-nocheck`
- [ ] 🛠 没有 `console.log`（用 logger 替代）

### 错误处理
- [ ] 🧠 API 路由有 try-catch（且非空 catch — 空 catch 由 seal 兜底）
- [ ] 🧠 用户输入有校验
- [ ] 🧠 错误消息不泄露内部细节
- [ ] 🧠 前端有 Error Boundary

### 安全
- [ ] 🛠 没有硬编码密钥（seal L1 regex 检测）
- [ ] 🛠 没有幻觉/未声明的依赖包（seal L2 注册表查询）
- [ ] 🛠 没有 `eval()` / `new Function()` / `pickle.load` 等危险 API
- [ ] 🧠 SQL 使用参数化查询（语义层，光看是否拼接不够）
- [ ] 🧠 用户输入有 XSS 防护
- [ ] 🧠 API 端点有认证/授权检查
- [ ] 🧠 敏感数据不在 URL/日志中暴露

### PRD 合规
- [ ] 🧠 每条 P0 验收标准都有对应实现
- [ ] 🧠 API 路由与 PRD 契约一致
- [ ] 🧠 组件结构与 PRD UI 规格一致

---

## 红线（不可违反）

1. **CRITICAL 问题不能跳过** — 必须修复或明确标记为用户接受
2. **必须先跑 seal-code-review L3 再派 agent** — 静态扫描提供事实基线，避免 LLM 在已知机械问题上浪费 token 或产生重复发现
3. **审查必须并行派发** — code-reviewer + security-reviewer + PRD 合规检查三路并行（在 seal 之后）
4. **审查结果必须写入 `.loop/review/findings.md`，seal 原始报告必须保留 `.loop/review/seal-report.json`**
5. **幻觉包视同 CRITICAL** — seal L2 报告的不存在 / 未声明依赖必须修复，AI 生成代码最常见的偷渡向量
6. **不跳过 PRD 合规检查** — 每条验收标准都要对照
7. **修复后必须重新验证** — 自动修复（包括 `seal --fix`）后要重跑 seal 确认 score 上升
8. **PRD 歧义/缺陷必须记录在 findings.md** — 不默默忽略，写入 PRD 歧义表并同步 session.json `prdRevisions[]`
9. **读取 API 契约优先使用 `.loop/api-contracts.json`** — 字段以 JSON 为准，PRD Markdown 为降级路径

---

## 特殊情况处理

| 情况 | 处理方式 |
|------|---------|
| 没有 base branch | 对比最近 N 个 commit，告知用户 |
| PRD 不存在 | 跳过 PRD 合规检查，只做 seal 扫描 + 代码质量 + 安全审查 |
| 改动很小（< 3 个文件） | 仍跑 seal（很快），但跳过 LLM agent，直接自检 + seal 结果 |
| 改动很大（> 30 个文件） | seal 扫整个 `src/`；建议 agent 分批审查，按模块分组 |
| 已有 PR 且被 review 过 | 只对增量改动跑 seal（`--lang` 收窄），agent 也只看增量 |
| `seal score < 60` 且含 CRITICAL | 先修 seal CRITICAL，修完重跑 seal 再派 agent，避免 LLM 噪音 |
| seal 报告全部 PASS | 仍要继续 agent 审查——seal 不覆盖业务逻辑和 PRD 合规 |
| CI 场景 | 用 `--format sarif --output report.sarif --threshold 85`，把退出码作为 gate |
| seal-code-review 未安装 | 提示用户安装该 skill；不要 silent skip——这是红线 #2 的依赖 |
