import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion, useTransform, type MotionValue } from 'framer-motion'
import { BellRing, Compass, LayoutGrid, LayoutTemplate, Plus, Search, Settings as SettingsIcon } from 'lucide-react'
import type { NewWidget, Widget, WidgetType } from '../types/widget'
import { widgetList, widgetRegistry, type WidgetDefinition } from '../lib/widgetRegistry'
import { useAnchorMonitor } from '../store/monitorStore'
import { useNotificationStore } from '../store/notificationStore'
import { setForceInteractive } from '../lib/ipc'
import { cn } from '../lib/utils'
import { SettingsModal } from './SettingsModal'
import { SpacesModal } from './SpacesModal'
import { NotificationsPanel } from './NotificationsPanel'
import { PetArt } from './widgets/pet/PetArt'
import { Tooltip } from './Tooltip'

// The Layer Hub: the toolbar pulled down into a small app. Every widget with
// a one-line description and a live demo, plus Spaces, Notifications and
// Settings as views inside it. It hangs from the toolbar like a sheet, at the
// bar's exact width; it never covers the whole screen.

export type HubView = 'widgets' | 'spaces' | 'notifications' | 'settings'
type Category = 'all' | 'productivity' | 'time' | 'media' | 'system' | 'web' | 'fun'

const CATEGORY_OF: Record<string, Exclude<Category, 'all'>> = {
  note: 'productivity',
  sticky: 'productivity',
  todo: 'productivity',
  board: 'productivity',
  inbox: 'productivity',
  pomodoro: 'productivity',
  shelf: 'productivity',
  clipboard: 'productivity',
  clock: 'time',
  worldclock: 'time',
  calendar: 'time',
  countdown: 'time',
  yearprogress: 'time',
  nowplaying: 'media',
  audio: 'media',
  mixer: 'media',
  camera: 'media',
  image: 'media',
  video: 'media',
  gallery: 'media',
  stats: 'system',
  diskinfo: 'system',
  quick: 'system',
  keepawake: 'system',
  winget: 'system',
  screentime: 'system',
  notifications: 'system',
  search: 'web',
  apps: 'web',
  link: 'web',
  webembed: 'web',
  weather: 'web',
  converter: 'web',
  pet: 'fun',
  greeting: 'fun',
}
const CATEGORIES: Category[] = ['all', 'productivity', 'time', 'media', 'system', 'web', 'fun']

// Widgets safe to render as a live demo: no camera, file pickers, network
// lookups, installers, focus-grabbing inputs or writes to shared stores.
const LIVE_DEMO = new Set<WidgetType>([
  'clock',
  'worldclock',
  'calendar',
  'countdown',
  'yearprogress',
  'todo',
  'inbox',
  'sticky',
  'board',
  'pomodoro',
  'stats',
  'diskinfo',
  'screentime',
  'greeting',
  'converter',
  'notifications',
  'clipboard',
  'nowplaying',
  'quick',
  'keepawake',
])

const ease = [0.32, 0.72, 0, 1] as const

// A demo that throws must never take the hub (or Layer) down with it.
class DemoBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {}
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function IconTile({ def, size }: { def: WidgetDefinition; size: number }) {
  const Icon = def.icon
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-[12px] bg-[var(--fill-1)] text-[var(--text-primary)]"
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.46)} strokeWidth={1.6} />
    </div>
  )
}

// For widgets that can't run as a demo: the icon floating on soft rings.
function IconDemo({ def }: { def: WidgetDefinition }) {
  const Icon = def.icon
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full border border-[var(--border-strong)]"
          style={{ width: 96, height: 96 }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: [0.8, 1.9], opacity: [0.5, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, delay: i * 1.4, ease: 'easeOut' }}
        />
      ))}
      <motion.div
        className="relative flex h-[76px] w-[76px] items-center justify-center rounded-[22px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)]"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Icon size={34} strokeWidth={1.5} />
      </motion.div>
    </div>
  )
}

// Desktop Pebbles gets its own little performance.
function PebbleDemo() {
  return (
    <div className="flex h-full w-full items-end justify-center pb-8">
      <motion.div
        className="h-[70px] w-[70px]"
        style={{ originY: 1 }}
        animate={{ y: [0, -46, 0, 0], scaleY: [0.82, 1.08, 0.8, 1], scaleX: [1.14, 0.94, 1.18, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.45, 0.82, 1], ease: 'easeInOut' }}
      >
        <PetArt eyes="happy" />
      </motion.div>
    </div>
  )
}

// The widget a style actually makes: its own type (Clock → Analog), or
// another one it stands for (Clock → World clock).
function styleTarget(host: WidgetDefinition, patch?: Record<string, unknown>): WidgetDefinition {
  const type = patch?.type
  return typeof type === 'string' && type !== host.type ? (widgetRegistry[type as WidgetType] ?? host) : host
}

// The demo stage: the real widget (in the chosen style), shrunk to fit the
// stage and inert.
function Stage({ host, styleKey, patch }: { host: WidgetDefinition; styleKey: string; patch?: Record<string, unknown> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [sample, setSample] = useState<Widget | null>(null)
  const def = styleTarget(host, patch)
  const demoKey = `${host.type}:${styleKey}`

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Sync creators only; the async ones open pickers or hit the network.
  useEffect(() => {
    if (!LIVE_DEMO.has(def.type as WidgetType)) {
      setSample(null)
      return
    }
    const made = def.create(0, 0) as NewWidget | null
    setSample(
      made && !(made instanceof Promise)
        ? ({ ...made, ...(patch ?? {}), type: def.type, id: `hub-demo-${demoKey}`, zIndex: 0 } as Widget)
        : null,
    )
    // demoKey captures host + style; patch objects are static per style
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoKey])

  const fallback = def.type === 'pet' ? <PebbleDemo /> : <IconDemo def={def} />
  let content: ReactNode = fallback
  if (sample && sample.id === `hub-demo-${demoKey}` && box.w > 0) {
    const pad = 28
    const scale = Math.min((box.w - pad) / sample.width, (box.h - pad) / sample.height, 1)
    const Renderer = def.Renderer
    content = (
      <DemoBoundary key={demoKey} fallback={fallback}>
        <div
          className="pointer-events-none absolute left-1/2 top-1/2"
          aria-hidden
          style={{
            width: sample.width,
            height: sample.height,
            transform: `translate(-50%, -50%) scale(${scale})`,
            ['--widget-accent' as string]: 'var(--accent)',
            ['--widget-accent-tint' as string]: 'transparent',
            ['--widget-accent-ring' as string]: 'transparent',
          }}
        >
          <Renderer widget={sample} />
        </div>
      </DemoBoundary>
    )
  }

  return (
    <div
      ref={ref}
      className="relative h-full w-full overflow-hidden rounded-[16px] border border-[var(--border)]"
      style={{
        // a soft spotlight over a faint dot grid
        background:
          'radial-gradient(120% 90% at 50% 35%, var(--fill-2), transparent 70%), radial-gradient(var(--border) 1px, transparent 1px) 0 0 / 14px 14px, var(--fill-1)',
      }}
    >
      {/* Keyed remount, no exit step: a "wait for the old one to leave"
          transition could get stuck when clicking through widgets quickly. */}
      <motion.div
        key={demoKey}
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 0.94, filter: 'blur(4px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.28, ease }}
      >
        {content}
      </motion.div>
    </div>
  )
}

function WidgetsView({
  width,
  category,
  query,
  onAdd,
}: {
  width: number
  category: Category
  query: string
  onAdd: (def: WidgetDefinition, patch?: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const name = (d: WidgetDefinition) => t(`widgets.${d.type}`, { defaultValue: d.label })
  const desc = (d: WidgetDefinition) => t(`hub.desc.${d.type}`)
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return widgetList.filter((d) => {
      if (category !== 'all' && CATEGORY_OF[d.type] !== category) return false
      if (!q) return true
      return name(d).toLowerCase().includes(q) || desc(d).toLowerCase().includes(q)
    })
    // name/desc only depend on t
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, query, t])
  const [selected, setSelected] = useState<string>(widgetList[0]?.type ?? 'note')
  useEffect(() => {
    if (list.length && !list.some((d) => d.type === selected)) setSelected(list[0]!.type)
  }, [list, selected])
  const def = widgetList.find((d) => d.type === selected) ?? widgetList[0]!
  // Which of the widget's styles is being previewed (and will be added).
  const [styleKey, setStyleKey] = useState('')
  const styles = def.styles ?? []
  const style = styles.find((s) => s.key === styleKey) ?? styles[0]
  useEffect(() => setStyleKey(''), [def.type])
  // The demo pane folds away on narrow screens (double-click a card to add).
  const detailW = width < 760 ? 0 : width < 1000 ? 270 : 330

  return (
    <div className="flex h-full min-w-0">
      <div className="min-w-0 flex-1 overflow-y-auto p-3">
        {list.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12.5px] text-[var(--text-tertiary)]">{t('hub.noResults')}</div>
        ) : (
          <motion.div
            key={category + query}
            className="grid gap-2"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))' }}
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.016, delayChildren: 0.05 } } }}
          >
            {list.map((d) => (
              <motion.button
                key={d.type}
                type="button"
                variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
                transition={{ duration: 0.3, ease }}
                onClick={() => setSelected(d.type)}
                onDoubleClick={() => onAdd(d)}
                className={cn(
                  'flex items-center gap-2.5 rounded-[12px] border p-2 text-left transition-colors',
                  d.type === def.type ? 'border-[var(--border-strong)] bg-[var(--fill-2)]' : 'border-transparent bg-[var(--fill-1)] hover:bg-[var(--fill-2)]',
                )}
              >
                <IconTile def={d} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{name(d)}</span>
                  <span className="block truncate text-[11px] text-[var(--text-tertiary)]">{desc(d)}</span>
                </span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>

      {detailW > 0 && (
        <div className="flex shrink-0 flex-col gap-3 border-l border-[var(--border)] p-4" style={{ width: detailW }}>
          <div className="min-h-[170px] flex-1">
            <Stage host={def} styleKey={style?.key ?? 'default'} patch={style?.patch} />
          </div>
          {/* Keyed remount (no exit step), so it always shows the selected widget. */}
            <motion.div
              key={def.type}
              className="flex shrink-0 flex-col"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease }}
            >
              <div className="text-[17px] font-bold tracking-tight text-[var(--text-primary)]">{name(def)}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{desc(def)}</p>
              {/* Style picker: choosing one swaps the demo above; Add adds it. */}
              {styles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {styles.map((s) => {
                    const on = s.key === style?.key
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setStyleKey(s.key)}
                        onDoubleClick={() => onAdd(def, s.patch)}
                        className={cn(
                          'relative h-7 rounded-full px-3 text-[11.5px] font-medium transition-colors',
                          on ? 'text-[var(--on-accent)]' : 'bg-[var(--fill-1)] text-[var(--text-secondary)] hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]',
                        )}
                      >
                        {on && (
                          <motion.span
                            layoutId="hub-style"
                            className="absolute inset-0 rounded-full bg-[var(--accent)]"
                            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                          />
                        )}
                        <span className="relative">{t(`widgetStyles.${def.type}.${s.key}`, { defaultValue: s.label })}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </motion.div>
          <motion.button
            type="button"
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onAdd(def, style?.patch)}
            className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[11px] bg-[var(--accent)] text-[13px] font-semibold text-[var(--on-accent)]"
          >
            <Plus size={15} strokeWidth={2.4} />
            {t('hub.add')}
          </motion.button>
        </div>
      )}
    </div>
  )
}

export function LayerHub({
  view,
  onView,
  reveal,
  frozen,
  onSettle,
  onClose,
  onAdd,
  onTour,
}: {
  // Owned by the toolbar, which shows it as a breadcrumb in the bar.
  view: HubView
  onView: (v: HubView) => void
  // 0 = tucked into the bar, 1 = fully out. Owned by the toolbar so a pull on
  // the bar and a drag of this sheet's handle drive the very same value.
  reveal: MotionValue<number>
  // Closing: stop following the bar so the sheet retracts as one piece.
  frozen: boolean
  // A drag of the handle ended: spring open (true) or close (false).
  onSettle: (open: boolean) => void
  onClose: () => void
  onAdd: (def: WidgetDefinition, patch?: Record<string, unknown>) => void
  onTour: () => void
}) {
  const { t } = useTranslation()
  const mon = useAnchorMonitor()
  const unread = useNotificationStore((s) => s.items.reduce((n, i) => n + (i.read ? 0 : 1), 0))
  const setView = onView
  const [category, setCategory] = useState<Category>('all')
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const counts = useMemo(() => {
    const c: Record<Category, number> = { all: widgetList.length, productivity: 0, time: 0, media: 0, system: 0, web: 0, fun: 0 }
    for (const d of widgetList) {
      const k = CATEGORY_OF[d.type]
      if (k) c[k]++
    }
    return c
  }, [])

  // Track the toolbar's real box: the sheet is exactly as wide and hangs from
  // its bottom edge. While closing, the geometry is frozen so the sheet
  // retracts as one clean piece even as the bar shrinks back.
  const [bar, setBar] = useState<{ left: number; width: number; bottom: number } | null>(null)
  const presentRef = useRef(true)
  presentRef.current = !frozen
  useEffect(() => {
    const el = document.querySelector<HTMLElement>('[data-tour="island"]')
    if (!el) return
    const read = () => {
      if (!presentRef.current) return
      const r = el.getBoundingClientRect()
      setBar((b) =>
        b && Math.abs(b.left - r.left) < 0.5 && Math.abs(b.width - r.width) < 0.5 && Math.abs(b.bottom - r.bottom) < 0.5
          ? b
          : { left: r.left, width: r.width, bottom: r.bottom },
      )
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    window.addEventListener('resize', read)
    const id = window.setInterval(read, 50)
    const stop = window.setTimeout(() => window.clearInterval(id), 900)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', read)
      window.clearInterval(id)
      window.clearTimeout(stop)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (view !== 'widgets') return
    const id = window.setTimeout(() => searchRef.current?.focus(), 380)
    return () => window.clearTimeout(id)
  }, [view])

  const screenH = mon?.h ?? window.innerHeight
  const screenTop = mon?.y ?? 0
  const width = bar?.width ?? Math.round((mon?.w ?? window.innerWidth) * 0.85)
  const top = bar ? bar.bottom - 1 : screenTop + 60
  // About 60% of the screen from the top, like the bar's own footprint.
  const height = Math.max(360, Math.round(screenTop + screenH * 0.61 - top))
  const sideW = width < 900 ? 168 : 204

  // Everything about the sheet's position comes from `reveal`, frame by frame:
  // no React render while it's being pulled, so it never lags the cursor.
  const sheetClip = useTransform(reveal, (p) => `inset(0% 0% ${(1 - p) * 100}% 0% round 0px 0px 22px 22px)`)
  const sheetY = useTransform(reveal, [0, 1], [-12, 0])
  const contentOpacity = useTransform(reveal, [0.25, 0.8], [0, 1])
  const contentY = useTransform(reveal, [0, 1], [-10, 0])

  // The handle: click to close, or drag it up (or back down) like a drawer.
  const handleDrag = useRef<{ y: number; p: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null)
  const onHandleDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    handleDrag.current = { y: e.clientY, p: reveal.get(), lastY: e.clientY, lastT: performance.now(), v: 0, moved: false }
  }
  const onHandleMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = handleDrag.current
    if (!d) return
    const dy = e.clientY - d.y
    if (!d.moved) {
      if (Math.abs(dy) < 4) return
      d.moved = true
      setForceInteractive(true).catch(() => {})
      document.body.style.cursor = 'grabbing'
    }
    const now = performance.now()
    d.v = (e.clientY - d.lastY) / Math.max(1, now - d.lastT)
    d.lastY = e.clientY
    d.lastT = now
    reveal.set(Math.min(1, Math.max(0, d.p + dy / height)))
  }
  const onHandleUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = handleDrag.current
    handleDrag.current = null
    if (!d) return
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    if (!d.moved) return onClose()
    setForceInteractive(false).catch(() => {})
    document.body.style.cursor = ''
    // A quick flick wins; otherwise it goes the way it's mostly at.
    onSettle(d.v > 0.5 ? true : d.v < -0.5 ? false : reveal.get() > 0.6)
  }

  const nav = (id: HubView, label: string, icon: ReactNode, badge?: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setView(id)}
      className={cn(
        'relative flex h-8 w-full shrink-0 items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px] font-medium transition-colors',
        view === id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
      )}
    >
      {view === id && (
        <motion.span layoutId="hub-nav" className="absolute inset-0 rounded-[9px] bg-[var(--fill-2)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
      )}
      <span className="relative flex">{icon}</span>
      <span className="relative truncate">{label}</span>
      {!!badge && (
        <span className="relative ml-auto rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-bold leading-[16px] text-[var(--on-accent)]">{badge}</span>
      )}
    </button>
  )

  return (
    <div data-hit className={cn('fixed z-[4990]', !bar && '-translate-x-1/2')} style={{ left: bar ? bar.left : mon ? mon.x + mon.w / 2 : '50%', top, width }}>
      {/* The sheet: revealed top-down like it's being pulled out of the bar. */}
      <motion.div
        className="glass flex flex-col overflow-hidden border border-t-0 border-[var(--border)]"
        style={{
          height,
          clipPath: sheetClip,
          y: sheetY,
          borderRadius: '0 0 22px 22px',
          background: 'linear-gradient(var(--surface), var(--surface)), linear-gradient(var(--surface), var(--surface))',
        }}
      >
        <motion.div className="flex min-h-0 flex-1" style={{ opacity: contentOpacity, y: contentY }}>
          {/* Sidebar */}
          <div className="flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-[var(--border)] p-3" style={{ width: sideW }}>
            {nav('widgets', t('hub.widgets'), <LayoutGrid size={15} strokeWidth={1.7} />)}
            {/* categories unfold under Widgets */}
            <AnimatePresence initial={false}>
              {view === 'widgets' && (
                <motion.div
                  key="cats"
                  className="shrink-0 overflow-hidden"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.32, ease }}
                >
                  <div className="relative my-1.5">
                    <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('hub.search')}
                      className="h-8 w-full rounded-[9px] border border-[var(--border)] bg-[var(--fill-1)] pl-8 pr-2 text-[12px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--border-strong)]"
                    />
                  </div>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={cn(
                        'relative flex h-7 w-full items-center justify-between rounded-[8px] pl-7 pr-2.5 text-[12px] transition-colors',
                        category === c ? 'font-semibold text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                      )}
                    >
                      {category === c && (
                        <motion.span layoutId="hub-cat" className="absolute left-3 h-3.5 w-[3px] rounded-full bg-[var(--accent)]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                      )}
                      <span className="truncate">{t(`hub.cat.${c}`)}</span>
                      <span className="text-[10.5px] tabular-nums text-[var(--text-tertiary)]">{counts[c]}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="my-1.5 h-px shrink-0 bg-[var(--border)]" />
            {nav('spaces', t('toolbar.spaces'), <LayoutTemplate size={15} strokeWidth={1.7} />)}
            {nav('notifications', t('toolbar.notifications'), <BellRing size={15} strokeWidth={1.7} />, unread)}
            {nav('settings', t('toolbar.settings'), <SettingsIcon size={15} strokeWidth={1.7} />)}
            <button
              type="button"
              onClick={onTour}
              className="mt-auto flex h-8 w-full shrink-0 items-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px] font-medium text-[var(--text-tertiary)] transition-colors hover:bg-[var(--fill-1)] hover:text-[var(--text-primary)]"
            >
              <Compass size={15} strokeWidth={1.7} />
              <span className="truncate">{t('settings.about.replayTour')}</span>
            </button>
          </div>

          {/* Content: each view slides and fades in */}
          <div className="relative min-w-0 flex-1">
            {/* Keyed remount, no exit step (see the demo stage). */}
              <motion.div
                key={view}
                className="absolute inset-0 overflow-hidden"
                initial={{ opacity: 0, y: 10, filter: 'blur(3px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.26, ease }}
              >
                {view === 'widgets' && <WidgetsView width={width - sideW} category={category} query={query} onAdd={onAdd} />}
                {view === 'spaces' && (
                  <div className="h-full overflow-y-auto">
                    <SpacesModal embedded onClose={onClose} />
                  </div>
                )}
                {view === 'notifications' && (
                  <div className="h-full overflow-y-auto">
                    <NotificationsPanel embedded onClose={onClose} />
                  </div>
                )}
                {view === 'settings' && <SettingsModal embedded onClose={onClose} />}
              </motion.div>
          </div>
        </motion.div>

        {/* Pull handle: click to push the sheet back up. */}
        <div className="flex h-5 shrink-0 items-center justify-center">
          <Tooltip label={t('hub.close')} side="bottom">
            <button
              type="button"
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              onPointerCancel={onHandleUp}
              className="group flex h-5 w-20 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
            >
              <span className="h-1 w-10 rounded-full bg-[var(--border-strong)] transition-all duration-200 group-hover:w-14 group-hover:bg-[var(--text-tertiary)]" />
            </button>
          </Tooltip>
        </div>
      </motion.div>
    </div>
  )
}
