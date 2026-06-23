---
name: dev-dev
description: 从 PRD 和原型出发，使用 lobster-lead 模式拆解任务、并行派发 subagent 开发、checkpoint 提交。触发词："开始开发"、"dev-dev"、"实现功能"。被 /dev-loop 作为 Phase 3 调用。
---

# Dev Dev — 开发执行器

## 何时启用

用户说出以下任意表达时立即激活：

- 「开始开发」「实现功能」「dev-dev」
- 被 `/dev-loop` 作为 Phase 3 调用

**前置条件**：

- `.loop/prd.md` 存在
- `.loop/prototype/stories-manifest.md` 存在（如果 Phase 2 已完成）

**不启用**：

- PRD 还没确认
- 用户只是讨论实现方案

---

## 开发约定（来自 octopush-web 的实战规范）

以下规范来自真实生产项目 octopush-web，所有 AI 生成代码必须严格遵守。

### Feature Module 结构

每个业务功能独立成一个 feature 模块，放在 `src/features/<domain>/`：

```
src/features/<domain>/
├── MANIFEST.md              # 功能说明（简述职责、边界、依赖）
├── queries.ts               # 类型定义 + queryOptions 工厂（服务端数据读取）
├── mutations.ts             # useMutation hooks（服务端数据写入）
├── views/
│   ├── <feature>.view.tsx   # 页面级组件（.view.tsx 后缀）
│   └── dialogs/             # 弹窗组件（.modal.tsx 后缀）
├── components/              # 功能内的私有组件（可选）
└── <store>.ts               # 功能内的状态管理（可选，如 auth-store.ts）
```

**关键原则**：
- `queries.ts` 同时放类型定义和 query 工厂，不单独拆 `types.ts`
- `mutations.ts` 只放 `useMutation` hooks，不放查询逻辑
- 每个文件职责单一，不混用

### 共享原语（_shared 层）

`src/features/_shared/` 提供可复用的 UI 原语，**任何功能不得重复实现**：

| 目录 | 原语 | 用途 |
|------|------|------|
| `_shared/state/` | `Loading` / `SkeletonList` / `EmptyState` / `ErrorState` | 通用状态展示 |
| `_shared/form/` | `FormField` / `formErrorText()` | 表单字段布局 + 错误提取 |
| `_shared/page/` | `PageHeader` / `SearchToolbar` / `Pagination` | 页面级 UI 骨架 |
| `_shared/table/` | `DataTable` | TanStack Table 封装 |

> **判断标准**：如果一个组件在 2 个以上 feature 里用到，就提到 `_shared/`；如果只在当前 feature 里用，留在 `components/`。

### 文件命名约定

| 文件类型 | 命名规则 | 示例 |
|---------|---------|------|
| 页面视图 | `*.view.tsx` | `team-manage.view.tsx` |
| 弹窗组件 | `*.modal.tsx` | `create-team.modal.tsx` |
| 查询工厂 | `queries.ts` | `features/team-manage/queries.ts` |
| 变更 hooks | `mutations.ts` | `features/team-manage/mutations.ts` |
| 状态管理 | `*-store.ts` | `auth-store.ts` |
| 功能文档 | `MANIFEST.md` | `features/team-manage/MANIFEST.md` |

### 前端代码规范

**数据加载（loader → useSuspenseQuery 模式）**：

路由层预取数据，组件层用 `useSuspenseQuery` 读取：

```tsx
// app/<feature>/page.tsx（Next.js App Router）
import { teamManageQueries } from '@/features/team-manage/queries'
import { TeamManageView } from '@/features/team-manage/views/team-manage.view'

export default async function TeamManagePage() {
  const queryClient = await getQueryClient()
  await queryClient.ensureQueryData(teamManageQueries.overview())
  return (
    <Suspense fallback={<Loading />}>
      <TeamManageView />
    </Suspense>
  )
}

// team-manage.view.tsx — 客户端组件
'use client'
function TeamManageView() {
  const { data } = useSuspenseQuery(teamManageQueries.overview())
  // ...
}
```

**Query 工厂（集中管理 queryKey + queryFn）**：

```ts
// features/<domain>/queries.ts
export const <domain>Queries = {
  overview: () => queryOptions({
    queryKey: ['<domain>', 'overview'] as const,
    queryFn: () => request<Overview>('/api/<resource>'),
  }),
  list: (params: ListParams) => queryOptions({
    queryKey: ['<domain>', 'list', params] as const,
    queryFn: () => request<PaginatedResponse<Item>>('/api/<resource>', {
      query: { page: params.page, page_size: params.pageSize },
    }),
  }),
}
```

**Mutation（写完必 invalidate）**：

```ts
// features/<domain>/mutations.ts
export function useUpdateMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateBody) =>
      request('/api/<resource>/id', { method: 'PUT', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['<domain>'] }) // 级联刷新
      toast.success('更新成功')
    },
  })
}
```

**URL 状态（用 searchParams，不用 useState）**：

```tsx
// 判断标准：用户刷新页面后，这个状态还要在吗？
// 是 → URL searchParams（useSearchParams / router search）
// 否 → useState（modal open、hover 等瞬态 UI）
```

**useEffect 规则**：

- 组件本体**禁止裸 `useEffect`**，必须抽到命名 hook（`useXxx`）
- **禁止 `useEffect` + `fetch`** 做数据拉取，用 `loader` / `useQuery`
- 数据请求统一走 `request<T>()`（ofetch 封装），不直接用裸 `fetch`

**表单（TanStack Form + FormField + formErrorText）**：

```tsx
import { FormField } from '@/features/_shared/form/form-field'
import { formErrorText } from '@/features/_shared/form/form-error'

<form.Field name="email">
  {(field) => (
    <FormField label="邮箱" required error={formErrorText(field)}>
      <Input
        value={field.state.value}
        onChange={(e) => field.handleChange(e.target.value)}
        onBlur={field.handleBlur}
      />
    </FormField>
  )}
</form.Field>
```

### 后端代码规范（Next.js API Routes）

**统一响应格式**：

```ts
// lib/api-response.ts
interface ApiResponse<T> {
  status_code: number  // 0 或 200 = 成功，其余 = 业务错误
  message?: string
  data: T
}

interface PaginatedResponse<T> {
  list: T[]
  total: number
  page: number
  page_size: number
}
```

**请求校验（Zod）**：

```ts
// lib/validators/<resource>.ts
import { z } from 'zod'

export const createResourceSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
})
```

**API Route 模板（Next.js App Router）**：

```ts
// app/api/<resource>/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createResourceSchema } from '@/lib/validators/<resource>'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const page = Number(searchParams.get('page') || 1)
  const pageSize = Number(searchParams.get('page_size') || 10)
  // ... 查询逻辑
  return NextResponse.json<ApiResponse<PaginatedResponse<Item>>>({
    status_code: 0,
    data: { list: items, total, page, page_size: pageSize },
  })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = createResourceSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json<ApiResponse<null>>(
      { status_code: 400, message: parsed.error.issues[0].message, data: null },
      { status: 400 }
    )
  }
  // ... 创建逻辑
  return NextResponse.json<ApiResponse<Item>>(
    { status_code: 0, data: newItem },
    { status: 201 }
  )
}
```

**错误处理**：
- 业务错误：返回 `status_code: 4xx` + `message`，HTTP 状态对应
- 系统错误：HTTP 500，不泄漏内部细节
- 认证失败：HTTP 401，前端 `request()` 拦截后统一跳转登录

### Import 约定

| 场景 | 写法 | 示例 |
|------|------|------|
| 跨模块引用 | `@/` 别名（指向 `src/`） | `import { Button } from '@/components/ui/button'` |
| 同目录引用 | `./` 相对路径 | `import { useXxx } from './use-xxx'` |
| UI 原子组件 | `@/components/ui/` | `import { Card } from '@/components/ui/card'` |
| 共享原语 | `@/features/_shared/` | `import { DataTable } from '@/features/_shared/table/data-table'` |

### 类型安全

- **禁止** `any` / `as any` / `@ts-ignore` / `@ts-expect-error`（除非有注释说明理由）
- API 响应类型在 `queries.ts` 定义，与 query 工厂同文件
- 有限枚举用联合类型字面量：`type Role = 'admin' | 'member'`
- catch 里的 error 用 `unknown`，不直接 `as Error`

---

## 完整执行流程

### Step 0：读取上下文

```bash
# 读取 PRD
cat .loop/prd.md

# 读取 Stories Manifest（如果存在）
cat .loop/prototype/stories-manifest.md 2>/dev/null

# 检查当前代码状态
git status
git log --oneline -5
```

从 PRD 提取：
- Section 4: 用户故事 + 验收标准
- Section 5: 功能需求（含优先级）
- Section 7: API 契约
- Section 8: UI 规格 + 组件拆分

从 Stories Manifest 提取：
- 已有组件列表
- MSW handlers 列表
- 交互流程

---

### Step 1：任务拆解（lobster-lead Phase 1）

基于 PRD 和原型，按 **feature module 结构**拆解为任务树：

```
🦞 任务拆解
──────────────────────────────

[1] 基础设施层（依赖：无）
    ├── lib/api-response.ts         — 统一响应类型
    ├── lib/validators/<resource>.ts — Zod 请求校验 schema
    └── lib/request.ts              — ofetch 封装（如不存在则创建）

[2] 后端 API 层（依赖：1）
    ├── app/api/<resource>/route.ts  — GET（列表 + 分页）
    ├── app/api/<resource>/route.ts  — POST（创建，含 Zod 校验）
    ├── app/api/<resource>/[id]/route.ts — PUT / DELETE
    └── 错误处理 + 认证中间件

[3] 前端 feature 模块（依赖：2）
    ├── features/<domain>/queries.ts      — 类型定义 + queryOptions 工厂
    ├── features/<domain>/mutations.ts    — useMutation hooks
    ├── features/<domain>/views/<f>.view.tsx — 页面视图
    └── features/<domain>/views/dialogs/  — 弹窗组件

[4] 路由集成（依赖：2, 3）
    ├── app/<route>/page.tsx              — 路由页面（loader + Suspense）
    └── 错误边界 error.tsx                — 路由级错误兜底

依赖图：[1] → [2] → 并行：[3] → [4]
```

> 每个任务对应的文件路径参见上方「开发约定」章节。

**STOP** — 用 `AskUserQuestion` 让用户确认任务拆解：

选项：
- **确认，开始开发**：任务拆解没问题
- **调整任务**：修改任务列表
- **只做核心**：只实现 P0 功能需求

---

### Step 2：并行开发（lobster-lead Phase 2）

按依赖图，使用 `TaskCreate` 创建任务，然后并行派发 subagent。

**派发策略**：

| 任务 | Agent 类型 | 说明 |
|------|-----------|------|
| 数据层 | `general-purpose` | Prisma schema / TypeScript 类型 / Zod 校验 |
| API 路由 | `general-purpose` | Next.js API routes，参照 PRD Section 7 |
| 前端组件 | `general-purpose` | 基于原型 Stories 实现真实组件 |
| 页面集成 | `general-purpose` | 路由 + 组件串联 + 错误边界 |

**并行规则**：
- 无依赖的任务在同一条消息里并行派发
- 有依赖的任务等前置完成后串行执行

**每个 subagent 的 prompt 必须包含**：
1. 项目技术栈（Next.js App Router + shadcn/ui + TypeScript）
2. 具体的 PRD 需求摘要（相关的用户故事和验收标准）
3. 要创建/修改的文件路径（按 feature module 结构）
4. **代码规范引用**（直接内联以下关键规则）：
   - 统一响应格式：`{ status_code, message, data }`
   - 请求校验：Zod schema，`safeParse` 后返回 400
   - queryKey 用工厂函数集中管理，不放组件里
   - mutation 成功后必须 `invalidateQueries` + `toast`
   - 组件本体禁止裸 `useEffect`，抽到命名 hook
   - 禁止 `any` / `as any` / `@ts-ignore`
   - import 用 `@/` 别名，不写深层相对路径
   - 共享原语从 `@/features/_shared/` 导入，不重复实现

---

### Step 3：验证 + Checkpoint

**每个子任务完成后**：

1. `TaskUpdate` 标记完成
2. `Read` 实际修改的文件，验证改动
3. 运行类型检查：

```bash
npx tsc --noEmit
```

4. 如果通过，checkpoint commit：

```bash
# 调用 /smart-commit
```

---

### Step 4：开发完成（lobster-lead Phase 3）

所有子任务完成后：

**汇总检查**：

```bash
# 类型检查
npx tsc --noEmit

# 构建检查
npm run build

# 查看所有改动
git diff --stat
```

**写入开发文档**：

`.loop/dev/task-breakdown.md`：

```markdown
# 任务拆解与完成情况

> 开发时间：YYYY-MM-DD
> Loop ID：loop-YYYYMMDD-NNN

## 任务列表

| # | 任务 | 状态 | Commits |
|---|------|------|---------|
| 1 | 数据层 | ✅ 完成 | feat: add user schema |
| 2 | API 路由 | ✅ 完成 | feat: add user CRUD API |
| 3 | 前端组件 | ✅ 完成 | feat: implement user components |
| 4 | 页面集成 | ✅ 完成 | feat: add user pages |
```

`.loop/dev/component-map.md`：

```markdown
# 组件映射

| Feature 模块 | 文件 | 类型 | shadcn 依赖 | 对应 Story |
|-------------|------|------|------------|-----------|
| team-manage | features/team-manage/queries.ts | query 工厂 | — | — |
| team-manage | features/team-manage/mutations.ts | mutation hooks | — | — |
| team-manage | features/team-manage/views/team-manage.view.tsx | 页面视图 | Table, Badge, Button | Default, Empty |
| team-manage | features/team-manage/views/dialogs/member.modal.tsx | 弹窗 | Dialog, Form, Input | Create, Edit |
```

`.loop/dev/api-contracts.md`：

```markdown
# 最终 API 契约

## GET /api/<resource>
- Query: page, page_size, keyword
- Response 200: `{ status_code: 0, data: { list, total, page, page_size } }`

## POST /api/<resource>
- Request: `{ name: string, email: string }`（Zod 校验）
- Response 201: `{ status_code: 0, data: Item }`
- Error 400: `{ status_code: 400, message: string, data: null }`

## PUT /api/<resource>/[id]
- Request: Partial<Item>
- Response 200: `{ status_code: 0, data: Item }`

## DELETE /api/<resource>/[id]
- Response 204: No Content
```

---

### Step 5：用户确认

```
🛠️ 开发完成
──────────────────────────────
任务：<N>/<N> 完成
组件：<N> 个
API 路由：<N> 个
Commits：<N> 次

文档：
  - .loop/dev/task-breakdown.md
  - .loop/dev/component-map.md
  - .loop/dev/api-contracts.md
```

用 `AskUserQuestion` 询问：
- **确认，进入审查**：开发完毕，进入 code review
- **补充开发**：还需要实现更多功能
- **修复问题**：有 bug 需要修

---

### Step 6：更新 session.json

```json
{
  "currentPhase": "review",
  "phases": {
    "dev": { "status": "completed", "completedAt": "<ISO timestamp>" }
  },
  "artifacts": {
    "prd": ".loop/prd.md",
    "storiesManifest": ".loop/prototype/stories-manifest.md",
    "taskBreakdown": ".loop/dev/task-breakdown.md",
    "componentMap": ".loop/dev/component-map.md",
    "apiContracts": ".loop/dev/api-contracts.md"
  }
}
```

---

## 红线（不可违反）

1. **必须从 PRD 拆解任务** — 不凭空开发
2. **独立任务必须并行** — 同一条消息里并行 Agent 调用
3. **每个 subagent 完成后必须 Read 验证** — 不盲目信任
4. **checkpoint 时调用 /smart-commit** — 不积攒大量改动
5. **类型检查必须通过** — `tsc --noEmit` 零错误
6. **开发文档必须写入 `.loop/dev/`** — 下游阶段依赖
7. **不跳过用户确认** — 任务拆解和完成都需要确认
8. **代码必须按 feature module 组织** — `features/<domain>/queries.ts` + `mutations.ts` + `views/`，不把所有代码堆在 `components/`
9. **共享原语从 `_shared/` 导入** — FormField、SearchToolbar、DataTable 等不重复实现
10. **mutation 后必须 invalidateQueries** — 不手动 `refetch`，不遗漏缓存刷新
11. **禁止裸 `useEffect` + `fetch`** — 数据拉取走 loader / `useQuery` / `useSuspenseQuery`
12. **禁止 `any` / `as any` / `@ts-ignore`** — TypeScript 严格模式，catch 用 `unknown`
13. **API 响应统一格式** — `{ status_code, message, data }`，Zod 校验后返回，不直接透传内部错误
14. **URL 状态用 searchParams** — 刷新后仍需保留的状态不存 `useState`

---

## 特殊情况处理

| 情况 | 处理方式 |
|------|---------|
| PRD 没有 API 契约 | 基于功能需求推导 API 设计，需用户确认 |
| Stories Manifest 不存在 | 直接从 PRD 开发，跳过原型参考 |
| 构建失败 | 用 `build-error-resolver` agent 修复 |
| 子任务依赖阻塞 | 等待前置任务完成，不跳过 |
| 改动文件超过 20 个 | 检查是否需要拆分任务 |
| 类型错误太多 | 先修类型错误，再推进功能 |
| 项目用的是 Next.js 而非 TanStack Router | 数据加载用 App Router `page.tsx` + `ensureQueryData`，不用 `createFileRoute` |
| 项目没有 `request.ts` 封装 | 先创建 `lib/request.ts`（ofetch 封装 + 统一错误处理），再写 API 调用 |
| 功能只需展示无需写操作 | 只写 `queries.ts` + `view.tsx`，跳过 `mutations.ts` |
| `_shared/` 原语不满足需求 | 在当前 feature `components/` 里扩展，不直接改 `_shared/`（需用户确认后才改） |
