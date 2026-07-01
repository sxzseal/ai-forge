import { render, type RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { type ReactElement } from 'react'
import zhMessages from '../../messages/zh-CN.json'

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  locale?: string
  messages?: AbstractIntlMessages
}

function renderWithProviders(ui: ReactElement, options: ProviderOptions = {}) {
  const {
    locale = 'zh-CN',
    messages = zhMessages as AbstractIntlMessages,
    ...rest
  } = options

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    )
  }

  return {
    user: userEvent.setup(),
    ...render(ui, { wrapper: Wrapper, ...rest }),
  }
}

export { renderWithProviders as render }
