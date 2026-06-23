---
name: dev-prd
description: 从自然语言需求生成结构化 PRD 文档，输出到 .loop/prd.md。触发词："写 PRD"、"生成需求文档"、"需求分析"、"dev-prd"、"产品需求文档"。可独立使用，也可被 /dev-loop 调用。
---

# Dev PRD — 需求文档生成器

## 何时启用

用户说出以下任意表达时立即激活：

- 「写 PRD」「生成 PRD」「产品需求文档」
- 「需求分析」「需求文档」「生成需求文档」
- 「dev-prd」
- 被 `/dev-loop` 作为 Phase 1 调用

**不启用**：

- 用户只是在讨论需求，还没要求生成文档
- 已有 PRD 且只需修改

---

## 项目上下文

- **技术栈**：Next.js (App Router) + shadcn/ui + Storybook + MSW
- **部署**：Vercel (前端) + Railway (后端)
- **输出目录**：项目根目录下 `.loop/prd.md`
- **状态文件**：`.loop/session.json`

---

## 完整执行流程

### Step 0：环境检查

确认当前目录是有效的项目目录：

```bash
ls -la
```

检查是否存在 `.loop/` 目录，不存在则创建：

```bash
mkdir -p .loop/prototype .loop/dev .loop/review .loop/test .loop/deploy
```

如果 `.loop/session.json` 不存在，初始化：

```json
{
  "id": "loop-YYYYMMDD-NNN",
  "requirement": "<用户原始需求>",
  "createdAt": "<ISO timestamp>",
  "currentPhase": "prd",
  "phases": {
    "clarify": { "status": "completed" },
    "prd": { "status": "in_progress" },
    "prototype": { "status": "pending" },
    "dev": { "status": "pending" },
    "review": { "status": "pending" },
    "test": { "status": "pending" },
    "deploy": { "status": "pending" }
  }
}
```

---

### Step 1：需求澄清（4 维度）

**如果需求不够明确**，用 `AskUserQuestion` 一次性问清：

| 维度 | 要问清 |
|------|--------|
| **目标** | 最终交付物是什么？核心解决什么问题？ |
| **范围** | 涉及哪些功能/页面/API？有无明确边界（不做什么）？ |
| **约束** | 技术栈偏好？性能要求？兼容性？第三方服务限制？ |
| **成功指标** | 怎么判断这个功能"做完了"且"做好了"？ |

**判断是否需要澄清**：
- 需求已经明确到可以写出用户故事 → 跳过，直接进入 Step 2
- 需求模糊、有多个解读方向 → 必须澄清

---

### Step 2：生成结构化 PRD

基于澄清后的需求，生成以下结构的 PRD：

```markdown
# PRD: <功能名称>

> 生成时间：YYYY-MM-DD
> Loop ID：loop-YYYYMMDD-NNN
> 状态：待确认

---

## 1. 背景与动机
<为什么要做这个功能？解决什么痛点？>

## 2. 目标与成功指标
- **目标 1**：<目标描述>
  - 指标：<可量化的成功指标>
- **目标 2**：<目标描述>
  - 指标：<可量化的成功指标>

## 3. 用户画像
| 角色 | 描述 | 核心诉求 |
|------|------|----------|
| <角色 1> | <描述> | <诉求> |
| <角色 2> | <描述> | <诉求> |

## 4. 用户故事与验收标准
### US-001: <用户故事标题>
- **角色**：作为 <角色>
- **行为**：我想要 <行为>
- **价值**：以便 <价值>
- **验收标准**：
  - AC-001: Given <前置条件>，When <操作>，Then <预期结果>
  - AC-002: Given <前置条件>，When <操作>，Then <预期结果>

### US-002: <用户故事标题>
...

## 5. 功能需求
| 编号 | 需求 | 优先级 | 关联用户故事 |
|------|------|--------|-------------|
| FR-001 | <需求描述> | P0 | US-001 |
| FR-002 | <需求描述> | P1 | US-001, US-002 |

**优先级定义**：
- P0：必须有，没有就不能上线
- P1：应该有，影响核心体验
- P2：可以有，锦上添花

## 6. 非功能需求
- **性能**：<页面加载时间、API 响应时间要求>
- **可访问性**：WCAG 2.1 AA 级别
- **SEO**：<如有公开页面>
- **安全**：认证/授权方案、输入验证、数据加密
- **国际化**：<是否需要多语言>

## 7. API 契约草稿
### POST /api/<resource>
- **描述**：<操作描述>
- **Request Body**：
  ```typescript
  {
    field1: string   // 描述
    field2: number   // 描述
  }
  ```
- **Response 200**：
  ```typescript
  {
    data: {
      id: string
      field1: string
      field2: number
      createdAt: string
    }
  }
  ```
- **Error Responses**：
  - 400: <错误场景>
  - 401: <错误场景>
  - 404: <错误场景>

### GET /api/<resource>
...

## 8. UI 规格
### 页面结构
- **页面 1: <页面名称>** (`/<route>`)
  - 布局描述
  - 包含组件：[组件列表]
  - 交互流程：[步骤描述]

### 组件拆分
| 组件 | 类型 | 使用的 shadcn 组件 | 描述 |
|------|------|-------------------|------|
| <ComponentName> | Feature | Button, Input, Form | <描述> |

### 交互流程
1. 用户 <操作> → <系统响应>
2. 用户 <操作> → <系统响应>

## 9. 不在范围
- <明确列出不做的功能，避免范围蔓延>

## 10. 开放问题
- [ ] <待确认的技术/业务问题>
```

---

### Step 3：输出 + 用户确认

将 PRD 写入 `.loop/prd.md`：

```bash
# 使用 Write 工具直接写入
```

写入后，向用户展示 PRD 概要并请求确认：

```
📋 PRD 生成完成
──────────────────────────────
功能：<功能名称>
用户故事：<N> 个
功能需求：<N> 条（P0: <n>, P1: <n>, P2: <n>）
API 端点：<N> 个
验收标准：<N> 条
文件位置：.loop/prd.md
```

用 `AskUserQuestion` 询问：

选项（3 选 1）：
- **确认，继续**：PRD 没问题，进入下一步（原型/开发）
- **需要修改**：指出需要调整的部分，我来修改
- **重新生成**：需求理解有偏差，重新来

---

### Step 4：处理修改

如果用户要求修改：
1. 根据反馈修改 PRD 对应章节
2. 重新写入 `.loop/prd.md`
3. 展示修改内容，再次确认
4. 循环直到用户确认

---

### Step 5：更新 session.json

确认通过后，更新 `.loop/session.json`：

```json
{
  "currentPhase": "prototype",
  "phases": {
    "prd": { "status": "completed", "completedAt": "<ISO timestamp>" }
  },
  "artifacts": {
    "prd": ".loop/prd.md"
  }
}
```

---

## 红线（不可违反）

1. **需求不清必须问，严禁猜方向** — 宁可多问一个问题，不要生成错误 PRD
2. **每条功能需求必须有优先级**（P0/P1/P2）
3. **每个用户故事必须有可测试的验收标准**（Given/When/Then 格式）
4. **API 契约必须包含 Request/Response/Errors** — 这是后续 MSW 和测试的基础
5. **PRD 写入 `.loop/prd.md`，不写其他位置**
6. **不替用户做业务决策** — 有疑问就问，不要假设
7. **PRD 语言与用户一致** — 用户用中文就写中文 PRD

---

## 特殊情况处理

| 情况 | 处理方式 |
|------|---------|
| 用户已有 PRD 文档 | 读取并导入到 `.loop/prd.md`，不重新生成 |
| 需求只涉及 UI 改动 | 简化 PRD，省略 API 契约，聚焦 UI 规格 |
| 需求涉及多个独立功能 | 建议拆分为多个 loop，每个独立 PRD |
| 用户要求跳过 PRD | 警告：下游原型和测试依赖 PRD。如用户坚持，创建最小 PRD（仅用户故事+验收标准） |
| `.loop/` 目录已存在且有旧数据 | 询问用户：覆盖当前 loop 还是归档旧数据后新建？ |
