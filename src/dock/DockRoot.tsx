import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '../store/settingsStore'
import { setNotchHitbox, isTauri } from '../lib/ipc'

const spring = { type: 'spring', stiffness: 380, damping: 34 } as const

// Minimal validation build of the Layer Dock window. Confirms the separate
// always-on-top window floats over other apps at the right edge WITHOUT
// freezing the app (after the main window's pin-loop fix). The full UI — from
// the design mockup — comes next once this foundation is proven stable.
export function DockRoot() {
  const { t } = useTranslation()
  const theme = useSettingsStore((s) => s.theme)

  // Match the app's theme (shared localStorage / same WebView2 profile).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  // Transparent window — only the dock rail paints.
  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    document.body.style.overflow = 'hidden'
    document.body.style.margin = '0'
  }, [])

  const [open, setOpen] = useState(false)
  const railRef = useRef<HTMLDivElement>(null)
  const lastBox = useRef('')

  // Report the visible rail's rect so Rust makes ONLY that area interactive;
  // everything else in the window stays click-through (apps beneath get clicks).
  useEffect(() => {
    const el = railRef.current
    if (!el || !isTauri()) return
    const sync = () => {
      const r = el.getBoundingClientRect()
      const box: [number, number, number, number] = [
        Math.floor(r.left),
        Math.floor(r.top),
        Math.ceil(r.width),
        Math.ceil(r.height),
      ]
      if (box[2] <= 0 || box[3] <= 0) return
      const key = box.join(',')
      if (key === lastBox.current) return
      lastBox.current = key
      setNotchHitbox(box).catch(() => {})
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    const id = window.setInterval(sync, 300)
    return () => {
      ro.disconnect()
      window.clearInterval(id)
    }
  }, [])

  return (
    <div className="fixed inset-0 flex items-center justify-end">
      <motion.div
        ref={railRef}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        animate={{ width: open ? 64 : 8 }}
        transition={spring}
        className="flex h-[420px] flex-col items-center justify-center gap-3 overflow-hidden text-[var(--text-primary)]"
        style={{
          background: 'var(--surface, rgba(28,28,32,0.72))',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid var(--border, rgba(255,255,255,0.12))',
          borderRight: 'none',
          borderRadius: '20px 0 0 20px',
          boxShadow: '-16px 0 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        {open ? (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-9 w-9 rounded-[11px]"
                style={{ background: 'var(--fill-1, rgba(255,255,255,0.08))' }}
              />
            ))}
            <div className="mt-1 text-[9px] font-semibold tracking-wide text-[var(--text-secondary)]">
              {t('dock.label')}
            </div>
          </>
        ) : (
          <div
            className="h-16 w-[3.5px] rounded-full"
            style={{ background: 'var(--text-tertiary, rgba(255,255,255,0.3))' }}
          />
        )}
      </motion.div>
    </div>
  )
}
