import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SlidersVertical, Volume2, VolumeX, Speaker } from 'lucide-react'
import type { MixerWidget as MixerWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'
import {
  getVolume,
  isTauri,
  listAudioSessions,
  setSessionMute,
  setSessionVolume,
  setVolume,
  type AudioSession,
} from '../../lib/ipc'
import { FieldRow, Slider, Toggle } from '../ui'
import { Tooltip } from '../Tooltip'
import { cn } from '../../lib/utils'

const POLL_MS = 1500
const SEND_MS = 60
// After a local drag, ignore polled values for this row briefly so a poll that
// raced the IPC write doesn't snap the slider back to the old level.
const HOLD_MS = 1200

// Trailing throttle per key: drags fire onChange on every pixel, but Core
// Audio only needs a write every ~60ms to feel live.
function useThrottledSender<T>(send: (key: string, value: T) => void) {
  const pending = useRef(new Map<string, { value: T; timer: number }>())
  useEffect(() => {
    const map = pending.current
    return () => map.forEach((p) => window.clearTimeout(p.timer))
  }, [])
  return useCallback(
    (key: string, value: T) => {
      const existing = pending.current.get(key)
      if (existing) {
        existing.value = value
        return
      }
      const entry = {
        value,
        timer: window.setTimeout(() => {
          pending.current.delete(key)
          send(key, entry.value)
        }, SEND_MS),
      }
      pending.current.set(key, entry)
    },
    [send],
  )
}

function Row({
  icon,
  name,
  volume,
  muted,
  onVolume,
  onToggleMute,
  muteLabel,
}: {
  icon: ReactNode
  name: string
  volume: number
  muted?: boolean
  onVolume: (v: number) => void
  onToggleMute?: () => void
  muteLabel?: string
}) {
  const pct = Math.round(volume * 100)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {onToggleMute ? (
          <Tooltip label={muteLabel ?? ''} side="top">
            <button
              type="button"
              onClick={onToggleMute}
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] transition-colors hover:bg-[var(--fill-2)]',
                muted ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]',
              )}
            >
              {muted ? <VolumeX size={14} strokeWidth={2} /> : icon}
            </button>
          </Tooltip>
        ) : (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[var(--text-secondary)]">
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-primary)]">
          {name}
        </span>
        <span className="shrink-0 tabular-nums text-[11px] text-[var(--text-tertiary)]">
          {muted ? '—' : `${pct}%`}
        </span>
      </div>
      <div className={cn('px-0.5', muted && 'opacity-40')}>
        <Slider value={pct} min={0} max={100} onChange={(v) => onVolume(v / 100)} />
      </div>
    </div>
  )
}

function MixerRenderer({ widget }: { widget: MixerWidgetType }) {
  const { t } = useTranslation()
  const card = widget.background !== false
  const [sessions, setSessions] = useState<AudioSession[]>([])
  const [master, setMaster] = useState<number | null>(null)
  const heldUntil = useRef(new Map<string, number>())

  const hold = (key: string) => heldUntil.current.set(key, Date.now() + HOLD_MS)
  const isHeld = (key: string) => (heldUntil.current.get(key) ?? 0) > Date.now()

  const refresh = useCallback(() => {
    if (!isTauri()) return
    listAudioSessions()
      .then((next) =>
        setSessions((prev) =>
          next.map((s) => {
            if (!isHeld(s.id)) return s
            const local = prev.find((p) => p.id === s.id)
            return local ? { ...s, volume: local.volume, muted: local.muted } : s
          }),
        ),
      )
      .catch(() => {})
    if (widget.showMaster) {
      getVolume()
        .then((v) => {
          if (v >= 0 && !isHeld('__master')) setMaster(v)
        })
        .catch(() => {})
    }
  }, [widget.showMaster])

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const sendSession = useThrottledSender<number>(
    useCallback((id: string, level: number) => {
      setSessionVolume(id, level).catch(() => {})
    }, []),
  )
  const sendMaster = useThrottledSender<number>(
    useCallback((_: string, level: number) => {
      setVolume(level).catch(() => {})
    }, []),
  )

  const changeSession = (s: AudioSession, level: number) => {
    hold(s.id)
    setSessions((prev) => prev.map((p) => (p.id === s.id ? { ...p, volume: level } : p)))
    sendSession(s.id, level)
  }

  const toggleMute = (s: AudioSession) => {
    hold(s.id)
    const muted = !s.muted
    setSessions((prev) => prev.map((p) => (p.id === s.id ? { ...p, muted } : p)))
    setSessionMute(s.id, muted).catch(() => {})
  }

  const changeMaster = (level: number) => {
    hold('__master')
    setMaster(level)
    sendMaster('__master', level)
  }

  // System Sounds first (like the native mixer), then apps alphabetically.
  const sorted = [...sessions].sort((a, b) => {
    if (a.pid === 0) return -1
    if (b.pid === 0) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col gap-3 overflow-y-auto rounded-[14px] p-3',
        card && 'glass border border-[var(--border)]',
      )}
    >
      {widget.showMaster && master !== null && (
        <>
          <Row
            icon={<Speaker size={14} strokeWidth={2} />}
            name={t('mixer.master')}
            volume={master}
            onVolume={changeMaster}
          />
          <div className="h-px shrink-0 bg-[var(--border)]" />
        </>
      )}
      {sorted.map((s) => (
        <Row
          key={s.id}
          icon={<Volume2 size={14} strokeWidth={2} />}
          name={s.pid === 0 ? t('mixer.systemSounds') : s.name}
          volume={s.volume}
          muted={s.muted}
          onVolume={(v) => changeSession(s, v)}
          onToggleMute={() => toggleMute(s)}
          muteLabel={s.muted ? t('mixer.unmute') : t('mixer.mute')}
        />
      ))}
      {sorted.length === 0 && (
        <div className="m-auto text-center text-[12px] text-[var(--text-tertiary)]">
          {t('mixer.empty')}
        </div>
      )}
    </div>
  )
}

function MixerSettings({
  widget,
  onUpdate,
}: {
  widget: MixerWidgetType
  onUpdate: (patch: Partial<MixerWidgetType>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex w-[220px] flex-col gap-3">
      <FieldRow label={t('mixer.showMaster')}>
        <Toggle checked={widget.showMaster} onChange={(v) => onUpdate({ showMaster: v })} />
      </FieldRow>
      <FieldRow label={t('mixer.background')}>
        <Toggle
          checked={widget.background !== false}
          onChange={(v) => onUpdate({ background: v })}
        />
      </FieldRow>
    </div>
  )
}

export const mixerDefinition: WidgetDefinition<MixerWidgetType> = {
  type: 'mixer',
  label: 'Volume Mixer',
  icon: SlidersVertical,
  enabled: true,
  minSize: { width: 200, height: 140 },
  create: (x, y) => ({
    type: 'mixer',
    x,
    y,
    width: 260,
    height: 280,
    locked: false,
    showMaster: true,
    background: true,
  }),
  Renderer: MixerRenderer,
  Settings: MixerSettings,
}
