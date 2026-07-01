---
name: theme-and-i18n
description: 开发阶段所有页面 / 组件 / 邮件模版必须使用语义主题 token + next-intl，覆盖 SSR、API 错误信息、metadata
enhances: dev
priority: high
appliesTo: [page, component, api, route, layout, form, text, label, error, metadata, email]
---

# 主题 + 国际化规范（开发阶段）

原型阶段的规范延续到开发阶段，并且要求**贯穿 SSR、API 错误信息、`generateMetadata`、邮件模版**。核心结构：

- `src/app/[locale]/` — 所有页面挂在 locale 段下
- `messages/{zh-CN,en}.json` — 消息目录，key 用命名空间嵌套
- `src/i18n/{routing,request,navigation}.ts` — next-intl 配置
- `src/middleware.ts` — locale 检测中间件
- `next.config.ts` 已用 `createNextIntlPlugin` 包装

## 必须遵守

### 页面路由
- 新页面**必须**创建在 `src/app/[locale]/<segment>/page.tsx`，页面的第一行是 `const { locale } = await params; setRequestLocale(locale)`——否则 SSG 时 next-intl 拿不到 locale。
- 所有**页面级跳转**用 `@/i18n/navigation` 的 `Link` / `useRouter` / `redirect`，不用 `next/link` / `next/navigation` 的对应物。
  - **例外**：`/api/*` 路由不在 `[locale]` 段下，直接用原生 `<a href="/api/...">`（记得配 `eslint-disable @next/next/no-html-link-for-pages`），或者用 `fetch` / `request()`。API 不需要 locale 前缀。
- 静态生成：`src/app/[locale]/layout.tsx` 已 export `generateStaticParams` 覆盖所有 locale，**页面不需要再 export 一份**（Next.js 会自动传递给子页面）。仅在页面自己还有额外动态段（如 `[locale]/posts/[slug]/page.tsx`）时，才写页面级 `generateStaticParams` 且必须合并 locale × slug。

### Metadata
`generateMetadata` 必须按 locale 返回：

```tsx
import { getTranslations } from 'next-intl/server'

export async function generateMetadata({ params }: Props) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Meta' })
  return { title: t('title'), description: t('description') }
}
```

### API 错误信息
`/api/*` 路由属于 locale 外，但如果返回给用户的 `message` 是最终展示文本，应通过 header/cookie 或请求体带上 locale，使用 `getTranslations({ locale, namespace: 'Errors' })`。默认在前端 catch 处再 `t()` 也可以——**不要在服务端 hardcode 用户可见的中文/英文字符串**。

> **机器字段例外**：`status: 'ok'` / `code: 'USER_NOT_FOUND'` / envelope 的 `status_code` 这类给程序读的枚举/标识不算"用户可见文本"，可以保持英文常量。规则只约束最终会渲染到 UI 的字符串。

### 颜色 / 主题
- 只用语义 Tailwind token（`bg-background` / `text-foreground` / `bg-primary` / `border-input` / `bg-card` / `text-muted-foreground` 等）。
- 需要新增语义时先扩展 `globals.css` 的 CSS 变量 + `tailwind.config.ts` 的 colors 映射，不要 inline 颜色。
- 图片 / SVG 装饰用 `currentColor` 或独立提供暗色变体。

### 文案
- **任何** JSX 里的用户可见字符串（包括 `aria-label`、`title`、`placeholder`、`alt`）都必须 `t()`。
- 新增 key 同步更新 **全部** 语言文件；缺失翻译在开发时 next-intl 会抛错，不允许静默兜底。
- 命名空间按功能模块划分：`Home` / `Login` / `Dashboard.Sidebar` / `Errors.Validation` ……

### 测试
- 单元测试用 `NextIntlClientProvider` 包装（模板的 `tests/helpers/render.tsx` 已默认注入 `zh-CN` messages）；断言可以直接读 `messages/zh-CN.json` 的 key，不要断言"登录"这种硬编码字面量。
- E2E 至少覆盖两条 locale 路径：`/` 和 `/en`。
- 主题切换：在 e2e 中验证 `<html class="dark">` 能通过 `ThemeToggle` 触发。

## 交叉引用

- 详细模式和 story 写法见原型阶段同名 enhancer：`enhancers/proto/theme-and-i18n.md`。
- 现成切换控件：`@/components/theme-toggle`、`@/components/locale-switcher`。
- 项目 CLAUDE.md 的"主题与国际化"小节列出了所有相关文件。

## 反模式（禁止）

- 页面写在 `src/app/<segment>/page.tsx`（少了 `[locale]/`）
- 忘写 `setRequestLocale(locale)`——生产 SSG 会退化到 SSR
- `throw new Error('登录失败')`——用户可见错误信息也要 i18n
- 在组件里用 `next/link` / `useRouter from 'next/navigation'` 跳**页面**（跳 `/api/*` 用原生 `<a>` 是允许的例外）
- 只更新一份 messages json
- inline hex 颜色 / `bg-white` / `text-gray-*` 硬编码
- 页面级又 export 一份重复的 `generateStaticParams(locale)`——layout 已经提供
