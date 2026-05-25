import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Buttery text editing. The textarea is **uncontrolled** — the browser owns the
 * text and the caret natively, so typing triggers ZERO React re-renders (no
 * per-keystroke setState, no value re-applied to the DOM). The store is updated
 * only on a debounce, and on unmount, so nothing is lost.
 *
 * Usage:
 *   const { ref, syncKey, onChange } = useUncontrolledText(value, commit)
 *   <textarea key={syncKey} ref={ref} defaultValue={value} onChange={onChange} />
 *
 * `syncKey` bumps (remounting the textarea) only when `value` changes
 * externally while idle — e.g. undo or loading a different note — so it never
 * clobbers in-progress typing.
 */
export function useUncontrolledText(
  value: string,
  commit: (next: string) => void,
  options: { delay?: number; ref?: RefObject<HTMLTextAreaElement> } = {},
) {
  const { delay = 250, ref: externalRef } = options
  const internalRef = useRef<HTMLTextAreaElement>(null)
  const ref = externalRef ?? internalRef
  const latest = useRef(value)
  const committed = useRef(value)
  const timer = useRef<number | undefined>(undefined)
  const commitRef = useRef(commit)
  commitRef.current = commit
  const [syncKey, setSyncKey] = useState(0)

  useEffect(() => {
    if (timer.current === undefined && value !== latest.current) {
      latest.current = value
      committed.current = value
      setSyncKey((k) => k + 1)
    }
  }, [value])

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current)
        if (latest.current !== committed.current) {
          commitRef.current(latest.current)
        }
      }
    }
  }, [])

  const onChange = () => {
    latest.current = ref.current?.value ?? ''
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      committed.current = latest.current
      commitRef.current(latest.current)
    }, delay)
  }

  return { ref, syncKey, onChange }
}
