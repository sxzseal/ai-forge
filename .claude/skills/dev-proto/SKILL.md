---
name: dev-proto
description: 从 PRD 生成 Storybook 可交互原型，使用 shadcn/ui 组件库 + MSW 模拟后端。触发词："做原型"、"生成 Storybook"、"dev-proto"、"原型开发"、"生成原型"。读取 .loop/prd.md 生成可交互的 Storybook stories。
---

# Dev Proto — Storybook 原型生成器

## 何时启用

用户说出以下任意表达时立即激活：

- 「做原型」「生成原型」「原型开发」
- 「生成 Storybook」「做 Storybook」
- 「dev-proto」
- 被 `/dev-loop` 作为 Phase 2 调用

**前置条件**：

- `.loop/prd.md` 必须存在且状态为「待确认」或「已确认」
- 如果 PRD 不存在，提示用户先执行 `/dev-prd`

**不启用**：

- PRD 还没确认（提醒用户先完成 dev-prd）
- 用户只是讨论原型，没要求生成

---

## 项目上下文

- **组件库**：shadcn/ui（`src/components/ui/`）
- **Storybook**：`@storybook/nextjs`（`.storybook/`）
- **Mock 层**：MSW (Mock Service Worker)（`mocks/`）
- **故事文件**：`src/stories/<feature>/`
- **状态目录**：`.loop/`

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

### Step 0：环境检查 + PRD 解析

**检查前置条件**：

```bash
# 检查 PRD 存在
cat .loop/prd.md | head -5

# 检查 Storybook 是否已安装
ls .storybook/main.ts 2>/dev/null || echo "STORYBOOK_NOT_INSTALLED"

# 检查 shadcn 组件库
ls src/components/ui/ 2>/dev/null || echo "SHADCN_NOT_INSTALLED"
```

**如果 Storybook 未安装**，执行安装（注意使用 `--yes` 跳过交互式提示）：

```bash
npx --yes storybook@latest init
```

安装后配置 `.storybook/main.ts` 和 `.storybook/preview.ts`（见附录 A）。

**如果 shadcn 未安装**，执行初始化：

```bash
npx shadcn@latest init
```

**解析 PRD**，提取以下关键信息：

| 提取内容 | 来源 | 用途 |
|----------|------|------|
| 用户故事 | `.loop/prd.md` Section 4 | 确定需要哪些组件和交互 |
| 功能需求 | `.loop/prd.md` Section 5 | 确定组件功能边界 |
| **API 契约** | **`.loop/api-contracts.json`**（优先）或 `.loop/prd.md` Section 7（降级） | 生成 MSW handlers |
| UI 规格 | `.loop/prd.md` Section 8 | 确定页面结构和组件拆分 |
| 组件拆分表 | `.loop/prd.md` Section 8 | 确定要创建的组件列表 |

**读取 API 契约 JSON**：

```bash
# 优先读取机器可读格式
cat .loop/api-contracts.json 2>/dev/null || echo "NO_API_CONTRACTS_JSON"
```

如果 `.loop/api-contracts.json` 不存在，从 PRD Section 7 手动解析（降级路径），并在完成后**补生成** `.loop/api-contracts.json`（格式参考 dev-prd Step 2.5）。

---

### Step 1：API 契约对齐审计 + 组件审计

**API 契约对齐**（必须先于组件审计）：

读取 `.loop/api-contracts.json` 的 `endpoints[]`，与 PRD Section 7 逐一比对，确认：
- 每个 PRD 中的端点都有对应的 JSON 条目
- 字段名、类型、required 标记一致
- 错误码完整

输出对齐表（写入 stories-manifest.md 的「API 契约对齐表」章节）：

```
API 契约对齐检查
──────────────────────────────
PRD 端点数：<N> | JSON 端点数：<N> | 对齐状态：✅ / ⚠️ 有差异

| 端点 | PRD 状态 | JSON 状态 | 差异说明 |
|------|---------|----------|---------|
| GET /api/teams | ✅ 存在 | ✅ 存在 | — |
| POST /api/teams | ✅ 存在 | ✅ 存在 | — |
| DELETE /api/teams/:id | ✅ 存在 | ❌ 缺失 | JSON 未包含此端点 |
```

如果对齐检查发现差异，**立即提示用户**，在修复后再继续生成 handlers。

**扫描已有 shadcn 组件**：

```bash
ls src/components/ui/
```

**对比 PRD 需要的 shadcn 组件**，列出需要新增的：

| PRD 需要的组件 | 状态 | 安装命令 |
|---------------|------|---------|
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

**Handler 模板**（`mocks/handlers/<feature>.ts`）：

```typescript
import { http, HttpResponse, delay } from 'msw'
import { <FEATURE>_LIST } from '../../fixtures/<feature>'

// 从 .loop/prd.md Section 7 的 API 契约自动生成
export const <feature>Handlers = [
  // GET /api/<resource> — 列表查询
  http.get('/api/<resource>', async () => {
    await delay(300) // 模拟网络延迟
    return HttpResponse.json({
      data: <FEATURE>_LIST,
      pagination: { total: <FEATURE>_LIST.length, page: 1, pageSize: 10 },
    })
  }),

  // GET /api/<resource>/:id — 详情查询
  http.get('/api/<resource>/:id', async ({ params }) => {
    await delay(200)
    const item = <FEATURE>_LIST.find(d => d.id === params.id)
    if (!item) {
      return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return HttpResponse.json({ data: item })
  }),

  // POST /api/<resource> — 创建
  http.post('/api/<resource>', async ({ request }) => {
    await delay(300)
    const body = await request.json() as Record<string, unknown>
    if (!body.<requiredField>) {
      return HttpResponse.json(
        { error: '<requiredField> is required' },
        { status: 400 }
      )
    }
    return HttpResponse.json(
      { data: { id: 'new-id', ...body, createdAt: new Date().toISOString() } },
      { status: 201 }
    )
  }),

  // PUT /api/<resource>/:id — 更新
  http.put('/api/<resource>/:id', async ({ params, request }) => {
    await delay(300)
    const body = await request.json()
    return HttpResponse.json({
      data: { id: params.id, ...body, updatedAt: new Date().toISOString() },
    })
  }),

  // DELETE /api/<resource>/:id — 删除
  http.delete('/api/<resource>/:id', async ({ params }) => {
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

**`.storybook/preview.ts`**（确保 MSW decorator）：

```typescript
import type { Preview } from '@storybook/react'
import '../src/app/globals.css'
import { initialize, mswLoader } from 'msw-storybook-addon'

// 初始化 MSW Storybook 集成
initialize()

const preview: Preview = {
  loaders: [mswLoader],
  parameters: {
    controls: { expanded: true },
    layout: 'centered',
  },
}

export default preview
```

> MSW Storybook Addon (`msw-storybook-addon`) 会自动从 story 的 `parameters.msw.handlers` 加载 handlers，无需手动配置 decorator。

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
> 关联 PRD：.loop/prd.md
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

## 与 PRD 映射

| PRD 用户故事 | 对应 Story |
|-------------|-----------|
| US-001 | v1 |
| US-002 | v1（交互变体）|
| US-003 | v1（交互变体）|

## API 契约对齐表

> 对比来源：`.loop/api-contracts.json` vs PRD Section 7
> 对齐状态：✅ 完全对齐 / ⚠️ 有差异

| 端点 | PRD 章节 | JSON 条目 | 字段一致性 | 状态 |
|------|---------|----------|-----------|------|
| GET /api/<resource> | Section 7 | ✅ 存在 | ✅ 一致 | ✅ 对齐 |
| POST /api/<resource> | Section 7 | ✅ 存在 | ✅ 一致 | ✅ 对齐 |
| PUT /api/<resource>/:id | Section 7 | ✅ 存在 | ✅ 一致 | ✅ 对齐 |
| DELETE /api/<resource>/:id | Section 7 | ✅ 存在 | ✅ 一致 | ✅ 对齐 |
```

---

### Step 7：用户确认

向用户展示原型概要：

```
🎨 原型生成完成
──────────────────────────────
组件：<N> 个
Stories：<N> 个（含 <N> 个交互原型）
MSW Handlers：<N> 个
Storybook 地址：http://localhost:6006

已输出：
  - .loop/prototype/stories-manifest.md
```

用 `AskUserQuestion` 询问：
- **确认，开始开发**：原型没问题，进入 Phase 3
- **调整原型**：修改组件或交互
- **加更多 Stories**：补充边界场景

---

### Step 8：更新 session.json

确认通过后，更新 `.loop/session.json`：

```json
{
  "currentPhase": "dev",
  "phases": {
    "prototype": { "status": "completed", "completedAt": "<ISO timestamp>" }
  },
  "artifacts": {
    "prd": ".loop/prd.md",
    "storiesManifest": ".loop/prototype/stories-manifest.md"
  }
}
```

---

## 红线（不可违反）

1. **必须有 PRD 才能开始** — 不读 PRD 直接生成是违规的
2. **只使用 shadcn/ui 组件** — 原子组件不自己写，从 shadcn 安装；不在原型里手写 `<button>` / `<input>`
3. **MSW Handlers 必须与 PRD API 契约一致** — 字段名、类型、错误码
4. **每个组件至少 3 个 Stories** — Default + Empty/Loading + Error
5. **交互原型必须可运行** — play function 里的每步都要验证
6. **生成代码后必须启动 Storybook 验证** — 不验证就交付是违规的
7. **Stories Manifest 必须写入 `.loop/prototype/`** — 下游 dev 阶段依赖
8. **Mock 数据必须放 fixtures 文件** — `.fixtures.ts` 或 `mocks/fixtures/`，不在 `.stories.tsx` 或 handler 里写死数据常量
9. **全局 `src/app/globals.css` 不可修改** — 项目主题覆写只在 `src/stories/<project>/_shared/theme.css`
10. **Story title 格式固定** — `'<project-slug> / <中文显示名>'`，文件路径用 latin slug
11. **showcase 必须包 theme scope** — `<div className="theme-<project> ...">` 让主题生效
12. **className 合并必须用 cn()** — 不直接拼接字符串，避免 Tailwind 冲突

---

## 特殊情况处理

| 情况 | 处理方式 |
|------|---------|
| Storybook 未安装 | 自动安装 + 配置，告知用户 |
| shadcn 未安装 | 自动安装 + 初始化，告知用户 |
| PRD 没有 UI 规格章节 | 基于用户故事推断组件拆分，输出计划让用户确认 |
| PRD 没有 API 契约 | 提示用户补充，或基于功能需求推导 API 设计（需确认） |
| 组件数量过多（>10） | 建议分批次生成，先核心后扩展 |
| 用户提供了设计稿 | 可选调用 `/design-to-code` 生成更精确的 UI |
| MSW 版本冲突 | 使用 `msw@^2` + `msw-storybook-addon@^2`，确保兼容 |
| 用户给了 hex 色值，需要转 oklch | `npx -y culori oklch "#hex"` 转换，再写入 `theme.css` |
| PRD 涉及多个项目/模块 | 每个项目独立 `_shared/` + `theme.css`，story 目录用各自 slug 区分 |
| 已有 `_shared/` 但无 `theme.css` | 先创建空的 `theme.css`（只有 `.theme-<project> {}`），按需填 token |
| 用户要求加动画效果 | 用 Tailwind `animate-*` + CSS transitions，不引入 framer-motion |

---

## 附录 A：Storybook 配置文件模板

### `.storybook/main.ts`

```typescript
import type { StorybookConfig } from '@storybook/nextjs'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
  ],
  framework: {
    name: '@storybook/nextjs',
    options: {},
  },
  staticDirs: ['../public'],
}

export default config
```

### `.storybook/preview.ts`

```typescript
import type { Preview } from '@storybook/react'
import '../src/app/globals.css'
import { initialize, mswLoader } from 'msw-storybook-addon'
import { withThemeByClassName } from '@storybook/addon-themes'

initialize()

const preview: Preview = {
  loaders: [mswLoader],
  parameters: {
    controls: { expanded: true },
    layout: 'centered',
  },
  decorators: [
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
    }),
  ],
}

export default preview
```

### `package.json` 依赖

```json
{
  "devDependencies": {
    "@storybook/nextjs": "^8.x",
    "@storybook/react": "^8.x",
    "@storybook/addon-essentials": "^8.x",
    "@storybook/addon-interactions": "^8.x",
    "@storybook/addon-a11y": "^8.x",
    "@storybook/addon-themes": "^8.x",
    "@storybook/test": "^8.x",
    "msw": "^2.x",
    "msw-storybook-addon": "^2.x",
    "storybook": "^8.x"
  },
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  }
}
```
