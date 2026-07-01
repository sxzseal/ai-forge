---
name: _placeholder
description: 在此目录添加开发阶段增强 skill（*.md）。dev-dev 会在 Step 0 扫描并加载本目录所有 *.md（_placeholder 除外）。
enhances: dev
priority: low
---

# Dev Phase Enhancers

把开发阶段要让 AI 遵守的领域专家规范放在本目录下，每个 enhancer 一份 `*.md`，frontmatter 标 `enhances: dev`。

**示例**：

- `react-query-patterns.md` — TanStack Query 使用模式
- `zustand-store-conventions.md` — Zustand store 拆分约定
- `api-error-handling.md` — 错误处理统一模式
- `accessibility-checklist.md` — a11y 检查项

格式与写法见上一级 [README.md](../README.md)。

> 本文件名以 `_` 开头，被主 skill 视为占位，不参与加载。删除本文件不影响功能。
