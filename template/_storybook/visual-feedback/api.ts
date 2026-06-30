import { VF_SERVER, type AnnotationRecord, type PickedElement } from './types'

interface VfFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  parseJson?: boolean
}

async function vfFetch<T>(path: string, options: VfFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, parseJson = true } = options
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await fetch(`${VF_SERVER}${path}`, init)
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const errBody = (await res.json()) as { error?: string }
      if (errBody.error) message = errBody.error
    } catch {
      // ignore parse failure
    }
    throw new Error(message)
  }
  if (!parseJson) return undefined as T
  return (await res.json()) as T
}

export async function fetchAnnotations(): Promise<AnnotationRecord[]> {
  const data = await vfFetch<{ annotations?: AnnotationRecord[] }>('/list')
  return Array.isArray(data.annotations) ? data.annotations : []
}

export interface CreatePayload {
  storyId?: string
  storyTitle?: string
  url: string
  element: PickedElement
  feedback: string
}

export async function createAnnotation(payload: CreatePayload): Promise<void> {
  await vfFetch<void>('/save', { method: 'POST', body: payload, parseJson: false })
}

export async function updateAnnotation(file: string, feedback: string): Promise<void> {
  await vfFetch<void>(`/annotations/${encodeURIComponent(file)}`, {
    method: 'PUT',
    body: { feedback },
    parseJson: false,
  })
}

export async function deleteAnnotation(file: string): Promise<void> {
  await vfFetch<void>(`/annotations/${encodeURIComponent(file)}`, {
    method: 'DELETE',
    parseJson: false,
  })
}
