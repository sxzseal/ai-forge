import type { CSSProperties } from 'react'

export const PANEL: CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 64,
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
}

export const PANEL_HEADER: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 10,
}

export const CLOSE_BTN: CSSProperties = {
  background: 'transparent',
  color: '#94a3b8',
  border: 'none',
  cursor: 'pointer',
}

export const HOVER_BOX: CSSProperties = {
  position: 'fixed',
  left: 0,
  top: 0,
  pointerEvents: 'none',
  outline: '2px solid #f43f5e',
  outlineOffset: 0,
  background: 'rgba(244, 63, 94, 0.08)',
  boxSizing: 'border-box',
  zIndex: 2147483600,
  display: 'none',
  willChange: 'transform, width, height',
}

export const SELECTED_BOX: CSSProperties = {
  position: 'fixed',
  left: 0,
  top: 0,
  pointerEvents: 'none',
  outline: '2px dashed #f59e0b',
  outlineOffset: 0,
  background: 'rgba(245, 158, 11, 0.08)',
  boxSizing: 'border-box',
  zIndex: 2147483601,
  willChange: 'transform, width, height',
}

export const ANCHOR_BADGE: CSSProperties = {
  position: 'fixed',
  left: 0,
  top: 0,
  minWidth: 20,
  height: 20,
  padding: '0 6px',
  borderRadius: 999,
  background: '#f43f5e',
  color: 'white',
  fontSize: 11,
  fontWeight: 700,
  lineHeight: '20px',
  textAlign: 'center',
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
  zIndex: 2147483602,
  fontFamily: 'system-ui, sans-serif',
  willChange: 'transform',
}

export const TOOLBAR: CSSProperties = {
  position: 'fixed',
  right: 16,
  bottom: 16,
  zIndex: 2147483647,
  display: 'flex',
  gap: 8,
  alignItems: 'center',
}

export const TOOLBAR_COUNT_BTN: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 999,
  border: 'none',
  background: 'white',
  color: '#111827',
  fontSize: 12,
  fontWeight: 600,
  boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
  cursor: 'pointer',
}

export function toolbarToggleBtn(bg: string): CSSProperties {
  return {
    padding: '8px 14px',
    borderRadius: 999,
    border: 'none',
    background: bg,
    color: 'white',
    fontSize: 12,
    fontWeight: 600,
    boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
    cursor: 'pointer',
  }
}

export const RECORD_CARD: CSSProperties = {
  background: '#1e293b',
  padding: 10,
  borderRadius: 8,
  border: '1px solid #334155',
}

export const RECORD_SELECTOR: CSSProperties = {
  fontSize: 11,
  color: '#fda4af',
  marginBottom: 4,
}

export const RECORD_TEXT: CSSProperties = {
  fontSize: 11,
  color: '#94a3b8',
  marginBottom: 4,
}

export const RECORD_FEEDBACK: CSSProperties = {
  fontSize: 12,
  color: '#e2e8f0',
  marginBottom: 8,
  whiteSpace: 'pre-wrap',
}

export const RECORD_ACTIONS: CSSProperties = { display: 'flex', gap: 6 }

export const EDIT_BTN: CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  background: '#0f172a',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 11,
}

export function deleteBtn(busy: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '4px 8px',
    background: '#7f1d1d',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    cursor: busy ? 'not-allowed' : 'pointer',
    fontSize: 11,
  }
}

export const TEXTAREA: CSSProperties = {
  width: '100%',
  background: '#1e293b',
  color: 'white',
  border: '1px solid #334155',
  borderRadius: 8,
  padding: 8,
  fontSize: 13,
  resize: 'vertical',
  fontFamily: 'inherit',
}

export const ERROR_TEXT: CSSProperties = {
  marginTop: 6,
  color: '#fda4af',
  fontSize: 11,
}

export const EDITOR_ACTIONS: CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 10,
}

export function primaryBtn(enabled: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '8px 12px',
    background: enabled ? '#f43f5e' : '#475569',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontWeight: 600,
  }
}

export const SECONDARY_BTN: CSSProperties = {
  padding: '8px 12px',
  background: 'transparent',
  color: '#cbd5e1',
  border: '1px solid #334155',
  borderRadius: 8,
  cursor: 'pointer',
}
