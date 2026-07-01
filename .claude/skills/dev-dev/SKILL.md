---
name: dev-dev
description: 从验收清单 + 原型出发，按「拆解 → 并行 → checkpoint」三阶段开发：先拆任务树 + task-state 落盘，再并行派发 subagent，最后 checkpoint 内嵌轻量自检后提交。触发词："开始开发"、"dev-dev"、"实现功能"。被 /dev-loop 作为 Phase 2 调用。
---

# Dev Dev — 开发执行器

## 何时启用

用户说出以下任意表达时立即激活：

- 「开始开发」「实现功能」「dev-dev」
- 被 `/dev-loop` 作为 Phase 2 调用

**前置条件**（至少一项满足）：

- `.loop/acceptance-checklist.md` 存在（主输入，由 dev-proto 生成）
- `.loop/prototype/stories-manifest.md` 存在
- `.loop/prd.md` 存在（兼容老流程或用户手动跑过 `/dev-prd`）

**不启用**：

- 三份输入都不存在（让用户先跑 `/dev-proto`）
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

`src/features/_shared/` 提供可复用的 UI 原语，**任何功能不得重复实现**。模板已自带：

| 子目录 | 模块 | 用途 |
|--------|------|------|
| `_shared/state/` | `Loading` / `SkeletonList` / `EmptyState` / `ErrorState` | 通用状态展示 |
| `_shared/form/` | `FormField` / `formErrorText()` | 表单字段布局 + 错误提取 |

按需补齐（首次需要时由 dev-dev 创建，避免预装重型依赖）：

| 子目录 | 模块 | 依赖 |
|--------|------|------|
| `_shared/page/` | `PageHeader` / `SearchToolbar` / `Pagination` | 无 |
| `_shared/table/` | `DataTable` | TanStack Table（按需 `npm i @tanstack/react-table`） |

> 判断标准：组件在 2 个以上 feature 用到 → 提到 `_shared/`；只在当前 feature 用 → 留在 `components/`。

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

**数据加载** — 模板不预装数据请求库，按需选择：

| 场景 | 推荐方案 | 说明 |
|------|---------|------|
| 简单组件 + 一次性获取 | 服务端组件直接 `await request<T>(...)` | 使用 `src/lib/request.ts` |
| 复杂客户端交互 + 缓存 + invalidate | TanStack Query (`useSuspenseQuery` + `useMutation`) | 首次需要时 `npm i @tanstack/react-query` |

**首次引入 TanStack Query 时**，dev-dev 应：

1. 确认是否安装：`grep '@tanstack/react-query' package.json`
2. 未安装则询问用户，安装后再开始
3. 安装后建立 `lib/query-client.ts` + `app/providers.tsx`（包 `QueryClientProvider`）
4. 后续 feature 才能用 `queries.ts` + `mutations.ts` 模式

**TanStack Query 模式（已安装时）**：

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

**Query 工厂**：

```ts
// features/<domain>/queries.ts
import { queryOptions } from '@tanstack/react-query'
import { request } from '@/lib/request'

export const <domain>Queries = {
  overview: () => queryOptions({
    queryKey: ['<domain>', 'overview'] as const,
    queryFn: () => request<Overview>('/api/<resource>'),
  }),
  list: (params: ListParams) => queryOptions({
    queryKey: ['<domain>', 'list', params] as const,
    queryFn: () => request<PaginatedData<Item>>('/api/<resource>', {
      query: { page: params.page, page_size: params.pageSize },
    }),
  }),
}
```

**Mutation（写完必 invalidate）**：

```ts
// features/<domain>/mutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { request } from '@/lib/request'

export function useUpdateMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateBody) =>
      request('/api/<resource>/id', { method: 'PUT', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['<domain>'] })
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
- **禁止 `useEffect` + `fetch`** 做数据拉取，用服务端组件 `await request<T>()` 或 TanStack Query
- 数据请求统一走 `request<T>()`（见 `src/lib/request.ts`），不直接用裸 `fetch`

**表单** — 模板不预装表单库，按需选择：

- 简单表单：原生 `<form>` + `useState` + `FormField`
- 复杂表单（多字段校验、依赖字段）：TanStack Form（按需 `npm i @tanstack/react-form`）

**TanStack Form + FormField 模式（已安装时）**：

```tsx
import { FormField, formErrorText } from '@/features/_shared/form/form-field'

<form.Field name="email">
  {(field) => (
    <FormField label="邮箱" required error={formErrorText(field.state.meta)}>
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

**统一响应格式** — 类型定义和工具函数已在模板 `src/lib/api-response.ts`：

```ts
import type { ApiResponse, PaginatedData } from '@/lib/api-response'
import { ok, err } from '@/lib/api-response'
```

约定：
- `status_code: 0` 表示成功，非 0 为业务错误
- 分页响应统一用 `PaginatedData<T> = { list, total, page, page_size }`
- 业务错误 HTTP 状态 = `status_code`；系统错误 HTTP 500 不泄漏细节
- 直接用 `ok(data)` / `err(status, message)` 返回，不手写 `NextResponse.json` 信封

**请求校验（Zod）**：

```ts
// lib/validators/<resource>.ts
import { z } from 'zod'

export const createResourceSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
})
```

**API Route 模板**：

```ts
// app/api/<resource>/route.ts
import { NextRequest } from 'next/server'
import { ok, err, type PaginatedData } from '@/lib/api-response'
import { createResourceSchema } from '@/lib/validators/<resource>'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const page = Number(searchParams.get('page') || 1)
  const pageSize = Number(searchParams.get('page_size') || 10)
  // ... 查询逻辑
  return ok<PaginatedData<Item>>({ list: items, total, page, page_size: pageSize })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = createResourceSchema.safeParse(body)
  if (!parsed.success) {
    return err(400, parsed.error.issues[0].message)
  }
  // ... 创建逻辑
  return ok(newItem, { status: 201 })
}
```

**错误处理**：
- 业务错误：`err(4xx, message)`，HTTP 状态与 `status_code` 对应
- 系统错误：HTTP 500，不泄漏内部细节
- 认证失败：`err(401, ...)`，前端 `request()` 抛 `UnauthorizedError`，上层统一拦截跳转登录

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
# 主输入：验收清单（dev-proto 产出，每条 AC 都要有对应实现）
cat .loop/acceptance-checklist.md 2>/dev/null

# API 契约 JSON（与原型 handlers 对齐）
cat .loop/api-contracts.json 2>/dev/null || echo "NO_API_CONTRACTS_JSON"

# Stories Manifest（Story → Feature 映射来源）
cat .loop/prototype/stories-manifest.md 2>/dev/null

# 可选补充：PRD（若用户手动跑过 /dev-prd）
cat .loop/prd.md 2>/dev/null

# 检查当前代码状态
git status
git log --oneline -5
```

**优先级**：

1. `.loop/acceptance-checklist.md` — 每条 AC 都是开发完成的判据，没覆盖就不算做完
2. `.loop/api-contracts.json` — API 字段名、类型、错误码以此为准
3. `.loop/prototype/stories-manifest.md` — 复用 story 组件结构
4. `.loop/prd.md`（如有）— 仅作补充上下文，不与上面三份冲突

从验收清单提取：
- 验收项分类（页面交互 / 数据契约 / 视觉 / 边界 / 不做清单）
- 每条 AC 编号 + 描述（开发完成时要对照 check）

从 Stories Manifest 提取，**建立 Story → Feature 组件预映射**：
- 已有 story 文件列表（`src/stories/<project>/`）
- 每个 story 的交互流程（play functions）
- 与验收项的映射关系

**Story → Feature 预映射表**（在任务拆解前建立，供 Step 4 component-map.md 使用）：

```
Story → Feature 预映射
──────────────────────────────
| Story 文件 | Story Title | 预期 Feature 模块 | 映射方式 |
|-----------|-------------|-----------------|---------|
| src/stories/<project>/<feature>.stories.tsx | <project> / <显示名> | features/<domain>/ | 完全复用 |
| src/stories/<project>/<dialog>.stories.tsx | <project> / <弹窗名> | features/<domain>/views/dialogs/ | 部分复用 |
```

> 映射方式：**完全复用**（story 组件结构直接用于 view）/ **部分复用**（story 提供布局参考，view 需扩展）/ **无对应 story**（验收清单要求但原型未覆盖）。

**加载增强能力包**（两段式，避免全量预加载）：

```bash
# 1. 只扫 frontmatter
node scripts/lib/enhancers.mjs list dev

# 2. 根据当前任务关键词过滤（如 query,mutation,state-management,api-error）
node scripts/lib/enhancers.mjs select dev --keywords "<kw1,kw2,...>"
```

处理规则：

- 返回的 `selected` 数组即启用清单；对每份逐一 `Read` 全文，纳入上下文
- 用 `AskUserQuestion` 把 `selected` / `skipped` 展示给用户确认
- Step 1 任务拆解时把增强规范纳入约束（如某 enhancer 规定「所有 mutation 必须 optimistic update」，拆解就要体现）
- Step 2 派发 subagent 时，把启用的 enhancer 内容**完整拷贝**到 subagent prompt 里（subagent 看不到主 skill 的上下文）
- Step 3 checkpoint 自检时按 enhancer 内容补充检查项
- 多个 enhancer 冲突按 frontmatter `priority` 排序：`high` > `medium` > `low`；同优先级按文件名字典序
- enhancer 与本 skill 红线冲突时（如「禁止 `any`」），**红线胜**

用户确认后落盘 manifest：

```bash
node scripts/lib/enhancers.mjs manifest --phase dev \
  --selected "<name1>,<name2>" --skipped "<name3>"
```

Step 6 完成时把 `selected` 数组通过 `forge-state` 写入 `session.json.phases.dev.enhancers`：

```bash
echo '{"phases":{"dev":{"enhancers":["<name1>","<name2>"]}}}' \
  | node scripts/lib/forge-state.mjs update .loop/session.json --schema session
```

若 `list` 输出为空数组 → 跳过本步，按默认约定执行。

---

### Step 0.5：Harness 协议启动（events + budget + repo-map）

**这一步给 Step 1-6 铺路，不可跳过**。

```bash
# 1. 写 phase.enter
node scripts/lib/forge-events.mjs append --kind phase.enter --phase dev --step step.0

# 2. 检查预算（默认 100 steps / 30 subagents / 3 retries per checkpoint）
node scripts/lib/forge-budget.mjs check dev

# 3. 生成 repo-map（后续每个 subagent prompt 都自带这份 context）
node scripts/lib/forge-repomap.mjs build --max-tokens 2000
# → .loop/dev/repo-map.txt
```

从此往后，**每个 Step / subagent 派发 / self-check / checkpoint / patch apply 都必须写 event**（见 PHASE_CONTRACT §10 kind 枚举）。示例：

```bash
node scripts/lib/forge-events.mjs append --kind step.enter --phase dev --step step.1
node scripts/lib/forge-budget.mjs consume dev --kind step  # 消耗 1 个 step 额度
```

### Plan / Act 协议（Step 1 vs Step 2+）

从这个版本起 dev-dev 采用 **Plan / Act 显式分离**：

- **Step 1 是纯 Plan 模式**：派发 `plan-analyst` role subagent（read-only，禁 Write/Edit），产出 `.loop/dev/plan.json`（schema: `plan`）。AskUserQuestion 批准 → 写入 `approvedAt`。
- **Step 2-4 是 Act 模式**：subagent 只能改 plan.tasks[].filesPlanned 里的文件；多改的必须进 receipt.deviations。每个 subagent 在 `.loop/.worktrees/<id>/` 沙箱里干活。

---

### Step 1：任务拆解（拆解阶段）

基于验收清单 + Stories Manifest，按 **feature module 结构**拆解为任务树：

```
🦞 任务拆解
──────────────────────────────

[1] 基础设施层（依赖：无）
    ├── lib/api-response.ts          ← 模板已自带，无需新建
    ├── lib/request.ts               ← 模板已自带，无需新建
    └── lib/validators/<resource>.ts — Zod 请求校验 schema（新增）

[2] 后端 API 层（依赖：1）
    ├── app/api/<resource>/route.ts  — GET（列表 + 分页）
    ├── app/api/<resource>/route.ts  — POST（创建，含 Zod 校验）
    ├── app/api/<resource>/[id]/route.ts — PUT / DELETE
    └── 错误处理 + 认证中间件

[3] 前端 feature 模块（依赖：2）
    ├── features/<domain>/queries.ts      — 类型 + 查询（装了 TanStack Query 时用 queryOptions 工厂；否则 export async fn）
    ├── features/<domain>/mutations.ts    — useMutation hooks（仅在装了 TanStack Query 时存在）
    ├── features/<domain>/views/<f>.view.tsx — 页面视图
    └── features/<domain>/views/dialogs/  — 弹窗组件

[4] 路由集成（依赖：2, 3）
    ├── app/<route>/page.tsx              — 路由页面（服务端组件预取或 Suspense）
    └── 错误边界 error.tsx                — 路由级错误兜底

依赖图：[1] → [2] → 并行：[3] → [4]

验收清单覆盖映射：
| AC 编号 | 验收项 | 对应任务 |
|--------|--------|---------|
| AC-001 | 页面渲染 | [3][4] |
| AC-101 | GET /api/<resource> | [2] |
| ... | ... | ... |
```

> 每个任务对应的文件路径参见上方「开发约定」章节。
> 任务拆解必须覆盖验收清单中所有验收项，不能遗漏。

**Plan 模式派发（read-only subagent 产 plan.json）**：

派发一个 `plan-analyst` 角色的 subagent，让它读 acceptance-checklist + stories-manifest + api-contracts.json + repo-map.txt，产出 `.loop/dev/plan.json`（schema: `plan`）。

```bash
# 派发前
node scripts/lib/forge-events.mjs append --kind subagent.spawn --phase dev --step step.1 \
  --payload '{"id":"sa-plan","role":"plan-analyst"}'

# subagent prompt 必须包含 .claude/roles/plan-analyst.json 的 promptInjections
# 完成后自动写 .loop/dev/plan.json 和 .loop/dev/subagent-receipts/sa-plan.json
```

主 skill 收到后：

```bash
# 1. 校验 plan.json
node scripts/lib/forge-state.mjs validate .loop/dev/plan.json --schema plan

# 2. 校验 receipt
node scripts/lib/forge-state.mjs validate .loop/dev/subagent-receipts/sa-plan.json --schema subagent-receipt

# 3. 写 subagent.return event
```

**STOP** — 用 `AskUserQuestion` 让用户确认 plan.json：

选项：
- **确认，开始 Act 模式**：进入 Step 2
- **调整任务**：修改 plan.json 后重新审核
- **只做核心**：过滤掉 non-P0 任务后确认

用户确认后写 `approvedAt`：

```bash
echo "{\"approvedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
  | node scripts/lib/forge-state.mjs update .loop/dev/plan.json --schema plan
```

**用户确认后落盘 task-state**（Step 2/3 用于跨 session resume；task-state 与 plan.json 一致）：

```bash
# 组装每个任务的初始状态，通过 forge-state 写入
cat <<'JSON' | node scripts/lib/forge-state.mjs write .loop/dev/task-state.json --schema task-state
{
  "loopId": "<loop-id from session.json>",
  "createdAt": "<ISO now>",
  "tasks": [
    { "id": "T001", "title": "lib/validators/<resource>.ts", "layer": "infra", "status": "pending", "deps": [], "acRefs": ["AC-101"] },
    { "id": "T002", "title": "app/api/<resource>/route.ts (GET+POST)", "layer": "api", "status": "pending", "deps": ["T001"], "acRefs": ["AC-101","AC-102"] }
  ]
}
JSON
```

> 每个任务的 `id` 用 `T001..T00N`，`deps` 引用其他任务 id。schema 校验失败 CLI 会拒写并原文件不变。

---

### Step 2：并行开发（并行阶段）

按依赖图，使用 `TaskCreate` 创建任务，然后并行派发 subagent。

#### Step 2.0：从 plan.json 拓扑分组算 batches

主 skill 读 `.loop/dev/plan.json`，按 `tasks[].dependencies` 做 Kahn 拓扑排序，把无依赖 / 依赖已满足的 task 归入同一 batch，同 batch 内并行、batch 间串行。

参考实现（无需新增 CLI）：

```bash
# 从 plan.json 计算 batches，输出 JSON 数组：[["T001","T005"],["T002","T003","T006"],["T004","T007"]]
node -e '
const plan = JSON.parse(require("fs").readFileSync(".loop/dev/plan.json", "utf8"));
const tasks = plan.tasks;
const doneSet = new Set();
const batches = [];
const pending = new Set(tasks.map(t => t.id));
while (pending.size) {
  const batch = [];
  for (const t of tasks) {
    if (!pending.has(t.id)) continue;
    const deps = t.dependencies || [];
    if (deps.every(d => doneSet.has(d))) batch.push(t.id);
  }
  if (!batch.length) {
    console.error("cyclic deps or unresolved dependency; pending:", [...pending]);
    process.exit(1);
  }
  batches.push(batch);
  batch.forEach(id => { doneSet.add(id); pending.delete(id); });
}
console.log(JSON.stringify(batches));
' > .loop/dev/batches.json

# 检查最大并行宽度
jq "map(length) | max" .loop/dev/batches.json
```

**并行规则**：

- **同一 batch 里的所有 tasks 必须在同一条消息里并行派发 Agent 调用** —— 这是红线 3 的具体化，是本 skill 提速的关键
- Batch 与 batch 之间等前一批全部返回 + gather 校验完成后才进入下一批
- 每个 batch 派发前写一条 aggregate event 便于 metrics 聚合
- 若某 batch 宽度 = 1，主 skill 不 fan-out，直接串行，但记录 `parallelWidth` 时计 1；Step 4 收敛时算所有 batch 的平均宽度，写入 `session.json.phases.dev.parallelWidth`

#### Step 2.1：每个任务派发前

```bash
node scripts/lib/forge-state.mjs set .loop/dev/task-state.json --schema task-state \
  --key "tasks.<index>.status" --value '"in_progress"'
```

> 由于 task-state 用数组，直接 `--key "tasks.0.status"` 这类 dotpath 会覆盖数组元素。实操中主 skill 应先 `forge-state read`，在内存里修改对应任务的 status/startedAt，再 `forge-state update` 全量写回（schema 会校验完整性）。

**派发策略**：

| 任务 | Agent 类型 | 说明 |
|------|-----------|------|
| 数据层 | `general-purpose` | Prisma schema / TypeScript 类型 / Zod 校验 |
| API 路由 | `general-purpose` | Next.js API routes，参照验收清单 + api-contracts.json |
| 前端组件 | `general-purpose` | 基于原型 Stories 实现真实组件 |
| 页面集成 | `general-purpose` | 路由 + 组件串联 + 错误边界 |

> 并行规则见 Step 2.0 —— 按 `batches.json` 逐批 fan-out，同一 batch 一条消息里并行派发。

**每个 subagent 的 prompt 必须包含**：
1. 项目技术栈（Next.js App Router + shadcn/ui + TypeScript）
2. 该任务对应的验收清单条目（AC-XXX）和原型 Story 文件路径
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

**Harness 协议（每个 subagent 派发时强制）**：

5. **Role 约束** — 从 `.claude/roles/<role>.json` Read `allowedTools` + `promptInjections`，整段拷贝到 subagent prompt 的「工具约束」段
6. **Repo Map 上下文** — 附带 `.loop/dev/repo-map.txt` 的相关切片（不用全塞，按 filesPlanned 目录过滤）
7. **Worktree 沙箱** — 派发前主 skill 执行：
   ```bash
   node scripts/lib/forge-worktree.mjs create --subagent <id>
   node scripts/lib/forge-events.mjs append --kind subagent.spawn --phase dev --step step.2 \
     --payload '{"id":"<id>","role":"<role>","taskRef":"<task-id>"}'
   node scripts/lib/forge-budget.mjs consume dev --kind subagent
   ```
   subagent prompt 里指令：`cd .loop/.worktrees/<id> && ...`
8. **Patch 优先于 Edit** — subagent 应输出 SEARCH-REPLACE 补丁到 `.loop/dev/pending-patches/<id>-<seq>.patch` 而非直接 Edit（尤其对已有文件）
9. **Receipt 必填** — subagent 完成前必须写：
   ```
   .loop/dev/subagent-receipts/<id>.json  (schema: subagent-receipt)
   ```
   通过 `node scripts/lib/forge-state.mjs write ... --schema subagent-receipt` 写入，校验不通过 receipt 无效 = subagent 失败。

**主 skill 收 subagent 返回**：

```bash
# 1. 校验 receipt
node scripts/lib/forge-state.mjs validate .loop/dev/subagent-receipts/<id>.json --schema subagent-receipt

# 2. 逐个应用 patch（原子）
for p in $(jq -r '.patchesApplied[]' .loop/dev/subagent-receipts/<id>.json); do
  node scripts/lib/forge-patch.mjs apply "$p" || node scripts/lib/forge-patch.mjs reject "$p"
done

# 3. 合 worktree
node scripts/lib/forge-worktree.mjs merge --subagent <id> --message "feat: <task-title>"

# 4. 写 subagent.return event
node scripts/lib/forge-events.mjs append --kind subagent.return --phase dev --step step.2 \
  --payload '{"id":"<id>","status":"success","filesChanged":<n>}'
```

**失败处理**：receipt 校验失败 / patch apply 失败 / self-check 不过 → `forge-worktree drop --subagent <id>`，写 `subagent.failed` event，进入 Step 3 的重试预算逻辑。

---

### Step 3：Checkpoint 内嵌自检 + 提交

**每个子任务完成后**：

1. `TaskUpdate` 标记完成
2. `Read` 实际修改的文件，验证改动
3. **运行 checkpoint 自检脚本**（替代独立 review 阶段的轻量版）：

   ```bash
   # 类型检查
   npx tsc --noEmit
   ```

   并对刚改的文件做**4 项快速自检**（结果结构化落盘）：

   | 检查项 | 命令 / 标准 | 不通过时 |
   |-------|-----------|---------|
   | 禁用 `any` / `@ts-ignore` | `grep -nE '\b(any\b\|@ts-ignore\|@ts-expect-error)' <files>` | 直接修复，不留 |
   | 裸 `useEffect + fetch`（多行匹配） | `grep -Pnzo 'useEffect\(\s*\(\)\s*=>\s*\{[^}]*fetch\(' <files>` — 若 `-P` 不可用回退 `perl -0777 -ne 'print "$1\n" while /(useEffect\(\s*\(\)\s*=>\s*\{[^}]*fetch\([^)]*\))/gs' <files>` | 改用服务端组件 / TanStack Query |
   | mutation 后忘记 invalidate | 仅在装了 TanStack Query 且修改了 `mutations.ts` 时检查：`grep -L 'invalidateQueries' <mutations.ts>` | 补 `invalidateQueries` |
   | API 响应格式 | grep route.ts 是否用了 `ok(` / `err(` 而非裸 `NextResponse.json` 信封 | 改用 `ok` / `err` |

   > **多行 grep 说明**：`useEffect + fetch` 常跨行（`useEffect(() => {\n  fetch(...)\n})`)，单行 grep 会漏。macOS 自带 grep 不支持 `-P`；主 skill 若检测到 `grep -P` 失败，回退 perl 或 ripgrep（`rg -U 'useEffect\(...\)'`）。

4. **每一项检查结果都必须写入结构化 findings**（Step 4 汇总 / dev-deploy 门控依赖这份）：

   ```bash
   cat >> .loop/dev/checkpoint-findings.md <<EOF
   | $(date -u +%FT%TZ) | <task-id T001..> | <file>:<line> | <rule-id> | <severity CRITICAL/HIGH/MEDIUM/LOW> | <auto-fixed/kept/reviewed> |
   EOF
   ```

   文件顶部初次写入时补表头：`| ts | task | location | rule | severity | action |`。

5. 自检全部通过 → 更新 task-state：

   ```bash
   # 先 read 得到当前 task-state，在内存里 patch，然后 update 全量写回
   node scripts/lib/forge-state.mjs read .loop/dev/task-state.json > /tmp/ts.json
   # ... 修改 tasks[i].status="done"、commits=[...]、completedAt=now ...
   cat /tmp/ts.json | node scripts/lib/forge-state.mjs write .loop/dev/task-state.json --schema task-state
   ```

6. checkpoint commit + 打 git tag（`/dev-undo` 依赖）：

   ```bash
   # 生成 checkpoint 编号（scoped 到当前 loop id，避免跨 loop 全局累加）
   LOOP_ID=$(node scripts/lib/forge-state.mjs read .loop/session.json | jq -r .loopId)
   CP_N=$(git tag --list "${LOOP_ID}-cp-*" | wc -l | tr -d ' ')
   CP_N=$((CP_N + 1))
   TAG="${LOOP_ID}-cp-${CP_N}"

   # 调用 /smart-commit 生成 commit
   # 然后打 tag（在 commit 之后）
   git tag "$TAG"

   # 写 checkpoint.created event + 追加到 session.json.checkpoints[]
   node scripts/lib/forge-events.mjs append --kind checkpoint.created --phase dev \
     --payload "$(jq -n --arg name "cp-$CP_N" --arg tag "$TAG" --arg sha "$(git rev-parse HEAD)" \
       '{name: $name, tag: $tag, sha: $sha, summary: "<task summary>"}')"

   node scripts/lib/forge-state.mjs read .loop/session.json | jq \
     --arg name "cp-$CP_N" --arg tag "$TAG" --arg sha "$(git rev-parse HEAD)" \
     --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     '.checkpoints = ((.checkpoints // []) + [{name: $name, tag: $tag, sha: $sha, createdAt: $ts, phase: "dev"}])' \
     | node scripts/lib/forge-state.mjs write .loop/session.json --schema session
   ```

7. 自检不通过 → **走重试预算**：

   ```bash
   # 每次失败先记 event 和消耗预算
   node scripts/lib/forge-events.mjs append --kind selfcheck.fail --phase dev \
     --payload '{"checkpoint":"cp-<N>","failure":"<summary>"}'
   node scripts/lib/forge-budget.mjs consume dev --kind retry --checkpoint "cp-<N>"

   # 触顶时（exit 2）必须 AskUserQuestion，不允许无限重试
   # 选项：「加预算继续」/「接受失败并跳过」/「回炉重做上一 checkpoint」
   ```

   默认 `maxSelfCheckRetries: 3`。修好后重跑自检 + 通过后走 Step 3.6 打 tag。

> 这里的自检只是「门槛级」检查，findings 是给 `dev-deploy` 生产闸门用的一手信号。要做深度安全 / 性能 / 架构审查，用户手动跑 `/dev-review`，其结果写入 `.loop/review/findings.md`。

---

### Step 4：开发完成（收敛阶段）

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

> 生成时间：YYYY-MM-DD
> Story → Feature 映射来源：`.loop/prototype/stories-manifest.md`

## Feature 组件清单

| Feature 模块 | 文件 | 类型 | shadcn 依赖 | 对应 Story 文件 | 映射状态 |
|-------------|------|------|------------|---------------|---------|
| team-manage | features/team-manage/queries.ts | query 工厂 | — | — | — |
| team-manage | features/team-manage/mutations.ts | mutation hooks | — | — | — |
| team-manage | features/team-manage/views/team-manage.view.tsx | 页面视图 | Table, Badge, Button | src/stories/team/team.stories.tsx | ✅ 完全复用 |
| team-manage | features/team-manage/views/dialogs/member.modal.tsx | 弹窗 | Dialog, Form, Input | src/stories/team/team.stories.tsx | 🔄 部分复用 |
| team-manage | features/team-manage/views/empty-state.tsx | 状态组件 | — | — | ❌ 无对应 Story |

## 映射状态说明

- ✅ **完全复用**：Story 的组件结构直接用于 view，只替换 mock 数据为真实 API 调用
- 🔄 **部分复用**：Story 提供布局/表单结构参考，view 需扩展（如增加表单校验、错误处理）
- ❌ **无对应 Story**：验收清单要求但原型未覆盖，需从头实现

## 覆盖统计

| 指标 | 数值 |
|------|------|
| Story 总数 | <N> |
| 完全复用 | <n> |
| 部分复用 | <n> |
| 无对应 Story | <n> |
| Story 覆盖率 | <n>%（有对应 Story 的组件占比） |
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
验收清单覆盖：<n>/<m>（<n>% 已实现）

文档：
  - .loop/dev/task-breakdown.md
  - .loop/dev/component-map.md
  - .loop/dev/api-contracts.md
  - .loop/dev/acceptance-coverage.md
```

**额外输出验收覆盖报告** `.loop/dev/acceptance-coverage.md`：

```markdown
# 验收清单覆盖情况

| AC 编号 | 验收项 | 实现位置 | 状态 |
|--------|--------|---------|------|
| AC-001 | 页面渲染 | features/<domain>/views/<f>.view.tsx | ✅ |
| AC-101 | GET /api/<resource> | app/api/<resource>/route.ts | ✅ |
| AC-102 | POST 校验 name 必填 | lib/validators/<resource>.ts | ✅ |
| AC-301 | 空状态显示 | features/<domain>/views/<f>.view.tsx | ⚠️ 待补 |
```

用 `AskUserQuestion` 询问：
- **确认，进入部署**：开发完毕，验收清单已覆盖
- **补充开发**：还有 AC 项未实现
- **深度审查**：先跑 `/dev-review` 再继续
- **生成测试**：先跑 `/dev-test` 再继续

---

### Step 6：更新 session.json

```json
{
  "currentPhase": "deploy",
  "phases": {
    "dev": {
      "status": "completed",
      "completedAt": "<ISO timestamp>",
      "enhancers": ["react-query-patterns", "..."],
      "parallelWidth": <N>
    }
  },
  "artifacts": {
    "acceptanceChecklist": ".loop/acceptance-checklist.md",
    "apiContractsJson": ".loop/api-contracts.json",
    "storiesManifest": ".loop/prototype/stories-manifest.md",
    "taskBreakdown": ".loop/dev/task-breakdown.md",
    "componentMap": ".loop/dev/component-map.md",
    "apiContracts": ".loop/dev/api-contracts.md",
    "acceptanceCoverage": ".loop/dev/acceptance-coverage.md"
  }
}
```

> `phases.dev.enhancers` 记录本轮启用的增强 skill `name` 列表（来自 Step 0 扫描结果，不含 `_` 开头的占位文件）。
> `phases.dev.parallelWidth` 记录 Step 2 各 batch 的平均并行宽度（用 `.loop/dev/batches.json` 里各 batch 长度取算术平均，向下取整）。全部串行时写 `1`；若 plan.json 拆分不够细导致最大 batch = 1，会体现在这个字段上，便于回顾时判断 plan-analyst 是否需要再收紧粒度。计算示例：`jq '[.[] | length] | add / length | floor' .loop/dev/batches.json`

**Metrics 聚合 + phase.exit event**：

```bash
# 聚合 phase 指标（从 events.jsonl 计算）
node scripts/lib/forge-metrics.mjs compute --phase dev
# → .loop/phases/dev/metrics.json

# 写 phase.exit event
node scripts/lib/forge-events.mjs append --kind phase.exit --phase dev

# 把 metricsPath 写入 session.json.phases.dev
echo '{"phases":{"dev":{"metricsPath":".loop/phases/dev/metrics.json"}}}' \
  | node scripts/lib/forge-state.mjs update .loop/session.json --schema session
```

---

## 红线（不可违反）

1. **必须从验收清单拆解任务** — 每条 AC 都要有对应任务，不凭空开发
2. **每个 checkpoint 前必须跑 `tsc --noEmit` + 4 项快速自检** — 类型错误和明显违规不进 commit
3. **独立任务必须并行** — 同一条消息里并行 Agent 调用
4. **每个 subagent 完成后必须 Read 验证** — 不盲目信任
5. **checkpoint 时调用 /smart-commit** — 不积攒大量改动
6. **开发文档必须写入 `.loop/dev/`** — 下游 deploy 阶段依赖；验收覆盖报告必须包含每条 AC 的实现位置
7. **不跳过用户确认** — 任务拆解和完成都需要确认
8. **代码必须按 feature module 组织** — `features/<domain>/queries.ts` + `mutations.ts` + `views/`，不把所有代码堆在 `components/`
9. **共享原语从 `_shared/` 导入** — FormField、SearchToolbar、DataTable 等不重复实现
10. **mutation 后必须 invalidateQueries** — 不手动 `refetch`，不遗漏缓存刷新
11. **禁止裸 `useEffect` + `fetch`** — 数据拉取走 loader / `useQuery` / `useSuspenseQuery`
12. **禁止 `any` / `as any` / `@ts-ignore`** — TypeScript 严格模式，catch 用 `unknown`
13. **API 响应统一格式** — 所有 `/api/*` route 用 `ok()` / `err()`（`src/lib/api-response.ts`），不手写 `NextResponse.json` 信封
14. **URL 状态用 searchParams** — 刷新后仍需保留的状态不存 `useState`
15. **API 字段以 `.loop/api-contracts.json` 为准** — 不在开发阶段悄悄改字段，要改先回 dev-proto 同步契约
16. **必须加载并遵守 `.claude/enhancers/dev/*.md`** — Step 0 扫描的所有增强 skill（`_` 开头的占位除外）都要 Read 进上下文，派发 subagent 时整段拷贝到其 prompt，冲突按 `priority` 排序

---

## 特殊情况处理

| 情况 | 处理方式 |
|------|---------|
| 验收清单不存在 | 让用户先跑 `/dev-proto` 生成；不允许凭空开发 |
| 验收清单没有 API 契约相关条目 | 基于 `.loop/api-contracts.json` 推导，没契约则用功能需求推导，需用户确认 |
| Stories Manifest 不存在 | 直接从验收清单开发，跳过原型参考 |
| 构建失败 | 用 `build-error-resolver` agent 修复 |
| 子任务依赖阻塞 | 等待前置任务完成，不跳过 |
| 改动文件超过 20 个 | 检查是否需要拆分任务 |
| 类型错误太多 | 先修类型错误，再推进功能 |
| 项目用的是 Next.js 而非 TanStack Router | 数据加载用 App Router `page.tsx` + `ensureQueryData`，不用 `createFileRoute` |
| 项目没有 `request.ts` 封装 | 先创建 `lib/request.ts`（ofetch 封装 + 统一错误处理），再写 API 调用 |
| 功能只需展示无需写操作 | 只写 `queries.ts` + `view.tsx`，跳过 `mutations.ts` |
| `_shared/` 原语不满足需求 | 在当前 feature `components/` 里扩展，不直接改 `_shared/`（需用户确认后才改） |
| 开发中发现验收清单与原型不一致 | 优先信原型，停下来回 dev-proto 修订验收清单和契约 |
