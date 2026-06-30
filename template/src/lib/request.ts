/**
 * 统一前端请求封装
 *
 * 所有前端数据请求走 request<T>()，不直接用裸 fetch：
 *   - 自动解析后端 ApiResponse<T> 信封
 *   - status_code !== 0 时抛 RequestError，由调用方或全局错误边界处理
 *   - HTTP 401 抛 UnauthorizedError，便于上层拦截跳转登录
 *
 * 不引入额外依赖（如 ofetch），保持轻量。需要时可替换为 ofetch。
 */
import type { ApiResponse } from './api-response'

export class RequestError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly httpStatus: number
  ) {
    super(message)
    this.name = 'RequestError'
  }
}

export class UnauthorizedError extends RequestError {
  constructor(message = '未授权') {
    super(401, message, 401)
    this.name = 'UnauthorizedError'
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  baseURL?: string
}

function buildURL(path: string, query?: RequestOptions['query'], baseURL?: string): string {
  const base = baseURL ?? (typeof window === 'undefined' ? 'http://localhost' : window.location.origin)
  const url = new URL(path, base)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }
  }
  if (baseURL) {
    return url.toString()
  }
  return url.pathname + url.search
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, body, baseURL, headers, ...rest } = options
  const init: RequestInit = {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  }
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body)
  }

  const response = await fetch(buildURL(path, query, baseURL), init)

  if (response.status === 401) {
    throw new UnauthorizedError()
  }

  if (response.status === 204) {
    return undefined as T
  }

  const parsed = (await response.json()) as ApiResponse<T>
  if (parsed.status_code !== 0) {
    throw new RequestError(parsed.status_code, parsed.message ?? 'Request failed', response.status)
  }
  return parsed.data as T
}
