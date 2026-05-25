import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Timer, Volume2, VolumeX } from 'lucide-react'
import type { PomodoroWidget as PomodoroWidgetType } from '../../types/widget'
import { useCanvasStore } from '../../store/canvasStore'
import { notify } from '../../lib/notify'
import { useToastStore } from '../../store/toastStore'
import {
  AMBIENT_SOUNDS,
  playAmbient,
  setAmbientVolume,
  stopAmbient,
  type AmbientSound,
} from '../../lib/ambientSound'
import { Slider } from '../ui'
import { Tooltip } from '../Tooltip'
import { fireConfetti } from '../../lib/confetti'
import { playSfx } from '../../lib/sfx'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

type Phase = 'focus' | 'short' | 'long'

const PHASE_LABEL: Record<Phase, string> = {
  focus: 'Focus',
  short: 'Short break',
  long: 'Long break',
}

const PHASE_TINT: Record<Phase, string> = {
  focus: '#d65a5a',
  short: '#3aa37c',
  long: '#5b8def',
}

function dayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function PomodoroRenderer({ widget }: { widget: PomodoroWidgetType }) {
  const updateWidget = useCanvasStore((s) => s.updateWidget)

  // Reset daily count when the day rolls over.
  useEffect(() => {
    if (widget.statsDate !== dayKey()) {
      updateWidget(widget.id, { completedToday: 0, statsDate: dayKey() })
    }
  }, [widget.id, widget.statsDate, updateWidget])

  const phaseDuration = useCallback(
    (p: Phase) =>
      (p === 'focus'
        ? widget.workMinutes
        : p === 'short'
          ? widget.shortBreak
          : widget.longBreak) * 60,
    [widget.workMinutes, widget.shortBreak, widget.longBreak],
  )

  const [phase, setPhase] = useState<Phase>('focus')
  const [cycleIndex, setCycleIndex] = useState(0)
  const [remaining, setRemaining] = useState(() => phaseDuration('focus'))
  const [running, setRunning] = useState(false)
  // Wall-clock anchor (timestamp the phase reaches zero). The display reads
  // from this instead of decrementing a counter, so the countdown stays
  // accurate even if the interval is throttled while the widget is occluded.
  const endRef = useRef<number | null>(null)

  // Keep `remaining` in sync if the user edits durations while paused.
  const pausedRef = useRef(running)
  pausedRef.current = running
  useEffect(() => {
    if (!pausedRef.current) {
      setRemaining(phaseDuration(phase))
    }
  }, [phase, phaseDuration])

  // Anchor the end time when the timer starts/resumes; clear it on pause.
  useEffect(() => {
    endRef.current = running ? Date.now() + remaining * 1000 : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  // Tick from the wall clock so the countdown can't drift.
  useEffect(() => {
    if (!running) return
    const tick = () => {
      if (endRef.current == null) return
      setRemaining(Math.max(0, Math.round((endRef.current - Date.now()) / 1000)))
    }
    tick()
    const id = window.setInterval(tick, 250)
    const onVisible = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [running])

  // Phase transitions when remaining hits zero.
  useEffect(() => {
    if (remaining > 0) return
    if (phase === 'focus') {
      const nextCycle = cycleIndex + 1
      setCycleIndex(nextCycle)
      const isLong = nextCycle % widget.cyclesUntilLong === 0
      const nextPhase: Phase = isLong ? 'long' : 'short'
      const newCount = (widget.completedToday ?? 0) + 1
      updateWidget(widget.id, {
        completedToday: newCount,
        statsDate: dayKey(),
      })
      notify({
        kind: 'timer',
        title: 'Focus session complete ✦',
        body: `${newCount} done today — time for a ${isLong ? 'long' : 'short'} break.`,
      })
      useToastStore.getState().showToast({
        message: `Focus session complete — ${newCount} today 🎉`,
        icon: 'focus',
        duration: 6000,
      })
      fireConfetti()
      setPhase(nextPhase)
      const dur = phaseDuration(nextPhase)
      setRemaining(dur)
      // Re-anchor so the auto-started break/focus counts from its full length.
      if (running) endRef.current = Date.now() + dur * 1000
    } else {
      notify({
        kind: 'timer',
        title: 'Break over — back to focus',
      })
      setPhase('focus')
      const dur = phaseDuration('focus')
      setRemaining(dur)
      if (running) endRef.current = Date.now() + dur * 1000
    }
  }, [
    remaining,
    phase,
    running,
    cycleIndex,
    widget.cyclesUntilLong,
    widget.completedToday,
    widget.id,
    phaseDuration,
    updateWidget,
  ])

  // Ambient focus sound, tied to the running state.
  const sound = (widget.sound ?? 'none') as AmbientSound
  useEffect(() => {
    if (running && sound !== 'none') {
      playAmbient(sound, widget.soundVolume ?? 0.5)
    } else {
      stopAmbient()
    }
    return () => stopAmbient()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, sound])
  useEffect(() => {
    setAmbientVolume(widget.soundVolume ?? 0.5)
  }, [widget.soundVolume])

  const cycleSound = () => {
    const i = AMBIENT_SOUNDS.findIndex((s) => s.value === sound)
    const next = AMBIENT_SOUNDS[(i + 1) % AMBIENT_SOUNDS.length]
    if (next) updateWidget(widget.id, { sound: next.value })
  }
  const soundLabel = AMBIENT_SOUNDS.find((s) => s.value === sound)?.label ?? 'Off'

  const reset = () => {
    setRunning(false)
    setRemaining(phaseDuration(phase))
  }

  const skipToFocus = () => {
    setRunning(false)
    setPhase('focus')
    setRemaining(phaseDuration('focus'))
  }

  const total = phaseDuration(phase)
  const progress = total > 0 ? 1 - remaining / total : 0
  const C = 2 * Math.PI * 46
  const tint = PHASE_TINT[phase]
  const completedToday = widget.completedToday ?? 0

  return (
    <div className="glass relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-[12px] border border-[var(--border)] p-4">
      <div
        className="text-[10px] font-bold uppercase tracking-[1.5px]"
        style={{ color: tint }}
      >
        {PHASE_LABEL[phase]}
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        style={{ containerType: 'inline-size' }}
      >
        <svg
          viewBox="0 0 100 100"
          style={{
            width: 'min(72%, 190px)',
            aspectRatio: '1 / 1',
            maxHeight: '100%',
          }}
        >
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="var(--border)"
            strokeWidth="3"
          />
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke={tint}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - progress)}
            transform="rotate(-90 50 50)"
            style={{ transition: 'stroke-dashoffset 0.5s linear' }}
          />
        </svg>
        <div
          className="absolute text-[var(--text-primary)] tabular-nums"
          style={{
            fontSize: 'clamp(22px, 14cqi, 34px)',
            fontWeight: 700,
            letterSpacing: '-1.2px',
          }}
        >
          {fmt(remaining)}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-1.5">
        <Tooltip label={running ? 'Pause' : 'Start'}>
          <button
            type="button"
            onClick={() => {
              playSfx('timer')
              setRunning((v) => !v)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--on-accent)] transition-transform hover:scale-105"
            style={{ background: tint }}
          >
            {running ? (
              <Pause size={14} strokeWidth={2.5} />
            ) : (
              <Play size={14} strokeWidth={2.5} fill="currentColor" />
            )}
          </button>
        </Tooltip>
        <Tooltip label="Reset">
          <button
            type="button"
            onClick={reset}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
          >
            <RotateCcw size={13} strokeWidth={2} />
          </button>
        </Tooltip>
        {phase !== 'focus' && (
          <Tooltip label="Skip break">
            <button
              type="button"
              onClick={skipToFocus}
              className="rounded-[6px] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              Skip
            </button>
          </Tooltip>
        )}
      </div>

      <Tooltip label="Focus sound">
        <button
          type="button"
          onClick={cycleSound}
          className="flex items-center gap-1.5 rounded-[7px] border border-[var(--border)] px-2 py-1 text-[11px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          {sound === 'none' ? (
            <VolumeX size={13} strokeWidth={2} />
          ) : (
            <Volume2 size={13} strokeWidth={2} />
          )}
          {soundLabel}
        </button>
      </Tooltip>

      <div
        className="text-[var(--text-tertiary)]"
        style={{ fontSize: 11 }}
      >
        Today:{' '}
        <span className="font-semibold text-[var(--text-secondary)]">
          {completedToday}
        </span>{' '}
        focused
      </div>
    </div>
  )
}

function PomodoroSettings({
  widget,
  onUpdate,
}: {
  widget: PomodoroWidgetType
  onUpdate: (patch: Partial<PomodoroWidgetType>) => void
}) {
  const num = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    min = 1,
    max = 120,
  ) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11.5px] text-[var(--text-secondary)]">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
        }}
        className="w-[68px] rounded-[6px] border border-[var(--border)] bg-[var(--fill-1)] px-2 py-1 text-right text-[12px] text-[var(--text-primary)] outline-none"
      />
    </div>
  )
  return (
    <div className="flex w-[220px] flex-col gap-1.5">
      {num('Focus (min)', widget.workMinutes, (v) =>
        onUpdate({ workMinutes: v }),
      )}
      {num('Short break (min)', widget.shortBreak, (v) =>
        onUpdate({ shortBreak: v }),
      )}
      {num('Long break (min)', widget.longBreak, (v) =>
        onUpdate({ longBreak: v }),
      )}
      {num(
        'Long break after',
        widget.cyclesUntilLong,
        (v) => onUpdate({ cyclesUntilLong: v }),
        2,
        12,
      )}

      <div className="mt-1 flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-[var(--text-secondary)]">
          Focus sound
        </span>
        <div className="flex flex-wrap gap-1">
          {AMBIENT_SOUNDS.map((s) => {
            const active = (widget.sound ?? 'none') === s.value
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => onUpdate({ sound: s.value })}
                className={`rounded-[7px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                    : 'border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--fill-2)]'
                }`}
              >
                {s.label}
              </button>
            )
          })}
        </div>
        {(widget.sound ?? 'none') !== 'none' && (
          <div className="mt-0.5">
            <Slider
              value={Math.round((widget.soundVolume ?? 0.5) * 100)}
              min={0}
              max={100}
              onChange={(v) => onUpdate({ soundVolume: v / 100 })}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export const pomodoroDefinition: WidgetDefinition<PomodoroWidgetType> = {
  type: 'pomodoro',
  label: 'Pomodoro',
  icon: Timer,
  enabled: true,
  minSize: { width: 200, height: 220 },
  maxSize: { width: 320, height: 340 },
  create: (x, y) => ({
    type: 'pomodoro',
    x,
    y,
    width: 240,
    height: 260,
    locked: false,
    workMinutes: 25,
    shortBreak: 5,
    longBreak: 15,
    cyclesUntilLong: 4,
    completedToday: 0,
    statsDate: dayKey(),
    sound: 'none',
    soundVolume: 0.5,
  }),
  Renderer: PomodoroRenderer,
  Settings: PomodoroSettings,
}
