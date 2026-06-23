---
name: dev-deploy
description: 管理 Vercel (前端) + Railway (后端) 部署，支持 preview / staging / production 环境。触发词："部署"、"发布"、"dev-deploy"、"上线"、"部署上线"。
---

# Dev Deploy — 部署管理器

## 何时启用

用户说出以下任意表达时立即激活：

- 「部署」「发布」「上线」「部署上线」
- 「dev-deploy」
- 被 `/dev-loop` 作为 Phase 6 调用

**前置条件**：

- 代码已编译通过
- 测试已通过（建议，非强制）
- CLI 工具已安装（vercel, railway）

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

**检查测试状态**：

```bash
# 如果有测试
cat .loop/test/coverage-report.md 2>/dev/null | head -20
```

如果测试报告存在且有失败测试，警告用户。

**检查代码审查状态**：

```bash
# 如果有审查报告
cat .loop/review/findings.md 2>/dev/null | grep "CRITICAL"
```

如果有未解决的 CRITICAL issue，警告用户。

**检查 API 契约一致性**：

```bash
# 检查 API 契约 JSON 是否存在
cat .loop/api-contracts.json 2>/dev/null | head -5 || echo "NO_API_CONTRACTS_JSON"

# 检查 PRD 修订状态
cat .loop/session.json 2>/dev/null | grep -A 5 '"prdRevisions"'
```

如果 `.loop/api-contracts.json` 不存在但 PRD 包含 API 契约，警告用户 API 契约未机器化，可能导致前后端不一致。

如果 `session.json` 中有 `prdRevisions[]` 且存在 `status: "pending_user_decision"` 的条目，**阻止 Production 部署**，提示用户先处理 PRD 歧义：

```
⚠️ 存在未处理的 PRD 歧义/缺陷（N 条）
   在部署到生产前，请先确认：
   - 回到 dev-prd 修订 PRD + api-contracts.json
   - 或在 findings.md 中标记为"已接受，无需修改"
```

**检查 P0 功能覆盖率**（如有测试报告）：

```bash
# 检查 P0 覆盖率
cat .loop/test/coverage-report.md 2>/dev/null | grep "P0 覆盖率"
```

如果 P0 覆盖率 < 100%，Production 部署前需用户明确确认接受。

**检查 CLI 工具**：

```bash
which vercel 2>/dev/null || echo "VERCEL_NOT_INSTALLED"
which railway 2>/dev/null || echo "RAILWAY_NOT_INSTALLED"
```

如果 CLI 未安装，提示用户安装：

```bash
npm install -g vercel
npm install -g @railway/cli
```

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

### Step 2：部署前端（Vercel）

**Preview 部署**：

```bash
# 在当前分支部署预览
vercel
```

Vercel 会自动生成 preview URL。

**Production 部署**：

```bash
# 部署到生产
vercel --prod
```

**部署后检查**：

```bash
# 获取部署 URL
vercel ls --limit 1
```

验证前端是否可访问：

```bash
# 健康检查
curl -s -o /dev/null -w "%{http_code}" <VERCEL_URL>
```

期望返回 `200`。

---

### Step 3：部署后端（Railway）

**检查 Railway 配置**：

```bash
# 检查是否已连接项目
railway status
```

如果未连接：

```bash
railway login
railway init
```

**部署**：

```bash
# 推送到 Railway
railway up
```

**数据库迁移**（如果有）：

```bash
# 运行 Prisma migration
railway run npx prisma migrate deploy
```

**健康检查**：

```bash
# 检查 API 健康
RAILWAY_URL=$(railway domain)
curl -s -o /dev/null -w "%{http_code}" "https://${RAILWAY_URL}/api/health"
```

期望返回 `200`。

---

### Step 4：验证部署

**完整健康检查清单**：

| 检查项 | 方法 | 期望 |
|--------|------|------|
| 前端可访问 | `curl <VERCEL_URL>` | HTTP 200 |
| 后端 API 健康 | `curl <RAILWAY_URL>/api/health` | HTTP 200 |
| 前后端连通 | 前端调用后端 API | 正常响应 |
| 数据库连接 | API 查询数据库 | 正常返回 |

**如果健康检查失败**：

1. 检查 Vercel/Railway 日志
2. 检查环境变量是否配置
3. 检查数据库连接字符串
4. 回滚部署（如需要）

---

### Step 5：输出部署报告

写入 `.loop/deploy/checklist.md`：

```markdown
# 部署报告

> 部署时间：YYYY-MM-DD HH:MM
> 环境：Production
> Loop ID：loop-YYYYMMDD-NNN

## 部署信息

| 服务 | 平台 | URL | 状态 |
|------|------|-----|------|
| 前端 | Vercel | https://xxx.vercel.app | ✅ 正常 |
| 后端 | Railway | https://xxx.up.railway.app | ✅ 正常 |

## 健康检查

| 检查项 | 结果 | 响应时间 |
|--------|------|---------|
| 前端首页 | ✅ 200 | 230ms |
| API /api/health | ✅ 200 | 150ms |
| 前后端连通 | ✅ 正常 | — |
| 数据库连接 | ✅ 正常 | — |

## 部署记录

| 版本 | 时间 | 操作人 | 备注 |
|------|------|--------|------|
| v1.0.0 | YYYY-MM-DD HH:MM | <user> | 首次部署 |

## 环境变量

| 变量 | 前端 | 后端 | 状态 |
|------|------|------|------|
| DATABASE_URL | — | ✅ 已配置 | — |
| NEXT_PUBLIC_API_URL | ✅ 已配置 | — | — |
```

---

### Step 6：更新 session.json

```json
{
  "currentPhase": "done",
  "phases": {
    "deploy": { "status": "completed", "completedAt": "<ISO timestamp>" }
  },
  "artifacts": {
    "deployReport": ".loop/deploy/checklist.md"
  }
}
```

---

### Step 7：Loop 完成

向用户展示最终报告：

```
🚀 部署完成！
──────────────────────────────
前端：https://xxx.vercel.app ✅
后端：https://xxx.up.railway.app ✅

本次 Loop 总结：
  Phase 1: PRD — <N> 个用户故事
  Phase 2: 原型 — <N> 个 Stories
  Phase 3: 开发 — <N> 次 commit
  Phase 4: 审查 — CRITICAL 0, HIGH 0
  Phase 5: 测试 — 通过率 100%, 覆盖率 <N>%
  Phase 6: 部署 — 健康检查通过

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
