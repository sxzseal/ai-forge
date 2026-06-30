import { useCallback, useEffect, useState } from 'react'
import { AnnotationEditor, AnnotationList } from './panels'
import * as S from './styles'
import { useAnnotations } from './use-annotations'
import { usePicker } from './use-picker'
import type {
  AnnotationRecord,
  Decorator,
  Mode,
  OverlayProps,
  PickedElement,
  Status,
} from './types'

function Overlay({ storyId, storyTitle }: OverlayProps) {
  const [active, setActive] = useState(false)
  const [mode, setMode] = useState<Mode>({ kind: 'closed' })
  const [feedback, setFeedback] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { records, create, update, remove } = useAnnotations()

  const handlePick = useCallback((picked: PickedElement) => {
    setMode({ kind: 'new', picked })
    setFeedback('')
    setStatus('idle')
    setErrorMsg(null)
  }, [])

  const pickerEnabled = mode.kind !== 'edit' && mode.kind !== 'new'
  const hoverRef = usePicker({ active, enabled: pickerEnabled, onPick: handlePick })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMode((cur) => (cur.kind !== 'closed' ? { kind: 'closed' } : cur))
        if (mode.kind === 'closed') setActive(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setActive((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode.kind])

  const submitCreate = async () => {
    if (mode.kind !== 'new' || !feedback.trim()) return
    setStatus('busy')
    setErrorMsg(null)
    try {
      await create({
        storyId,
        storyTitle,
        url: window.location.href,
        element: mode.picked,
        feedback: feedback.trim(),
      })
      setStatus('idle')
      setMode({ kind: 'closed' })
      setFeedback('')
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  const submitUpdate = async () => {
    if (mode.kind !== 'edit' || !feedback.trim()) return
    setStatus('busy')
    setErrorMsg(null)
    try {
      await update(mode.record.file, feedback.trim())
      setStatus('idle')
      setMode({ kind: 'list' })
      setFeedback('')
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDelete = async (record: AnnotationRecord) => {
    if (!window.confirm(`删除这条标注？\n\n${record.feedback}`)) return
    setStatus('busy')
    try {
      await remove(record.file)
      setStatus('idle')
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  const openEdit = (record: AnnotationRecord) => {
    setMode({ kind: 'edit', record })
    setFeedback(record.feedback)
    setStatus('idle')
    setErrorMsg(null)
  }

  const cancelEditor = () => {
    setMode(mode.kind === 'edit' ? { kind: 'list' } : { kind: 'closed' })
  }

  const buttonLabel =
    active && mode.kind !== 'edit' && mode.kind !== 'new' ? '🎯 标注中' : '📌 标注反馈'
  const buttonBg = active ? '#f43f5e' : '#111827'
  const editorElement =
    mode.kind === 'new' ? mode.picked : mode.kind === 'edit' ? mode.record.element : null

  return (
    <>
      <div data-vf-ui ref={hoverRef} style={S.HOVER_BOX} />

      <div data-vf-ui style={S.TOOLBAR}>
        {records.length > 0 && (
          <button
            type="button"
            onClick={() => setMode({ kind: 'list' })}
            title="查看所有标注"
            style={S.TOOLBAR_COUNT_BTN}
          >
            📋 {records.length}
          </button>
        )}
        <button
          type="button"
          onClick={() => setActive((v) => !v)}
          title="Visual Feedback (Ctrl+Shift+D)"
          style={S.toolbarToggleBtn(buttonBg)}
        >
          {buttonLabel}
        </button>
      </div>

      {mode.kind === 'list' && (
        <AnnotationList
          records={records}
          status={status}
          onClose={() => setMode({ kind: 'closed' })}
          onEdit={openEdit}
          onDelete={(r) => void handleDelete(r)}
        />
      )}

      {(mode.kind === 'new' || mode.kind === 'edit') && (
        <AnnotationEditor
          element={editorElement}
          isNew={mode.kind === 'new'}
          feedback={feedback}
          status={status}
          errorMsg={errorMsg}
          onFeedbackChange={setFeedback}
          onSubmit={() => void (mode.kind === 'new' ? submitCreate() : submitUpdate())}
          onCancel={cancelEditor}
        />
      )}
    </>
  )
}

export const visualFeedbackDecorator: Decorator = (Story, context) => {
  return (
    <>
      <Story />
      <Overlay storyId={context.id} storyTitle={context.title} />
    </>
  )
}
