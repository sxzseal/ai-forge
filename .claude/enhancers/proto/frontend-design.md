---
name: frontend-design
description: 原型阶段涉及视觉方向、排版、主题、审美判断时，委托 Anthropic 官方 frontend-design skill 提供设计专家级指导
enhances: proto
priority: high
appliesTo: [visual, design, ui, aesthetic, theme, typography, layout, color, style, brand, look, feel, spacing, hierarchy]
---

# 原型阶段视觉设计委托

> 本 enhancer 不直接给规则，而是**委托** [frontend-design](../../skills/frontend-design) skill 提供设计专家级判断。让原型摆脱"模板默认外观"，做出有意图的视觉设计。

## 触发条件

当原型阶段的以下步骤涉及**视觉决策**时，必须先调用 `frontend-design` skill：

- **Step 3 fixtures 前** — 决定整体视觉方向（品牌调性、参考对标、氛围关键词）
- **Step 4 stories 生成前** — 决定 theme tokens（色板、字体系统、圆角、阴影、间距节奏）
- **Step 6 组件生成时** — 遇到 hero、landing、marketing、dashboard 等"有存在感"的页面
- **Step 7 标注迭代时** — 用户反馈涉及"感觉不对"「不够精致」「太模板」「太默认」等审美判断

## 如何调用

```
使用 Skill 工具，skill 参数传 "frontend-design"，args 描述当前视觉决策的上下文（产品定位、目标用户、参考方向）。
```

调用后：

- 把 frontend-design 返回的设计方向/token 建议纳入 theme 生成
- 把它对"如何避免模板感"的具体建议落到 story 的 className 和 Tailwind 配置上
- 与 [shadcn-form-patterns] 之类的其他 enhancer 冲突时，frontend-design 决定**视觉表现**，其他 enhancer 决定**结构和交互**，两者分工不冲突

## 不触发的情况

以下场景不必调用（避免过度使用）：

- 内部工具、admin 面板、纯功能性表单（用 shadcn 默认样式即可）
- 单个 utility component（按钮、input 等原子组件）的原型
- 已有明确 design token 配置且用户没提视觉问题

## 前置检查

在调用前，dev-proto 需要确认 `frontend-design` skill 是否已安装：

```bash
ls .claude/skills/frontend-design 2>/dev/null && echo "installed" || echo "missing"
```

若未安装，提示用户运行：

```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
```

安装后 skill 会 symlink 到 `.claude/skills/frontend-design`，Claude Code 自动识别。

## 与主 skill 红线的关系

- 若 frontend-design 建议修改 `globals.css` 的全局样式 → **红线胜**，改到 story 内联 className 或 theme override
- 若 frontend-design 建议引入新字体包 → 需先确认字体已在项目本地（不通过 URL import Google Fonts）
