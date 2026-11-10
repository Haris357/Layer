import { useCallback, useEffect, useLayoutEffect, useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ArrowLeft, ArrowRight } from 'lucide-react'
import { useTourStore } from '../../store/tourStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useCanvasStore } from '../../store/canvasStore'
import { useAnchorMonitor } from '../../store/monitorStore'
import { Tooltip } from '../Tooltip'
import { IS_STORE } from '../../lib/dist'
import {
  AllWidgetsVisual,
  ArrangeVisual,
  DoneVisual,
  HotkeyVisual,
  ScreensaverVisual,
  ShortcutsVisual,
  TrayVisual,
  WelcomeVisual,
} from './TourVisuals'

export interface TourStep {
  id: string
  // data-tour anchor to spotlight; omitted = a centered card.
  target?: string
  Visual?: ComponentType
}

const ALL_STEPS: TourStep[] = [
  { id: 'welcome', Visual: WelcomeVisual },
  { id: 'island', target: 'island' },
  { id: 'widgets', target: 'widgets' },
  { id: 'allWidgets', Visual: AllWidgetsVisual },
  { id: 'arrange', Visual: ArrangeVisual },
  { id: 'lock', target: 'lock' },
  { id: 'backgrounds', target: 'backgrounds' },
  { id: 'reset', target: 'reset' },
  { id: 'spaces', target: 'spaces' },
  { id: 'notifications', target: 'notifications' },
  { id: 'settings', target: 'settings' },
  { id: 'hotkey', Visual: HotkeyVisual },
  { id: 'shortcuts', Visual: ShortcutsVisual },
  { id: 'screensaver', Visual: ScreensaverVisual },
  { id: 'tray', Visual: TrayVisual },
  { id: 'done', Visual: DoneVisual },
]

// The Store build can't install a system screensaver, so don't tour it.
export const WELCOME_STEPS = ALL_STEPS.filter((s) => !(IS_STORE && s.id === 'screensaver'))

const PAD = 8
const CARD_W = 380
const spring = { type: 'spring' as const, stiffness: 260, damping: 30 }

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// Full-screen rect plus a rounded-rect hole, drawn with the same commands
// every time so framer can interpolate between steps.
function holePath(h: Rect, radius: number): string {
  const W = 20000
  const r = Math.min(radius, h.w / 2, h.h / 2)
  const { x, y, w, h: hh } = h
  return [
    `M-${W} -${W}H${W}V${W}H-${W}Z`,
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}`,
    `V${y + hh - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + hh}`,
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + hh - r}`,
    `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`,
  ].join('')
}

function measure(target?: string): Rect | null {
  if (!target) return null
  const el = document.querySelector(`[data-tour="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return null
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }
}

// One tour engine for the welcome tour and each update's "what's new" tour:
// `steps` to walk, `ns` where their text lives (`<ns>.<id>.title/body`),
// `onFinish` when it ends (finished or skipped).
export function Tour({
  steps: STEPS = WELCOME_STEPS,
  ns = 'tour.steps',
  onFinish,
}: {
  steps?: TourStep[]
  ns?: string
  onFinish?: () => void
}) {
  const { t } = useTranslation()
  const close = useTourStore((s) => s.close)
  const setOnboarded = useSettingsStore((s) => s.setOnboarded)
  const setMode = useCanvasStore((s) => s.setMode)
  const mon = useAnchorMonitor()
  const [i, setI] = useState(0)
  const [dir, setDir] = useState(1)
  const [rect, setRect] = useState<Rect | null>(null)
  const step = STEPS[i]!
  const last = i === STEPS.length - 1

  // The toolbar must be open for the spotlight to have something to point at.
  useEffect(() => {
    setMode('edit')
  }, [setMode])

  // Re-measure the target on every step and whenever layout settles/changes
  // (the toolbar animates open, the window can resize).
  useLayoutEffect(() => {
    const update = () => setRect(measure(step.target))
    update()
    const ids = [120, 320, 650].map((ms) => window.setTimeout(update, ms))
    window.addEventListener('resize', update)
    return () => {
      ids.forEach((id) => window.clearTimeout(id))
      window.removeEventListener('resize', update)
    }
  }, [step.target])

  const finish = useCallback(() => {
    if (onFinish) onFinish()
    else setOnboarded(true)
    close()
  }, [close, onFinish, setOnboarded])

  const go = useCallback(
    (d: 1 | -1) => {
      if (d === 1 && last) return finish()
      setDir(d)
      setI((n) => Math.min(STEPS.length - 1, Math.max(0, n + d)))
    },
    [finish, last],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, finish])

  // Screen to center on: the monitor the toolbar lives on.
  const usable = mon && [mon.x, mon.y, mon.w, mon.h].every(Number.isFinite) && mon.w > 0
  const screen = usable ? mon : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
  const cardH = step.Visual ? 400 : 230
  let cardX: number
  let cardY: number
  if (rect) {
    cardX = rect.x + rect.w / 2 - CARD_W / 2
    const below = rect.y + rect.h + 16
    cardY = below + cardH < screen.y + screen.h ? below : rect.y - cardH - 16
  } else {
    cardX = screen.x + screen.w / 2 - CARD_W / 2
    cardY = screen.y + screen.h / 2 - cardH / 2
  }
  cardX = Math.min(Math.max(cardX, screen.x + 16), screen.x + screen.w - CARD_W - 16)

  // The spotlight hole; with no target it shrinks to a point at the center
  // so the dim covers everything and the card stands alone.
  const hole = rect ?? { x: screen.x + screen.w / 2, y: screen.y + screen.h / 2, w: 0, h: 0 }

  return (
    <motion.div
      data-hit
      className="fixed inset-0 z-[10002]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Dim with a rounded cut-out: one even-odd path (screen + hole) whose
          numbers interpolate, so the hole glides between targets. Shadows
          are disabled app-wide, so no box-shadow tricks here. */}
      <svg className="absolute inset-0 h-full w-full">
        <motion.path
          fill="rgba(6,6,12,0.66)"
          fillRule="evenodd"
          initial={false}
          animate={{ d: holePath(hole, rect ? 14 : 0) }}
          transition={spring}
        />
      </svg>

      {/* Pulsing ring around the target */}
      <AnimatePresence>
        {rect && (
          <motion.div
            key="ring"
            className="pointer-events-none absolute rounded-[14px] border-2 border-[var(--accent)]"
            initial={{ opacity: 0, left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            animate={{ opacity: [0.5, 1, 0.5], left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
            // Own exit timing: otherwise it inherits the infinite pulse and the
            // ring never finishes leaving.
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{ ...spring, opacity: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } }}
          />
        )}
      </AnimatePresence>

      {/* The card */}
      <motion.div
        className="glass absolute flex flex-col overflow-hidden rounded-[20px] border border-[var(--border)]"
        // --surface is ~90% opaque; stacked three times it's effectively
        // solid, so widgets behind never show through the card.
        style={{
          width: CARD_W,
          background: 'linear-gradient(var(--surface), var(--surface)), linear-gradient(var(--surface), var(--surface)), linear-gradient(var(--surface), var(--surface))',
        }}
        initial={{ left: cardX, top: cardY + 20, opacity: 0 }}
        animate={{ left: cardX, top: cardY, opacity: 1 }}
        transition={spring}
      >
        {/* progress */}
        <div className="h-1 w-full bg-[var(--fill-1)]">
          <motion.div
            className="h-full rounded-r-full bg-[var(--accent)]"
            animate={{ width: `${((i + 1) / STEPS.length) * 100}%` }}
            transition={spring}
          />
        </div>
        <div className="flex items-center justify-between px-5 pt-3">
          <span className="text-[11px] font-semibold tabular-nums tracking-wide text-[var(--text-tertiary)]">
            {t('tour.stepOf', { n: i + 1, total: STEPS.length })}
          </span>
          {!last && (
            <Tooltip label={t('tour.skip')} side="left">
              <button
                type="button"
                onClick={finish}
                className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
              >
                {t('tour.skip')}
                <X size={12} />
              </button>
            </Tooltip>
          )}
        </div>

        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div
            key={step.id}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40, filter: 'blur(4px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: dir * -40, filter: 'blur(4px)' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col"
          >
            {step.Visual && (
              <div className="mx-5 mt-3 h-[180px] overflow-hidden rounded-[14px] bg-[var(--fill-1)]">
                <step.Visual />
              </div>
            )}
            <div className="flex flex-col gap-1.5 px-5 pt-4">
              <h3 className="text-[18px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
                {t(`${ns}.${step.id}.title`)}
              </h3>
              <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                {t(`${ns}.${step.id}.body`)}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between gap-2 px-5 pb-4 pt-5">
          <div className="flex gap-1">
            {STEPS.map((s, n) => (
              <motion.span
                key={s.id}
                className="h-1.5 rounded-full"
                animate={{ width: n === i ? 16 : 6, backgroundColor: n <= i ? 'var(--accent)' : 'var(--fill-3)' }}
                transition={spring}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {i > 0 && (
              <Tooltip label={t('tour.back')} side="top">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--fill-1)] text-[var(--text-primary)] transition-colors hover:bg-[var(--fill-2)]"
                >
                  <ArrowLeft size={15} />
                </button>
              </Tooltip>
            )}
            <motion.button
              type="button"
              onClick={() => go(1)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-[13px] font-semibold text-[var(--on-accent)]"
            >
              {i === 0 ? t('tour.start') : last ? t('tour.done') : t('tour.next')}
              {!last && <ArrowRight size={14} />}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
