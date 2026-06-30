import { useEffect, useMemo, useState, type FC } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Music,
  Timer as TimerIcon,
  Cpu,
  CloudSun,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Bell,
  Clipboard as ClipIcon,
  Calendar as CalIcon,
  LayoutGrid,
  ToggleLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  RotateCcw,
  Plus,
  X,
  Search,
  Trash2,
  MonitorPlay,
  type LucideIcon,
} from 'lucide-react'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import {
  getNowPlaying,
  mediaControl,
  getVolume,
  setVolume,
  getSystemStats,
  listApps,
  launchApp,
  getAppIcon,
  previewScreensaver,
  setHotcorner,
  type NowPlaying,
  type SystemStats,
  type AppEntry,
} from '../lib/ipc'
import { useTimerStore, timerRemaining } from './timerStore'
import { useNotchStore, type NotchModuleId } from './notchStore'
import { useClipboardStore } from '../store/clipboardStore'
import { useNotificationStore } from '../store/notificationStore'
import { useEventsStore } from '../store/eventsStore'
import { eventsOnDay } from '../lib/calendar'
import { useSettingsStore } from '../store/settingsStore'
import { detectLocation, reverseCity } from '../lib/location'
import { playSfx } from '../lib/sfx'
import { Segmented } from '../components/ui'
import type { PinnedApp } from '../types/widget'

export interface NotchModule {
  id: NotchModuleId
  label: string
  icon: LucideIcon
  accent: string
  Expanded: FC
}

function usePoll<T>(fn: () => Promise<T>, ms: number): T | null {
  const [val, setVal] = useState<T | null>(null)
  useEffect(() => {
    let alive = true
    const run = () => fn().then((v) => alive && setVal(v)).catch(() => {})
    run()
    const id = window.setInterval(run, ms)
    return () => {
      alive = false
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return val
}

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const gb = (b: number) => (b / 1024 ** 3).toFixed(1)

// ---------------- Now Playing ----------------
const NowPlayingExpanded: FC = () => {
  const { t } = useTranslation()
  const np = usePoll<NowPlaying>(getNowPlaying, 2500)
  const [vol, setVol] = useState(-1)
  useEffect(() => {
    getVolume().then(setVol).catch(() => {})
  }, [])
  const has = np?.hasSession && (np.title || np.artist)
  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0 text-center">
        <div className="truncate text-[14px] font-semibold">
          {has ? np!.title || t('notch.npUnknown') : t('notch.npIdle')}
        </div>
        <div className="truncate text-[12px] text-[var(--text-tertiary)]">
          {has ? np!.artist : t('notch.npHint')}
        </div>
      </div>
      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={() => mediaControl('prev').catch(() => {})} className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]">
          <SkipBack size={18} />
        </button>
        <button type="button" onClick={() => mediaControl('playpause').catch(() => {})} className="rounded-full bg-[var(--accent)] p-2.5 text-[var(--on-accent)]">
          {np?.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button type="button" onClick={() => mediaControl('next').catch(() => {})} className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]">
          <SkipForward size={18} />
        </button>
      </div>
      {vol >= 0 && (
        <div className="flex items-center gap-2">
          <Volume2 size={15} className="text-[var(--text-tertiary)]" />
          <input type="range" min={0} max={1} step={0.02} value={vol} onChange={(e) => { const v = Number(e.target.value); setVol(v); setVolume(v).catch(() => {}) }} className="h-1 w-full accent-[var(--accent)]" />
        </div>
      )}
    </div>
  )
}

// ---------------- Timer ----------------
const PRESETS = [5, 15, 25]
const TimerExpanded: FC = () => {
  const t = useTimerStore()
  const [, force] = useState(0)
  useEffect(() => {
    if (!t.running) return
    const id = window.setInterval(() => force((n) => n + 1), 250)
    return () => window.clearInterval(id)
  }, [t.running])
  const rem = timerRemaining(t)
  useEffect(() => {
    if (t.running && rem <= 0) {
      playSfx('timer')
      t.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rem, t.running])
  const idle = !t.running && rem <= 0
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="text-[34px] font-bold tabular-nums" style={{ letterSpacing: '-1px' }}>
        {fmt(rem)}
      </div>
      {idle ? (
        <div className="flex gap-2">
          {PRESETS.map((m) => (
            <button key={m} type="button" onClick={() => t.start(m * 60_000)} className="rounded-[9px] bg-[var(--fill-2)] px-3 py-1.5 text-[13px] font-medium hover:bg-[var(--fill-3)]">
              {m}m
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => (t.running ? t.pause() : t.resume())} className="rounded-full bg-[var(--accent)] p-2.5 text-[var(--on-accent)]">
            {t.running ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button type="button" onClick={() => t.reset()} className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]">
            <RotateCcw size={16} />
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------- System ----------------
function Bar({ label, pct, tint }: { label: string; pct: number; tint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px] text-[var(--text-tertiary)]">
        <span>{label}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--fill-2)]">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: tint }} />
      </div>
    </div>
  )
}
const SystemExpanded: FC = () => {
  const { t } = useTranslation()
  const s = usePoll<SystemStats>(getSystemStats, 2500)
  if (!s) return <div className="text-[12px] text-[var(--text-tertiary)]">{t('notch.sysReading')}</div>
  const mem = s.memTotal ? (s.memUsed / s.memTotal) * 100 : 0
  const disk = s.diskTotal ? (s.diskUsed / s.diskTotal) * 100 : 0
  return (
    <div className="flex flex-col gap-2.5">
      <Bar label={t('notch.cpu')} pct={s.cpu} tint="#3b82f6" />
      <Bar label={`${t('notch.memory')} · ${gb(s.memUsed)}/${gb(s.memTotal)} GB`} pct={mem} tint="#8b5cf6" />
      <Bar label={t('notch.disk')} pct={disk} tint="#10b981" />
      {s.battery >= 0 && (
        <div className="mt-0.5 text-[12px] text-[var(--text-secondary)]">
          Battery {s.battery}%{s.charging ? ' · charging' : ''}
        </div>
      )}
    </div>
  )
}

// ---------------- Shortcut hub ----------------
function AppTile({ app, onLaunch, onRemove }: { app: PinnedApp; onLaunch: () => void; onRemove: () => void }) {
  const hue = useMemo(() => {
    let h = 0
    for (const c of app.name) h = (h * 31 + c.charCodeAt(0)) % 360
    return h
  }, [app.name])
  return (
    <div className="group relative flex flex-col items-center gap-1">
      <button type="button" onClick={onLaunch} className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[12px] bg-[var(--fill-2)] hover:bg-[var(--fill-3)]">
        {app.icon ? (
          <img src={app.icon} alt="" className="h-8 w-8" draggable={false} />
        ) : (
          <span className="text-[16px] font-bold text-white" style={{ color: `hsl(${hue} 60% 70%)` }}>
            {app.name[0]?.toUpperCase()}
          </span>
        )}
      </button>
      <span className="max-w-[56px] truncate text-[10px] text-[var(--text-tertiary)]">{app.name}</span>
      <button type="button" onClick={onRemove} className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-[var(--danger)] text-white group-hover:flex">
        <X size={10} />
      </button>
    </div>
  )
}
const ShortcutsExpanded: FC = () => {
  const { t } = useTranslation()
  const pinned = useNotchStore((s) => s.pinned)
  const setPinned = useNotchStore((s) => s.setPinned)
  const [picking, setPicking] = useState(false)
  const [all, setAll] = useState<AppEntry[]>([])
  const [q, setQ] = useState('')

  useEffect(() => {
    if (picking && all.length === 0) listApps().then(setAll).catch(() => {})
  }, [picking, all.length])

  const add = async (a: AppEntry) => {
    const icon = await getAppIcon(a.path).catch(() => null)
    setPinned([...pinned, { name: a.name, path: a.path, icon: icon ?? undefined }])
    setPicking(false)
    setQ('')
  }
  const results = q
    ? all.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40)
    : all.slice(0, 40)

  if (picking) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-[var(--text-tertiary)]" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('notch.searchApps')} className="w-full bg-transparent text-[13px] outline-none" />
          <button type="button" onClick={() => setPicking(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X size={15} /></button>
        </div>
        <div className="flex max-h-[160px] flex-col gap-0.5 overflow-y-auto">
          {results.map((a) => (
            <button key={a.path} type="button" onClick={() => add(a)} className="truncate rounded-[7px] px-2 py-1.5 text-left text-[12px] hover:bg-[var(--fill-2)]">
              {a.name}
            </button>
          ))}
          {results.length === 0 && <div className="px-2 py-3 text-[12px] text-[var(--text-tertiary)]">{t('notch.noApps')}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-4 gap-3">
      {pinned.map((app, i) => (
        <AppTile key={app.path + i} app={app} onLaunch={() => launchApp(app.path).catch(() => {})} onRemove={() => setPinned(pinned.filter((_, j) => j !== i))} />
      ))}
      <button type="button" onClick={() => setPicking(true)} className="flex h-12 w-12 items-center justify-center rounded-[12px] border border-dashed border-[var(--border-strong)] text-[var(--text-tertiary)] hover:bg-[var(--fill-2)]">
        <Plus size={18} />
      </button>
    </div>
  )
}

// ---------------- Weather ----------------
function weatherIcon(code: number): LucideIcon {
  if (code === 0) return Sun
  if (code <= 3) return CloudSun
  if (code <= 67) return CloudRain
  if (code <= 86) return CloudSnow
  return Cloud
}
const WeatherExpanded: FC = () => {
  const { t } = useTranslation()
  const [data, setData] = useState<{ temp: number; code: number; city: string } | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const loc = await detectLocation()
      if (!loc || !alive) return setErr(true)
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}&current=temperature_2m,weather_code`)
        const j = await r.json()
        const city = loc.city || (await reverseCity(loc.lat, loc.lon))
        if (alive) setData({ temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, city })
      } catch {
        if (alive) setErr(true)
      }
    }
    load()
    const id = window.setInterval(load, 15 * 60_000)
    return () => { alive = false; window.clearInterval(id) }
  }, [])
  if (err) return <div className="text-[12px] text-[var(--text-tertiary)]">{t('notch.weatherUnavailable')}</div>
  if (!data) return <div className="text-[12px] text-[var(--text-tertiary)]">{t('notch.locating')}</div>
  const Icon = weatherIcon(data.code)
  return (
    <div className="flex items-center gap-3">
      <Icon size={40} strokeWidth={1.5} className="text-[#0ea5e9]" />
      <div>
        <div className="text-[26px] font-bold tabular-nums">{data.temp}°</div>
        <div className="text-[12px] text-[var(--text-tertiary)]">{data.city}</div>
      </div>
    </div>
  )
}

// ---------------- Notifications ----------------
const NotificationsExpanded: FC = () => {
  const { t } = useTranslation()
  const items = useNotificationStore((s) => s.items)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const clearAll = useNotificationStore((s) => s.clearAll)
  if (items.length === 0) return <div className="text-[12px] text-[var(--text-tertiary)]">{t('notch.notifEmpty')}</div>
  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-h-[160px] flex-col gap-1.5 overflow-y-auto">
        {items.slice(0, 20).map((n) => (
          <div key={n.id} className="rounded-[8px] bg-[var(--fill-2)] px-2.5 py-1.5">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold">
              {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
              <span className="truncate">{n.title}</span>
            </div>
            {n.body && <div className="truncate text-[11px] text-[var(--text-tertiary)]">{n.body}</div>}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={markAllRead} className="flex-1 rounded-[7px] bg-[var(--fill-2)] py-1.5 text-[12px] hover:bg-[var(--fill-3)]">{t('notch.markRead')}</button>
        <button type="button" onClick={clearAll} className="rounded-[7px] px-3 py-1.5 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--danger)]"><Trash2 size={14} /></button>
      </div>
    </div>
  )
}

// ---------------- Clipboard ----------------
const ClipboardExpanded: FC = () => {
  const { t } = useTranslation()
  const items = useClipboardStore((s) => s.items)
  const togglePin = useClipboardStore((s) => s.togglePin)
  const [copied, setCopied] = useState<string | null>(null)
  if (items.length === 0) return <div className="text-[12px] text-[var(--text-tertiary)]">{t('notch.clipEmpty')}</div>
  return (
    <div className="flex max-h-[180px] flex-col gap-1 overflow-y-auto">
      {items.slice(0, 25).map((c) => (
        <button key={c.id} type="button" onClick={() => { writeText(c.text).catch(() => {}); setCopied(c.id); window.setTimeout(() => setCopied(null), 900) }} onContextMenu={(e) => { e.preventDefault(); togglePin(c.id) }} className="truncate rounded-[7px] px-2 py-1.5 text-left text-[12px] hover:bg-[var(--fill-2)]" title={c.pinned ? t('notch.pinnedHint') : t('notch.copyHint')}>
          {copied === c.id ? t('notch.copied') : (c.pinned ? '📌 ' : '') + c.text}
        </button>
      ))}
    </div>
  )
}

// ---------------- Calendar ----------------
const CalendarExpanded: FC = () => {
  const { t } = useTranslation()
  const events = useEventsStore((s) => s.events)
  const today = useMemo(() => eventsOnDay(events, new Date()), [events])
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[12px] font-semibold text-[var(--text-secondary)]">
        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
      {today.length === 0 ? (
        <div className="text-[12px] text-[var(--text-tertiary)]">{t('notch.noEvents')}</div>
      ) : (
        today.slice(0, 6).map((e) => (
          <div key={e.id} className="flex items-center gap-2 text-[12px]">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />
            <span className="truncate">{e.title}</span>
            {!e.allDay && (
              <span className="ml-auto text-[11px] text-[var(--text-tertiary)]">
                {new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </div>
        ))
      )}
    </div>
  )
}

// ---------------- Quick toggles ----------------
const TogglesExpanded: FC = () => {
  const { t } = useTranslation()
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const hotCorner = useSettingsStore((s) => s.hotCorner)
  const setHotCorner = useSettingsStore((s) => s.setHotCorner)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-[var(--text-tertiary)]">{t('notch.theme')}</span>
        <Segmented
          value={theme}
          options={[{ value: 'light', label: t('notch.light') }, { value: 'dark', label: t('notch.dark') }, { value: 'system', label: t('notch.system') }]}
          onChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}
        />
      </div>
      <button type="button" onClick={() => previewScreensaver().catch(() => {})} className="flex items-center gap-2 rounded-[8px] bg-[var(--fill-2)] px-3 py-2 text-[13px] hover:bg-[var(--fill-3)]">
        <MonitorPlay size={15} /> {t('notch.previewScreensaver')}
      </button>
      <button type="button" onClick={() => { const v = !hotCorner; setHotCorner(v); setHotcorner(v).catch(() => {}) }} className="flex items-center justify-between rounded-[8px] bg-[var(--fill-2)] px-3 py-2 text-[13px]">
        <span>{t('notch.hotCorner')}</span>
        <span className={hotCorner ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}>{hotCorner ? t('notch.on') : t('notch.off')}</span>
      </button>
    </div>
  )
}

export const NOTCH_MODULES: Record<NotchModuleId, NotchModule> = {
  nowplaying: { id: 'nowplaying', label: 'Now Playing', icon: Music, accent: '#ec4899', Expanded: NowPlayingExpanded },
  timer: { id: 'timer', label: 'Timer', icon: TimerIcon, accent: '#f59e0b', Expanded: TimerExpanded },
  system: { id: 'system', label: 'System', icon: Cpu, accent: '#3b82f6', Expanded: SystemExpanded },
  weather: { id: 'weather', label: 'Weather', icon: CloudSun, accent: '#0ea5e9', Expanded: WeatherExpanded },
  notifications: { id: 'notifications', label: 'Notifications', icon: Bell, accent: '#ef4444', Expanded: NotificationsExpanded },
  clipboard: { id: 'clipboard', label: 'Clipboard', icon: ClipIcon, accent: '#14b8a6', Expanded: ClipboardExpanded },
  calendar: { id: 'calendar', label: 'Calendar', icon: CalIcon, accent: '#8b5cf6', Expanded: CalendarExpanded },
  shortcuts: { id: 'shortcuts', label: 'Shortcuts', icon: LayoutGrid, accent: '#6366f1', Expanded: ShortcutsExpanded },
  toggles: { id: 'toggles', label: 'Quick toggles', icon: ToggleLeft, accent: '#22c55e', Expanded: TogglesExpanded },
}
