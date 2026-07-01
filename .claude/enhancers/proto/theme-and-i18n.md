---
name: theme-and-i18n
description: 原型阶段必须使用主题 CSS 变量 + next-intl 翻译，禁止硬编码颜色和裸文本
enhances: proto
priority: high
appliesTo: [ui, story, component, text, label, button, form, page, header, layout]
---

# 主题 + 国际化规范（原型阶段）

模板已经内置 `next-themes` + `next-intl`，`app/[locale]/layout.tsx` 挂了 `ThemeProvider`（`attribute="class"`, `defaultTheme="light"`, `enableSystem`）和 `NextIntlClientProvider`；Tailwind `darkMode: 'class'`，CSS 变量在 `globals.css`。原型生成的每个 story 都必须与这套配置兼容。

## 必须遵守

### 颜色 / 主题
- **只用语义化 Tailwind token**：`bg-background` / `text-foreground` / `bg-primary` / `text-muted-foreground` / `border-input` / `bg-card` 等，全部落到 CSS 变量。
- **禁止硬编码颜色**：不写 `bg-white`、`text-gray-900`、`bg-[#fff]`、`text-[hsl(...)]`、`style={{ color: '#000' }}`。破例仅限品牌 logo / 装饰性插画。
- **深色态**：不要写 `dark:bg-...`，因为语义 token 会自动切换。如果确实需要覆盖，才用 `dark:` 前缀。
- **图标**：`currentColor`（Lucide 默认即 `stroke="currentColor"`），随文本色变化。

### 文案 / i18n
- **禁止裸文本**：JSX 中所有面向用户的字符串必须通过 `useTranslations()` / `getTranslations()` 或 story 用 `NextIntlClientProvider` 注入。
  - 反例 `<h1>登录</h1>` / `<Button>Submit</Button>`
  - 正例 `<h1>{t('login.title')}</h1>` / `<Button>{t('actions.submit')}</Button>`
- **同步补齐两份**：新增 key 必须同时写入 `messages/zh-CN.json` 和 `messages/en.json`，key 用命名空间嵌套（如 `Login.title`）。
- **动态值**用 ICU 占位符：`t('greeting', { name })`，不用字符串拼接。
- **aria-label / title / placeholder** 也要走 `t()`。

## Story 编写模式

Story 顶层用 `NextIntlClientProvider` 包一层，直接引入项目 messages。**这样在 Storybook 里也能验证 i18n。**

```tsx
// src/features/login/login-form.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { NextIntlClientProvider } from 'next-intl'
import zhCN from '../../../messages/zh-CN.json'
import en from '../../../messages/en.json'
import { LoginForm } from './login-form'

const meta: Meta<typeof LoginForm> = {
  title: 'Features/Login/LoginForm',
  component: LoginForm,
  decorators: [
    (Story, ctx) => {
      const locale = ctx.globals.locale ?? 'zh-CN'
      const messages = locale === 'en' ? en : zhCN
      return (
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Story />
        </NextIntlClientProvider>
      )
    },
  ],
}
export default meta
type Story = StoryObj<typeof LoginForm>
export const Default: Story = {}
```

**每个含文案的组件都必须给出至少 2 个语言下的 story 表现**（可以通过 `globals.locale` 切换单个 story，也可以复制成 `Default` + `English` 两个 story）。

## 组件模式

### Server Component

```tsx
import { getTranslations } from 'next-intl/server'

export async function Header() {
  const t = await getTranslations('Header')
  return <h1 className="text-foreground">{t('title')}</h1>
}
```

### Client Component

```tsx
'use client'
import { useTranslations } from 'next-intl'

export function LoginForm() {
  const t = useTranslations('Login')
  return (
    <form className="rounded-md border border-input bg-background p-4">
      <label className="text-sm text-muted-foreground">{t('email')}</label>
      {/* ... */}
    </form>
  )
}
```

### 路由跳转

用 `@/i18n/navigation` 的 `Link` / `useRouter`，而不是 `next/link` 和 `next/navigation`——这样切换 locale 时会保持路径。

```tsx
import { Link } from '@/i18n/navigation'
<Link href="/dashboard">{t('nav.dashboard')}</Link>
```

## 反模式（禁止）

- `<div className="bg-white text-black">`
- `style={{ backgroundColor: '#fff' }}`
- `<Button>提交</Button>` — 应为 `<Button>{t('submit')}</Button>`
- 只更新 `zh-CN.json` 忽略 `en.json`
- 用 `next/link` 而非 `@/i18n/navigation` 的 `Link`
- 硬编码 `lang="zh-CN"`——`layout.tsx` 已用 `params.locale`

## 交叉引用

- 主题变量：见 `src/app/globals.css` 的 `:root` 和 `.dark`。
- 语言配置：见 `src/i18n/routing.ts`。
- 现成的切换控件：`@/components/theme-toggle`、`@/components/locale-switcher`——直接复用，不要重造。
