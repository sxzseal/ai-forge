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

---

### Step 3：生成 MSW Handlers

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

### Step 10：更新 session.json

确认通过后，更新 `.loop/session.json`：

```json
{
  "currentPhase": "dev",
  "phases": {
    "prototype": {
      "status": "completed",
      "completedAt": "<ISO timestamp>",
      "feedbackRounds": <N>
    }
  },
  "artifacts": {
    "acceptanceChecklist": ".loop/acceptance-checklist.md",
    "storiesManifest": ".loop/prototype/stories-manifest.md",
    "apiContracts": ".loop/api-contracts.json",
    "prd": ".loop/prd.md"
  }
}
```

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
