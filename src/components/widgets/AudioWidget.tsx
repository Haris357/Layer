import { useCallback, useEffect, useState } from 'react'
import { Volume2, Mic, Check, Loader2, type LucideIcon } from 'lucide-react'
import type { AudioWidget as AudioWidgetType } from '../../types/widget'
import {
  listAudioDevices,
  setAudioDevice,
  type AudioDevice,
} from '../../lib/ipc'
import { Segmented, FieldRow, Toggle } from '../ui'
import { cn } from '../../lib/utils'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

function DeviceGroup({
  title,
  icon: Icon,
  devices,
  busy,
  onPick,
}: {
  title: string
  icon: LucideIcon
  devices: AudioDevice[]
  busy: string | null
  onPick: (d: AudioDevice) => void
}) {
  if (devices.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        <Icon size={12} strokeWidth={2} />
        {title}
      </div>
      <div className="flex flex-col gap-1">
        {devices.map((d) => {
          const active = d.isDefault
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onPick(d)}
              title={d.name}
              className={cn(
                'flex items-center gap-2 rounded-[9px] px-2.5 py-2 text-left transition-colors',
                active
                  ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                  : 'bg-[var(--fill-1)] text-[var(--text-primary)] hover:bg-[var(--fill-2)]',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                {d.name}
              </span>
              {busy === d.id ? (
                <Loader2 size={14} className="shrink-0 animate-spin opacity-80" />
              ) : (
                active && <Check size={14} className="shrink-0" strokeWidth={2.4} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AudioRenderer({ widget }: { widget: AudioWidgetType }) {
  const card = widget.background !== false
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(() => {
    listAudioDevices()
      .then(setDevices)
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    // Re-poll so external changes (plugging in headphones) show up.
    const id = window.setInterval(refresh, 4000)
    return () => window.clearInterval(id)
  }, [refresh])

  const pick = async (d: AudioDevice) => {
    if (d.isDefault) return
    setBusy(d.id)
    const ok = await setAudioDevice(d.id).catch(() => false)
    if (ok) {
      // Optimistically move the default within this direction.
      setDevices((prev) =>
        prev.map((x) =>
          x.direction === d.direction
            ? { ...x, isDefault: x.id === d.id }
            : x,
        ),
      )
    }
    setBusy(null)
    refresh()
  }

  const outputs = devices.filter((d) => d.direction === 'output')
  const inputs = devices.filter((d) => d.direction === 'input')
  const showOut = widget.show !== 'input'
  const showIn = widget.show !== 'output'

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col gap-3 overflow-y-auto rounded-[14px] p-3',
        card && 'glass border border-[var(--border)]',
      )}
    >
      {showOut && (
        <DeviceGroup
          title="Output"
          icon={Volume2}
          devices={outputs}
          busy={busy}
          onPick={pick}
        />
      )}
      {showIn && (
        <DeviceGroup
          title="Input"
          icon={Mic}
          devices={inputs}
          busy={busy}
          onPick={pick}
        />
      )}
      {devices.length === 0 && (
        <div className="m-auto text-[12px] text-[var(--text-tertiary)]">
          No audio devices found.
        </div>
      )}
    </div>
  )
}

function AudioSettings({
  widget,
  onUpdate,
}: {
  widget: AudioWidgetType
  onUpdate: (patch: Partial<AudioWidgetType>) => void
}) {
  return (
    <div className="flex w-[248px] flex-col gap-3">
      <Segmented
        value={widget.show}
        options={[
          { value: 'both', label: 'Both' },
          { value: 'output', label: 'Output' },
          { value: 'input', label: 'Input' },
        ]}
        onChange={(v) => onUpdate({ show: v as AudioWidgetType['show'] })}
      />
      <FieldRow label="Background">
        <Toggle
          checked={widget.background !== false}
          onChange={(v) => onUpdate({ background: v })}
        />
      </FieldRow>
    </div>
  )
}

export const audioDefinition: WidgetDefinition<AudioWidgetType> = {
  type: 'audio',
  label: 'Audio Devices',
  icon: Volume2,
  enabled: true,
  minSize: { width: 200, height: 150 },
  create: (x, y) => ({
    type: 'audio',
    x,
    y,
    width: 260,
    height: 240,
    locked: false,
    show: 'both',
    background: true,
  }),
  Renderer: AudioRenderer,
  Settings: AudioSettings,
}
