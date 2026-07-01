import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ThemeToggle } from '@/components/theme-toggle'
import { LocaleSwitcher } from '@/components/locale-switcher'

interface HomePageProps {
  params: Promise<{ locale: string }>
}

export default async function Home({ params }: HomePageProps) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('Home')

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-24">
      <div className="absolute right-6 top-6 flex items-center gap-2">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{t('subtitle')}</p>
        <div className="mt-8 flex gap-4 justify-center">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/health"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t('apiHealth')}
          </a>
          <a
            href="http://localhost:6006"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            {t('storybook')}
          </a>
        </div>
      </div>
    </main>
  )
}
