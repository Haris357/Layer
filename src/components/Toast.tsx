import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUpCircle,
  CheckCircle2,
  Info,
  RotateCcw,
  AlarmClock,
  AlertCircle,
  Timer,
  Lock,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useToastStore,
  type ActiveToast,
  type ToastIcon,
} from '../store/toastStore'

const ICONS: Record<ToastIcon, LucideIcon> = {
  update: ArrowUpCircle,
  success: CheckCircle2,
  info: Info,
  undo: RotateCcw,
  reminder: AlarmClock,
  error: AlertCircle,
  focus: Timer,
  lock: Lock,
}

const COLORS: Record<ToastIcon, string> = {
  update: 'var(--accent)',
  success: '#34c759',
  info: 'var(--accent)',
  undo: '#f0a020',
  reminder: 'var(--accent)',
  error: 'var(--danger)',
  focus: '#34c759',
  lock: 'var(--text-secondary)',
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ActiveToast
  onDismiss: (id: number) => void
}) {
  const Icon = toast.icon ? ICONS[toast.icon] : null
  const tint = toast.icon ? COLORS[toast.icon] : 'var(--accent)'
  const determinate = typeof toast.progress === 'number'
  const dur = toast.duration ?? 3400
  const [hovered, setHovered] = useState(false)

  return (
    <motion.div
      data-hit
      layout
      initial={{ opacity: 0, y: 24, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.92, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="glass pointer-events-auto relative flex w-[min(92vw,440px)] items-center gap-3 overflow-hidden rounded-[13px] border border-[var(--border)] py-2.5 pl-3.5 pr-2.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)]"
    >
      {Icon && (
        <motion.span
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.05, type: 'spring', stiffness: 500, damping: 20 }}
          className="shrink-0"
          style={{ color: tint }}
        >
          <Icon size={18} strokeWidth={2.2} />
        </motion.span>
      )}

      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)]">
        {toast.message}
      </span>

      <AnimatePresence mode="popLayout">
        {toast.detail && (
          <motion.span
            key={toast.detail}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="shrink-0 tabular-nums text-[11.5px] font-medium text-[var(--text-tertiary)]"
          >
            {toast.detail}
          </motion.span>
        )}
      </AnimatePresence>

      {toast.actions?.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={() => {
            a.onClick()
            if (a.dismiss !== false) onDismiss(toast.id)
          }}
          className={`shrink-0 rounded-[8px] px-2.5 py-1 text-[12px] font-semibold transition-colors ${
            a.primary
              ? 'text-[var(--on-accent)]'
              : 'text-[var(--text-primary)] hover:bg-[var(--fill-2)]'
          }`}
          style={a.primary ? { background: tint } : undefined}
        >
          {a.label}
        </button>
      ))}

      {/* No dismiss button mid-download — closing would just hide the
          progress while it keeps running. */}
      {!determinate && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => onDismiss(toast.id)}
          className="shrink-0 rounded-[7px] p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]"
        >
          <X size={14} strokeWidth={2.4} />
        </button>
      )}

      {/* Progress / countdown bar. Driven by a GPU-composited transform so it
          stays smooth even when the click-through window isn't repainting the
          main thread. */}
      {determinate ? (
        <div
          className="absolute inset-x-0 bottom-0 h-[3px]"
          style={{
            background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)',
          }}
        >
          <div
            className="h-full origin-left rounded-r-full"
            style={{
              transform: `scaleX(${Math.max(0, Math.min(100, toast.progress ?? 0)) / 100})`,
              transition: 'transform 0.25s ease-out',
              background: tint,
            }}
          />
        </div>
      ) : dur > 0 ? (
        <div className="absolute inset-x-0 bottom-0 h-[2.5px]">
          <div
            key={toast.message}
            className="h-full origin-left"
            style={{
              background: tint,
              opacity: 0.9,
              animation: `toast-countdown ${dur}ms linear forwards`,
              animationPlayState: hovered ? 'paused' : 'running',
            }}
            onAnimationEnd={() => onDismiss(toast.id)}
          />
        </div>
      ) : null}
    </motion.div>
  )
}

export function Toast() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed bottom-20 left-1/2 z-[10002] flex -translate-x-1/2 flex-col items-center gap-2.5">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  )
}
