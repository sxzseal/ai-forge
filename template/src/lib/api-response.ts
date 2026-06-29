/**
 * 统一 API 响应封装
 *
 * 所有 Next.js API Routes 必须返回 ApiResponse<T> 形态：
 *   - status_code: 0 = 业务成功；非 0 = 业务错误码
 *   - message?: 错误时的人类可读消息（成功时可省略）
 *   - data: 业务数据（错误时为 null）
 *
 * HTTP 状态码独立于 status_code：例如认证失败 HTTP 401 + status_code 401。
 * 分页响应统一用 PaginatedData 包裹 list/total/page/page_size。
 */
import { NextResponse } from 'next/server'

export interface ApiResponse<T> {
  status_code: number
  message?: string
  data: T | null
}

export interface PaginatedData<T> {
  list: T[]
  total: number
  page: number
  page_size: number
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiResponse<T>> {
  return NextResponse.json<ApiResponse<T>>({ status_code: 0, data }, init)
}

export function err(
  status: number,
  message: string,
  init?: ResponseInit
): NextResponse<ApiResponse<null>> {
  return NextResponse.json<ApiResponse<null>>(
    { status_code: status, message, data: null },
    { status, ...init }
  )
}
