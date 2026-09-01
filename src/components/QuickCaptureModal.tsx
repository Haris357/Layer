import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { listen } from '@tauri-apps/api/event'
import { Inbox } from 'lucide-react'
import { useInboxStore } from '../store/inboxStore'
import { useToastStore } from '../store/toastStore'
import { setFront } from '../lib/ipc'
import { MonitorLayer } from './MonitorLayer'

// Listens for the Ctrl+Shift+N global hotkey (emitted from Rust as
// "quick-capture") and pops a centred input. Anything saved drops into
// the Inbox widget.
export function QuickCaptureModal() {
  const { t: tr } = useTranslation()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const add = useInboxStore((s) => s.add)
  const showToast = useToastStore((s) => s.showToast)

  useEffect(() => {
    const un = listen('quick-capture', () => {
      setText('')
      setOpen(true)
    })
    return () => {
      un.then((f) => f()).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(id)
  }, [open])

  // Rust grabbed real OS focus so this popup is visible/typeable over
  // whatever app was active (see focus_capture_window in window.rs). Restore
  // normal pinned-to-bottom, click-through desktop-layer mode on close —
  // setFront's value is ignored by set_layer, it always re-pins to the
  // bottom; the call itself is what triggers the restore.
  const restoreLayer = () => setFront(false).catch(() => {})

  const cancel = () => {
    setOpen(false)
    setText('')
    restoreLayer()
  }

  const save = () => {
    const t = text.trim()
    if (t) {
      add(t)
      const captured = t.length > 36 ? t.slice(0, 36) + '…' : t
      showToast({
        message: tr('quickCapture.savedToInbox', { text: captured }),
        icon: 'success',
      })
    }
    setOpen(false)
    setText('')
    restoreLayer()
  }

  return (
    <AnimatePresence>
      {open && (
        <div
          data-hit
          className="fixed inset-0 z-[10003]"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
          onMouseDown={cancel}
        >
          <MonitorLayer>
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            onMouseDown={(e) => e.stopPropagation()}
            className="glass flex w-[480px] flex-col gap-2 rounded-[14px] border border-[var(--border)] p-4"
          >
            <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
              <Inbox size={14} strokeWidth={1.8} />
              <span
                className="text-[11px] font-semibold uppercase tracking-[1.2px]"
              >
                {tr('quickCapture.title')}
              </span>
            </div>
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                else if (e.key === 'Escape') cancel()
              }}
              placeholder={tr('quickCapture.placeholder')}
              className="bg-transparent text-[18px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              style={{ letterSpacing: '-0.4px' }}
            />
            <div className="flex items-center justify-between text-[10.5px] text-[var(--text-tertiary)]">
              <span>{tr('quickCapture.helper')}</span>
              <span>
                <kbd className="rounded-[4px] bg-[var(--fill-2)] px-1 py-0.5">
                  Enter
                </kbd>{' '}
                {tr('quickCapture.saveHint')} ·{' '}
                <kbd className="rounded-[4px] bg-[var(--fill-2)] px-1 py-0.5">
                  Esc
                </kbd>{' '}
                {tr('quickCapture.cancelHint')}
              </span>
            </div>
          </motion.div>
          </MonitorLayer>
        </div>
      )}
    </AnimatePresence>
  )
}
