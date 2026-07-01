import { notFound } from 'next/navigation'
import { getRequestConfig } from 'next-intl/server'
import { routing, type Locale } from './routing'

function isSupportedLocale(candidate: string | undefined): candidate is Locale {
  return (
    typeof candidate === 'string' &&
    (routing.locales as readonly string[]).includes(candidate)
  )
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  if (!isSupportedLocale(requested)) notFound()

  return {
    locale: requested,
    messages: (await import(`../../messages/${requested}.json`)).default,
  }
})
