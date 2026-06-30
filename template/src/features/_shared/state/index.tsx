/**
 * 通用状态展示组件 — Loading / Empty / Error
 *
 * dev-dev skill 红线：任何 feature 不得重复实现这三类状态，统一从此处导入。
 * 视觉上保持 shadcn/Tailwind 风格，无外部依赖。
 */
import * as React from 'react'
import { cn } from '@/lib/utils'

interface BaseProps {
  className?: string
  children?: React.ReactNode
}

export function Loading({ className, children }: BaseProps) {
  return (
    <div
      className={cn(
        'flex min-h-[200px] flex-col items-center justify-center gap-3 text-muted-foreground',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <div className="size-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {children ?? <span className="text-sm">加载中…</span>}
    </div>
  )
}

interface SkeletonListProps {
  rows?: number
  className?: string
}

export function SkeletonList({ rows = 5, className }: SkeletonListProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  )
}

interface EmptyStateProps extends BaseProps {
  title?: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ title = '暂无数据', description, action, className, children }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[200px] flex-col items-center justify-center gap-2 px-4 py-8 text-center',
        className
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

interface ErrorStateProps extends BaseProps {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({
  title = '出错了',
  description = '请稍后重试或联系管理员',
  onRetry,
  className,
  children,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[200px] flex-col items-center justify-center gap-2 px-4 py-8 text-center',
        className
      )}
      role="alert"
    >
      <p className="text-sm font-medium text-destructive">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
      {children}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-input bg-background px-3 py-1 text-xs hover:bg-accent"
        >
          重试
        </button>
      )}
    </div>
  )
}
