import { useCallback, useEffect, useState } from 'react'
import {
  Wifi,
  WifiOff,
  Bluetooth,
  BluetoothOff,
  Plane,
  Leaf,
  Sun,
  Volume2,
  Volume1,
  VolumeX,
  Battery,
  BatteryCharging,
  Settings as SettingsIcon,
  SlidersHorizontal,
} from 'lucide-react'
import type { QuickSettingsWidget as QuickSettingsWidgetType } from '../../types/widget'
import {
  getWifi,
  setWifi,
  getBluetooth,
  setBluetooth,
  setAirplane as setAirplaneIPC,
  getBrightness,
  setBrightness,
  getPowerScheme,
  setPowerScheme,
  getVolume,
  setVolume,
  getSystemStats,
  isTauri,
  type PowerScheme,
} from '../../lib/ipc'
import { cn } from '../../lib/utils'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

interface Status {
  wifi: boolean | null
  bluetooth: boolean | null
  saver: boolean
  brightness: number | null
  volume: number
  battery: number
  charging: boolean
}

function Tile({
  active,
  label,
  icon,
  iconActive,
  disabled,
  onClick,
}: {
  active: boolean
  label: string
  icon: React.ReactNode
  iconActive?: React.ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-[60px] flex-col items-center justify-center gap-1 rounded-[10px] border transition-colors',
        disabled && 'opacity-40',
        active
          ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]'
          : 'border-[var(--border)] bg-[var(--fill-1)] text-[var(--text-primary)] hover:bg-[var(--fill-2)]',
      )}
    >
      <div>{active ? (iconActive ?? icon) : icon}</div>
      <span style={{ fontSize: 10.5, fontWeight: 500 }}>{label}</span>
    </button>
  )
}

function QuickSettingsRenderer() {
  const [s, setS] = useState<Status>({
    wifi: null,
    bluetooth: null,
    saver: false,
    brightness: null,
    volume: 0.5,
    battery: 0,
    charging: false,
  })
  const [pending, setPending] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!isTauri()) return
    const [wifi, bluetooth, brightness, scheme, volume, stats] =
      await Promise.all([
        getWifi().catch(() => null),
        getBluetooth().catch(() => null),
        getBrightness().catch(() => null),
        getPowerScheme().catch<PowerScheme>(() => 'balanced'),
        getVolume().catch(() => 0.5),
        getSystemStats().catch(() => null),
      ])
    setS((prev) => ({
      wifi,
      bluetooth,
      saver: scheme === 'saver',
      brightness,
      volume: volume ?? prev.volume,
      battery: stats ? Math.round(stats.battery) : prev.battery,
      charging: stats ? stats.charging : prev.charging,
    }))
  }, [])

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, 5000)
    return () => window.clearInterval(id)
  }, [refresh])

  const wrap = async (key: string, fn: () => Promise<void>) => {
    setPending(key)
    try {
      await fn()
    } catch {
      /* ignore */
    }
    await refresh()
    setPending(null)
  }

  const toggleWifi = () =>
    wrap('wifi', async () => {
      await setWifi(!(s.wifi ?? false))
    })
  const toggleBluetooth = () =>
    wrap('bt', async () => {
      await setBluetooth(!(s.bluetooth ?? false))
    })
  const airplaneOn = s.wifi === false && s.bluetooth === false
  const toggleAirplane = () =>
    wrap('air', async () => {
      await setAirplaneIPC(!airplaneOn)
    })
  const toggleSaver = () =>
    wrap('saver', async () => {
      await setPowerScheme(s.saver ? 'balanced' : 'saver')
    })

  const onBrightness = (v: number) => {
    setS((prev) => ({ ...prev, brightness: v }))
    setBrightness(v).catch(() => {})
  }
  const onVolume = (v: number) => {
    setS((prev) => ({ ...prev, volume: v }))
    setVolume(v).catch(() => {})
  }

  const volIcon =
    s.volume === 0 ? VolumeX : s.volume < 0.5 ? Volume1 : Volume2
  const VolIcon = volIcon

  return (
    <div className="glass flex h-full w-full flex-col gap-3 overflow-hidden rounded-[14px] border border-[var(--border)] p-3.5">
      <div className="grid grid-cols-2 gap-2">
        <Tile
          active={s.wifi === true}
          label="Wi-Fi"
          icon={<WifiOff size={20} strokeWidth={1.8} />}
          iconActive={<Wifi size={20} strokeWidth={1.8} />}
          disabled={pending === 'wifi'}
          onClick={toggleWifi}
        />
        <Tile
          active={s.bluetooth === true}
          label="Bluetooth"
          icon={<BluetoothOff size={20} strokeWidth={1.8} />}
          iconActive={<Bluetooth size={20} strokeWidth={1.8} />}
          disabled={pending === 'bt'}
          onClick={toggleBluetooth}
        />
        <Tile
          active={airplaneOn}
          label="Airplane"
          icon={<Plane size={20} strokeWidth={1.8} />}
          disabled={pending === 'air'}
          onClick={toggleAirplane}
        />
        <Tile
          active={s.saver}
          label="Energy saver"
          icon={<Leaf size={20} strokeWidth={1.8} />}
          disabled={pending === 'saver'}
          onClick={toggleSaver}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <Sun
            size={15}
            strokeWidth={1.9}
            className={cn(
              s.brightness === null
                ? 'text-[var(--text-tertiary)]'
                : 'text-[var(--text-secondary)]',
            )}
          />
          <input
            type="range"
            min={5}
            max={100}
            step={1}
            value={s.brightness ?? 50}
            disabled={s.brightness === null}
            onChange={(e) => onBrightness(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: 'var(--accent)' }}
            title={
              s.brightness === null
                ? 'Brightness control unavailable on this display'
                : `${s.brightness}%`
            }
          />
        </div>
        <div className="flex items-center gap-2.5">
          <VolIcon
            size={15}
            strokeWidth={1.9}
            className="text-[var(--text-secondary)]"
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={s.volume}
            onChange={(e) => onVolume(Number(e.target.value))}
            className="flex-1"
            style={{ accentColor: 'var(--accent)' }}
            title={`${Math.round(s.volume * 100)}%`}
          />
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-[var(--border)] pt-2.5">
        <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          {s.charging ? (
            <BatteryCharging size={15} strokeWidth={1.9} />
          ) : (
            <Battery size={15} strokeWidth={1.9} />
          )}
          <span style={{ fontSize: 11.5, fontWeight: 600 }}>
            {s.battery}%
          </span>
        </div>
        <button
          type="button"
          title="Tweak power options"
          onClick={() =>
            wrap('sch', async () => {
              const next: PowerScheme =
                s.saver
                  ? 'balanced'
                  : (await getPowerScheme()) === 'performance'
                    ? 'balanced'
                    : 'performance'
              await setPowerScheme(next)
            })
          }
          className="rounded-[6px] p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          <SlidersHorizontal size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

// Settings popover for the widget — minimal since the widget is mostly live state.
function QuickSettingsSettings() {
  return (
    <div className="flex w-[220px] flex-col gap-1.5 text-[var(--text-secondary)]">
      <div className="flex items-center gap-1.5">
        <SettingsIcon size={13} strokeWidth={1.8} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>
          About this widget
        </span>
      </div>
      <p style={{ fontSize: 11.5, lineHeight: 1.5 }}>
        Wi-Fi · Bluetooth · Airplane (Wi-Fi+BT off) · Energy saver (power
        scheme). Brightness works on laptop screens via WMI.
      </p>
    </div>
  )
}

export const quickSettingsDefinition: WidgetDefinition<QuickSettingsWidgetType> =
  {
    type: 'quicksettings',
    label: 'Quick settings',
    icon: SlidersHorizontal,
    enabled: true,
    minSize: { width: 240, height: 280 },
    maxSize: { width: 360, height: 420 },
    create: (x, y) => ({
      type: 'quicksettings',
      x,
      y,
      width: 280,
      height: 320,
      locked: false,
    }),
    Renderer: QuickSettingsRenderer,
    Settings: QuickSettingsSettings,
  }
