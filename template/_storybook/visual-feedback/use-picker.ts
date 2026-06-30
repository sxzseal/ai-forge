import { useEffect, useRef } from 'react'
import { snapshotElement } from './picker'
import type { PickedElement } from './types'

export interface UsePickerOptions {
  active: boolean
  enabled: boolean
  onPick: (picked: PickedElement) => void
}

export function usePicker({ active, enabled, onPick }: UsePickerOptions) {
  const hoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!active || !enabled) {
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
      onPick(snapshotElement(target))
    }

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [active, enabled, onPick])

  return hoverRef
}
