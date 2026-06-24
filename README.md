# 🔨 ai-forge

> AI 驱动的全流程开发框架 — 从一句话需求到生产部署，一条命令走完。

```
需求 → [确认] → PRD → [确认] → 原型 → [确认] → 开发 → [确认] → 审查 → [确认] → 测试 → [确认] → 部署
```

**一句话**：把传统开发流程的每一步串联成一条 Dev Loop，AI 编排执行，人类在关键节点确认。

---

## 目录

- [快速开始](#快速开始)
- [Dev Loop 流程](#dev-loop-流程)
- [架构设计](#架构设计)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [组件分层](#组件分层)
- [关键特性](#关键特性)
- [自定义与扩展](#自定义与扩展)
- [常见问题](#常见问题)
- [许可证](#许可证)

---

## 快速开始

### 前置条件

- Node.js 18+ / pnpm 或 npm
- Claude Code（已安装并登录）
- Git

### 三步启动

```bash
# 1. 克隆框架
git clone <your-repo-url> ~/Projects/ai-forge
cd ~/Projects/ai-forge

# 2. 创建新项目（自动安装依赖、初始化 MSW、Git）
./scripts/create.sh my-app ~/Projects

# 3. 进入项目，在 Claude Code 中开始开发
cd ~/Projects/my-app
# 在 Claude Code 中：
# /dev-loop 实现一个用户管理系统，支持 CRUD 和角色权限
```

创建完成后，项目立即可用：

```bash
npm run dev          # 启动开发服务器 → http://localhost:3000
npm run storybook    # 启动 Storybook    → http://localhost:6006
npm run test         # 运行测试
```

---

## Dev Loop 流程

### 全流程概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Dev Loop 全流程                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 0   Phase 1   Phase 2    Phase 3    Phase 4    Phase 5   Phase 6   │
│  澄清  →   PRD  →   原型  →    开发  →    审查  →    测试  →   部署      │
│ (可选)    dev-prd  dev-proto   dev-dev  dev-review  dev-test  dev-deploy  │
│           ↓         ↓          ↓         ↓          ↓         ↓          │
│         prd.md   stories    features   findings  tests     manifest     │
│                  + MSW      + commits  + 修复    + 覆盖率   + URLs      │
│                                                                             │
│  ─────────────────────── .loop/session.json ────────────────────────────── │
│                         (状态在阶段间传递)                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 各阶段详情

| Phase | 名称 | Skill | 产出 | 人工确认 |
|-------|------|-------|------|---------|
| 0 | 澄清（可选）| — | 需求边界明确 | 复杂需求时自动触发 |
| 1 | PRD | `dev-prd` | `.loop/prd.md` + `api-contracts.json` | ✅ 必须确认 |
| 2 | 原型 | `dev-proto` | Storybook stories + MSW handlers | ✅ 交互验证 |
| 3 | 开发 | `dev-dev` | 业务代码 + Git commits | ✅ 阶段性确认 |
| 4 | 审查 | `dev-review` | `.loop/review/findings.md` | ✅ CRITICAL 必须修复 |
| 5 | 测试 | `dev-test` | Vitest + Playwright 测试 | ✅ 测试意图确认（STOP POINT） |
| 6 | 部署 | `dev-deploy` | Vercel + Railway 部署 | ✅ 生产环境必须确认 |

### 使用方式

```bash
# 全流程（从需求到部署）
/dev-loop 用户管理系统，支持 CRUD 和角色权限

# 只做需求→原型（适合需求评审、方案验证）
/dev-loop 用户管理系统 --to proto

# 从指定阶段开始（前置阶段需已完成）
/dev-loop --from review

# 从上次中断处恢复
/dev-loop --resume

# 也可以独立调用单个 skill
写 PRD          → 自动触发 dev-prd
做原型          → 自动触发 dev-proto
代码审查        → 自动触发 dev-review
生成测试        → 自动触发 dev-test
部署            → 自动触发 dev-deploy
```

---

## 架构设计

### 核心设计原则

```
单一数据源                    三处复用
┌─────────┐
│ PRD     │  API 契约 (api-contracts.json)
│ (需求)  │─────────────────────────────┐
└─────────┘                             │
     │                                  ▼
     │  ┌──────────────────────────────────────────┐
     │  │  MSW handlers  ←→  Storybook stories     │
     │  │  (mock 层)          (可交互原型)          │
     │  └──────────────────────────────────────────┘
     │
     ▼  ┌──────────────────────────────────────────┐
        │  API routes    ←→  Vitest 测试           │
        │  (真实实现)       (API 层验证)            │
        └──────────────────────────────────────────┘
```

**一个 API 契约定义，三处消费**：原型 mock、真实路由、测试用例全部从同一份 JSON 生成，杜绝接口不一致。

### 状态管理：`.loop/` 目录

每个开发循环在项目根目录创建 `.loop/` 文件夹，在阶段间传递上下文，支持中断恢复：

```
.loop/
├── session.json              # 当前 loop 状态（阶段、进度、时间戳）
├── prd.md                    # Phase 1: 结构化 PRD
├── api-contracts.json        # Phase 1: 机器可读的 API 契约
├── prototype/
│   └── stories-manifest.md   # Phase 2: Story → 组件 → API 映射
├── dev/
│   ├── task-breakdown.md     # Phase 3: 任务拆解
│   └── component-mapping.md  # Phase 3: 组件映射
├── review/
│   └── findings.md           # Phase 4: 审查发现（CRITICAL/HIGH/MEDIUM/LOW）
├── test/
│   ├── test-scenarios.md     # Phase 5: 测试意图（Given/When/Then）
│   └── coverage-report.md    # Phase 5: 覆盖率报告
├── deploy/
│   ├── manifest.md           # Phase 6: 部署 URL + 健康检查
│   └── history.md            # Phase 6: 部署历史
└── archive/                  # 已完成的 loop 归档
```

---

## 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 框架 | Next.js (App Router) | 15+ | 全栈 React 框架，服务端渲染 |
| 语言 | TypeScript | 5.7+ | 严格模式，类型安全 |
| UI | shadcn/ui | Latest | Radix UI + Tailwind，高质量原子组件 |
| 样式 | Tailwind CSS | 3.4+ | 实用优先，设计令牌 |
| 原型 | Storybook | 8.4+ | 组件文档 + 交互原型 |
| Mock | MSW | 2.7+ | 网络层 API 模拟，浏览器原生 |
| 单元测试 | Vitest | 2.1+ | 快速，兼容 Jest API |
| E2E 测试 | Playwright | 1.49+ | 端到端用户流程 |
| 前端部署 | Vercel | — | 零配置 Next.js 部署 |
| 后端部署 | Railway | — | 容器化后端，自动健康检查 |

---

## 项目结构

### 框架结构（ai-forge 本身）

```
ai-forge/
├── .claude/                    # Dev Loop 编排层
│   ├── CLAUDE.md               # 项目上下文
│   ├── skills/                 # 6 个阶段 skills
│   │   ├── dev-prd/            # Phase 1: PRD 生成
│   │   ├── dev-proto/          # Phase 2: 原型开发
│   │   ├── dev-dev/            # Phase 3: 功能开发
│   │   ├── dev-review/         # Phase 4: 代码审查
│   │   ├── dev-test/           # Phase 5: 测试生成
│   │   └── dev-deploy/         # Phase 6: 部署
│   └── commands/
│       └── dev-loop.md         # 全流程编排命令
│
├── template/                   # 项目模板（create.sh 复制此目录）
│   ├── _claude/                # → .claude/（安装时重命名）
│   ├── _storybook/             # → .storybook/（安装时重命名）
│   ├── src/
│   │   ├── app/                # Next.js App Router 入口
│   │   ├── components/ui/      # shadcn 原子组件（L1，只读）
│   │   ├── features/           # 业务功能模块（L3，开发区）
│   │   └── lib/                # 工具函数
│   ├── mocks/                  # MSW handlers + 测试数据
│   └── tests/                  # unit / integration / e2e
│
└── scripts/
    └── create.sh               # 脚手架脚本（复制 + 占位符替换 + 依赖安装）
```

### 生成项目结构（create.sh 产出）

```bash
my-app/
├── .claude/                    # 所有 skills 已复制
├── .storybook/                 # Storybook 配置（MSW 已集成）
├── .loop/                      # Dev Loop 状态目录（空）
├── src/
│   ├── app/
│   │   ├── layout.tsx          # 根布局（Inter 字体，zh-CN）
│   │   ├── page.tsx            # 首页（欢迎 + 链接）
│   │   ├── globals.css         # CSS 变量主题
│   │   └── api/health/route.ts # 健康检查（Railway 用）
│   ├── components/ui/          # 预装 8 个 shadcn 组件
│   └── lib/utils.ts            # cn() 工具函数
├── mocks/handlers/             # MSW handler 注册中心
├── tests/
│   ├── unit/                   # 示例单元测试
│   ├── integration/            # 示例集成测试
│   └── e2e/                    # 示例 E2E 测试
├── package.json                # 已配置所有 scripts
└── ...配置文件（ts/tailwind/vitest/playwright/vercel/railway）
```

---

## 组件分层

生成的项目采用三层组件架构，职责清晰，互不干扰：

```
┌─────────────────────────────────────────────────────────┐
│  L3  Feature Components    src/features/<domain>/       │
│  业务组件 + 页面逻辑       频繁修改，按功能域组织        │
├─────────────────────────────────────────────────────────┤
│  L2  Shared Primitives     src/features/_shared/        │
│  项目级复用组件            每个项目初始化一次             │
│  (State/Form/Page/Table)   加载态、表单、表格、分页      │
├─────────────────────────────────────────────────────────┤
│  L1  Atomic Components     src/components/ui/           │
│  shadcn/ui 原子组件        ❌ 只读，不修改               │
│  (Button/Input/Card/...)   升级 shadcn 时直接覆盖        │
└─────────────────────────────────────────────────────────┘
```

**L1 只读原则**：shadcn 组件不直接修改，升级时覆盖即可，保证 UI 一致性。

---

## 关键特性

### 📋 Phase 1：PRD 生成（dev-prd）

从自然语言需求生成结构化 PRD，包含：
- 背景、目标、用户故事（AC-xxx 验收标准）
- 功能需求（P0/P1/P2 优先级）
- **API 契约**（机器可读 JSON，供下游阶段消费）
- UI 规格、非功能需求、范围外说明

### 🎨 Phase 2：交互原型（dev-proto）

基于 PRD 自动生成 Storybook stories + MSW handlers：
- 每个页面/组件一个 story，真实可交互
- Mock 数据含边界情况（空态、超长文本、错误态）
- 生成 stories-manifest.md，记录 story → 组件 → API 映射

### ⚡ Phase 3：并行开发（dev-dev）

使用 **lobster-lead 模式**（内置的任务编排策略）：

```
依赖分析 → 任务拆解 → 并行派发 subagent → 阶段性 commit
[1] 数据层 ─→ [2] API 路由 ─→ 并行: [3a] 前端组件
                             ─→ 并行: [3b] 页面集成
```

功能模块采用标准结构：

```
src/features/<domain>/
├── MANIFEST.md           # 功能边界 + 依赖说明
├── queries.ts            # React Query 配置 + 类型定义
├── mutations.ts          # useMutation hooks
├── views/
│   ├── list.view.tsx     # 列表页
│   └── dialogs/
│       └── create.modal.tsx
└── components/           # 私有组件
```

### 🔍 Phase 4：三路并行审查（dev-review）

```
并行派发:
├── code-reviewer      → 代码质量、设计模式、性能
├── security-reviewer  → 安全漏洞、注入、权限
└── PRD 合规检查        → 验收标准覆盖率（AC-xxx → 实现映射）
```

结果汇总到 `findings.md`，**CRITICAL 问题阻止部署**。

### 🧪 Phase 5：业务测试三层桥梁（dev-test）

解决 AI 弱于业务逻辑测试的痛点：

```
Layer 1: PRD 验收标准 → Given/When/Then 测试意图（含 AI 置信度）
Layer 2: 🛑 STOP POINT → 人工确认业务逻辑是否正确（不可跳过）
Layer 3: 确认通过 → 生成 Vitest / Playwright 测试代码
```

P0 功能覆盖率要求 100%，P1/P2 建议 ≥ 80%。

### 🚀 Phase 6：多环境部署（dev-deploy）

**部署前自动检查**（任一失败则阻止部署）：
- ✅ Git 状态干净（无未提交改动）
- ✅ 测试报告存在且全部通过
- ✅ 审查报告无 CRITICAL 问题
- ✅ API 契约一致（PRD ↔ 代码）
- ✅ P0 功能覆盖率 100%

支持三个环境：`preview`（PR 预览）→ `staging`（预发）→ `production`（生产，需二次确认）

---

## 自定义与扩展

### 添加自定义 Skill

在 `.claude/skills/` 下创建新目录，遵循标准格式：

```markdown
---
name: my-skill
description: 描述 skill 用途
triggers:
  - "触发词1"
  - "触发词2"
prerequisites:
  - ".loop/prd.md"
---

## Step 0: 环境检查
...

## Step 1: 执行逻辑
...

## 红线
- 不可跳过的检查
```

### 安装更多 shadcn 组件

```bash
npx shadcn@latest add <component-name>
# 例如：npx shadcn@latest add dialog select popover
```

dev-proto 阶段也会自动检测 PRD 所需组件并提示安装。

### 修改部署配置

- **Vercel**：编辑 `vercel.json`（构建命令、环境变量、域名）
- **Railway**：编辑 `railway.toml`（健康检查路径、超时、重试策略）
- **添加其他平台**：在 `dev-deploy` skill 中扩展部署目标

---

## 常见问题

### Q: 必须用 Claude Code 才能用 ai-forge 吗？

是的。ai-forge 的 Dev Loop 依赖 Claude Code 的 skills/commands 机制来编排各阶段。项目模板本身（Next.js + shadcn + Storybook 等）是通用的，但 AI 编排层需要 Claude Code 环境。

### Q: 可以不用 Railway，只部署前端吗？

可以。如果项目没有后端 API（纯前端或使用第三方 API），dev-deploy 阶段会跳过 Railway 部署，只部署 Vercel。

### Q: 生成的项目可以换 UI 库吗？

模板预装了 shadcn/ui，但你可以自由替换。注意 dev-proto 阶段会自动安装 shadcn 组件，换库后需要调整该 skill 的逻辑。

### Q: `.loop/` 目录应该提交到 Git 吗？

建议不提交（已在 `.gitignore` 中）。它是开发过程的临时状态，归档后（`.loop/archive/`）可按需提交作为审计记录。

### Q: 开发中断了怎么办？

使用 `/dev-loop --resume`，它会读取 `.loop/session.json`，显示当前进度，询问是从中断处继续还是跳转到其他阶段。

### Q: 可以跳过某些阶段吗？

可以。使用 `--to <phase>` 提前结束，或 `--from <phase>` 从中间开始（前提：前置阶段的产出文件已存在）。

---

## 许可证

MIT
