import type React from 'react'

export type StoryFn = () => React.ReactElement
export type StoryContext = { id?: string; title?: string; [key: string]: unknown }
export type Decorator = (Story: StoryFn, context: StoryContext) => React.ReactElement

export interface PickedElement {
  selector: string
  tag: string
  classes: string[]
  text: string
  computedStyles: Record<string, string>
  rect: { x: number; y: number; width: number; height: number }
}

export interface AnnotationRecord {
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

export interface OverlayProps {
  storyId?: string
  storyTitle?: string
}

export type Mode =
  | { kind: 'closed' }
  | { kind: 'list' }
  | { kind: 'new'; picked: PickedElement }
  | { kind: 'edit'; record: AnnotationRecord }

export type Status = 'idle' | 'busy' | 'error'

export const VF_SERVER = 'http://localhost:6007'
