# 🔨 ai-forge

> AI 驱动的全流程开发框架 — 从一句话需求到生产部署，一条命令走完。

```
需求 → [确认] → 原型 → [确认] → 开发 → [确认] → 部署
              （可选：/dev-prd、/dev-review、/dev-test 独立调用；/dev-undo 回退 checkpoint）
```

**一句话**：把开发流程的核心三阶段（原型 → 开发 → 部署）串成一条 Dev Loop，AI 编排执行，人类在关键节点确认。所有跨阶段状态由 **Forge Harness**（`scripts/lib/forge-*.mjs`）托管——事件日志、预算、checkpoint、worktree 沙箱、三级审批门——保证可重放、可回退、可审计。复杂场景按需手动调用 PRD / 审查（含 seal 静态扫描）/ 测试 三个独立增强 skill。

---

## 目录

- [快速开始](#快速开始)
- [Dev Loop 流程](#dev-loop-流程)
- [Forge Harness](#forge-harness)
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
│                       Dev Loop 默认管线（3 阶段）                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│       Phase 1            Phase 2             Phase 3                        │
│       原型  →             开发  →             部署                          │
│       dev-proto          dev-dev             dev-deploy                     │
│         ↓                  ↓                   ↓                            │
│   stories + MSW       features + commits   Vercel + Railway                 │
│                                                                             │
│  ─────────────────── .loop/session.json ─────────────────────────────────── │
│                       (状态在阶段间传递)                                     │
└─────────────────────────────────────────────────────────────────────────────┘

可选独立 skill（不在默认管线中，按需手动调用）：

  /dev-prd      → 生成结构化 PRD 文档
  /dev-review   → 深度代码审查（code-reviewer + security + PRD 合规）
  /dev-test     → 完整测试套件 + 覆盖率报告（含 P0 100% 检查）
```

### 各阶段详情

**默认管线**

| Phase | 名称 | Skill | 产出 | 人工确认 |
|-------|------|-------|------|---------|
| 1 | 原型 | `dev-proto` | Storybook stories + MSW handlers + 验收清单 | ✅ 标注迭代 + 定稿 |
| 2 | 开发 | `dev-dev` | 业务代码 + Git commits + 验收覆盖报告 | ✅ 任务拆解 + 完成确认 |
| 3 | 部署 | `dev-deploy` | Vercel + Railway 部署 + 健康检查 | ✅ 生产环境二次确认 |

**独立增强 skill**

| Skill | 用途 | 产出 |
|-------|------|------|
| `dev-prd` | 复杂需求需要结构化文档时 | `.loop/prd.md` + `.loop/api-contracts.json` |
| `dev-review` | 代码深度审查 | `.loop/review/findings.md`，写入 `session.json.lastReview` |
| `dev-test` | 完整测试生成 + 覆盖率 | `.loop/test/scenarios.md` + `coverage-report.md`，写入 `session.json.lastTest` |

### 使用方式

```bash
# 全流程（原型 → 开发 → 部署）
/dev-loop 用户管理系统，支持 CRUD 和角色权限

# 只做需求→原型（适合需求评审、方案验证）
/dev-loop 用户管理系统 --to proto

# 从指定阶段开始（前置阶段需已完成）
/dev-loop --from dev      # 跳过原型，需 .loop/acceptance-checklist.md 存在

# 从上次中断处恢复
/dev-loop --resume

# 跳过原型标注迭代循环（一次生成即定稿）
/dev-loop 后台管理系统 --skip-feedback

# 独立增强 skill（不在默认管线，按需手动调用）
/dev-prd 用户管理系统   # 生成结构化 PRD
/dev-review            # 深度代码审查
/dev-test              # 完整测试套件 + 覆盖率

# 回退到某个 checkpoint（每个 phase 会创建 git tag: loop-<id>-cp-<n>）
/dev-undo              # 交互选择
/dev-undo cp-3         # 直接回到 checkpoint 3
/dev-undo cp-3 --keep-events   # 只回滚代码，保留 events.jsonl
```

---

## Forge Harness

Dev Loop 的三个 phase skill 不直接写状态文件，而是通过 **Forge Harness CLI** 统一托管。所有 `.loop/*.json`、`.jsonl` 写入都走 schema 校验 + atomic write，保证跨 session 断点可恢复、可审计。

### CLI 一览

| CLI | 职责 | 关键命令 |
|-----|------|---------|
| `forge-state` | 状态读写 + schema 校验 | `read/write/validate` |
| `forge-events` | 追加式事件日志（`.loop/events.jsonl`） | `append/tail/query/rollup/rollback/resume-hint` |
| `forge-budget` | 每 phase 的 step/subagent/retry 预算 | `check/consume/set/reset` |
| `forge-metrics` | 汇总 events → phase/loop 指标 | `compute/rollup/show` |
| `forge-mode` | 三级审批门（suggest / auto-edit / full-auto） | `get/set/gate/classify` |
| `forge-patch` | Aider 风格 SEARCH-REPLACE 补丁 | `validate/apply` |
| `forge-worktree` | subagent 隔离到 git worktree | `create/list/merge/drop/path` |
| `forge-repomap` | 轻量符号图，注入 subagent 上下文 | `build/show` |
| `enhancers` | 扫描 `.claude/enhancers/<phase>/` frontmatter | `list/select` |

### 治理机制

- **三级模式**（`session.json.mode`）
  - `suggest` — 所有写操作都要人工确认
  - `auto-edit`（默认）— 编辑自动放行，危险动作（`git push`、`vercel --prod`、`rm -rf`、`--no-verify` 等）走 AskUserQuestion
  - `full-auto` — 编辑 + 部署自动，只挡 destructive
  - 通过 `PreToolUse` hook 在 settings.json 里挡在 Bash 前面
- **预算**（`phases.<phase>.budget`）— 每个 phase 有 step/subagent/retry 上限；≥80% 预警，100% 阻塞并要求人工决策
- **事件日志** — 每一步 entry/exit、subagent 派发、patch apply、checkpoint 都写 `events.jsonl`，`forge-metrics` 反推指标，`forge-events resume-hint` 帮 `--resume` 定位断点
- **Checkpoint & 回退** — 每个 phase 完成后打 git tag `loop-<id>-cp-<n>`；`/dev-undo` 可回退代码与事件到任意 checkpoint
- **Subagent 隔离** — dev-dev 派发的子任务默认在 `.loop/.worktrees/<id>/` 独立分支执行，验收后 squash-merge 回主分支；失败可 drop 而不影响主工作树
- **Role Manifest** — `.claude/roles/*.json` 声明每个 subagent 允许的工具、bash 模式、写作范围。plan-analyst 只读；feature-impl/api-route/page-integration/shared-primitive 可写但禁 `git push`、禁 `--no-verify`
- **Schema 校验** — `PostToolUse` hook 对 `session.json` / `task-state.json` / `api-contracts.json` / `plan.json` / `subagent-receipts/*.json` / `phase-metrics.json` 全部做 schema 校验，写坏就报错

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

每个开发循环在项目根目录创建 `.loop/` 文件夹，在阶段间传递上下文，支持中断恢复与 checkpoint 回退：

```
.loop/
├── session.json              # 当前 loop 状态（mode + currentPhase + phases[].budget + last<Skill>）
├── events.jsonl              # ★ 追加式事件日志（step/subagent/patch/checkpoint）
├── events-archive/           # /dev-undo 回退后归档的旧 events
├── loop-summary.json         # forge-metrics rollup 产出的整体指标
├── phases/
│   └── <phase>/metrics.json  # 每个 phase 的 step/subagent/retry/token 指标
├── .worktrees/               # dev-dev subagent 的独立 git worktree
├── prd.md                    # 独立 skill (dev-prd): 结构化 PRD
├── api-contracts.json        # dev-prd / dev-proto 共同维护的 API 契约
├── acceptance-checklist.md   # Phase 1 (dev-proto): 定稿后反推的验收清单
├── prototype/
│   └── stories-manifest.md   # Phase 1 (dev-proto): Story → 组件 → API 映射
├── dev/
│   ├── plan.json             # ★ plan-analyst 产出的任务图（schema 校验）
│   ├── task-breakdown.md     # Phase 2 (dev-dev): 任务拆解
│   ├── component-mapping.md  # Phase 2 (dev-dev): 组件映射
│   ├── repo-map.txt          # forge-repomap 产出的符号图（subagent 上下文）
│   └── subagent-receipts/    # 每个 subagent 的执行回执（含 patch + 验收记录）
├── deploy/
│   ├── manifest.md           # Phase 3 (dev-deploy): 部署 URL + 健康检查
│   └── history.md            # Phase 3 (dev-deploy): 部署历史
├── review/                   # 独立 skill (dev-review)
│   ├── seal-report.json      # L1: seal-code-review 静态扫描结果
│   ├── seal.sarif            # L1: SARIF 格式（CI 用）
│   ├── changed-files.txt     # 改动文件清单（扫描范围）
│   └── findings.md           # L2: LLM 审查汇总（CRITICAL/HIGH/MEDIUM/LOW）
├── test/                     # 独立 skill (dev-test)
│   ├── test-scenarios.md     # 测试意图（Given/When/Then）
│   └── coverage-report.md    # 覆盖率报告
└── archive/                  # 已完成的 loop 归档
```

> Checkpoint tag：每个 phase 完成时打 `loop-<id>-cp-<n>` git tag，`/dev-undo` 通过 tag 回退代码 + `.loop/events.jsonl`。

---

## 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 框架 | Next.js (App Router) | 15+ | 全栈 React 框架，服务端渲染 |
| 语言 | TypeScript | 5.7+ | 严格模式，类型安全 |
| UI | shadcn/ui | Latest | Radix UI + Tailwind，高质量原子组件 |
| 样式 | Tailwind CSS | 3.4+ | 实用优先，设计令牌 |
| 原型 | Storybook (`nextjs-vite`) | 10+ | 组件文档 + 交互原型 |
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
│   ├── PHASE_CONTRACT.md       # 跨阶段状态契约
│   ├── settings.json           # Pre/PostToolUse hooks + permissions allowlist
│   ├── skills/                 # 6 个 skill（3 个管线内 + 3 个独立增强）
│   │   ├── dev-proto/          # Phase 1（默认管线）: 原型开发
│   │   ├── dev-dev/            # Phase 2（默认管线）: 功能开发
│   │   ├── dev-deploy/         # Phase 3（默认管线）: 部署
│   │   ├── dev-prd/            # 独立: PRD 生成
│   │   ├── dev-review/         # 独立: 代码审查
│   │   └── dev-test/           # 独立: 测试生成
│   ├── commands/               # 5 个 slash command
│   │   ├── dev-loop.md         # 默认管线编排命令
│   │   ├── dev-proto.md / dev-dev.md / dev-deploy.md
│   │   └── dev-undo.md         # 回退到 checkpoint
│   ├── roles/                  # ★ subagent 角色清单（allowedTools / bash 模式）
│   │   ├── plan-analyst.json   # 只读规划
│   │   ├── feature-impl.json   # 功能模块实现
│   │   ├── api-route.json      # API 路由 + Zod 验证
│   │   ├── page-integration.json  # App Router 页面装配
│   │   └── shared-primitive.json  # L2 共享原语
│   ├── schemas/                # JSON Schemas（session/api-contracts/task-state/plan/event/phase-metrics/subagent-receipt/subagent-role）
│   └── enhancers/              # 阶段增强能力包（proto/dev/deploy 三个子目录）
│
├── scripts/
│   ├── create.sh               # 生成新项目
│   ├── upgrade.sh              # 升级现有项目的框架资产
│   └── lib/                    # ★ Forge Harness CLI（atomic write + schema 校验）
│       ├── _common.mjs         # 参数解析、原子写、schema 加载
│       ├── forge-state.mjs     # 状态 read/write/validate
│       ├── forge-events.mjs    # 事件日志（append/tail/query/rollup/rollback/resume-hint）
│       ├── forge-budget.mjs    # step/subagent/retry 预算
│       ├── forge-metrics.mjs   # events → phase/loop 指标
│       ├── forge-mode.mjs      # 三级审批门 gate
│       ├── forge-patch.mjs     # SEARCH-REPLACE 补丁 validate/apply
│       ├── forge-worktree.mjs  # subagent worktree 隔离
│       ├── forge-repomap.mjs   # 轻量符号图注入 subagent 上下文
│       └── enhancers.mjs       # enhancer 扫描 / 选择
│
├── template/                   # 项目模板（create.sh 复制此目录）
│   ├── _claude/                # → .claude/（安装时重命名，含 skills/roles/schemas/enhancers/settings.json）
│   ├── _storybook/             # → .storybook/（含 visual-feedback/，可选）
│   ├── src/
│   │   ├── app/                # Next.js App Router 入口
│   │   ├── components/ui/      # shadcn 原子组件（L1，只读）
│   │   ├── features/
│   │   │   ├── _shared/        # L2 共享原语（state/ form/）
│   │   │   └── <domain>/       # L3 业务功能模块
│   │   └── lib/                # api-response.ts / request.ts / utils.ts
│   ├── mocks/                  # MSW handlers + 测试数据
│   └── tests/                  # unit / integration / e2e
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

### 🎨 Phase 1：交互原型（dev-proto）

从自然语言需求直接生成 Storybook stories + MSW handlers，无需事先写 PRD：
- 每个页面/组件一个 story，真实可交互
- Mock 数据含边界情况（空态、超长文本、错误态）
- **内置 visual-feedback 标注工具**（模块化结构）：在 Storybook 里点元素 → 写反馈 → AI 读取迭代
  - `picker.ts` / `use-picker.ts` — 元素选取
  - `overlay.tsx` / `panels.tsx` / `styles.ts` — UI 浮层
  - `api.ts` / `server.cjs` — 客户端 API + 本地服务器
  - `use-annotations.ts` / `types.ts` — 状态管理 + 类型
- 定稿后反推「验收清单」（`.loop/acceptance-checklist.md`），作为开发输入
- 生成 stories-manifest.md，记录 story → 组件 → API 映射
- 同步推导 `.loop/api-contracts.json`（schema 与 `.claude/schemas/api-contracts.schema.json` 一致，由 `forge-state` CLI 校验）

### ⚡ Phase 2：并行开发（dev-dev）

按 **拆解 → 并行 → checkpoint** 三步走：

```
plan-analyst (只读) → plan.json → 并行派发 subagent（worktree 隔离） → 阶段性 commit + git tag
[1] 基础设施 ─→ [2] API 路由 ─→ 并行: [3a] 前端 feature 模块
                              ─→ 并行: [3b] 路由集成
```

**Harness 加持**：

- **plan-analyst** 只读产出 `plan.json`（schema 校验），拆解任务、识别依赖
- 每个 subagent 按 `.claude/roles/*.json` 分配工具白名单，默认在独立 git worktree（`.loop/.worktrees/<id>/`）里干活
- `forge-repomap` 抽取项目符号，作为轻量上下文注入 subagent，避免重复读大文件
- 编辑走 `forge-patch` SEARCH-REPLACE 格式，先 validate 再 apply
- 每个 subagent 完成后写一份回执到 `.loop/dev/subagent-receipts/<id>.json`（schema 校验）
- `forge-budget` 卡住失控：step/subagent/retry 超预算前预警，超 100% 阻塞

功能模块采用标准结构（按需使用 TanStack Query 模式）：

```
src/features/<domain>/
├── MANIFEST.md           # 功能边界 + 依赖说明
├── queries.ts            # 类型定义 + 查询（装了 TanStack Query 时为 queryOptions 工厂）
├── mutations.ts          # useMutation hooks（仅装了 TanStack Query 时）
├── views/
│   ├── list.view.tsx     # 列表页
│   └── dialogs/
│       └── create.modal.tsx
└── components/           # 私有组件
```

每个 checkpoint 前自动跑 `tsc --noEmit` + 4 项轻量自检（禁 `any`、禁裸 `useEffect+fetch`、mutation 必 invalidate、API 必走 `ok()/err()`），通过后自动 commit + 打 tag `loop-<id>-cp-<n>`，方便 `/dev-undo` 回退。

### 🚀 Phase 3：多环境部署（dev-deploy）

**Pre-flight 检查**（任一失败则阻止 production 部署）：
- ✅ Git 状态干净（无未提交改动）
- ✅ `npm run build` 通过
- ✅ 验收覆盖检查（dev-dev 产出）
- ✅ 若手动跑过 `/dev-review`：无 CRITICAL issue
- ✅ 若手动跑过 `/dev-test`：P0 覆盖率 100%

支持三个环境：`preview`（PR 预览）→ `staging`（预发）→ `production`（生产，需二次确认）

---

### 独立增强 skill

#### 📋 dev-prd — 结构化 PRD 生成

从自然语言需求生成结构化 PRD，包含：
- 背景、目标、用户故事（AC-xxx 验收标准）
- 功能需求（P0/P1/P2 优先级）
- API 契约（同步写入 `.loop/api-contracts.json`，遵循统一 schema）
- UI 规格、非功能需求、范围外说明

#### 🔍 dev-review — 双层审查（确定性扫描 + LLM 深度分析）

```
L1 静态扫描：seal-code-review (L3 模式)
   ├── 幻觉包检测、硬编码密钥、危险 API（eval/exec）
   ├── 死代码、空 catch、长函数、深嵌套
   └── floating promise、as any、async 无 await
        ↓ 报告写入 .loop/review/seal-report.json
L2 LLM 并行审查（以 seal 报告为事实基线）：
   ├── code-reviewer      → 代码质量、设计模式、性能
   ├── security-reviewer  → 安全语义、注入、权限
   └── PRD 合规检查        → 验收标准覆盖率（AC-xxx → 实现映射）
```

**为什么先静态后 LLM**：seal 的发现是确定性的、零幻觉，LLM 不再浪费 token 重复发现机械问题，专注于业务逻辑和契约合规。结果汇总到 `.loop/review/findings.md`，写入 `session.json.lastReview`。

> seal 仅自动修 `unused-import` 类 LOW 问题，其余交由人工。

#### 🧪 dev-test — 业务测试三层桥梁

解决 AI 弱于业务逻辑测试的痛点：

```
Layer 1: 验收清单 / PRD AC → Given/When/Then 测试意图（含 AI 置信度）
Layer 2: 🛑 STOP POINT → 人工确认业务逻辑是否正确（不可跳过）
Layer 3: 确认通过 → 生成 Vitest / Playwright 测试代码
```

P0 功能覆盖率要求 100%，P1/P2 建议 ≥ 80%。结果写入 `session.json.lastTest`。

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

### Q: 想撤销一次误提交或走偏的开发怎么办？

用 `/dev-undo`。每个 phase 完成时都会打 git tag `loop-<id>-cp-<n>`，回退时代码 `git reset` 到目标 tag，同时把之后的 events 归档到 `.loop/events-archive/`（加 `--keep-events` 只回滚代码）。

### Q: 三级审批模式（suggest / auto-edit / full-auto）怎么切？

`node scripts/lib/forge-mode.mjs set <mode>` 或直接编辑 `.loop/session.json.mode`。默认 `auto-edit` — 编辑放行、危险动作（`git push` / `vercel --prod` / `rm -rf` / `--no-verify`）走 AskUserQuestion。`.claude/settings.json` 的 PreToolUse hook 会在 Bash 前把关。

---

## 许可证

MIT
