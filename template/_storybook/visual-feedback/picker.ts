import type { PickedElement } from './types'

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

export function buildSelector(el: Element): string {
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

export function snapshotElement(el: Element): PickedElement {
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
