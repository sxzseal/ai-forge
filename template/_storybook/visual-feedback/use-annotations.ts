import { useCallback, useEffect, useRef, useState } from 'react'
import { createAnnotation, deleteAnnotation, fetchAnnotations, updateAnnotation } from './api'
import type { CreatePayload } from './api'
import type { AnnotationRecord } from './types'

export interface UseAnnotationsResult {
  records: AnnotationRecord[]
  refresh: () => Promise<void>
  create: (payload: CreatePayload) => Promise<void>
  update: (file: string, feedback: string) => Promise<void>
  remove: (file: string) => Promise<void>
}

export function useAnnotations(): UseAnnotationsResult {
  const [records, setRecords] = useState<AnnotationRecord[]>([])
  const warnedRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const list = await fetchAnnotations()
      setRecords(list)
      warnedRef.current = false
    } catch (err) {
      if (!warnedRef.current) {
        warnedRef.current = true
        console.warn(
          '[visual-feedback] failed to fetch annotations — is the VF server running?',
          err,
        )
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(
    async (payload: CreatePayload) => {
      await createAnnotation(payload)
      await refresh()
    },
    [refresh],
  )

  const update = useCallback(
    async (file: string, feedback: string) => {
      await updateAnnotation(file, feedback)
      await refresh()
    },
    [refresh],
  )

  const remove = useCallback(
    async (file: string) => {
      await deleteAnnotation(file)
      await refresh()
    },
    [refresh],
  )

  return { records, refresh, create, update, remove }
}
