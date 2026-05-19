import { useEffect } from 'react'
import { useCanvasStore } from '../store/canvasStore'

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA'
  )
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const state = useCanvasStore.getState()

      if (e.key === 'Escape') {
        state.setSelected(null)
        return
      }

      if (isTyping(e.target)) return

      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()

      if (ctrl && k === 'z' && !e.shiftKey) {
        e.preventDefault()
        state.undo()
        return
      }
      if (ctrl && ((k === 'z' && e.shiftKey) || k === 'y')) {
        e.preventDefault()
        state.redo()
        return
      }
      if (ctrl && k === 'v') {
        e.preventDefault()
        state.pasteWidget()
        return
      }

      const id = state.selectedId
      if (!id) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        state.deleteWidget(id)
      } else if (ctrl && k === 'c') {
        e.preventDefault()
        state.copyWidget(id)
      } else if (ctrl && k === 'd') {
        e.preventDefault()
        state.duplicateWidget(id)
      } else if (ctrl && k === ']') {
        e.preventDefault()
        state.bringToFront(id)
      } else if (ctrl && k === '[') {
        e.preventDefault()
        state.sendToBack(id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
