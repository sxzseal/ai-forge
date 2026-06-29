/**
 * 通用表单字段布局 — Label / 必填星号 / 错误文案
 *
 * 与 TanStack Form 或原生表单都兼容：
 *   - 配合 TanStack Form 时，把 field.state.meta 传给 formErrorText() 获取错误
 *   - 配合原生表单时，直接传 error: string 即可
 *
 * 不强依赖 TanStack Form，避免在没装的项目里报错。
 */
import * as React from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface FormFieldProps {
  label: React.ReactNode
  required?: boolean
  error?: string | null
  hint?: React.ReactNode
  htmlFor?: string
  className?: string
  children: React.ReactNode
}

export function FormField({ label, required, error, hint, htmlFor, className, children }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

interface FieldMetaLike {
  isTouched?: boolean
  errors?: ReadonlyArray<unknown>
}

/**
 * 从 TanStack Form 的 field.state.meta 中提取第一条错误文案。
 * 只在 touched 后展示，避免初始渲染就报错。
 */
export function formErrorText(meta: FieldMetaLike | undefined | null): string | null {
  if (!meta?.isTouched) return null
  const first = meta.errors?.[0]
  if (!first) return null
  if (typeof first === 'string') return first
  if (typeof first === 'object' && first !== null && 'message' in first) {
    const msg = (first as { message?: unknown }).message
    return typeof msg === 'string' ? msg : null
  }
  return null
}
