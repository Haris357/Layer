import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Layers, MousePointer2, Check, Moon, Copy, Trash2, Sun, Music2 } from 'lucide-react'
import { widgetList } from '../../lib/widgetRegistry'
import { useSettingsStore } from '../../store/settingsStore'
import { PetArt } from '../widgets/pet/PetArt'

// Shared look for the little "app" mockups inside the tour card.
const chip = 'rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-md'

// ── Welcome: the logo with mini widgets floating around it ────────────────
export function WelcomeVisual() {
  const floaters = [
    { x: -118, y: -38, d: 0, el: <span className="text-[13px] font-bold tabular-nums">9:41</span> },
    { x: 104, y: -46, d: 0.15, el: <span className="flex items-center gap-1 text-[12px] font-semibold"><Sun size={13} className="text-amber-400" />24°</span> },
    { x: -126, y: 38, d: 0.3, el: <span className="flex flex-col gap-1">{[30, 22, 26].map((w, i) => <span key={i} className="h-1 rounded-full bg-[var(--fill-3)]" style={{ width: w }} />)}</span> },
    { x: 112, y: 34, d: 0.45, el: <span className="flex items-end gap-[2px]">{[8, 14, 6, 12, 9].map((h, i) => <motion.span key={i} className="w-[3px] rounded-full bg-[var(--accent)]" animate={{ height: [h, h / 2, h] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }} />)}</span> },
  ]
  return (
    <div className="relative flex h-full items-center justify-center">
      {floaters.map((f, i) => (
        <motion.div
          key={i}
          className={`absolute px-2.5 py-2 text-[var(--text-primary)] ${chip}`}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
          animate={{ opacity: 1, x: f.x, y: [f.y, f.y - 6, f.y], scale: 1 }}
          transition={{ opacity: { delay: 0.25 + f.d }, scale: { delay: 0.25 + f.d, type: 'spring', stiffness: 260, damping: 16 }, x: { delay: 0.25 + f.d, type: 'spring', stiffness: 120, damping: 14 }, y: { duration: 3 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: 0.6 + f.d } }}
        >
          {f.el}
        </motion.div>
      ))}
      <motion.div
        className="absolute bottom-1 right-16 h-12 w-12"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, type: 'spring', stiffness: 200, damping: 14 }}
      >
        <PetArt eyes="happy" />
      </motion.div>
      <motion.div
        className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--accent)] text-[var(--on-accent)] shadow-xl"
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 14 }}
      >
        <Layers size={30} strokeWidth={1.8} />
      </motion.div>
    </div>
  )
}

// ── Every widget: a grid that spotlights each one in turn ─────────────────
export function AllWidgetsVisual() {
  const { t } = useTranslation()
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setI((n) => (n + 1) % widgetList.length), 900)
    return () => window.clearInterval(id)
  }, [])
  const cur = widgetList[i]!
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="grid grid-cols-9 gap-1.5">
        {widgetList.map((def, n) => {
          const Icon = def.icon
          const on = n === i
          return (
            <motion.div
              key={def.type}
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: 1, scale: on ? 1.22 : 1 }}
              transition={{ opacity: { delay: n * 0.018 }, scale: { type: 'spring', stiffness: 420, damping: 18, delay: on ? 0 : n * 0.018 } }}
              className="flex h-7 w-7 items-center justify-center rounded-[8px] transition-colors duration-200"
              style={{ background: on ? 'var(--accent)' : 'var(--fill-1)', color: on ? 'var(--on-accent)' : 'var(--text-secondary)' }}
            >
              <Icon size={14} strokeWidth={1.8} />
            </motion.div>
          )
        })}
      </div>
      <motion.span
        key={cur.type}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[13px] font-semibold text-[var(--text-primary)]"
      >
        {t(`widgets.${cur.type}`, { defaultValue: cur.label })}
      </motion.span>
    </div>
  )
}

// ── Arrange: a cursor drags, resizes and right-clicks a mini widget ───────
export function ArrangeVisual() {
  const { t } = useTranslation()
  // One 7s loop: move to grip → drag right → go to corner → resize →
  // right-click → menu → reset.
  const T = { duration: 7, repeat: Infinity, ease: 'easeInOut' as const }
  const times = [0, 0.1, 0.3, 0.38, 0.55, 0.65, 0.78, 0.92, 1]
  return (
    <div className="relative mx-auto h-full w-[300px] overflow-hidden rounded-[12px] bg-[var(--fill-1)]" style={{ backgroundImage: 'radial-gradient(var(--fill-3) 1px, transparent 1px)', backgroundSize: '14px 14px' }}>
      <motion.div
        className={`absolute top-[34px] flex flex-col gap-1.5 p-2.5 ${chip}`}
        animate={{ left: [30, 30, 120, 120, 120, 120, 120, 120, 30], width: [96, 96, 96, 96, 132, 132, 132, 132, 96], height: [64, 64, 64, 64, 84, 84, 84, 84, 64] }}
        transition={{ ...T, times }}
      >
        <span className="h-1.5 w-12 rounded-full bg-[var(--accent)]" />
        <span className="h-1 w-16 rounded-full bg-[var(--fill-3)]" />
        <span className="h-1 w-10 rounded-full bg-[var(--fill-3)]" />
      </motion.div>
      <motion.div
        className={`absolute flex w-[92px] flex-col gap-0.5 p-1 text-[9px] text-[var(--text-secondary)] ${chip}`}
        style={{ left: 196, top: 70 }}
        animate={{ opacity: [0, 0, 0, 0, 0, 0, 1, 1, 0], scale: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 1, 1, 0.8] }}
        transition={{ ...T, times }}
      >
        <span className="flex items-center gap-1 rounded px-1 py-0.5 bg-[var(--fill-2)]"><Copy size={9} />{t('contextMenu.duplicate')}</span>
        <span className="flex items-center gap-1 px-1 py-0.5"><Layers size={9} />{t('contextMenu.bringToFront')}</span>
        <span className="flex items-center gap-1 px-1 py-0.5 text-[var(--danger)]"><Trash2 size={9} />{t('contextMenu.delete')}</span>
      </motion.div>
      <motion.div
        className="absolute text-[var(--text-primary)]"
        animate={{ left: [220, 38, 128, 246, 270, 180, 190, 190, 220], top: [120, 40, 40, 92, 112, 70, 64, 64, 120], scale: [1, 0.85, 0.85, 1, 0.85, 1, 0.85, 1, 1] }}
        transition={{ ...T, times }}
      >
        <MousePointer2 size={18} fill="currentColor" strokeWidth={1.4} />
      </motion.div>
    </div>
  )
}

// ── Keycaps that press in sequence ───────────────────────────────────────
function Keycap({ k, delay }: { k: string; delay: number }) {
  return (
    <motion.span
      className="inline-flex h-10 min-w-10 items-center justify-center rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13px] font-semibold text-[var(--text-primary)]"
      style={{ boxShadow: '0 3px 0 var(--border-strong)' }}
      animate={{ y: [0, 0, 3, 3, 0], boxShadow: ['0 3px 0 var(--border-strong)', '0 3px 0 var(--border-strong)', '0 0 0 var(--border-strong)', '0 0 0 var(--border-strong)', '0 3px 0 var(--border-strong)'] }}
      transition={{ duration: 2.4, repeat: Infinity, times: [0, delay, delay + 0.06, 0.8, 0.9] }}
    >
      {k}
    </motion.span>
  )
}

export function HotkeyVisual() {
  const { t } = useTranslation()
  const hotkey = useSettingsStore((s) => s.hotkey)
  const keys = hotkey.split('+')
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="flex items-center gap-2">
        {keys.map((k, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-[var(--text-tertiary)]">+</span>}
            <Keycap k={k} delay={0.15 + i * 0.12} />
          </span>
        ))}
      </div>
      <div className="relative flex h-8 w-[180px] items-center rounded-full bg-[var(--fill-1)] p-1 text-[11px] font-semibold">
        <motion.span
          className="absolute h-6 w-[86px] rounded-full bg-[var(--accent)]"
          animate={{ x: [0, 0, 86, 86, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.5, 0.58, 0.9, 1], ease: 'easeInOut' }}
        />
        {/* Labels flip color in step with the pill so the active one stays readable. */}
        {[t('tour.view'), t('tour.edit')].map((label, n) => (
          <motion.span
            key={n}
            className="relative z-10 w-1/2 text-center"
            animate={{
              color:
                n === 0
                  ? ['var(--on-accent)', 'var(--on-accent)', 'var(--text-secondary)', 'var(--text-secondary)', 'var(--on-accent)']
                  : ['var(--text-secondary)', 'var(--text-secondary)', 'var(--on-accent)', 'var(--on-accent)', 'var(--text-secondary)'],
            }}
            transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.5, 0.58, 0.9, 1], ease: 'easeInOut' }}
          >
            {label}
          </motion.span>
        ))}
      </div>
    </div>
  )
}

// ── All shortcuts, using the user's own bindings ─────────────────────────
export function ShortcutsVisual() {
  const { t } = useTranslation()
  const hotkey = useSettingsStore((s) => s.hotkey)
  const sec = useSettingsStore((s) => s.secondaryShortcuts)
  const rows: [string, string][] = [
    [t('settings.shortcuts.toggleEdit'), hotkey],
    [t('settings.shortcuts.quickCapture'), sec.capture.enabled ? sec.capture.accelerator : t('settings.shortcuts.disabled')],
    [t('settings.shortcuts.hideEverything'), sec.hideAll.enabled ? sec.hideAll.accelerator : t('settings.shortcuts.disabled')],
    [t('settings.shortcuts.cycleSpaces'), sec.cycle.enabled ? sec.cycle.accelerator : t('settings.shortcuts.disabled')],
    [t('settings.shortcuts.previewScreensaver'), sec.screensaver.enabled ? sec.screensaver.accelerator : t('settings.shortcuts.disabled')],
    [t('settings.shortcuts.peek'), 'Ctrl+Shift+`'],
  ]
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 px-1">
      {rows.map(([label, keys], i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.08 * i, type: 'spring', stiffness: 300, damping: 24 }}
          className="flex items-center justify-between gap-3 text-[12px]"
        >
          <span className="truncate text-[var(--text-secondary)]">{label}</span>
          <span className="shrink-0 rounded-[6px] bg-[var(--fill-2)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--text-primary)]">{keys}</span>
        </motion.div>
      ))}
    </div>
  )
}

// ── Screensaver: a little monitor running the ambient view ────────────────
export function ScreensaverVisual() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center">
        <div className="relative h-[118px] w-[200px] overflow-hidden rounded-[10px] border-[5px] border-[#1d1d24] shadow-xl">
          <motion.div
            className="absolute inset-[-40%]"
            style={{ background: 'conic-gradient(from 0deg, #7c5cff, #2ec5ff, #ff7ac3, #ffb86b, #7c5cff)', filter: 'blur(28px)' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
          />
          <div className="absolute inset-0 bg-black/35" />
          <div className="relative flex h-full flex-col items-center justify-center text-white">
            <span className="text-[30px] font-bold tabular-nums leading-none" style={{ letterSpacing: '-1px' }}>
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="mt-1 flex items-center gap-1 text-[10px] opacity-80"><Moon size={10} />{now.toLocaleDateString([], { weekday: 'long' })}</span>
          </div>
        </div>
        <div className="h-3 w-10 bg-[#1d1d24]" />
        <div className="h-1.5 w-20 rounded-full bg-[#1d1d24]" />
      </div>
    </div>
  )
}

// ── Tray: the taskbar corner with Layer's icon and its menu ──────────────
export function TrayVisual() {
  const { t } = useTranslation()
  return (
    <div className="relative flex h-full items-end justify-center pb-2">
      <motion.div
        className={`absolute bottom-[50px] right-[58px] flex w-[140px] flex-col gap-0.5 p-1 text-[11px] text-[var(--text-primary)] ${chip}`}
        initial={{ opacity: 0, y: 8, scale: 0.9 }}
        animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, 8], scale: [0.9, 1, 1, 0.9] }}
        transition={{ duration: 3.2, repeat: Infinity, times: [0.2, 0.32, 0.85, 0.95] }}
      >
        {[t('settings.shortcuts.toggleEdit'), t('toolbar.spaces'), t('toolbar.settings'), t('common.quit')].map((l) => (
          <span key={l} className="truncate rounded px-2 py-1 first:bg-[var(--fill-2)]">{l}</span>
        ))}
      </motion.div>
      <div className="flex h-10 w-[290px] items-center justify-end gap-2.5 rounded-[10px] bg-[#1f2027] px-3 text-white/70">
        <Music2 size={14} />
        <Sun size={14} />
        <motion.span
          className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-white/10 text-white"
          animate={{ scale: [1, 1, 1.18, 1], backgroundColor: ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.28)', 'rgba(255,255,255,0.1)'] }}
          transition={{ duration: 3.2, repeat: Infinity, times: [0, 0.12, 0.2, 0.32] }}
        >
          <Layers size={14} />
        </motion.span>
        <span className="text-[11px] tabular-nums">9:41</span>
      </div>
    </div>
  )
}

// ── Done: a burst of color and a check ───────────────────────────────────
export function DoneVisual() {
  const colors = ['#7c5cff', '#2ec5ff', '#ff7ac3', '#ffb86b', '#5be3a4', '#ffd166']
  return (
    <div className="relative flex h-full items-center justify-center">
      {Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2
        const r = 70 + (i % 3) * 14
        return (
          <motion.span
            key={i}
            className="absolute h-2 w-2 rounded-full"
            style={{ background: colors[i % colors.length] }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
            animate={{ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.62, opacity: [0, 1, 0], scale: [0, 1.2, 0.6] }}
            transition={{ duration: 1.4, delay: 0.15 + (i % 4) * 0.05, repeat: Infinity, repeatDelay: 1.2, ease: 'easeOut' }}
          />
        )
      })}
      <motion.div
        className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] shadow-xl"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 12 }}
      >
        <Check size={32} strokeWidth={2.6} />
      </motion.div>
    </div>
  )
}
