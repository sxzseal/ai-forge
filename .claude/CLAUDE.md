# ai-forge

AI 驱动的全流程开发框架。从需求到部署，一条命令走完。

## 项目定位

ai-forge 是一个**可复用的脚手架框架**，提供：
1. **Dev Loop Skills** — 6 个 Claude Code skills，覆盖 PRD → 原型 → 开发 → 审查 → 测试 → 部署
2. **项目模板** — Next.js + shadcn/ui + Storybook + MSW + Vitest + Playwright
3. **脚手架脚本** — 一条命令生成新项目

## 技术栈

- **框架**：Next.js 15 (App Router)
- **UI**：shadcn/ui + Tailwind CSS
- **原型**：Storybook 8 + MSW 2
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
- 每个 skill 遵循 Phase 结构：Step 0 准备 → Step 1-N 执行 → 红线
- 状态通过 `.loop/` 目录在 phase 间传递
- 模板中 `_` 前缀目录在安装时重命名为 `.`

## 测试

```bash
./scripts/create.sh test-project /tmp/
# 验证生成的项目结构正确
```
