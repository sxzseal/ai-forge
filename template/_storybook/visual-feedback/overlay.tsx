import React, { useCallback, useEffect, useRef, useState } from 'react'

// Storybook Decorator type — kept structural to avoid coupling to a specific
// renderer package. At install time the project picks up the real type from
// @storybook/nextjs-vite (or whichever framework it uses).
type StoryFn = () => React.ReactElement
type StoryContext = { id?: string; title?: string; [key: string]: unknown }
type Decorator = (Story: StoryFn, context: StoryContext) => React.ReactElement

const VF_SERVER = 'http://localhost:6007'

interface PickedElement {
  selector: string
  tag: string
  classes: string[]
  text: string
  computedStyles: Record<string, string>
  rect: { x: number; y: number; width: number; height: number }
}

interface AnnotationRecord {
  file: string
  id: string
  createdAt: string
  updatedAt?: string
  storyId?: string | null
  storyTitle?: string | null
  url?: string | null
  element: PickedElement | null
  feedback: string
}

interface OverlayProps {
  storyId?: string
  storyTitle?: string
}

type Mode =
  | { kind: 'closed' }
  | { kind: 'list' }
  | { kind: 'new'; picked: PickedElement }
  | { kind: 'edit'; record: AnnotationRecord }

const STYLE_KEYS = [
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'line-height',
  'padding',
  'margin',
  'border',
  'border-radius',
] as const

function buildSelector(el: Element): string {
  const parts: string[] = []
  let node: Element | null = el
  let depth = 0
  while (node && depth < 4) {
    let part = node.tagName.toLowerCase()
    if (node.id) {
      parts.unshift(`${part}#${node.id}`)
      break
    }
    const classes = Array.from(node.classList).slice(0, 2).join('.')
    if (classes) part += `.${classes}`
    parts.unshift(part)
    node = node.parentElement
    depth += 1
  }
  return parts.join(' > ')
}

function snapshotElement(el: Element): PickedElement {
  const computed = window.getComputedStyle(el)
  const styles: Record<string, string> = {}
  STYLE_KEYS.forEach((key) => {
    styles[key] = computed.getPropertyValue(key)
  })
  const rect = el.getBoundingClientRect()
  return {
    selector: buildSelector(el),
    tag: el.tagName.toLowerCase(),
    classes: Array.from(el.classList),
    text: (el.textContent || '').trim().slice(0, 120),
    computedStyles: styles,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  }
}

function Overlay({ storyId, storyTitle }: OverlayProps) {
  const [active, setActive] = useState(false)
  const [mode, setMode] = useState<Mode>({ kind: 'closed' })
  const [feedback, setFeedback] = useState('')
  const [records, setRecords] = useState<AnnotationRecord[]>([])
  const [status, setStatus] = useState<'idle' | 'busy' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const hoverRef = useRef<HTMLDivElement | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${VF_SERVER}/list`)
      if (!res.ok) return
      const data = (await res.json()) as { annotations?: AnnotationRecord[] }
      setRecords(Array.isArray(data.annotations) ? data.annotations : [])
    } catch {
      // server may be down
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!active || mode.kind === 'edit' || mode.kind === 'new') {
      if (hoverRef.current) hoverRef.current.style.display = 'none'
      return
    }

    const onMove = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target || !(target instanceof Element)) return
      if (target.closest('[data-vf-ui]')) return
      const rect = target.getBoundingClientRect()
      const box = hoverRef.current
      if (!box) return
      box.style.display = 'block'
      box.style.left = `${rect.x}px`
      box.style.top = `${rect.y}px`
      box.style.width = `${rect.width}px`
      box.style.height = `${rect.height}px`
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target || !(target instanceof Element)) return
      if (target.closest('[data-vf-ui]')) return
      e.preventDefault()
      e.stopPropagation()
      setMode({ kind: 'new', picked: snapshotElement(target) })
      setFeedback('')
      setStatus('idle')
      setErrorMsg(null)
    }

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [active, mode.kind])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mode.kind !== 'closed') setMode({ kind: 'closed' })
        else setActive(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setActive((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode.kind])

  const onCreate = async () => {
    if (mode.kind !== 'new' || !feedback.trim()) return
    setStatus('busy')
    setErrorMsg(null)
    try {
      const res = await fetch(`${VF_SERVER}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId,
          storyTitle,
          url: window.location.href,
          element: mode.picked,
          feedback: feedback.trim(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setStatus('idle')
      setMode({ kind: 'closed' })
      setFeedback('')
      refresh()
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  const onUpdate = async () => {
    if (mode.kind !== 'edit' || !feedback.trim()) return
    setStatus('busy')
    setErrorMsg(null)
    try {
      const res = await fetch(
        `${VF_SERVER}/annotations/${encodeURIComponent(mode.record.file)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedback: feedback.trim() }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setStatus('idle')
      setMode({ kind: 'list' })
      setFeedback('')
      refresh()
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  const onDelete = async (record: AnnotationRecord) => {
    if (!window.confirm(`删除这条标注？\n\n${record.feedback}`)) return
    setStatus('busy')
    try {
      await fetch(`${VF_SERVER}/annotations/${encodeURIComponent(record.file)}`, {
        method: 'DELETE',
      })
      setStatus('idle')
      refresh()
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

  const buttonLabel =
    active && mode.kind !== 'edit' && mode.kind !== 'new' ? '🎯 标注中' : '📌 标注反馈'
  const buttonBg = active ? '#f43f5e' : '#111827'
  const pendingCount = records.length

  return (
    <>
      <div
        data-vf-ui
        ref={hoverRef}
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          border: '2px solid #f43f5e',
          background: 'rgba(244, 63, 94, 0.08)',
          zIndex: 2147483600,
          display: 'none',
          transition: 'all 60ms ease-out',
        }}
      />

      <div
        data-vf-ui
        style={{
          position: 'fixed',
          right: 16,
          bottom: 16,
          zIndex: 2147483647,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={() => setMode({ kind: 'list' })}
            title="查看所有标注"
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              border: 'none',
              background: 'white',
              color: '#111827',
              fontSize: 12,
              fontWeight: 600,
              boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
              cursor: 'pointer',
            }}
          >
            📋 {pendingCount}
          </button>
        )}
        <button
          type="button"
          onClick={() => setActive((v) => !v)}
          title="Visual Feedback (Ctrl+Shift+D)"
          style={{
            padding: '8px 14px',
            borderRadius: 999,
            border: 'none',
            background: buttonBg,
            color: 'white',
            fontSize: 12,
            fontWeight: 600,
            boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
            cursor: 'pointer',
          }}
        >
          {buttonLabel}
        </button>
      </div>

      {/* List panel */}
      {mode.kind === 'list' && (
        <div
          data-vf-ui
          style={{
            position: 'fixed',
            right: 16,
            bottom: 64,
            width: 400,
            maxHeight: '75vh',
            overflow: 'auto',
            zIndex: 2147483647,
            background: '#0f172a',
            color: 'white',
            borderRadius: 12,
            padding: 16,
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <strong>📋 标注列表（{records.length}）</strong>
            <button
              type="button"
              onClick={() => setMode({ kind: 'closed' })}
              style={{
                background: 'transparent',
                color: '#94a3b8',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>

          {records.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 12, padding: '8px 0' }}>
              暂无标注。点「📌 标注反馈」开始。
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {records.map((r) => (
                <li
                  key={r.file}
                  style={{
                    background: '#1e293b',
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid #334155',
                  }}
                >
                  <div style={{ fontSize: 11, color: '#fda4af', marginBottom: 4 }}>
                    <code>{r.element?.selector || '(no selector)'}</code>
                  </div>
                  {r.element?.text && (
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                      "{r.element.text}"
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 12,
                      color: '#e2e8f0',
                      marginBottom: 8,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {r.feedback}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        background: '#0f172a',
                        color: '#e2e8f0',
                        border: '1px solid #334155',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 11,
                      }}
                    >
                      ✏️ 编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(r)}
                      disabled={status === 'busy'}
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        background: '#7f1d1d',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: status === 'busy' ? 'not-allowed' : 'pointer',
                        fontSize: 11,
                      }}
                    >
                      🗑 删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* New/Edit panel */}
      {(mode.kind === 'new' || mode.kind === 'edit') && (
        <div
          data-vf-ui
          style={{
            position: 'fixed',
            right: 16,
            bottom: 64,
            width: 380,
            maxHeight: '75vh',
            overflow: 'auto',
            zIndex: 2147483647,
            background: '#0f172a',
            color: 'white',
            borderRadius: 12,
            padding: 16,
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>{mode.kind === 'new' ? '📌 新标注' : '✏️ 编辑标注'}</strong>
            <button
              type="button"
              onClick={() =>
                setMode(mode.kind === 'edit' ? { kind: 'list' } : { kind: 'closed' })
              }
              style={{
                background: 'transparent',
                color: '#94a3b8',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ marginBottom: 8, color: '#cbd5e1', fontSize: 11 }}>
            {(() => {
              const el = mode.kind === 'new' ? mode.picked : mode.record.element
              if (!el) return null
              return (
                <>
                  <code style={{ color: '#fda4af' }}>{el.selector}</code>
                  <div style={{ marginTop: 4 }}>
                    {el.rect.width}×{el.rect.height}px · color {el.computedStyles.color} ·{' '}
                    {el.computedStyles['font-size']}
                  </div>
                  {el.text && (
                    <div style={{ marginTop: 4, color: '#94a3b8' }}>"{el.text}"</div>
                  )}
                </>
              )
            })()}
          </div>

          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="想怎么改？例如：字体改大到 18px，加粗，颜色换深蓝"
            autoFocus
            rows={4}
            style={{
              width: '100%',
              background: '#1e293b',
              color: 'white',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: 8,
              fontSize: 13,
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />

          {errorMsg && (
            <div style={{ marginTop: 6, color: '#fda4af', fontSize: 11 }}>{errorMsg}</div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={mode.kind === 'new' ? onCreate : onUpdate}
              disabled={status === 'busy' || !feedback.trim()}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: feedback.trim() ? '#f43f5e' : '#475569',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: feedback.trim() ? 'pointer' : 'not-allowed',
                fontWeight: 600,
              }}
            >
              {status === 'busy' ? '保存中…' : mode.kind === 'new' ? '保存' : '更新'}
            </button>
            <button
              type="button"
              onClick={() =>
                setMode(mode.kind === 'edit' ? { kind: 'list' } : { kind: 'closed' })
              }
              style={{
                padding: '8px 12px',
                background: 'transparent',
                color: '#cbd5e1',
                border: '1px solid #334155',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              取消
            </button>
          </div>
        </div>
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
