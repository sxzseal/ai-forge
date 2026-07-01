import type { Preview } from '@storybook/nextjs-vite'
import '../src/app/globals.css'
import { createElement } from 'react'
import { initialize, mswLoader } from 'msw-storybook-addon'
import { withThemeByClassName } from '@storybook/addon-themes'
import { NextIntlClientProvider } from 'next-intl'
import { visualFeedbackDecorator } from './visual-feedback/overlay'
import zhCN from '../messages/zh-CN.json'
import en from '../messages/en.json'

initialize()

const messagesByLocale: Record<string, Record<string, unknown>> = {
  'zh-CN': zhCN,
  en,
}

const viewports = {
  mobile: {
    name: '📱 Mobile (375)',
    styles: { width: '375px', height: '812px' },
    type: 'mobile' as const,
  },
  tablet: {
    name: '📱 Tablet (768)',
    styles: { width: '768px', height: '1024px' },
    type: 'tablet' as const,
  },
  laptop: {
    name: '💻 Laptop (1280)',
    styles: { width: '1280px', height: '800px' },
    type: 'desktop' as const,
  },
  desktop: {
    name: '🖥️ Desktop (1440)',
    styles: { width: '1440px', height: '900px' },
    type: 'desktop' as const,
  },
  wide: {
    name: '🖥️ Wide (1920)',
    styles: { width: '1920px', height: '1080px' },
    type: 'desktop' as const,
  },
}

const preview: Preview = {
  loaders: [mswLoader],
  globalTypes: {
    locale: {
      name: 'Locale',
      description: 'Active language for i18n',
      defaultValue: 'zh-CN',
      toolbar: {
        icon: 'globe',
        items: [
          { value: 'zh-CN', title: '中文' },
          { value: 'en', title: 'English' },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    controls: { expanded: true },
    layout: 'centered',
    viewport: {
      viewports,
      defaultViewport: 'laptop',
    },
  },
  decorators: [
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
    }),
    (Story, ctx) => {
      const locale = (ctx.globals.locale as string) ?? 'zh-CN'
      const messages = messagesByLocale[locale] ?? zhCN
      return createElement(
        NextIntlClientProvider,
        { locale, messages },
        createElement(Story),
      )
    },
    visualFeedbackDecorator,
  ],
}

export default preview
