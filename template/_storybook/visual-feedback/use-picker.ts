import { useEffect, useRef } from 'react'
import { snapshotElement } from './picker'
import type { PickedElement } from './types'

export interface UsePickerOptions {
  active: boolean
  enabled: boolean
  onPick: (picked: PickedElement, element: Element) => void
}

export function usePicker({ active, enabled, onPick }: UsePickerOptions) {
  const hoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!active || !enabled) {
      if (hoverRef.current) hoverRef.current.style.display = 'none'
      return
    }

    let raf = 0
    let pendingTarget: Element | null = null

    const apply = () => {
      raf = 0
      const box = hoverRef.current
      if (!box) return
      if (!pendingTarget || !pendingTarget.isConnected) {
        box.style.display = 'none'
        return
      }
      const rect = pendingTarget.getBoundingClientRect()
      box.style.display = 'block'
      box.style.transform = `translate(${rect.left}px, ${rect.top}px)`
      box.style.width = `${rect.width}px`
      box.style.height = `${rect.height}px`
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply)
    }

    const onMove = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target || !(target instanceof Element)) return
      if (target.closest('[data-vf-ui]')) {
        pendingTarget = null
        schedule()
        return
      }
      pendingTarget = target
      schedule()
    }

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (!target || !(target instanceof Element)) return
      if (target.closest('[data-vf-ui]')) return
      e.preventDefault()
      e.stopPropagation()
      onPick(snapshotElement(target), target)
    }

    const onViewportChange = () => schedule()

    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('click', onClick, true)
    window.addEventListener('scroll', onViewportChange, true)
    window.addEventListener('resize', onViewportChange)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('scroll', onViewportChange, true)
      window.removeEventListener('resize', onViewportChange)
    }
  }, [active, enabled, onPick])

  return hoverRef
}
