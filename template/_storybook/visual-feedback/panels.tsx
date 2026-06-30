import * as S from './styles'
import type { AnnotationRecord, PickedElement, Status } from './types'

interface AnnotationListProps {
  records: AnnotationRecord[]
  status: Status
  onClose: () => void
  onEdit: (record: AnnotationRecord) => void
  onDelete: (record: AnnotationRecord) => void
}

export function AnnotationList({
  records,
  status,
  onClose,
  onEdit,
  onDelete,
}: AnnotationListProps) {
  return (
    <div data-vf-ui style={{ ...S.PANEL, width: 400 }}>
      <div style={S.PANEL_HEADER}>
        <strong>标注列表（{records.length}）</strong>
        <button type="button" onClick={onClose} style={S.CLOSE_BTN}>
          ✕
        </button>
      </div>

      {records.length === 0 ? (
        <div style={{ color: '#94a3b8', fontSize: 12, padding: '8px 0' }}>
          暂无标注。点「标注反馈」开始。
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {records.map((r) => (
            <li key={r.file} style={S.RECORD_CARD}>
              <div style={S.RECORD_SELECTOR}>
                <code>{r.element?.selector || '(no selector)'}</code>
              </div>
              {r.element?.text && <div style={S.RECORD_TEXT}>&quot;{r.element.text}&quot;</div>}
              <div style={S.RECORD_FEEDBACK}>{r.feedback}</div>
              <div style={S.RECORD_ACTIONS}>
                <button type="button" onClick={() => onEdit(r)} style={S.EDIT_BTN}>
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(r)}
                  disabled={status === 'busy'}
                  style={S.deleteBtn(status === 'busy')}
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface AnnotationEditorProps {
  element: PickedElement | null
  isNew: boolean
  feedback: string
  status: Status
  errorMsg: string | null
  onFeedbackChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function AnnotationEditor({
  element,
  isNew,
  feedback,
  status,
  errorMsg,
  onFeedbackChange,
  onSubmit,
  onCancel,
}: AnnotationEditorProps) {
  const canSubmit = !!feedback.trim() && status !== 'busy'

  return (
    <div data-vf-ui style={{ ...S.PANEL, width: 380, marginBottom: 8 }}>
      <div style={{ ...S.PANEL_HEADER, marginBottom: 8 }}>
        <strong>{isNew ? '新标注' : '编辑标注'}</strong>
        <button type="button" onClick={onCancel} style={S.CLOSE_BTN}>
          ✕
        </button>
      </div>

      {element && (
        <div style={{ marginBottom: 8, color: '#cbd5e1', fontSize: 11 }}>
          <code style={{ color: '#fda4af' }}>{element.selector}</code>
          <div style={{ marginTop: 4 }}>
            {element.rect.width}×{element.rect.height}px · color {element.computedStyles.color} ·{' '}
            {element.computedStyles['font-size']}
          </div>
          {element.text && (
            <div style={{ marginTop: 4, color: '#94a3b8' }}>&quot;{element.text}&quot;</div>
          )}
        </div>
      )}

      <textarea
        value={feedback}
        onChange={(e) => onFeedbackChange(e.target.value)}
        placeholder="想怎么改？例如：字体改大到 18px，加粗，颜色换深蓝"
        autoFocus
        rows={4}
        style={S.TEXTAREA}
      />

      {errorMsg && <div style={S.ERROR_TEXT}>{errorMsg}</div>}

      <div style={S.EDITOR_ACTIONS}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          style={S.primaryBtn(!!feedback.trim())}
        >
          {status === 'busy' ? '保存中…' : isNew ? '保存' : '更新'}
        </button>
        <button type="button" onClick={onCancel} style={S.SECONDARY_BTN}>
          取消
        </button>
      </div>
    </div>
  )
}
