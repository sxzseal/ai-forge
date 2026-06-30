import { useEffect, useRef, useState } from 'react'
import * as S from './styles'
import type { AnnotationRecord } from './types'

interface LiveOutlineProps {
  element: Element | null
}

export function LiveOutline({ element }: LiveOutlineProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!element) return
    let raf = 0

    const apply = () => {
      raf = 0
      const node = ref.current
      if (!node) return
      if (!element.isConnected) {
        node.style.display = 'none'
        return
      }
      const rect = element.getBoundingClientRect()
      node.style.display = 'block'
      node.style.transform = `translate(${rect.left}px, ${rect.top}px)`
      node.style.width = `${rect.width}px`
      node.style.height = `${rect.height}px`
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply)
    }

    schedule()
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    const ro = new ResizeObserver(schedule)
    ro.observe(element)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      ro.disconnect()
    }
  }, [element])

  if (!element) return null
  return <div data-vf-ui ref={ref} style={S.SELECTED_BOX} />
}

interface AnchorBadgesProps {
  records: AnnotationRecord[]
  onSelect: (record: AnnotationRecord) => void
}

interface BadgePos {
  x: number
  y: number
  visible: boolean
}

export function AnchorBadges({ records, onSelect }: AnchorBadgesProps) {
  const [positions, setPositions] = useState<Record<string, BadgePos>>({})

  useEffect(() => {
    let raf = 0

    const compute = () => {
      raf = 0
      const next: Record<string, BadgePos> = {}
      for (const r of records) {
        const sel = r.element?.selector
        if (!sel) continue
        let el: Element | null = null
        try {
          el = document.querySelector(sel)
        } catch {
          el = null
        }
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) continue
        next[r.file] = {
          x: rect.right - 10,
          y: rect.top - 10,
          visible: true,
        }
      }
      setPositions(next)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(compute)
    }

    schedule()
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    const mo = new MutationObserver(schedule)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      mo.disconnect()
    }
  }, [records])

  return (
    <>
      {records.map((r, i) => {
        const pos = positions[r.file]
        if (!pos) return null
        return (
          <button
            key={r.file}
            data-vf-ui
            type="button"
            onClick={() => onSelect(r)}
            title={r.feedback}
            style={{
              ...S.ANCHOR_BADGE,
              transform: `translate(${pos.x}px, ${pos.y}px)`,
            }}
          >
            {i + 1}
          </button>
        )
      })}
    </>
  )
}
