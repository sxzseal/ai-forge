# ai-forge

AI 驱动的全流程开发框架。从需求到部署，一条命令走完。

## 项目定位

ai-forge 是一个**可复用的脚手架框架**，提供：
1. **Dev Loop Skills** — 6 个 Claude Code skills；`/dev-loop` 默认管线串联其中 3 个（原型 → 开发 → 部署），另外 3 个（PRD、审查、测试）作为独立增强 skill 按需调用
2. **项目模板** — Next.js + shadcn/ui + Storybook + MSW + Vitest + Playwright
3. **脚手架脚本** — 一条命令生成新项目

## 默认管线（3 阶段）

```
Phase 1: 原型 (dev-proto)   含 visual feedback 标注迭代循环
Phase 2: 开发 (dev-dev)     lobster-lead 模式 + checkpoint 自检
Phase 3: 部署 (dev-deploy)  Vercel + Railway
```

**独立 skill**（按需手动调用，不在默认管线中）：

- `/dev-prd` — 复杂需求需要结构化 PRD 文档时
- `/dev-review` — 深度代码审查（安全 / 性能 / PRD 合规）
- `/dev-test` — 完整测试套件 + 覆盖率报告

## 技术栈

- **框架**：Next.js 15 (App Router)
- **UI**：shadcn/ui + Tailwind CSS
- **原型**：Storybook 10 (`@storybook/nextjs-vite`) + MSW 2
- **测试**：Vitest + Playwright
- **部署**：Vercel + Railway
- **AI 编排**：Claude Code Skills + Commands

## 目录结构

```
.claude/          → Dev Loop skills（开发 ai-forge 时使用）
template/         → 项目模板（生成新项目时复制）
scripts/          → 脚手架脚本
```

## 开发约定

- Skills 用中文编写，frontmatter 包含触发词
- 每个 skill 遵循结构：Step 0 准备 → Step 1-N 执行 → 红线 → 特殊情况
- 状态通过 `.loop/` 目录在 phase 间传递；`session.json.currentPhase` 只由 dev-proto/dev-dev/dev-deploy 写入
- 独立 skill（dev-prd/dev-review/dev-test）只写自己的 `last<Skill>` 字段，不覆写 `currentPhase`
- 模板中 `_` 前缀目录在安装时重命名为 `.`（`_claude` → `.claude`，`_storybook` → `.storybook`）
- API 契约统一遵循 `template/api-contracts.schema.json`；响应信封统一 `{status_code, data, message?}`

## 测试

```bash
./scripts/create.sh test-project /tmp/
# 验证生成的项目结构正确
```
