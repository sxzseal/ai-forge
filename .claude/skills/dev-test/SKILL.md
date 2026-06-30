---
name: dev-test
description: 从 PRD 验收标准自动生成测试用例，通过人工验证桥梁解决 AI 弱于业务测试的痛点。触发词："生成测试"、"跑测试"、"dev-test"、"自动测试"、"写测试"。
---

# Dev Test — 测试生成与验证器

## 何时启用

用户说出以下任意表达时立即激活：

- 「生成测试」「写测试」「跑测试」
- 「自动测试」「dev-test」
- 用户主动调用此 skill 做完整测试套件生成（**独立 skill**，不在 `/dev-loop` 默认管线中）

**前置条件**（至少一项满足）：

- `.loop/acceptance-checklist.md` 存在（dev-proto 产出，主输入）
- `.loop/prd.md` 存在（用户手动跑过 `/dev-prd`，含 AC-xxx 验收标准）
- 代码已实现（提供具体可测目标）

**不启用**：

- 没有 PRD 也没有代码
- 用户只想手动写测试

---

## 核心理念：三层桥梁

AI 能写测试代码，但无法验证测试是否正确捕获了业务逻辑。

本 skill 通过三层桥梁解决这个问题：

```
Layer 1: PRD 验收标准 → 测试意图（中文 Given/When/Then）
Layer 2: 人工验证 STOP POINT → 用户确认业务逻辑是否正确
Layer 3: 验证通过 → 生成测试代码（标注 AC 编号 + AI 置信度）
```

关键：**在写测试代码之前，先让用户审阅测试意图**。

---

## 完整执行流程

### Step 0：环境检查

```bash
# 检查测试框架
cat package.json | grep -E '"(vitest|@playwright/test)"'

# 检查测试目录
ls tests/ 2>/dev/null || echo "NO_TESTS_DIR"
```

如果测试框架未安装：

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
npm install -D @playwright/test
npx playwright install
```

创建测试目录：

```bash
mkdir -p tests/unit/components tests/integration/api tests/e2e/flows tests/helpers
```

---

### Step 1：解析验收标准

按优先级读取输入：

1. **`.loop/acceptance-checklist.md`**（主输入，dev-proto 产出）— 提取每条 `AC-xxx [模块] 描述`
2. **`.loop/prd.md`**（如有）— 提取 Section 4 的 AC-xxx 条目，作为补充
3. **`.loop/prototype/stories-manifest.md`**（如有）— 提取 Story 文件列表与 AC 映射关系

> 两者都存在时以验收清单为准；只有 PRD 时按 PRD 走；都没有则让用户先跑 `/dev-proto` 或 `/dev-prd`。

对每条 AC，分析：

| 字段 | 提取内容 |
|------|---------|
| AC 编号 | AC-001 |
| 所属用户故事 | US-001 |
| Given | 前置条件 |
| When | 用户操作 |
| Then | 预期结果 |
| 测试类型 | Unit / Integration / E2E |
| 关联组件/API | 需要测试的代码路径 |
| **关联 Story** | `.loop/prototype/stories-manifest.md` 中对应的 story 文件路径（如无则为"—"）|

**测试类型判断规则**：

| 场景 | 类型 |
|------|------|
| 纯 UI 交互（按钮点击、表单验证） | Unit (Vitest + Testing Library) |
| API 请求/响应（数据校验、权限检查） | Integration (Vitest) |
| 跨页面流程（登录→跳转→操作） | E2E (Playwright) |
| 涉及多个组件的交互 | E2E (Playwright) |

---

### Step 2：生成测试场景文档（Layer 1）

将每条 AC 转化为「测试意图」，用中文 Given/When/Then 描述：

```markdown
# 测试场景：<功能名称>

> 生成时间：YYYY-MM-DD
> 关联 PRD：.loop/prd.md
> 状态：待人工验证

---

## AC-001: <验收标准原文>

- **测试类型**：E2E
- **测试意图**：
  - Given 用户在登录页面，且已注册账号 (test@example.com / ValidPass123!)
  - When 用户输入正确的邮箱和密码，点击"登录"按钮
  - Then 页面跳转到 /dashboard，显示欢迎消息"欢迎回来"
- **AI 置信度**：High ✅
- **关联 Story**：`src/stories/octopush/auth.stories.tsx`（v1 · 登录流程 play function）
- **Storybook 预览**：http://localhost:6006/?story=octopush--登录-认证
- **测试文件**：tests/e2e/flows/authentication.spec.ts
- **备注**：—

## AC-002: <验收标准原文>

- **测试类型**：Integration + E2E
- **测试意图**：
  - Given 用户在登录页面
  - When 用户输入正确的邮箱但错误的密码
  - Then 页面不跳转，显示错误消息"用户名或密码错误"
- **AI 置信度**：High ✅
- **关联 Story**：`src/stories/octopush/auth.stories.tsx`（v1 · 错误提示 play function）
- **Storybook 预览**：http://localhost:6006/?story=octopush--登录-认证
- **测试文件**：tests/integration/api/auth.test.ts + tests/e2e/flows/authentication.spec.ts
- **备注**：—

## AC-003: <验收标准原文>

- **测试类型**：E2E
- **测试意图**：
  - Given 用户已登录，在仪表盘页面
  - When 用户 30 分钟无操作
  - Then 会话过期，重定向到登录页，显示"会话已过期"
- **AI 置信度**：Medium ⚠️
- **关联 Story**：—（原型未覆盖此场景）
- **Storybook 预览**：—
- **测试文件**：tests/e2e/flows/authentication.spec.ts
- **备注**：需要确认超时时间是否真的是 30 分钟

---

## 汇总

| AC | 类型 | 置信度 | 关联 Story | 状态 |
|----|------|--------|-----------|------|
| AC-001 | E2E | High ✅ | auth.stories.tsx | 待验证 |
| AC-002 | Integration + E2E | High ✅ | auth.stories.tsx | 待验证 |
| AC-003 | E2E | Medium ⚠️ | — | 待验证 |

**置信度说明**：
- High ✅：AC 描述清晰明确，测试意图准确
- Medium ⚠️：AC 有模糊之处，可能需要确认
- Low ❌：AC 不够具体，需要补充后才能生成测试
```

写入 `.loop/test/scenarios.md`。

---

### Step 3：人工验证 STOP POINT（Layer 2）

**这是整个流程最关键的一步。**

向用户展示测试场景摘要，并用 `AskUserQuestion` 逐条确认：

```
🧪 测试场景已生成
──────────────────────────────
共 <N> 条测试场景，请确认业务逻辑是否正确。

⚠️ 请仔细检查每条测试的 Given/When/Then 是否准确反映了您的业务需求。
   如果测试场景有误，生成的测试代码也会是错误的。

💡 有原型可参考的场景，请在 Storybook 中先操作一遍再确认：
   http://localhost:6006
```

选项：
- **全部正确，生成测试代码**：所有场景都没问题
- **部分需要修改**：指出哪些需要修改
- **重新生成**：测试意图理解有偏差

对于 Medium 置信度的场景，额外提示：
```
⚠️ AC-003 置信度 Medium：
   会话超时时间写的是 30 分钟，是否正确？
   当前测试意图：Given 用户已登录...When 30分钟无操作...Then 会话过期
```

**处理用户反馈**：
- 用户指出错误 → 修改测试场景，重新确认
- 用户补充细节 → 更新场景，调整置信度
- 用户确认全部正确 → 进入 Step 4

记录用户验证结果到 `.loop/test/human-validation.md`：

```markdown
# 人工验证结果

> 验证时间：YYYY-MM-DD

| AC | 用户判定 | 修改说明 |
|----|---------|---------|
| AC-001 | ✅ 正确 | — |
| AC-002 | ✅ 正确 | — |
| AC-003 | ✏️ 修改 | 超时时间是 2 小时，不是 30 分钟 |
```

---

### Step 4：生成测试代码（Layer 3）

根据验证通过的测试场景，生成测试代码。

**每条测试必须**：
1. 注释标注关联的 AC 编号
2. 测试名称使用中文描述
3. 遵循 arrange / act / assert 模式
4. 使用 `data-testid` 定位元素（不依赖文本内容）

### Unit 测试模板（Vitest + Testing Library）

```typescript
// tests/unit/components/<Component>.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { <Component> } from '@/components/features/<feature>/<Component>'

describe('<Component>', () => {
  // AC-001: <验收标准简述>
  it('AC-001: <中文测试描述>', async () => {
    // Arrange
    render(<<Component> {...props} />)

    // Act
    fireEvent.click(screen.getByTestId('submit-btn'))

    // Assert
    await waitFor(() => {
      expect(screen.getByTestId('success-message')).toBeInTheDocument()
    })
  })
})
```

### Integration 测试模板（Vitest）

```typescript
// tests/integration/api/<resource>.test.ts
import { describe, it, expect } from 'vitest'

// 使用 Next.js 测试工具或 supertest
describe('POST /api/<resource>', () => {
  // AC-001: <验收标准简述>
  it('AC-001: <中文测试描述>', async () => {
    // Arrange
    const body = { /* 请求数据 */ }

    // Act
    const response = await fetch('/api/<resource>', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json()

    // Assert
    expect(response.status).toBe(201)
    expect(data.data).toBeDefined()
  })

  // AC-002: 错误场景
  it('AC-002: 缺少必填字段时返回 400', async () => {
    const body = { /* 缺少必填字段 */ }

    const response = await fetch('/api/<resource>', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    expect(response.status).toBe(400)
  })
})
```

### E2E 测试模板（Playwright）

```typescript
// tests/e2e/flows/<feature>.spec.ts
import { test, expect } from '@playwright/test'

test.describe('<功能名称> 流程', () => {
  // AC-001: <验收标准简述>
  test('AC-001: <中文测试描述>', async ({ page }) => {
    // Arrange
    await page.goto('/<route>')

    // Act
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'ValidPass123!')
    await page.click('[data-testid="submit-btn"]')

    // Assert
    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('[data-testid="welcome-message"]')).toBeVisible()
  })

  // AC-002: 错误场景
  test('AC-002: <中文错误场景描述>', async ({ page }) => {
    await page.goto('/<route>')
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'WrongPass!')
    await page.click('[data-testid="submit-btn"]')

    await expect(page.locator('[data-testid="error-message"]')).toContainText('错误信息')
    await expect(page).toHaveURL('/<current-route>')
  })
})
```

---

### Step 5：运行测试

```bash
# 运行所有测试
npm run test

# 或分步运行
npx vitest run                          # Unit + Integration
npx playwright test                     # E2E

# 生成覆盖率报告
npx vitest run --coverage
```

**如果测试失败**：
1. 分析失败原因
2. 区分：测试代码问题 vs 实现代码问题
3. 测试代码问题 → 修复测试
4. 实现代码问题 → 记录到 `.loop/test/coverage-report.md`，建议用户修复实现

---

### Step 6：输出覆盖率报告

写入 `.loop/test/coverage-report.md`：

```markdown
# 测试覆盖率报告

> 运行时间：YYYY-MM-DD
> 测试框架：Vitest + Playwright

## 测试结果

| 类型 | 总数 | 通过 | 失败 | 跳过 |
|------|------|------|------|------|
| Unit | <n> | <n> | <n> | <n> |
| Integration | <n> | <n> | <n> | <n> |
| E2E | <n> | <n> | <n> | <n> |
| **合计** | **<n>** | **<n>** | **<n>** | **<n>** |

## 覆盖率

| 指标 | 覆盖率 | 目标 |
|------|--------|------|
| Statements | <n>% | ≥ 80% |
| Branches | <n>% | ≥ 80% |
| Functions | <n>% | ≥ 80% |
| Lines | <n>% | ≥ 80% |

## 未覆盖的验收标准

| AC | 原因 | 建议 |
|----|------|------|
| AC-xxx | <原因> | <建议> |

## P0 功能需求覆盖率（最关键指标）

> 代码覆盖率 ≥ 80% 不代表 P0 功能都被测试覆盖了。
> 此表逐条对照 PRD Section 4 中所有 P0 验收标准，确认是否有对应测试用例。

| PRD 验收标准（AC） | 优先级 | 对应测试用例 | 覆盖状态 |
|------------------|--------|------------|---------|
| AC-001: <验收标准原文> | P0 | tests/e2e/flows/auth.spec.ts::AC-001 | ✅ 已覆盖 |
| AC-002: <验收标准原文> | P0 | tests/integration/api/auth.test.ts::AC-002 | ✅ 已覆盖 |
| AC-003: <验收标准原文> | P0 | — | ❌ 缺失（需补充）|
| AC-004: <验收标准原文> | P1 | tests/e2e/flows/team.spec.ts::AC-004 | ✅ 已覆盖 |

### P0 覆盖率统计

| 指标 | 数值 |
|------|------|
| P0 验收标准总数 | <N> |
| 已有测试覆盖 | <n> |
| 缺失测试 | <n> |
| **P0 覆盖率** | **<n>%** |

> ⚠️ P0 覆盖率 < 100% 时，必须明确列出缺失原因，并在部署前由用户决定是否接受。

## 失败测试

| 测试 | 错误 | 分类 |
|------|------|------|
| <测试名> | <错误信息> | 测试问题 / 实现问题 |
```

---

### Step 7：用户确认

```
🧪 测试完成
──────────────────────────────
总测试：<N> 个 | 通过：<N> | 失败：<N>
代码覆盖率：<N>%（目标 ≥ 80%）
P0 功能覆盖率：<n/N>（目标 100%）
报告：.loop/test/coverage-report.md
```

用 `AskUserQuestion` 询问：
- **确认，继续部署**：测试全部通过
- **修复失败测试**：处理失败的测试
- **补充测试**：覆盖率不够，增加更多测试

---

### Step 8：更新 session.json

dev-test 是**独立 skill**，不接管 `/dev-loop` 阶段流转。只在 `lastTest` 字段记录本次测试结果，**不覆写** `currentPhase`：

```json
{
  "lastTest": {
    "completedAt": "<ISO timestamp>",
    "scenarios": ".loop/test/scenarios.md",
    "coverageReport": ".loop/test/coverage-report.md",
    "p0Coverage": { "total": <N>, "covered": <n>, "percent": <n> }
  }
}
```

> **不要**写入 `currentPhase: "deploy"` — `/dev-loop` 当前只编排 proto/dev/deploy 三个阶段，dev-test 是补充测试工具。

---

## 红线（不可违反）

1. **必须有人工验证 STOP POINT** — 不能在用户确认前生成测试代码
2. **每条测试必须标注 AC 编号** — 可追溯到 PRD 验收标准
3. **测试名称用中文** — 方便审阅和理解
4. **置信度 Medium/Low 的场景必须提示用户** — 不能默默跳过
5. **覆盖率目标 ≥ 80%** — 低于目标要提示用户
6. **P0 验收标准必须有对应测试** — P0 覆盖率必须逐条检查，缺失需明确告知用户
7. **每条测试场景必须标注关联 Story**（如有原型）— 人工验证时可在 Storybook 中先操作
8. **失败测试必须分类** — 区分测试问题 vs 实现问题
9. **测试场景和覆盖率报告写入 `.loop/test/`**

---

## 特殊情况处理

| 情况 | 处理方式 |
|------|---------|
| PRD 没有验收标准 | 基于功能需求推导验收标准，需用户确认 |
| 验收标准不可测试 | 标记为 Low 置信度，建议用户改写为可测试形式 |
| 测试框架未安装 | 自动安装 vitest + playwright，告知用户 |
| E2E 测试需要真实后端 | 使用 MSW 或测试数据库，不依赖生产环境 |
| 某些 AC 无法自动化测试 | 标记为「手动测试」，写入测试报告 |
| 覆盖率不达标 | 分析未覆盖代码，建议补充测试或标记为可接受 |
