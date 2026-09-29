import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Coffee } from 'lucide-react'
import type { KeepAwakeWidget as KeepAwakeWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'
import { setKeepAwake, isTauri } from '../../lib/ipc'
import { useCanvasStore } from '../../store/canvasStore'
import { FieldRow, Segmented, Toggle } from '../ui'

const DURATIONS: { value: string; minutes: number | null }[] = [
  { value: '30', minutes: 30 },
  { value: '60', minutes: 60 },
  { value: '120', minutes: 120 },
  { value: 'inf', minutes: null },
]

function fmtRemaining(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// Mirrors the OS-level keep-awake flag to whatever this widget instance last
// wanted. SetThreadExecutionState is a single global, process-wide flag (see
// commands.rs) — with more than one Keep Awake widget on the canvas they'd
// all just be steering the same knob, which is fine for a small utility
// widget like this; it isn't worth per-instance reference counting.
function useKeepAwakeEffect(enabled: boolean, keepDisplayOn: boolean) {
  useEffect(() => {
    if (!isTauri()) return
    setKeepAwake(enabled, enabled && keepDisplayOn).catch(() => {})
  }, [enabled, keepDisplayOn])

  // Release the flag if this widget instance goes away while active, so
  // deleting it doesn't leave the machine stuck awake forever.
  useEffect(() => {
    return () => {
      if (isTauri()) setKeepAwake(false, false).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

function KeepAwakeRenderer({ widget }: { widget: KeepAwakeWidgetType }) {
  const { t } = useTranslation()
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const liveUpdateWidget = useCanvasStore((s) => s.liveUpdateWidget)
  const [now, setNow] = useState(() => Date.now())
  useKeepAwakeEffect(widget.enabled, widget.keepDisplayOn)

  // The main toggle lives right on the card, not just in Settings — this is
  // meant to be a one-glance-one-click utility, not something you dig into a
  // popover for every time. A deliberate flip, so it goes through
  // updateWidget (with an undo entry), not the auto-expiry's liveUpdateWidget.
  function toggle() {
    const enabled = !widget.enabled
    updateWidget(widget.id, {
      enabled,
      endsAt: enabled && widget.timerMinutes ? Date.now() + widget.timerMinutes * 60_000 : null,
    })
  }

  // Tick the countdown display, and auto-turn-off once a timed session ends.
  // liveUpdateWidget (no undo snapshot) since this is an automatic system
  // action, not a deliberate edit worth an undo entry.
  useEffect(() => {
    if (!widget.enabled || !widget.endsAt) return
    const id = window.setInterval(() => {
      const remaining = widget.endsAt! - Date.now()
      if (remaining <= 0) {
        liveUpdateWidget(widget.id, { enabled: false, endsAt: null })
      } else {
        setNow(Date.now())
      }
    }, 1000)
    return () => window.clearInterval(id)
  }, [widget.enabled, widget.endsAt, widget.id, liveUpdateWidget])

  return (
    <div className="glass flex h-full w-full flex-col items-center justify-center gap-2 rounded-[16px] border border-[var(--border)] p-3 text-center">
      <Coffee
        size={22}
        strokeWidth={1.75}
        className={widget.enabled ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}
      />
      <span className="text-[12px] font-semibold text-[var(--text-primary)]">
        {t('keepawake.title')}
      </span>
      <span className="text-[11px] text-[var(--text-tertiary)]">
        {widget.enabled
          ? widget.endsAt
            ? t('keepawake.remaining', { time: fmtRemaining(widget.endsAt - now) })
            : t('keepawake.on')
          : t('keepawake.off')}
      </span>
      <Toggle checked={widget.enabled} onChange={toggle} />
    </div>
  )
}

function KeepAwakeSettings({
  widget,
  onUpdate,
}: {
  widget: KeepAwakeWidgetType
  onUpdate: (patch: Partial<KeepAwakeWidgetType>) => void
}) {
  const { t } = useTranslation()
  const selected = widget.timerMinutes === null ? 'inf' : String(widget.timerMinutes)

  function pickDuration(value: string) {
    const opt = DURATIONS.find((d) => d.value === value)
    if (!opt) return
    onUpdate({
      timerMinutes: opt.minutes,
      endsAt: widget.enabled && opt.minutes ? Date.now() + opt.minutes * 60_000 : null,
    })
  }

  function toggle(enabled: boolean) {
    onUpdate({
      enabled,
      endsAt: enabled && widget.timerMinutes ? Date.now() + widget.timerMinutes * 60_000 : null,
    })
  }

  return (
    <div className="flex w-[220px] flex-col gap-3">
      <FieldRow label={t('keepawake.title')}>
        <Toggle checked={widget.enabled} onChange={toggle} />
      </FieldRow>

      <div className="flex flex-col gap-1">
        <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          {t('keepawake.duration')}
        </span>
        <Segmented
          value={selected}
          options={[
            { value: '30', label: t('keepawake.d30') },
            { value: '60', label: t('keepawake.d60') },
            { value: '120', label: t('keepawake.d120') },
            { value: 'inf', label: t('keepawake.dInf') },
          ]}
          onChange={pickDuration}
        />
      </div>

      <FieldRow label={t('keepawake.keepDisplayOn')}>
        <Toggle
          checked={widget.keepDisplayOn}
          onChange={(v) => onUpdate({ keepDisplayOn: v })}
        />
      </FieldRow>
    </div>
  )
}

export const keepAwakeDefinition: WidgetDefinition<KeepAwakeWidgetType> = {
  type: 'keepawake',
  label: 'Keep Awake',
  icon: Coffee,
  enabled: true,
  minSize: { width: 120, height: 110 },
  maxSize: { width: 220, height: 180 },
  create: (x, y) => ({
    type: 'keepawake',
    x,
    y,
    width: 150,
    height: 130,
    locked: false,
    enabled: false,
    keepDisplayOn: false,
    timerMinutes: null,
    endsAt: null,
  }),
  Renderer: KeepAwakeRenderer,
  Settings: KeepAwakeSettings,
}
