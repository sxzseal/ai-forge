---
name: shadcn-form-patterns
description: 原型阶段生成表单时统一使用 shadcn Form + react-hook-form + zod 的规范（示例 enhancer）
enhances: proto
priority: medium
appliesTo: [form, input, validation, dialog]
---

# 表单生成规范（示例 enhancer）

> 这是一个示例 enhancer，演示如何在原型阶段约束 AI 生成表单的方式。
> 真实项目可以保留、修改或删除本文件。

## 必须遵守

- 所有表单使用 **shadcn `<Form>` + react-hook-form + zod**，不手写 `useState` 管理字段
- 校验通过 zod schema 集中定义，schema 与 story 同目录
- 错误信息渲染在 `<FormMessage>`，**不**用 toast 显示字段级错误
- 提交按钮在 `form.formState.isSubmitting === true` 时禁用并显示 loading 态
- 必填字段在 label 后加 `<span className="text-destructive">*</span>`

## 推荐模式

```tsx
// schema 与 story 同目录：<feature>.schema.ts
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('请输入有效邮箱'),
  password: z.string().min(8, '至少 8 位'),
})
export type LoginInput = z.infer<typeof loginSchema>
```

```tsx
// <feature>.stories.tsx 内
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'

const form = useForm<LoginInput>({
  resolver: zodResolver(loginSchema),
  defaultValues: { email: '', password: '' },
})

<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormField
      control={form.control}
      name="email"
      render={({ field }) => (
        <FormItem>
          <FormLabel>邮箱<span className="text-destructive">*</span></FormLabel>
          <FormControl><Input {...field} /></FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  </form>
</Form>
```

## 反模式（禁止）

- ❌ 用 `useState` + `onChange` 自己管理字段值（除非是纯展示原型，不涉及提交）
- ❌ 在 `onChange` 里手写校验逻辑
- ❌ 把错误信息 toast 出来（toast 只用于全局结果反馈）
- ❌ 在 `onSubmit` 里再手动校验一次（zod 已在 resolver 里做了）
- ❌ 在 story 里直接写 `if (!email) alert('请填邮箱')`

## 与 fixtures 配合

- 表单的 mock 默认值放 `<feature>.fixtures.ts` 的 `DEFAULT_FORM` 常量
- 校验错误的 mock 场景（演示 error state）单独导出 `INVALID_FORM`
