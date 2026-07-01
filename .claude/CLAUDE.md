# ai-forge

AI 驱动的全流程开发框架。从需求到部署，一条命令走完。

## 项目定位

ai-forge 是一个**可复用的脚手架框架**，提供：
1. **Dev Loop Skills** — 6 个 Claude Code skills；`/dev-loop` 默认管线串联其中 3 个（原型 → 开发 → 部署），另外 3 个（PRD、审查、测试）作为独立增强 skill 按需调用
2. **Slash Commands** — `/dev-loop` 全流程 + `/dev-proto` / `/dev-dev` / `/dev-deploy` 单阶段，跨 session 接力
3. **项目模板** — Next.js + shadcn/ui + Storybook + MSW + Vitest + Playwright
4. **脚手架脚本** — 一条命令生成新项目

## 默认管线（3 阶段）

```
Phase 1: 原型 (dev-proto)   含 visual feedback 标注迭代循环
Phase 2: 开发 (dev-dev)     拆解 → 并行 → checkpoint 自检
Phase 3: 部署 (dev-deploy)  通过 enhancers/deploy/* 调度 provider（默认 Vercel + Railway）
```

**两种入口方式**：

- `/dev-loop <需求>` — 一口气串联三阶段（带 phase 间用户确认）
- `/dev-proto` / `/dev-dev` / `/dev-deploy` — 单独运行某一阶段，支持跨 session 接力。状态通过 `.loop/` 持久化，详见 [PHASE_CONTRACT.md](./PHASE_CONTRACT.md)

**独立增强 skill**（按需手动调用，不在默认管线中）：

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
  ├── skills/        6 个 dev-* skill
  ├── commands/      slash command 入口
  ├── enhancers/     ★ 阶段增强能力包（proto/dev/deploy 三个子目录）
  ├── schemas/       JSON Schemas（session / api-contracts / task-state）
  └── PHASE_CONTRACT.md
scripts/          → 框架脚本
  ├── create.sh      脚手架
  ├── upgrade.sh     升级现有项目的框架资产
  └── lib/           forge-state CLI + enhancers CLI（atomic write + schema 校验）
template/         → 项目模板（生成新项目时复制）
```

## 增强 skill 机制

三个主 phase skill 在 Step 0 通过 `node scripts/lib/enhancers.mjs list <phase>` 仅扫描 `.claude/enhancers/<phase>/*.md` 的 frontmatter（成本低），再根据需求关键词与 `appliesTo` 交集过滤后 Read 选中的几份，作为"领域专家规范"纳入上下文，后续每一步生成产物时遵守。

- **挂载位置**：框架级（维护在 `ai-forge/.claude/enhancers/`），`scripts/create.sh` 复制到每个生成项目
- **加载时机**：每个 phase skill Step 0 末尾，两段式（frontmatter manifest → 选中后 Read 全文）
- **冲突顺序**：frontmatter `priority: high > medium > low`，同优先级按文件名字典序；与 skill 红线冲突时红线胜
- **审计**：完成时启用的 enhancer `name` 列表写入 `session.json.phases.<phase>.enhancers`，同时落盘 `.loop/<phase>/enhancers-manifest.md` 给用户查阅

写作规范见 [enhancers/README.md](./enhancers/README.md)。

## 开发约定

- Skills 用中文编写，frontmatter 包含触发词
- 每个 skill 遵循结构：Step 0 准备 → Step 1-N 执行 → 红线 → 特殊情况
- 状态通过 `.loop/` 目录在 phase 间传递；`session.json.currentPhase` 只由 dev-proto/dev-dev/dev-deploy 写入
- 独立 skill（dev-prd/dev-review/dev-test）只写自己的 `last<Skill>` 字段，不覆写 `currentPhase`
- 所有 `.loop/*.json` 写入必须经过 `node scripts/lib/forge-state.mjs`（atomic write + schema 校验），禁止直接 Write
- 模板中 `_` 前缀目录在安装时重命名为 `.`（`_claude` → `.claude`，`_storybook` → `.storybook`）
- API 契约统一遵循 `.claude/schemas/api-contracts.schema.json`；响应信封统一 `{status_code, data, message?}`
- 增强能力包放在 `.claude/enhancers/<phase>/`，主 skill 两段式加载；写作规范见 [enhancers/README.md](./enhancers/README.md)

## 测试

```bash
./scripts/create.sh test-project /tmp/
# 验证生成的项目结构正确
```
