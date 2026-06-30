# `_shared/` — 项目级共享原语 (L2)

> 任何 feature 需要的状态展示 / 表单布局 / 页面骨架 / 表格组件**必须**从此处导入，不重复实现。
>
> 判断标准：组件在 2 个以上 feature 用到 → 提到这里；只在当前 feature 用 → 留在 `features/<domain>/components/`。

## 现有原语

| 子目录 | 模块 | 何时用 |
|--------|------|--------|
| `state/` | `Loading` / `SkeletonList` / `EmptyState` / `ErrorState` | 异步数据加载、空列表、错误兜底 |
| `form/` | `FormField` / `formErrorText()` | 任何表单字段的标签 + 错误布局 |

## 待按需补齐（dev-dev skill 会按需创建）

- `page/` — `PageHeader` / `SearchToolbar` / `Pagination`
- `table/` — `DataTable`（TanStack Table 封装）

> 不预先安装 TanStack Query / Form / Table 等重型依赖。dev-dev skill 在首次需要时，会询问是否安装并补齐对应原语。
