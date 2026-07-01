---
name: dev-deploy
description: 通过 .claude/enhancers/deploy/*.md 里挂载的 provider 调度部署（默认含 Vercel + Railway，可增删）。支持 preview / staging / production 环境，production 附带生产闸门（review 时效、CRITICAL findings、验收覆盖）。触发词："部署"、"发布"、"dev-deploy"、"上线"、"部署上线"。
---

# Dev Deploy — 部署管理器

## 何时启用

用户说出以下任意表达时立即激活：

- 「部署」「发布」「上线」「部署上线」
- 「dev-deploy」
- 被 `/dev-loop` 作为 Phase 3 调用

**前置条件**：

- 代码已编译通过（`npm run build` / `tsc --noEmit` 通过）
- `.claude/enhancers/deploy/` 至少存在一个 provider enhancer（模板默认自带 `vercel.md` + `railway.md`）；对应 provider 的 CLI 已安装（如 vercel、railway）

**不启用**：

- 没有可部署的代码
- 用户只是想讨论部署方案

---

## 完整执行流程

### Step 0：Pre-flight 检查

**检查代码状态**：

```bash
# 是否有未提交的改动
git status --porcelain

# 当前分支
git branch --show-current
```

如果有未提交改动，提醒用户先提交。

**构建检查**（强制）：

```bash
# 类型检查
npx tsc --noEmit

# 构建
npm run build
```

构建失败则**阻止部署**，提示用户修复。

**验收覆盖检查**（来自 dev-dev 阶段，软门控）：

```bash
cat .loop/dev/acceptance-coverage.md 2>/dev/null
```

若存在未实现的 AC 项，警告用户但不阻止 Preview/Staging；**Production 部署需用户明确确认接受未覆盖项**。

**可选检查**（用户手动跑了独立 review/test 时才生效）：

```bash
# session.json.lastReview / lastTest 时间戳（用 node argv 一行搞定，避免 stdin 拼接的字符转义地雷）
SESSION_JSON=$(node scripts/lib/forge-state.mjs read .loop/session.json 2>/dev/null || echo '{}')
LAST_REVIEW=$(node -e "try{process.stdout.write((JSON.parse(process.argv[1]).lastReview)||'')}catch{}" "$SESSION_JSON")
LAST_TEST=$(node -e "try{process.stdout.write((JSON.parse(process.argv[1]).lastTest)||'')}catch{}" "$SESSION_JSON")

# checkpoint findings（来自 dev-dev Step 3）+ 深度 review findings
grep -E "CRITICAL|HIGH" .loop/dev/checkpoint-findings.md 2>/dev/null
grep -E "CRITICAL|HIGH" .loop/review/findings.md 2>/dev/null
```

**Production 生产闸门**（**硬阻塞**，其他环境仅警告）：

1. **Review 时效**：`lastReview` 缺失 或 距今 > 7 天 → 阻塞。提示用户「production 部署要求过去 7 天内有一次 `/dev-review`」
2. **未解决 CRITICAL/HIGH findings**：在 `.loop/dev/checkpoint-findings.md` 或 `.loop/review/findings.md` 中 grep 到未标记为 `resolved` 的 CRITICAL/HIGH 条目 → 阻塞
3. **验收覆盖**：`.loop/dev/acceptance-coverage.md` 中存在未实现的 P0 AC（AC-001 ~ AC-099）→ 阻塞
4. **Test 覆盖**：`lastTest` 缺失 或距今 > 14 天 → 警告（不阻塞，但写入 checklist.md）

Preview / Staging 环境：以上四项全部降为警告，写入 `.loop/deploy/checklist.md` 但不阻塞。

**检查 API 契约一致性**：

```bash
# 检查 API 契约 JSON 是否存在
cat .loop/api-contracts.json 2>/dev/null | head -5 || echo "NO_API_CONTRACTS_JSON"
```

如果 `.loop/api-contracts.json` 不存在，警告用户契约未机器化，可能导致前后端不一致。

**检查 CLI 工具**（按 Step 0 选中的 provider 动态检查）：

对每个启用的 provider，检查其 CLI：

```bash
# 举例：常见 provider 的 CLI 检查（实际按 Step 0 selected 数组动态执行）
which vercel   2>/dev/null || echo "VERCEL_NOT_INSTALLED"
which railway  2>/dev/null || echo "RAILWAY_NOT_INSTALLED"
which wrangler 2>/dev/null || echo "WRANGLER_NOT_INSTALLED"  # 如启用 cloudflare
```

如果 CLI 未安装，从对应 enhancer 的顶部指引安装（常见的）：

```bash
npm install -g vercel
npm install -g @railway/cli
npm install -g wrangler
```

**加载 provider 与增强能力包**（两段式，deploy 阶段 provider 也是 enhancer）：

```bash
# 1. 扫描本阶段所有 enhancer 的 frontmatter
node scripts/lib/enhancers.mjs list deploy

# 2. 基于项目形态自动派生关键词：
#    - 存在 src/app/api/ 或 prisma/ → 加 backend,api,database,prisma
#    - 存在 Next.js 页面路由 → 加 frontend,nextjs
#    - 用户显式指定 provider（如 "部署到 cloudflare"）→ 加对应关键词
node scripts/lib/enhancers.mjs select deploy --keywords "<派生的关键词>"
```

处理规则：

- 返回的 `selected` 数组即启用清单；对每份逐一 `Read` 全文，把其中的**命令块**当作 Step 2/3 的实际执行内容（本 skill 不再硬编码 vercel/railway 命令）
- 用 `AskUserQuestion` 展示 `selected` / `skipped`，让用户确认或手动增删（如强制启用 railway 用于非典型后端）
- Step 0 pre-flight 检查按 enhancer 「必须遵守」段补充（如 vercel 要求 `vercel whoami`）
- Step 2/3 按 enhancer 「命令块」执行部署
- Step 4 健康检查合并 enhancer 里的检查清单
- 多个 enhancer 冲突按 frontmatter `priority` 排序：`high` > `medium` > `low`；同优先级按文件名字典序
- enhancer 与本 skill 红线冲突时（如「Production 部署必须用户确认」），**红线胜**

用户确认后落盘 manifest：

```bash
node scripts/lib/enhancers.mjs manifest --phase deploy \
  --selected "<vercel,railway,...>" --skipped "<cloudflare>"
```

Step 6 完成时把 `selected` 数组通过 `forge-state` 写入 `session.json.phases.deploy.enhancers`：

```bash
echo '{"phases":{"deploy":{"enhancers":["<name1>","<name2>"]}}}' \
  | node scripts/lib/forge-state.mjs update .loop/session.json --schema session
```

若 `list` 输出为空数组 → 报错并阻止部署（没有 provider 就没有部署命令，不允许硬编码回退）。

---

### Step 0.5：Harness 协议启动

```bash
node scripts/lib/forge-events.mjs append --kind phase.enter --phase deploy --step step.0
node scripts/lib/forge-budget.mjs check deploy   # 默认 30 steps / 5 subagents
```

后续每个 Step 和 provider 命令执行都要写 event（`step.enter/exit` / `tool.call/result`）。

---

### Step 1：选择部署环境

用 `AskUserQuestion` 询问部署环境：

选项：

| 环境 | 触发条件 | 说明 |
|------|---------|------|
| **Preview** | 开发中预览 | 自动生成预览 URL，不推送到生产 |
| **Staging** | 合并到 main 前 | 预发布环境验证 |
| **Production** | 正式发布 | 推送到生产环境，需要用户确认 |

**环境说明**：

```
🚀 部署环境选择
──────────────────────────────
Preview    → 分支预览，不影响线上
Staging    → 预发布验证（需要 main 分支）
Production → 正式发布到用户
```

> Production 部署需要二次确认。

---

### Step 2：调度 provider 部署

本 skill **不再硬编码 vercel / railway 命令**。所有部署命令来自 Step 0 选中的 enhancer，按 `priority` 顺序（`high > medium > low`，同优先级按名称字典序）执行。

**执行流程**：

对 `session.json.phases.deploy.enhancers` 数组里的每个 provider（如 `["vercel", "railway"]`）：

1. `Read .claude/enhancers/deploy/<name>.md`
2. 从「命令块」段抽取本次环境（Preview/Staging/Production）的命令块
3. 依次执行；抓取 stdout 中的部署 URL / service name
4. 执行 enhancer 的「健康检查」段的每一条 curl / status 命令
5. 结果写入 `.loop/deploy/checklist.md`（表格形式，Step 5 汇总）

**Provider 命令示例**（内容不在本 skill 里，参见 [enhancers/deploy/vercel.md](../../enhancers/deploy/vercel.md) 和 [enhancers/deploy/railway.md](../../enhancers/deploy/railway.md)）：

```bash
# vercel enhancer 提供的命令块（示意，实际以 enhancer 内容为准）
vercel               # preview
vercel --target=staging  # staging
vercel --prod        # production
```

**扩展方式**：想加 Cloudflare / AWS / 自托管等 provider，只需在 `.claude/enhancers/deploy/` 新增一份 markdown（frontmatter 里 `appliesTo` 列关键词），无需改本 skill。删除 provider enhancer 就等于不部署该层。

---

### Step 3：执行部署（按 provider 顺序）

按 Step 2 的调度流程实际执行部署。所有 provider 命令必须**串行执行**（不并行），因为后端部署完成前不应部署前端（前端会指向新后端 URL）。

**执行规约**：

- 前端 provider（如 vercel）在**后端 provider（如 railway）完成后**再跑
- 每一步失败 → 立即停止，写 `.loop/deploy/checklist.md` 标注失败步骤，不继续下一 provider
- production 模式下任一 provider 部署失败 → 引导用户回滚，不静默放过

---

### Step 4：验证部署

**健康检查清单**由 Step 0 选中的 provider enhancer 各自的「健康检查」段合并组成，本 skill 不再假设前后端二元结构。

对每个已部署的 provider：

1. 读取 enhancer 中的健康检查表
2. 逐项执行（curl / status 命令）
3. 结果记入 `.loop/deploy/checklist.md`

**如果健康检查失败**：

1. 检查该 provider 的部署日志（`vercel inspect` / `railway logs` 等，具体命令看 enhancer）
2. 检查环境变量
3. Production 环境：立即引导用户回滚（`vercel rollback` / `railway rollback` — 看 enhancer 支持）
4. Preview / Staging：警告但不强制回滚

---

### Step 4.5：Acceptance Smoke Test

基于 `.loop/acceptance-checklist.md` 里的 P0 验收项（`AC-001 ~ AC-099` 页面交互 + `AC-101 ~ AC-199` API 契约），对已部署 URL 跑 Playwright 冒烟。

**前置**：项目里 `tests/smoke/` 目录存在（模板自带，见 `template/tests/smoke/smoke.sample.spec.ts`）。若不存在跳过并写 warn event。

```bash
# 1. 解析 P0 AC
node scripts/lib/forge-state.mjs read .loop/api-contracts.json > /tmp/contracts.json

# 2. 生成 / 更新 smoke spec（如果模板自带的 sample spec 是模板占位符，需替换 baseURL）
export SMOKE_BASE_URL="<部署得到的主 URL>"

# 3. 执行冒烟（用 smoke 专属 config，stdout 只留 JSON；stderr 单独保存供排查）
export SMOKE_OUT_FILE=".loop/deploy/smoke-report.json"
mkdir -p .loop/deploy
npx playwright test \
  --config=tests/smoke/playwright.smoke.config.ts \
  > .loop/deploy/smoke-stdout.log 2> .loop/deploy/smoke-stderr.log

# 4. 汇总结果到 .loop/deploy/smoke-result.json（读 outputFile 里的 JSON，不做行扫描）
node -e '
  const fs = require("fs");
  const path = require("path");
  const reportPath = path.resolve("tests/smoke/smoke-report.json"); // playwright.smoke.config.ts 的 outputFile
  let json = null;
  try { json = JSON.parse(fs.readFileSync(reportPath, "utf8")); } catch {}
  const stats = (json && json.stats) || {};
  const passed = stats.expected || 0;
  const failed = stats.unexpected || 0;
  const flaky = stats.flaky || 0;
  const total = passed + failed;
  const out = {
    deployedAt: new Date().toISOString(),
    target: process.env.SMOKE_BASE_URL,
    reportPath: json ? reportPath : null,
    totalAC: total,
    passed, failed, flaky,
    failedAC: [],
    details: (json && json.suites) || [],
  };
  fs.mkdirSync(".loop/deploy", {recursive: true});
  fs.writeFileSync(".loop/deploy/smoke-result.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify({passed, failed, flaky, total}));
'

# 5. 写 event
node scripts/lib/forge-events.mjs append --kind tool.result --phase deploy \
  --payload "$(cat .loop/deploy/smoke-result.json | jq '{smoke: {passed, failed, total: .totalAC}}')"
```

**Production 门控**：`smoke-result.json.failed > 0` 时 Production 部署必须 `AskUserQuestion` 二次确认（选项：「回滚」/「保留部署但记录失败」/「跳过冒烟」）。Preview/Staging 只警告。

若项目没有 Playwright / smoke 目录：写 `{"skipped": true, "reason": "no smoke tests"}` 到 smoke-result.json，跳过门控。

---

### Step 5：输出部署报告

写入 `.loop/deploy/checklist.md`：

```markdown
# 部署报告

> 部署时间：YYYY-MM-DD HH:MM
> 环境：Production
> Loop ID：loop-YYYYMMDD-NNN
> 启用 provider：<vercel>, <railway>, ...

## 部署信息

按启用 provider 各一行（不预设前端 / 后端语义）：

| Provider | Service | URL / Endpoint | 状态 |
|----------|---------|----------------|------|
| vercel | frontend | https://xxx.vercel.app | ✅ 正常 |
| railway | api | https://xxx.up.railway.app | ✅ 正常 |

## 健康检查

由启用 provider 的「健康检查」段汇总而来：

| Provider | 检查项 | 结果 | 响应时间 |
|----------|-------|------|---------|
| vercel | / | ✅ 200 | 230ms |
| vercel | /api/health | ✅ 200 | 150ms |
| railway | /api/health | ✅ 200 | 180ms |

## 生产闸门（仅 production 环境）

| 闸门项 | 结果 |
|-------|------|
| lastReview 距今 | X 天（阈值 7 天）✅/❌ |
| 未解决 CRITICAL/HIGH findings | N 条 ✅/❌ |
| P0 AC 覆盖 | n/m ✅/❌ |
| lastTest 距今 | X 天（阈值 14 天，仅警告）|

## 部署记录

| 版本 | 时间 | 操作人 | 备注 |
|------|------|--------|------|
| v1.0.0 | YYYY-MM-DD HH:MM | <user> | 首次部署 |
```

---

### Step 6：更新 session.json（通过 forge-state）

```bash
cat <<'EOF' | node scripts/lib/forge-state.mjs update .loop/session.json --schema session
{
  "currentPhase": "done",
  "phases": {
    "deploy": {
      "status": "completed",
      "completedAt": "<ISO now>",
      "environment": "production",
      "enhancers": ["vercel", "railway"]
    }
  },
  "artifacts": {
    "deployReport": ".loop/deploy/checklist.md"
  }
}
EOF
```

> Schema 校验会拒绝无效 `currentPhase` / `environment` / `status` 值。CLI 用 read-modify-write + atomic rename，其他 phase 的字段不会被覆盖。
>
> `phases.deploy.enhancers` 记录本轮启用的 provider `name` 列表，与 `.loop/deploy/enhancers-manifest.md` 一致。

---

### Step 7：Loop 完成

**先聚合 metrics 和写 phase.exit event**：

```bash
# 1. deploy phase metrics
node scripts/lib/forge-metrics.mjs compute --phase deploy

# 2. loop 级 rollup（合并 3 phase 指标 → .loop/loop-summary.json）
node scripts/lib/forge-metrics.mjs rollup

# 3. 写 phase.exit
node scripts/lib/forge-events.mjs append --kind phase.exit --phase deploy

# 4. 把 metricsPath + loopSummary 写回 session.json
echo '{"phases":{"deploy":{"metricsPath":".loop/phases/deploy/metrics.json"}},"artifacts":{"loopSummary":".loop/loop-summary.json"}}' \
  | node scripts/lib/forge-state.mjs update .loop/session.json --schema session
```

向用户展示最终报告（数据来自 `.loop/loop-summary.json`）：

```
🚀 部署完成！
──────────────────────────────
前端：https://xxx.vercel.app ✅
后端：https://xxx.up.railway.app ✅

本次 Loop 总结：
  Phase 1: 原型 — <N> 个 Stories，<N> 轮标注迭代
  Phase 2: 开发 — <N> 次 commit，验收清单覆盖 <n>/<m>
  Phase 3: 部署 — 健康检查通过

  附加（如手动跑过）：
    dev-review：CRITICAL <n>, HIGH <n>
    dev-test：通过率 <N>%，P0 覆盖率 <N>%

报告：.loop/deploy/checklist.md
```

用 `AskUserQuestion` 询问：
- **归档 Loop**：将 `.loop/` 归档到 `.loop/archive/YYYY-MM-DD-<feature>/`
- **开始新 Loop**：清除当前 `.loop/` 状态，开始新的开发循环
- **先不归档**：保留当前状态

---

## 回滚方案

如果部署后发现问题：

**Vercel 回滚**：

```bash
# 查看部署历史
vercel ls

# 回滚到上一个部署
vercel rollback <project> production
```

**Railway 回滚**：

```bash
# 查看部署历史
railway deployment list

# Railway 通过 Dashboard 回滚
# 或重新部署上一个版本
railway up --deployment <previous-deployment-id>
```

---

## 红线（不可违反）

1. **Production 部署必须用户确认** — 不自动推送生产
2. **Pre-flight 检查不能跳过** — 有 CRITICAL issue 不部署
3. **健康检查必须执行** — 部署后必须验证
4. **部署报告写入 `.loop/deploy/`** — 保留部署历史
5. **涉及生产环境操作必须二次确认** — 数据库迁移、回滚等
6. **不在部署过程中修改代码** — 只部署，不修 bug
7. **未处理 PRD 歧义（prdRevisions 有 pending 条目）时阻止 Production 部署** — 先让用户决定是否修订 PRD
8. **P0 功能覆盖率 < 100% 时 Production 部署需用户明确确认** — 展示缺失的 AC 列表
9. **`.loop/api-contracts.json` 不存在时警告用户** — API 契约未机器化，前后端可能不一致
10. **必须加载并遵守 `.claude/enhancers/deploy/*.md`** — Step 0 扫描的所有增强 skill（`_` 开头的占位除外）都要 Read 进上下文，pre-flight 和健康检查必须并入 enhancer 列出的项，冲突按 `priority` 排序

---

## 特殊情况处理

| 情况 | 处理方式 |
|------|---------|
| Vercel CLI 未登录 | 提示 `vercel login`，不自动执行 |
| Railway CLI 未登录 | 提示 `railway login`，不自动执行 |
| 测试有失败 | 警告用户，询问是否继续部署 |
| CRITICAL 审查未解决 | 阻止部署，建议先修复 |
| 环境变量未配置 | 提醒用户配置后再部署 |
| 数据库迁移失败 | 停止部署，不继续，让用户处理 |
| 健康检查失败 | 不报告成功，提供日志链接 |
| 只部署前端/后端 | 询问用户，允许单独部署 |
