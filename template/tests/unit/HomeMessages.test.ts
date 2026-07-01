// Home messages contract test.
//
// The real `src/app/[locale]/page.tsx` is an async server component built on
// `getTranslations` + `setRequestLocale`. Those need the next-intl request
// context that jsdom cannot provide, so this file does NOT render the page —
// it locks in the messages JSON contract the page depends on:
//   • every key the page reads exists in every locale
//   • zh-CN and en carry the same shape (catch key drift on new translations)
// Rendered behavior of `page.tsx` is covered by `tests/e2e/home.spec.ts`.
import { describe, expect, it } from 'vitest'
import zhCN from '../../messages/zh-CN.json'
import en from '../../messages/en.json'

const HOME_KEYS_USED_BY_PAGE = ['title', 'subtitle', 'apiHealth', 'storybook'] as const

describe('Home messages contract', () => {
  it.each(['zh-CN', 'en'] as const)(
    '%s contains every key the page renders',
    (locale) => {
      const messages = locale === 'zh-CN' ? zhCN : en
      for (const key of HOME_KEYS_USED_BY_PAGE) {
        const value = messages.Home[key as keyof typeof messages.Home]
        expect(value, `${locale}.Home.${key}`).toBeTruthy()
        expect(typeof value, `${locale}.Home.${key} type`).toBe('string')
      }
    },
  )

  it('zh-CN and en share the same Home key shape', () => {
    expect(Object.keys(zhCN.Home).sort()).toEqual(Object.keys(en.Home).sort())
  })
})
