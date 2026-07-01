---
name: dev-proto
description: 从自然语言需求直接生成 Storybook 可交互原型，使用 shadcn/ui + MSW。生成后用内置 visual-feedback 标注工具迭代（项目模板自带，零安装），定稿后反推验收清单。触发词："做原型"、"生成 Storybook"、"dev-proto"、"原型开发"、"生成原型"。
---

# Dev Proto — Storybook 原型生成器（含标注迭代）

## 何时启用

用户说出以下任意表达时立即激活：

- 「做原型」「生成原型」「原型开发」
- 「生成 Storybook」「做 Storybook」
- 「dev-proto」
- 被 `/dev-loop` 作为 Phase 1 调用

**输入来源**（优先级从高到低）：

1. 用户自然语言需求（默认入口）
2. `.loop/prd.md`（如果用户手动跑过 `/dev-prd`，作为补充上下文）
3. `.loop/acceptance-checklist.md`（恢复迭代时）

**不启用**：

- 用户只是讨论原型方案，没要求生成

---

## 项目上下文

- **组件库**：shadcn/ui（`src/components/ui/`）
- **Storybook**：`@storybook/nextjs-vite` v10（`.storybook/`，模板已配好）
- **Mock 层**：MSW v2 (Mock Service Worker)（`mocks/`）
- **故事文件**：`src/stories/<feature>/`
- **状态目录**：`.loop/`
- **API 契约 schema**：`api-contracts.schema.json`（项目根，所有 endpoint 写入必须满足该 JSON Schema）

---

## 原型约定（来自 design-playground 的最佳实践）

### 三层架构

原型文件严格按三层组织，职责分明：

| 层级 | 目录 | 职责 | 修改频率 |
|------|------|------|---------|
| **L1 · 原子层** | `src/components/ui/` | shadcn/ui 原子组件 | ❌ 只读，不修改 |
| **L2 · 共享层** | `src/stories/<project>/_shared/` | 项目级布局、主题、复用组件 | 每个项目一次 |
| **L3 · 功能层** | `src/stories/<project>/<feature>.stories.tsx` | 具体功能页面原型 | 频繁迭代 |

- **L1 只读**：shadcn 组件直接复用，不在原型里手写 `<button>` 或 `<input>`
- **L2 隔离**：每个项目的 shell（AppLayout/AppSidebar）和主题（theme.css）在 `_shared/`，互不干扰
- **L3 组合**：功能 story 只组合 L1 原子 + L2 共享组件，不重复造轮子

### Mock 数据分离（fixtures 模式）

所有 mock 数据写在 `.fixtures.ts`，`.stories.tsx` 只负责展示逻辑：

```
src/stories/<project>/
├── auth.stories.tsx        ← 展示逻辑
├── auth.fixtures.ts        ← 所有 mock 常量
└── _shared/
    └── theme.css           ← 项目主题覆写
```

**为什么**：fixtures 和 story 分离后，后续 dev 阶段可以用真实 API 替换 mock 数据，无需改动 story 文件结构。

### 项目主题 scope

每个项目有自己的主题覆写文件，只改想改的 token，其余继承全局：

```
src/stories/<project>/_shared/theme.css
```

```css
/* 只覆写项目特有的 token，其余继承 src/app/globals.css */
.theme-<project> {
  --primary: oklch(0.55 0.22 263);   /* 品牌蓝 */
  --ring:    oklch(0.55 0.22 263);   /* 与 primary 保持一致 */
}
```

- 使用 **oklch 色彩空间**（shadcn radix-nova 标准），转换命令：`npx -y culori oklch "#2563EB"`
- showcase 必须包一层 `<div className="theme-<project> ...">` 才生效
- **全局 `src/app/globals.css` 不可修改**，避免影响其他项目 story

### Story 命名规范

| 维度 | 格式 | 示例 |
|------|------|------|
| Story title（侧栏显示） | `<project-slug> / <中文显示名>` | `'octopush / 登录 & 认证'` |
| 文件路径 | `src/stories/<project-slug>/<feature>.stories.tsx` | `src/stories/octopush/auth.stories.tsx` |
| 默认 story 名 | `v1`（原地迭代，类似 Figma） | `export const v1: Story = { tags: ['draft'] }` |
| 版本标签 | `draft` / `published` | `tags: ['published']` 表示已定稿 |

- 需要 A/B 对比时才开 `v2`，否则只有一个 `v1` 原地改
- 废弃版本移入 `_archive/`，不直接删除

### 动画原则

- **优先 CSS transitions + Tailwind `animate-*`**，不引入 framer-motion 等重型库
- Radix UI 组件用 `data-open` / `data-closed` 属性控制开关动画：
  ```tsx
  "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
  ```

### 布局自适应规范（**高频踩坑点，必读**）

Storybook canvas 宽度 ≠ 视口宽度 —— 左侧栏 + 右 addon 面板打开时，canvas 经常只剩 600–900px。原型必须在这个区间不被裁切。

**禁止**：

- ❌ `grid-cols-[260px_1fr_360px]` —— 固定 px 列宽，窄 canvas 直接溢出
- ❌ `w-[400px]` / `min-w-[800px]` —— 写死的宽度
- ❌ `h-[calc(100vh-120px)]` —— Storybook iframe 高度不是 100vh
- ❌ 三栏以上布局没有 `overflow-x-auto` 兜底

**强制**：

- ✅ 多栏布局用响应式 + `minmax(0, 1fr)`：
  ```tsx
  // 桌面三栏，窄屏自动堆叠 —— 注意用 md (768) 而非 lg (1024)
  // Storybook 侧栏 + 工具栏会吃掉 ~280px，浏览器 1440 时 canvas 只剩 ~1140
  // 用 lg 断点会让 1280 浏览器（canvas ~980）直接堆叠，用户以为内容丢失
  //
  // 关键：内容主列（编辑器/详情区）必须有 minmax(280px, 1fr)，
  // 否则窄 canvas 时这一列会被挤到 100-200px，内部内容溢出遮挡相邻列。
  className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(180px,220px)_minmax(280px,1fr)_minmax(220px,280px)]"
  ```
- ✅ 全屏页面高度用 `min-h-screen` + flex 链路，而非 `100vh` 数学计算；确需 vh 时用 `100dvh`
- ✅ 任何可能横向溢出的容器套 `min-w-0 overflow-hidden`（flex/grid 子项默认 `min-width: auto` 会撑破父级，必须显式 `min-w-0`）
- ✅ 文本节点用 `truncate` 或 `line-clamp-N`，标题区用 `min-w-0 flex-1` + `truncate`
- ✅ 长列表用 `<ScrollArea>` 或 `overflow-y-auto`，不要让外层撑开
- ✅ 页面级 story 在 `parameters` 标注期望视口：
  ```tsx
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'desktop' },   // 见 .storybook/preview.ts viewports
  }
  ```

**自查清单**（生成 story 后必须过一遍）：

1. 把浏览器窗口缩到 1280px，左侧栏 + addon 面板都打开 —— 内容是否完整？
2. 切到 viewport addon 的 tablet (768px) —— 是否横向滚动条出现？三栏是否折叠？
3. mock 数据里那条"边界场景"（超长名称）—— 是否被 truncate？还是把布局撑破？

### cn() 工具函数

所有 className 合并必须使用 `cn()`（clsx + tailwind-merge），正确处理 Tailwind 冲突：

```tsx
import { cn } from '@/lib/utils'

className={cn(baseClasses, conditionalClass, userOverride)}
```

### Mock 数据规则

- 5-8 条数据，含 1 个边界场景（空值/超长名称/异常状态）
- 使用真实中文人名，日期在最近 3 个月内
- 导出为命名导出（方便 story 按需引用）

---

## 完整执行流程

### Step 0：环境检查 + 需求理解

**检查环境**：

```bash
# 检查 Storybook 是否已安装（模板已自带 v10 + .storybook/）
ls .storybook/main.ts 2>/dev/null || echo "STORYBOOK_NOT_INSTALLED"

# 检查 shadcn 组件库（模板已自带）
ls src/components/ui/ 2>/dev/null || echo "SHADCN_NOT_INSTALLED"

# 检查 API 契约 schema
ls api-contracts.schema.json 2>/dev/null || echo "NO_API_SCHEMA"

# 检查是否有补充上下文
cat .loop/prd.md 2>/dev/null | head -20
cat .loop/acceptance-checklist.md 2>/dev/null | head -10
```

**模板已自带 Storybook v10 + shadcn 配置**。如果你看到这两个目录不存在，说明项目不是用 ai-forge create.sh 生成的：

- Storybook 未装 → 执行 `npx --yes storybook@latest init`，目标必须是 v10+ + `@storybook/nextjs-vite` 框架
- shadcn 未装 → 执行 `npx shadcn@latest init`

> 注意：`.storybook/main.ts` 应使用 `@storybook/nextjs-vite` 框架（v10）。模板已配好，不要切回旧的 `@storybook/nextjs` v8。

**理解需求**：

- 如果输入是自然语言（默认）：
  - 需求清晰 → 直接进入下一步
  - 需求模糊 → 用 `AskUserQuestion` 一次性问清 4 个维度（**只问真正不清楚的**，不照本宣科）：
    | 维度 | 示例问题 |
    |------|---------|
    | 目标 | 这个原型要解决什么问题？最核心的用户动作是什么？ |
    | 范围 | 一期做哪些功能/页面？哪些先不做？ |
    | 关键场景 | 最重要的 2-3 个使用场景是？ |
    | 视觉风格 | 有参考产品/品牌色吗？或者按 shadcn 默认风格？ |

- 如果输入有 `.loop/prd.md`（用户手动跑过 `/dev-prd`）：
  - 把 PRD 作为详细需求来源，跳过澄清

**提取关键信息**用于后续生成：

| 提取内容 | 用途 |
|----------|------|
| 核心用户场景 | 确定要做哪些 stories |
| 数据实体 + 字段 | 确定 fixtures + handlers |
| 关键交互流程 | 写 play functions |
| 视觉风格 | 决定 theme tokens |

**加载增强能力包**（两段式，避免全量预加载撑爆上下文）：

```bash
# 1. 只扫 frontmatter，输出 manifest（成本低）
node scripts/lib/enhancers.mjs list proto

# 2. 根据 Step 0 提取的需求关键词过滤（如 form,validation,dialog）
node scripts/lib/enhancers.mjs select proto --keywords "<kw1,kw2,...>"
```

处理规则：

- 返回的 `selected` 数组即启用清单；对每份逐一 `Read` 全文，纳入上下文
- 用 `AskUserQuestion` 把 `selected` / `skipped` 展示给用户确认（默认接受，允许「全部启用」或「跳过某项」）
- 后续每个生成步骤（Step 3 handlers / Step 4 stories / Step 7 标注迭代修改）开始前，回顾启用的增强规范并在产物中遵守
- 多个 enhancer 内容冲突时按 frontmatter `priority` 排序：`high` > `medium` > `low`；同优先级按文件名字典序
- enhancer 与本 skill 红线冲突时（如「全局 globals.css 不可修改」），**红线胜**

用户确认后落盘 manifest：

```bash
node scripts/lib/enhancers.mjs manifest --phase proto \
  --selected "<name1>,<name2>" --skipped "<name3>"
```

Step 10 完成时把 `selected` 数组通过 `forge-state` 写入 `session.json.phases.prototype.enhancers`：

```bash
echo '{"phases":{"prototype":{"enhancers":["<name1>","<name2>"]}}}' \
  | node scripts/lib/forge-state.mjs update .loop/session.json --schema session
```

若 `list` 输出为空数组（无可用 enhancer） → 跳过本步，按默认约定执行。

---

### Step 0.5：Harness 协议启动

在进入 Step 1 之前，先把 harness 追踪打开——**这是 `--resume`、metrics、budget 生效的前提**：

```bash
# 1. 写 phase.enter（events.jsonl 若不存在会自动创建）
node scripts/lib/forge-events.mjs append --kind phase.enter --phase prototype --step step.0

# 2. 检查 phase 预算（默认 50 steps / 8 subagents —— 覆盖 3-5 features 并行 + 若干重试）
node scripts/lib/forge-budget.mjs check prototype
# exit 0 = OK, 2 = 触顶 → AskUserQuestion「加预算 / 中断 / 接受当前进度」, 3 = 80% warn
```

后续每个 Step / AskUserQuestion / annotation 迭代都必须写对应 event：

| 事件 | 何时写 | 命令 |
|------|--------|------|
| `step.enter` / `step.exit` | 每个 Step 入口 / 完成时 | `forge-events append --kind step.enter --phase prototype --step step.N` |
| `askuser.prompt` / `askuser.answer` | AskUserQuestion 前后 | 同上，kind 变 |
| `enhancer.applied` | Step 0 结束确认清单后 | `forge-events append --kind enhancer.applied --payload '{"name":"..."}'` |
| `note` | 标注迭代每轮完成时 | 记录处理了多少条 |
| `phase.exit` | Step 10 完成后 | `forge-events append --kind phase.exit --phase prototype` |

**Step 10 完成后**必须调用 metrics 聚合：

```bash
node scripts/lib/forge-metrics.mjs compute --phase prototype
# → 写入 .loop/phases/prototype/metrics.json
```

---

### Step 1：API 草案 + 组件审计

**自推 API 草案**：

基于需求中识别的数据实体和操作，**直接推导一份 API 契约草案**，写入 `.loop/api-contracts.json`。

**Schema 来源**：`api-contracts.schema.json`（项目根），与 `/dev-prd` 输出完全一致。endpoint 必填字段：`method` / `path` / `description` / `response`，可选：`request.{query|body|params}`、`errors`、`prdRef`。

```json
{
  "generatedAt": "2026-06-29T10:00:00Z",
  "loopId": "loop-20260629-001",
  "endpoints": [
    {
      "method": "GET",
      "path": "/api/<resource>",
      "description": "列表查询",
      "request": {
        "query": [
          { "name": "page", "type": "number", "required": false, "default": 1 },
          { "name": "page_size", "type": "number", "required": false, "default": 10 }
        ]
      },
      "response": {
        "200": {
          "type": "{ status_code: 0, data: { list: Item[], total: number, page: number, page_size: number } }"
        }
      },
      "errors": [{ "status": 401, "description": "未授权" }],
      "prdRef": "原型推导"
    },
    {
      "method": "POST",
      "path": "/api/<resource>",
      "description": "创建资源",
      "request": {
        "body": [
          { "name": "name", "type": "string", "required": true, "description": "名称" }
        ]
      },
      "response": {
        "201": { "type": "{ status_code: 0, data: Item }" }
      },
      "errors": [{ "status": 400, "description": "请求参数错误" }],
      "prdRef": "原型推导"
    }
  ]
}
```

> 这份草案只是种子，后续标注迭代时会随用户反馈调整。开发阶段以最终定稿版为准。
>
> **响应类型字符串**遵循统一信封 `{ status_code, data, message? }`（参见 `src/lib/api-response.ts`），下游 dev-dev 直接对应 `ok()` / `err()` 工具函数。

**扫描已有 shadcn 组件**：

```bash
ls src/components/ui/
```

**对比需求需要的 shadcn 组件**，列出需要新增的：

| 需要的组件 | 状态 | 安装命令 |
|-----------|------|---------|
| Button | ✅ 已有 | — |
| Dialog | ❌ 需安装 | `npx shadcn@latest add dialog` |
| Form | ❌ 需安装 | `npx shadcn@latest add form` |

**安装缺失组件**（逐个安装，不批量）：

```bash
npx shadcn@latest add <component-name>
```

---

### Step 2：原型计划（STOP 等确认）

在生成代码之前，先输出原型计划让用户确认：

```
📋 原型计划
──────────────────────────────

功能模块：<模块名称>

组件清单：
  1. <FeatureList> — 列表展示（使用 Table, Badge, Button）
     - Stories: Default / Empty / Loading / Error
  2. <FeatureForm> — 创建/编辑表单（使用 Form, Input, Button）
     - Stories: Create / Edit / Validation
  3. <FeatureDetail> — 详情展示（使用 Card, Badge）
     - Stories: Default / Loading

MSW Handlers：
  - GET  /api/<resource>     → 返回列表数据
  - POST /api/<resource>     → 创建资源
  - PUT  /api/<resource/:id> → 更新资源
  - DELETE /api/<resource/:id> → 删除资源

交互流程原型：
  1. 列表页 → 点击"新建" → 弹窗表单 → 提交 → 刷新列表
  2. 列表页 → 点击"编辑" → 弹窗表单（预填） → 提交 → 刷新列表
  3. 列表页 → 点击"删除" → 确认弹窗 → 删除 → 刷新列表
```

用 `AskUserQuestion` 询问：
- **确认，生成**：开始生成代码
- **调整计划**：修改组件清单或交互流程
- **只做部分**：选择要生成的组件子集

**Features 分组**（Step 2.5 并行 fan-out 的输入）：

在 AskUserQuestion 之前，把组件清单**按 feature 归组**并明示每 feature 的三件套目标文件路径：

```
📦 Features 分组（用于并行 fan-out）
──────────────────────────────

feature: auth
  handlers:  mocks/handlers/auth.ts
  fixtures:  mocks/fixtures/auth.ts
  stories:   src/stories/<project>/auth.stories.tsx
  fixtures:  src/stories/<project>/auth.fixtures.ts
  endpoints: POST /api/auth/login, POST /api/auth/logout

feature: user-list
  handlers:  mocks/handlers/user-list.ts
  fixtures:  mocks/fixtures/user-list.ts
  stories:   src/stories/<project>/user-list.stories.tsx
  fixtures:  src/stories/<project>/user-list.fixtures.ts
  endpoints: GET /api/users, DELETE /api/users/:id

feature: user-detail
  ...

并行策略：features ≥ 2 且未设 FORGE_NO_PARALLEL=1 → Step 2.5 并行派发 <N> 个 proto-feature-builder
                                        否则 → 走 Step 3+4 串行分支
```

> Feature 命名建议：latin-slug（kebab-case），与 story title 里的中文显示名解耦。同一 feature 的所有文件必须共享 slug。

---

### Step 2.5：并行派发 feature builders（fan-out 阶段）

**触发条件**：Step 2 分组产出的 features 数量 ≥ 2，且未设 `FORGE_NO_PARALLEL=1`。否则跳过本步，直接进入 Step 3+4 单线程分支。

**目标**：主 skill 一条消息里并行派发 N 个 `proto-feature-builder` role subagent，每个 subagent 负责一个 feature 的三件套（handlers + fixtures + stories）。**不使用 worktree**（文件按 feature 天然分离），主 skill 通过 disjoint-set 校验保证隔离。

#### Step 2.5.1：派发前置

```bash
# 1. 确保 .loop/api-contracts.json 已在 Step 1 落盘（subagent 唯一的跨 feature 契约源）
node scripts/lib/forge-state.mjs validate .loop/api-contracts.json --schema api-contracts

# 2. 确保 receipts 目录存在
mkdir -p .loop/prototype/subagent-receipts

# 3. Read role 定义（拷贝到每个 subagent prompt）
cat .claude/roles/proto-feature-builder.json
```

对每个 feature，在派发前写 `subagent.spawn` event（**不新增 event kind**，用 payload.batch 编码同批次）：

```bash
node scripts/lib/forge-events.mjs append --kind subagent.spawn --phase prototype --step step.2.5 \
  --payload '{"id":"pfb-<feature-slug>","role":"proto-feature-builder","batch":"proto-fan-1","feature":"<feature-slug>"}'
node scripts/lib/forge-budget.mjs consume prototype --kind subagent
```

预算够（8 subagents）覆盖典型 3-5 features + 少量重试。超预算 → `AskUserQuestion` 提示加预算或降级到串行。

#### Step 2.5.2：并行派发（一条消息里 N 个 Agent 调用）

**关键**：这 N 个 `Agent` 工具调用必须放在**同一条 assistant 消息里**，harness 才会真正并发执行。

每个 subagent prompt 必须包含：

1. **该 feature 的名称**（slug）+ 目标文件路径列表
2. **`.loop/api-contracts.json` 里对应 endpoints 的切片**（只该 feature 的，不要全量）
3. **项目 slug** + 主题 scope 类名（`theme-<project>`）
4. **Step 0 启用的 enhancer 全文**（当前 `frontend-design.md` + `shadcn-form-patterns.md`，均 < 10KB）
5. **`.claude/roles/proto-feature-builder.json` 的 `promptInjections` 全文**（工具约束）
6. **本 skill 的关键约定**：三层架构、fixtures 分离、cn()、min-w-0、oklch 主题、story title 格式
7. **Receipt 要求**：完成前写 `.loop/prototype/subagent-receipts/pfb-<feature>.json`（schema: `subagent-receipt`），`filesWritten` 必须列出所有写入的文件

Subagent prompt 模板（伪代码，实际派发时逐条填充）：

```
你是一个 proto-feature-builder subagent，本次负责 feature="<slug>"。

===== 工具约束（来自 .claude/roles/proto-feature-builder.json）=====
<拷贝 role.promptInjections 每一条>

===== API 契约（来自 .loop/api-contracts.json 的相关切片）=====
<只该 feature 的 endpoints，JSON 片段>

===== 需要产出的文件 =====
1. mocks/handlers/<slug>.ts              — MSW handlers
2. mocks/fixtures/<slug>.ts              — mock 数据常量（5-8 条 + 1 边界场景）
3. src/stories/<project>/<slug>.stories.tsx    — Storybook story
4. src/stories/<project>/<slug>.fixtures.ts    — story 展示常量（品牌名等）

===== 项目约定 =====
- 项目 slug: <project>
- 主题 scope: `<div className="theme-<project> ...">` 包裹 showcase
- Story title 格式: `'<project> / <中文显示名>'`
- 响应信封: {status_code, data, message?}
- className: cn() 合并；min-w-0 + minmax(0,1fr) 响应式；oklch 色值

===== 增强能力包（Step 0 启用）=====
<拷贝 enhancer 全文，每个 < 10KB>

===== Receipt =====
完成前调用：
  cat <<'JSON' | node scripts/lib/forge-state.mjs write .loop/prototype/subagent-receipts/pfb-<slug>.json --schema subagent-receipt
  {
    "id": "pfb-<slug>",
    "role": "proto-feature-builder",
    "status": "success",
    "filesWritten": ["mocks/handlers/<slug>.ts", "mocks/fixtures/<slug>.ts", ...],
    "summary": "生成 <slug> feature 的 handlers + fixtures + stories，共 <N> 个 endpoints、<M> 条 mock 数据"
  }
  JSON

绝不触碰 blocklist（详见工具约束 promptInjections 第 2 条）。
```

**降级路径**：如果本地环境或用户设置 `FORGE_NO_PARALLEL=1`，跳过并行派发，走原 Step 3+4 串行流程。此时不消耗 subagent 预算。

#### Step 2.5.3：Gather + 校验（关键红线）

所有 subagent 返回后，主 skill 执行：

```bash
# 1. 校验每份 receipt（schema）
for id in $(ls .loop/prototype/subagent-receipts/pfb-*.json | xargs -n1 basename | sed 's/.json//'); do
  node scripts/lib/forge-state.mjs validate ".loop/prototype/subagent-receipts/${id}.json" --schema subagent-receipt || echo "FAIL: $id"
done

# 2. Disjoint-set 校验 —— 每份 receipt.filesWritten 合并后不能有交集
# 3. Blocklist 校验 —— filesWritten 里不能出现:
#    - mocks/handlers/index.ts
#    - mocks/fixtures/index.ts
#    - .loop/api-contracts.json
#    - src/stories/<project>/_shared/**
#    - .storybook/**
#    - src/app/**
#    - src/components/ui/**
```

用 jq 一次性做 disjoint-set + blocklist 检查：

```bash
BLOCKLIST='mocks/handlers/index.ts mocks/fixtures/index.ts .loop/api-contracts.json'
ALL_FILES=$(jq -s '[.[] | .filesWritten[]]' .loop/prototype/subagent-receipts/pfb-*.json)

# 检查重复（disjoint 违规）
echo "$ALL_FILES" | jq -r '.[]' | sort | uniq -d | while read dup; do
  echo "❌ Disjoint violation: $dup written by multiple subagents"
done

# 检查 blocklist
for bad in $BLOCKLIST; do
  echo "$ALL_FILES" | jq -e --arg b "$bad" 'index($b) != null' > /dev/null && \
    echo "❌ Blocklist violation: $bad"
done

# 额外：正则 blocklist
echo "$ALL_FILES" | jq -r '.[]' | grep -E '(_shared/|\.storybook/|src/app/|src/components/ui/)' && \
  echo "❌ Blocklist regex violation"
```

**任一违规**：
1. 记 `subagent.failed` event，payload 包含违规 subagent id + 违规文件
2. 该 feature 视为失败，走**降级**：主 skill 自己接手 Step 3+4 串行分支为该 feature 补做
3. 若整批多个失败 → `AskUserQuestion` 让用户选择「全部串行重跑 / 只重跑失败的 / 中断」

**全部通过**后：

```bash
# 4. 主 skill 独占写入 barrel（subagent 不允许写这个文件）
# 从每份 receipt 的 filesWritten 提取 handler 文件，生成 index.ts
cat > mocks/handlers/index.ts <<EOF
import { authHandlers } from './auth'
import { userListHandlers } from './user-list'
// ... 每 feature 一行 import
export const handlers = [
  ...authHandlers,
  ...userListHandlers,
  // ...
]
EOF

# 5. 主 skill 独占写入 stories-manifest.md（Step 6 的产物）
# 见下方 Step 6 模板；本步只是提前把 fan-out 结果聚合进去

# 6. 写 subagent.return event（每个成功的 subagent 一条）
for id in ...; do
  node scripts/lib/forge-events.mjs append --kind subagent.return --phase prototype --step step.2.5 \
    --payload "{\"id\":\"${id}\",\"status\":\"success\",\"batch\":\"proto-fan-1\"}"
done

# 7. 记录本轮 parallelWidth（gather 完成时算平均，只有一批的话就是 batch 大小）
# Step 10 更新 session.json 时写入 phases.prototype.parallelWidth
```

**并行完成后**：Step 3、Step 4 的文件生成工作已经在 subagent 里完成，主 skill **跳过 Step 3、Step 4 的代码生成**，直接进入 Step 5（Storybook 配置验证）和 Step 6（输出 manifest）。

---

### Step 3：生成 MSW Handlers

> **降级分支**：若 Step 2.5 已完成并行 fan-out（features ≥ 2 且未设 `FORGE_NO_PARALLEL=1`），handlers 已由各 subagent 产出，**跳过本步**（但 barrel `mocks/handlers/index.ts` 由主 skill 在 Step 2.5.3 gather 阶段独占写入）。仅当 features 只有 1 个 或用户显式 `FORGE_NO_PARALLEL=1` 或 Step 2.5 整批失败降级 时走本串行分支。

基于 **`.loop/api-contracts.json`** 的 `endpoints[]` 生成 MSW handlers（如不存在则从 PRD Section 7 降级解析）。

**目录结构**（fixtures 与 handlers 分离）：

```
mocks/
├── handlers/
│   ├── index.ts           # 合并所有 handlers
│   └── <feature>.ts       # 按功能分组的 handlers（只写请求逻辑，不含数据常量）
└── fixtures/
    └── <feature>.ts       # Mock 数据常量（被 handlers 和 stories 共同引用）
```

> **关键约定**：handlers 和 stories 都从 `mocks/fixtures/<feature>.ts` 读取 mock 数据，不在各自文件里重复定义。后续 dev 阶段用真实 API 替换时，只需修改 handlers，fixtures 可复用为测试 seed data。

**Fixtures 模板**（`mocks/fixtures/<feature>.ts`）：

```typescript
// 基于 PRD 用户故事生成合理的 mock 数据
// 规则：5-8 条，含 1 个边界场景，真实中文人名，日期在最近 3 个月内

export interface <Feature>Item {
  id: string
  // ... 字段来自 PRD API 契约
  createdAt: string
}

// 命名导出，方便 story 按需引用
export const <FEATURE>_LIST: <Feature>Item[] = [
  {
    id: '1',
    name: '张三',          // 真实中文人名
    status: 'active',
    createdAt: '2026-04-15T10:30:00Z', // 最近 3 个月内
  },
  {
    id: '2',
    name: '李四',
    status: 'pending',
    createdAt: '2026-05-02T14:20:00Z',
  },
  // 5-8 条，含 1 个边界场景（超长名称/空值/异常状态）
  {
    id: '6',
    name: '',              // ← 边界：空名称
    status: 'error',
    createdAt: '2026-06-01T08:00:00Z',
  },
]

export const <FEATURE>_EMPTY: <Feature>Item[] = []
```

**Handler 模板**（`mocks/handlers/<feature>.ts`，遵循统一信封 `{status_code, data, message?}`）：

```typescript
import { http, HttpResponse, delay } from 'msw'
import { <FEATURE>_LIST } from '../fixtures/<feature>'

// 与 src/lib/api-response.ts 的 ApiResponse<T> 信封保持一致
export const <feature>Handlers = [
  // GET /api/<resource> — 列表查询（分页）
  http.get('/api/<resource>', async () => {
    await delay(300)
    return HttpResponse.json({
      status_code: 0,
      data: {
        list: <FEATURE>_LIST,
        total: <FEATURE>_LIST.length,
        page: 1,
        page_size: 10,
      },
    })
  }),

  // GET /api/<resource>/:id — 详情查询
  http.get('/api/<resource>/:id', async ({ params }) => {
    await delay(200)
    const item = <FEATURE>_LIST.find(d => d.id === params.id)
    if (!item) {
      return HttpResponse.json(
        { status_code: 404, message: 'Not found', data: null },
        { status: 404 }
      )
    }
    return HttpResponse.json({ status_code: 0, data: item })
  }),

  // POST /api/<resource> — 创建
  http.post('/api/<resource>', async ({ request }) => {
    await delay(300)
    const body = await request.json() as Record<string, unknown>
    if (!body.<requiredField>) {
      return HttpResponse.json(
        { status_code: 400, message: '<requiredField> is required', data: null },
        { status: 400 }
      )
    }
    return HttpResponse.json(
      { status_code: 0, data: { id: 'new-id', ...body, createdAt: new Date().toISOString() } },
      { status: 201 }
    )
  }),

  // PUT /api/<resource>/:id — 更新
  http.put('/api/<resource>/:id', async ({ params, request }) => {
    await delay(300)
    const body = await request.json()
    return HttpResponse.json({
      status_code: 0,
      data: { id: params.id, ...body, updatedAt: new Date().toISOString() },
    })
  }),

  // DELETE /api/<resource>/:id — 删除
  http.delete('/api/<resource>/:id', async () => {
    await delay(200)
    return new HttpResponse(null, { status: 204 })
  }),
]
```

**合并 Handlers**（`mocks/handlers/index.ts`）：

```typescript
import { <feature>Handlers } from './<feature>'

export const handlers = [
  ...<feature>Handlers,
]
```

---

### Step 4：生成 Storybook Stories

> **降级分支**：同 Step 3 —— 若 Step 2.5 已完成并行 fan-out，stories 已由 subagent 产出，**跳过本步**。仅串行分支或 Step 2.5 整批降级 时执行。

**目录结构**（三层架构，参见「原型约定」）：

```
src/stories/<project-slug>/
├── _shared/
│   ├── theme.css           # L2 · 项目主题覆写（oklch 色值）
│   └── <SharedShell>.tsx   # L2 · 项目级复用组件（AppLayout 等，可选）
├── <feature>.stories.tsx   # L3 · 功能页面原型
└── <feature>.fixtures.ts   # L3 · 功能页面专属 mock 数据常量
```

> 文件名用 latin slug（`auth.stories.tsx`），story title 用中文显示名（`'project / 登录 & 认证'`）。

**Story 模板**（含 MSW + fixtures + theme scope）：

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { expect, userEvent, within } from '@storybook/test'
import { http, HttpResponse } from 'msw'
// L1 · 原子组件（来自 shadcn/ui，不自己写）
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
// Mock 数据从 fixtures 引入，不在 story 文件里写常量
import { BRAND, DEFAULT_FORM } from './<feature>.fixtures'
// L2 · 引入项目主题（必须）
import './_shared/theme.css'

// ─── 页面组件 ────────────────────────────────────────────
// 所有 mock 数据从 ./<feature>.fixtures 引入，不在此文件里写常量

function Showcase() {
  // ... 页面逻辑，组合 L1 原子 + L2 共享组件
  return (
    // 最外层包 theme scope，主题才生效
    <div className={cn('theme-<project>', 'flex min-h-screen items-center justify-center bg-muted/40')}>
      <Card className="w-full max-w-sm">
        {/* ... */}
      </Card>
    </div>
  )
}

// ─── Storybook 元信息 ────────────────────────────────────
// title 格式：'<project-slug> / <中文显示名>'

const meta = {
  title: '<project-slug> / <中文显示名>',
  component: Showcase,
  parameters: {
    layout: 'fullscreen',    // 页面级用 fullscreen，组件级用 centered
    msw: { handlers: [] },   // 按需覆盖 handlers
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Showcase>

export default meta
type Story = StoryObj<typeof meta>

// 默认版本：原地迭代（类似 Figma），需要 A/B 对比时才开 v2
export const v1: Story = {
  tags: ['draft'],           // draft → 开发中; published → 已定稿
}
```

**Fixtures 文件模板**（`src/stories/<project-slug>/<feature>.fixtures.ts`）：

```typescript
// 与 mock 层 fixtures 同理：命名导出，5-8 条，含 1 个边界场景
// 这里放 story 专属的展示常量（品牌名、默认表单状态等）

export const BRAND = {
  productName: '<产品名称>',
  tagline: '<一句话标语>',
}

export const DEFAULT_FORM = {
  email: '',
  password: '',
  remember: true,
}
```

**项目主题文件**（`src/stories/<project-slug>/_shared/theme.css`）：

每个项目有独立主题覆写，只改想改的 token，其余继承全局。

```css
/* src/stories/<project-slug>/_shared/theme.css */
/* 只覆写项目特有 token，其余继承 src/app/globals.css */

.theme-<project> {
  /* 品牌主色（用 oklch，转换：npx -y culori oklch "#2563EB"） */
  --primary: oklch(0.55 0.22 263);
  --primary-foreground: oklch(0.98 0 0);
  --ring: oklch(0.55 0.22 263);

  /* 只改这几个就够，其他 token 全部继承全局 */
}

/* 暗色模式覆写（可选） */
.theme-<project>.dark {
  --primary: oklch(0.65 0.20 263);
}
```

> **不可修改** `src/app/globals.css`（全局），避免影响其他项目 story。所有项目特有样式只在 `theme.css` 覆写。

---

### Step 5：配置 Storybook MSW 集成

**模板已自带** `.storybook/preview.ts` 配置（`mswLoader` + `withThemeByClassName` + `visualFeedbackDecorator`），通常不需要改。

如果发现 MSW handler 未生效：

1. 确认 `mocks/handlers/index.ts` 已 `export const handlers = [...]`
2. 确认 story 的 `parameters.msw.handlers` 引用了对应 handler
3. 重启 Storybook（首次启动 worker 注册可能需要刷新）

> MSW Storybook Addon (`msw-storybook-addon@^2`) 会自动从 story 的 `parameters.msw.handlers` 加载 handlers，无需手动写 decorator。

---

### Step 6：验证 + 输出 Manifest

**启动 Storybook 验证**：

```bash
npm run storybook
```

在浏览器中检查：
- 所有 stories 能正常渲染
- MSW handlers 正常拦截 API 请求
- 交互流程（play functions）能走通
- 空状态、加载状态、错误状态都正确展示

**输出 Stories Manifest** 到 `.loop/prototype/stories-manifest.md`：

```markdown
# Stories Manifest: <功能名称>

> 生成时间：YYYY-MM-DD
> 需求来源：自然语言输入 / .loop/prd.md（若存在）
> 项目 slug：<project-slug>

## 文件清单

### L3 · 功能层（stories + fixtures）

| Story 文件 | Fixtures 文件 | Story Title | 默认版本 |
|-----------|--------------|-------------|---------|
| src/stories/<project-slug>/<feature>.stories.tsx | src/stories/<project-slug>/<feature>.fixtures.ts | '<project-slug> / <中文显示名>' | v1 (draft) |

### L2 · 共享层

| 文件 | 说明 |
|------|------|
| src/stories/<project-slug>/_shared/theme.css | 项目主题覆写（oklch） |

### Mock 层

| 文件 | 说明 |
|------|------|
| mocks/fixtures/<feature>.ts | Mock 数据常量（被 handlers 和 stories 共同引用） |
| mocks/handlers/<feature>.ts | MSW request handlers |
| mocks/handlers/index.ts | handlers 合并入口 |

## MSW Handlers

| Handler | 文件 | Mock 数据来源 |
|---------|------|-------------|
| GET /api/<resource> | mocks/handlers/<feature>.ts | mocks/fixtures/<feature>.ts |
| POST /api/<resource> | mocks/handlers/<feature>.ts | — |
| PUT /api/<resource>/:id | mocks/handlers/<feature>.ts | — |
| DELETE /api/<resource>/:id | mocks/handlers/<feature>.ts | — |

## 交互流程

1. **创建流程** (v1 story, play function)
   - 点击"新建" → 弹窗表单 → 填写 → 提交 → 列表刷新
2. **编辑流程** (v1 story, play function)
   - 点击"编辑" → 弹窗表单（预填） → 修改 → 提交 → 列表刷新
3. **删除流程** (v1 story, play function)
   - 点击"删除" → 确认弹窗 → 确认 → 列表刷新

## 主题 Token 覆写

| Token | 值（oklch） | 说明 |
|-------|-----------|------|
| --primary | oklch(...) | 品牌主色 |
| --ring | oklch(...) | 与 primary 保持一致 |

## 标注迭代历史

> 由 Step 7 visual-feedback 循环填充

| 轮次 | 时间 | 标注数 | 修改文件 | 用户备注 |
|------|------|--------|---------|---------|
| 0 | YYYY-MM-DD | — | 初始生成 | — |
```

---

### Step 7：Visual Feedback 标注迭代循环

**这是原型阶段的核心环节** — 用户在浏览器里点和标注，AI 解析并迭代，直到定稿。

**跳过条件**：如果调用方传入 `--skip-feedback`，直接跳到 Step 8，并在 stories-manifest 标注迭代历史中记录「已跳过」。否则按下面流程走。

**内置标注工具**（项目模板默认集成，零安装）：

模板里 `_storybook/visual-feedback/` 包含：
- `server.cjs` — 零依赖 Node HTTP 服务，监听 `localhost:6007`
- `overlay.tsx` — Storybook decorator，注入悬浮按钮 + 元素选择 + 反馈输入框

`npm run storybook` 会同时启动两者（通过 `concurrently`），用户在 Storybook 页面右下角看到「📌 标注反馈」按钮即可使用。

**首次提示**（仅当用户首次进入循环时显示完整说明）：

```
🎨 原型初版已生成 → 进入可视化标注迭代
──────────────────────────────
Storybook 地址：http://localhost:6006

📌 标注工具：项目内置（无需安装任何扩展）

使用流程：
   1. 在 Storybook 页面，点右下角「📌 标注反馈」按钮（或按 Ctrl+Shift+D）
   2. 鼠标悬停看红框高亮 → 点击想改的元素
   3. 在弹出的输入框写反馈，按"保存"
   4. 反馈自动写入 .loop/annotations/<时间戳>.json
   5. 全部标注完后，告诉我「迭代」或「处理标注」
   6. 如果原型已经满意，直接说"定稿"

等待你的标注或定稿确认...
```

**触发迭代的方式**（按优先级）：

1. **自动轮询模式**：每次用户消息进来时先 `ls .loop/annotations/*.json`，有未处理的就开始迭代
2. **用户主动触发**：用户说"迭代" / "处理标注" / "看看我标的这些"
3. **降级到 Markdown 粘贴**：如果用户没用内置工具（或服务挂了），用户可以贴老格式 Markdown，仍能解析

**循环规则**：

每次启动迭代时，执行：

1. **读取 .loop/annotations/** — 列出所有 JSON 文件，按时间排序：

   ```bash
   ls -1 .loop/annotations/*.json 2>/dev/null
   ```

2. **解析每条标注** — JSON 字段：
   ```json
   {
     "id": "vf-...",
     "createdAt": "2026-06-29T...",
     "storyId": "octopush-login-auth--v1",
     "storyTitle": "octopush / 登录 & 认证",
     "url": "http://localhost:6006/?path=...",
     "element": {
       "selector": "div.hero > h1.title",
       "tag": "h1",
       "classes": ["title"],
       "text": "Welcome",
       "computedStyles": {"color": "...", "font-size": "..."},
       "rect": {"x": 100, "y": 200, "width": 800, "height": 48}
     },
     "feedback": "字体改大到 48px，加粗，颜色改深蓝"
   }
   ```

3. **定位源文件** — 根据 `storyId` 反查到 `.stories.tsx` 文件：
   - storyId 格式：`<kebab-title>--<story-name>`，如 `octopush-login-auth--v1` 对应 `src/stories/octopush/auth.stories.tsx` 的 `v1`
   - 是动数据（改 `.fixtures.ts`）还是动样式（改 story 或 `theme.css`）？
   - 是动交互（改 play function 或 MSW handler）？

4. **批量修改** — 对每条标注做最小修改：
   - 样式调整 → 改 className / theme token
   - 文案调整 → 改 fixtures
   - 结构调整 → 改 story 组件
   - 数据契约调整 → 同步改 `.loop/api-contracts.json` + handler + fixtures

5. **归档已处理标注** — 调用 `POST http://localhost:6007/clear` 把 `.loop/annotations/*.json` 移动到 `.loop/annotations-archive/<ts>/`，避免下轮重复处理（若服务未运行则手动 `mv`）

6. **输出本轮变更摘要**：

```
✏️ 第 <N> 轮标注迭代完成
──────────────────────────────
处理标注：<N> 条
修改文件：
  - src/stories/<project>/<feature>.stories.tsx（样式 + 结构）
  - src/stories/<project>/<feature>.fixtures.ts（文案）
  - mocks/handlers/<feature>.ts（新增 PATCH 端点）

已归档到 .loop/annotations-archive/<ts>/

请刷新 http://localhost:6006 复看。继续标注或说"定稿"。
```

7. **追加到 stories-manifest.md 的「标注迭代历史」表**。

**退出条件**（满足任一即退出循环）：

- 用户明确说："定稿" / "OK" / "原型可以了" / "进入开发"
- 用户连续 2 轮都说"没问题"
- 用户主动跳过：`/dev-loop ... --skip-feedback`

**不退出的情况**：

- `.loop/annotations/` 还有未处理标注 → 继续迭代
- 用户继续标注 → 继续迭代
- 用户提了模糊反馈（"再优化一下"）→ 用 `AskUserQuestion` 具体问改哪里

---

### Step 8：反推验收清单

定稿后，基于最终原型反推「验收清单」写入 `.loop/acceptance-checklist.md`：

```markdown
# 验收清单

> 生成时间：YYYY-MM-DD
> 来源：原型定稿（标注迭代 <N> 轮）
> 项目 slug：<project-slug>

## 页面与交互

- [ ] **AC-001** [<页面名>] 页面正确渲染，对应 Story：`src/stories/<project>/<feature>.stories.tsx` v1
- [ ] **AC-002** 点击"新建"打开表单弹窗，必填字段未填时禁用提交
- [ ] **AC-003** 提交成功后列表刷新，显示新条目
- [ ] **AC-004** 删除前弹确认对话框，确认后从列表移除
- [ ] **AC-005** 空状态显示空提示组件（参考 Story Empty 变体）

## 数据契约（与 .loop/api-contracts.json 对齐）

- [ ] **AC-101** `GET /api/<resource>` 返回 `{ list, total, page, page_size }`
- [ ] **AC-102** `POST /api/<resource>` 校验 `name` 必填，返回 400 时显示错误消息
- [ ] **AC-103** `PUT /api/<resource>/:id` 支持部分更新
- [ ] **AC-104** `DELETE /api/<resource>/:id` 返回 204

## 视觉规格

- [ ] **AC-201** 主色 `--primary` 为 oklch(<...>)，与原型一致
- [ ] **AC-202** 卡片圆角 / 间距 / 阴影按 Story v1 实现
- [ ] **AC-203** 加载状态使用 skeleton，不显示文字 "Loading..."

## 边界场景

- [ ] **AC-301** 列表为空时显示空状态组件
- [ ] **AC-302** 网络错误时显示错误状态 + 重试按钮
- [ ] **AC-303** 表单字段超长时正确换行/截断

## 不在范围内（明确不做）

- ❌ 多语言切换（v1 仅中文）
- ❌ 暗色模式（v1 仅亮色）
- ❌ 移动端适配（v1 桌面优先）
```

**编写规则**：

- 每条验收项格式：`[ ] AC-<编号> [可选模块] <可测试的具体行为>`
- 编号分段：`001-099` 页面交互，`101-199` 数据契约，`201-299` 视觉，`301-399` 边界，`401+` 其他
- **避免抽象描述**（如"用户体验良好"），必须可测可观察
- **明确"不做"清单** — 防止开发阶段过度扩展

---

### Step 9：用户确认

向用户展示原型概要：

```
🎨 原型定稿
──────────────────────────────
组件：<N> 个
Stories：<N> 个（含 <N> 个交互原型）
MSW Handlers：<N> 个
标注迭代：<N> 轮（处理标注 <N> 条）
Storybook 地址：http://localhost:6006

已输出：
  - .loop/prototype/stories-manifest.md
  - .loop/acceptance-checklist.md（<N> 条验收项）
  - .loop/api-contracts.json
```

用 `AskUserQuestion` 询问：
- **确认，开始开发**：原型定稿，进入 Phase 2
- **继续迭代**：还有想改的地方，回到 Step 7
- **补充验收项**：手动添加 AC 条目

---

### Step 9.5：产出可分享的静态原型

用户确认定稿后，构建一份**可脱离 Storybook dev server 运行**的静态产物，方便分享/回看：

```bash
# 输出到 .loop/prototype/static/，避免污染项目根
npm run build-storybook -- -o .loop/prototype/static
```

产物是一个静态站点，包含所有 stories + 打包好的 MSW worker。由于 Service Worker 不能在 `file://` 下注册（MSW 拦截会失效），必须用本地 HTTP server 打开。**同时写一份 `.loop/prototype/static/README.md`**，把启动方式和注意事项写清楚：

````markdown
# 原型静态产物

> 生成时间：<ISO timestamp>
> 项目 slug：<project-slug>
> 标注迭代：<N> 轮

## 打开方式

**推荐**（保留完整 MSW mock 交互）：

```bash
cd .loop/prototype/static
npx serve .
# 浏览器打开提示的地址（通常是 http://localhost:3000）
```

或用任意本地 HTTP server：`python3 -m http.server 8000` / `npx http-server`。

## 为什么不能双击打开 index.html

MSW 用 Service Worker 拦截 API 请求，Service Worker **只能在 http/https 协议下注册**，`file://` 会导致 mock 失效——页面能渲染但登录/列表等接口调用会 404。

## Stories 入口

- 顶层：`/index.html`
- 单个 story 深链：`/index.html?path=/story/<project-slug>-<feature>--v1`

## 想改怎么办

这是**只读快照**。要修改请回到项目根，编辑 `src/stories/<project-slug>/*.stories.tsx`，然后：

```bash
npm run storybook                      # 本地开发
npm run build-storybook -- -o .loop/prototype/static  # 重新出静态包
```
````

构建失败时的处理：

- Storybook 构建报错 → 定位报错的 story 文件，修复后重试；不要跳过本步
- 磁盘空间不足 / 超时 → 告知用户构建耗时和产物大小（典型 30-80MB），询问是否继续
- 用户不需要静态产物 → `AskUserQuestion` 允许跳过，Step 10 的 `artifacts.staticPrototype` 记为 `null`

完成后写 `note` event：

```bash
node scripts/lib/forge-events.mjs append --kind note --phase prototype --step step.9.5 \
  --payload '{"action":"build-storybook","output":".loop/prototype/static"}'
```

---

### Step 10：更新 session.json

确认通过后，更新 `.loop/session.json`：

```json
{
  "currentPhase": "dev",
  "phases": {
    "prototype": {
      "status": "completed",
      "completedAt": "<ISO timestamp>",
      "feedbackRounds": <N>,
      "enhancers": ["shadcn-form-patterns", "..."],
      "parallelWidth": <N>
    }
  },
  "artifacts": {
    "acceptanceChecklist": ".loop/acceptance-checklist.md",
    "storiesManifest": ".loop/prototype/stories-manifest.md",
    "apiContracts": ".loop/api-contracts.json",
    "prd": ".loop/prd.md",
    "staticPrototype": ".loop/prototype/static"
  }
}
```

> `phases.prototype.enhancers` 记录本轮启用的增强 skill `name` 列表（来自 Step 0 扫描结果，不含 `_` 开头的占位文件）。
> `phases.prototype.parallelWidth` 记录 Step 2.5 fan-out 的实际并行宽度（batch 内 subagent 数量）。单 feature 或 `FORGE_NO_PARALLEL=1` 降级到串行时写 `0`。下游 phase 不依赖此字段，仅供审计/排查/性能观测。

---

## 红线（不可违反）

1. **只使用 shadcn/ui 组件** — 原子组件不自己写，从 shadcn 安装；不在原型里手写 `<button>` / `<input>`
2. **MSW Handlers 必须与 `.loop/api-contracts.json` 一致** — 字段名、类型、错误码同步更新
3. **每个组件至少 3 个 Stories** — Default + Empty/Loading + Error
4. **交互原型必须可运行** — play function 里的每步都要验证
5. **生成代码后必须启动 Storybook 验证** — 不验证就交付是违规的
6. **必须进入标注迭代循环** — 一次生成就交付是违规的，除非用户明确说"无需迭代"
7. **Stories Manifest 必须写入 `.loop/prototype/`** — 下游 dev 阶段依赖
8. **验收清单必须写入 `.loop/acceptance-checklist.md`** — 是 dev 阶段的核心输入
9. **Mock 数据必须放 fixtures 文件** — `.fixtures.ts` 或 `mocks/fixtures/`，不在 `.stories.tsx` 或 handler 里写死数据常量
10. **全局 `src/app/globals.css` 不可修改** — 项目主题覆写只在 `src/stories/<project>/_shared/theme.css`
11. **Story title 格式固定** — `'<project-slug> / <中文显示名>'`，文件路径用 latin slug
12. **showcase 必须包 theme scope** — `<div className="theme-<project> ...">` 让主题生效
13. **className 合并必须用 cn()** — 不直接拼接字符串，避免 Tailwind 冲突
14. **标注引发的契约变更必须同步** — 改 fixtures 时同步改 `.loop/api-contracts.json` 和 handler，避免三者漂移
15. **布局禁止固定 px 列宽与 100vh 计算** — 详见「布局自适应规范」。多栏页面必须用 `minmax(0,1fr)` + 响应式断点；高度用 `min-h-screen` 或 `100dvh`，不用 `calc(100vh-...)`
16. **必须加载并遵守 `.claude/enhancers/proto/*.md`** — Step 0 扫描的所有增强 skill（`_` 开头的占位除外）都要 Read 进上下文，后续每一步生成代码前回顾，冲突按 `priority` 排序
17. **Step 2.5 gather 阶段必须做 disjoint-set + blocklist 校验** — 任何 subagent 写了不该写的文件（重复写 / blocklist 命中）视为失败，走降级路径（主 skill 串行重跑该 feature），不静默接受
18. **`mocks/handlers/index.ts` / `mocks/fixtures/index.ts` / `.loop/api-contracts.json` / `_shared/**` / `.storybook/**` / `src/app/**` / `src/components/ui/**` 只由主 skill 写** — Step 2.5 派发的 subagent 触碰任一即判失败
19. **Step 2.5 不使用 worktree** — 与 dev-dev 不同，proto-feature-builder 直接在主 worktree 写文件；隔离靠 disjoint-set + blocklist 校验，不靠 git 沙箱（详见 `PHASE_CONTRACT.md` §6 rule 13）
20. **定稿后必须产出静态原型包** — Step 9.5 执行 `npm run build-storybook -- -o .loop/prototype/static` + 写 README；构建失败不允许跳过（除非用户显式说不需要）。README 必须写清「不能双击 file:// 打开，需用 `npx serve`」的原因

---

## 特殊情况处理

| 情况 | 处理方式 |
|------|---------|
| Storybook 未安装 | 自动安装 + 配置，告知用户 |
| shadcn 未安装 | 自动安装 + 初始化，告知用户 |
| 用户没装 visual-feedback-extension | 不需要装！项目模板已内置标注工具，启动 `npm run storybook` 即可。仅老项目或服务挂了时降级到 Chrome 扩展 |
| 标注 server 启动失败（端口占用） | 让用户用 `VF_PORT=6017 npm run storybook:vf-server` 换端口，或单独启动 storybook + 用对话方式收集反馈 |
| `.loop/annotations/` 里的 JSON 解析失败 | 报告具体文件名，让用户在 Storybook 上重标注；坏文件移到 `.loop/annotations-broken/` |
| 用户贴了参考图 base64 | 用 `Read` 把 base64 解析为图片查看，再决定如何修改 |
| 用户连续标注未定稿超过 10 轮 | 主动询问是否需要重新审视需求边界 |
| 标注涉及未生成的组件 | 当作新需求处理，按 Step 2 原型计划补生成新 Story |
| 用户只是讨论原型方向，未真正标注 | 用 `AskUserQuestion` 确认是否继续生成；不要无标注空转 |
| 组件数量过多（>10） | 建议分批次生成，先核心后扩展 |
| 用户提供了设计稿 | 可选调用 `/design-to-code` 生成更精确的 UI |
| MSW 版本冲突 | 使用 `msw@^2` + `msw-storybook-addon@^2`，确保兼容 |
| 用户给了 hex 色值，需要转 oklch | `npx -y culori oklch "#hex"` 转换，再写入 `theme.css` |
| 需求涉及多个项目/模块 | 每个项目独立 `_shared/` + `theme.css`，story 目录用各自 slug 区分 |
| 已有 `_shared/` 但无 `theme.css` | 先创建空的 `theme.css`（只有 `.theme-<project> {}`），按需填 token |
| 用户要求加动画效果 | 用 Tailwind `animate-*` + CSS transitions，不引入 framer-motion |

---

## 附录 A：Storybook 配置参考

模板已自带 v10 配置，不要重新生成：

- `.storybook/main.ts` — `@storybook/nextjs-vite` 框架 + a11y/themes/docs addon
- `.storybook/preview.ts` — `mswLoader` + `withThemeByClassName` + `visualFeedbackDecorator`
- `.storybook/visual-feedback/` — 内置标注工具（server.cjs + overlay.tsx）

如需在非 ai-forge 项目复现，依赖锁：`@storybook/nextjs-vite@^10`、`storybook@^10`、`msw@^2`、`msw-storybook-addon@^2`。框架由 v8 升 v10 时**必须**把 `@storybook/nextjs` 换成 `@storybook/nextjs-vite`，否则 vite-based 配置无法工作。
