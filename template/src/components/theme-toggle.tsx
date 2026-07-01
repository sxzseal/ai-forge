'use client'

import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

const ORDER = ['light', 'dark', 'system'] as const
type ThemeMode = (typeof ORDER)[number]

export function ThemeToggle() {
  const t = useTranslations('ThemeToggle')
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const current = (mounted ? (theme as ThemeMode) : 'light') ?? 'light'
  const nextTheme = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]

  const Icon = current === 'dark' ? Moon : current === 'system' ? Monitor : Sun

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={t('label')}
      title={t(current)}
      onClick={() => setTheme(nextTheme)}
    >
      <Icon className="h-4 w-4" />
    </Button>
  )
}
