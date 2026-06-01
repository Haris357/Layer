import { useEffect, useState } from 'react'
import {
  HardDrive,
  HardDriveDownload,
  ArrowDownToLine,
  ArrowUpFromLine,
  Activity,
} from 'lucide-react'
import { getDisks, getDiskIo, isTauri, type DiskInfo, type DiskIo } from '../../lib/ipc'
import type { DiskInfoWidget as DiskInfoWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

function fmtBytes(n: number): string {
  const tb = 1024 ** 4
  const gb = 1024 ** 3
  const mb = 1024 ** 2
  if (n >= tb) return `${(n / tb).toFixed(2)} TB`
  if (n >= gb) return `${(n / gb).toFixed(0)} GB`
  if (n >= mb) return `${(n / mb).toFixed(0)} MB`
  return `${Math.round(n / 1024)} KB`
}

function fmtSpeed(bps: number): string {
  const mb = 1024 ** 2
  if (bps >= mb) return `${(bps / mb).toFixed(1)} MB/s`
  if (bps >= 1024) return `${Math.round(bps / 1024)} KB/s`
  return `${Math.round(bps)} B/s`
}

function letterOf(mount: string): string {
  const m = mount.match(/^([A-Za-z]:)/)
  return m && m[1] ? m[1].toUpperCase() : mount.replace(/\\$/, '')
}

function barColor(pct: number): string {
  if (pct >= 0.9) return '#e5564b'
  if (pct >= 0.75) return '#e0a458'
  return 'var(--accent)'
}

function Stat({
  icon: Icon,
  label,
  value,
  pct,
}: {
  icon: typeof Activity
  label: string
  value: string
  pct?: number
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[9px] border border-[var(--border)] bg-[var(--fill-1)] px-2 py-1.5">
      <span className="flex items-center gap-1 text-[var(--text-tertiary)]">
        <Icon size={11} strokeWidth={2} />
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.3px' }}>
          {label}
        </span>
      </span>
      <span
        className="tabular-nums text-[var(--text-primary)]"
        style={{ fontSize: 12.5, fontWeight: 700 }}
      >
        {value}
      </span>
      {pct !== undefined && (
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--fill-3)]">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${Math.min(100, pct)}%`,
              background: 'var(--accent)',
            }}
          />
        </div>
      )}
    </div>
  )
}

function DiskInfoRenderer() {
  const [disks, setDisks] = useState<DiskInfo[] | null>(null)
  const [io, setIo] = useState<DiskIo[]>([])
  const [selected, setSelected] = useState<string>('')

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const pollDisks = () =>
      getDisks()
        .then((d) => !cancelled && setDisks(d))
        .catch(() => {})
    const pollIo = () =>
      getDiskIo()
        .then((d) => !cancelled && setIo(d))
        .catch(() => {})
    pollDisks()
    pollIo()
    const a = window.setInterval(pollDisks, 10_000)
    const b = window.setInterval(pollIo, 1500)
    return () => {
      cancelled = true
      window.clearInterval(a)
      window.clearInterval(b)
    }
  }, [])

  // Default selection + keep it valid as drives change.
  useEffect(() => {
    if (!disks || disks.length === 0) return
    if (!disks.some((d) => d.mount === selected)) {
      setSelected(disks[0]!.mount)
    }
  }, [disks, selected])

  const sel = disks?.find((d) => d.mount === selected) ?? disks?.[0]
  const letter = sel ? letterOf(sel.mount) : ''
  const act = io.find((i) => i.name.toUpperCase().includes(letter))

  const used = sel ? Math.max(0, sel.total - sel.available) : 0
  const pct = sel && sel.total > 0 ? used / sel.total : 0

  return (
    <div className="glass flex h-full w-full flex-col overflow-hidden rounded-[12px] border border-[var(--border)] p-2.5">
      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        <HardDrive size={12} strokeWidth={2} className="text-[var(--text-tertiary)]" />
        <span
          className="text-[var(--text-primary)]"
          style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.3px' }}
        >
          Disks
        </span>
      </div>

      {disks === null ? (
        <div className="flex flex-1 items-center justify-center text-[11.5px] text-[var(--text-tertiary)]">
          Reading disks…
        </div>
      ) : disks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[11.5px] text-[var(--text-tertiary)]">
          No disks found
        </div>
      ) : (
        <>
          {/* drive selector */}
          <div className="mb-2 flex flex-wrap gap-1">
            {disks.map((d) => {
              const active = d.mount === sel?.mount
              return (
                <button
                  key={d.mount}
                  type="button"
                  onClick={() => setSelected(d.mount)}
                  className={`flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-semibold transition-colors ${
                    active
                      ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                      : 'border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--fill-2)]'
                  }`}
                >
                  {d.removable ? (
                    <HardDriveDownload size={11} strokeWidth={2} />
                  ) : (
                    <HardDrive size={11} strokeWidth={2} />
                  )}
                  {letterOf(d.mount)}
                </button>
              )
            })}
          </div>

          {sel && (
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
              {/* identity */}
              <div className="flex items-center gap-2">
                <span
                  className="text-[var(--text-primary)]"
                  style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.5px' }}
                >
                  {letterOf(sel.mount)}
                </span>
                {sel.name && (
                  <span className="truncate text-[12px] text-[var(--text-secondary)]">
                    {sel.name}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  {sel.kind !== 'unknown' && (
                    <span
                      className="rounded-[4px] px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide"
                      style={{ background: 'var(--fill-3)', color: 'var(--text-secondary)' }}
                    >
                      {sel.kind}
                    </span>
                  )}
                  {sel.removable && (
                    <span className="text-[9.5px] font-semibold uppercase text-[var(--text-tertiary)]">
                      removable
                    </span>
                  )}
                  {sel.fs && (
                    <span className="text-[10px] font-medium text-[var(--text-tertiary)]">
                      {sel.fs}
                    </span>
                  )}
                </span>
              </div>

              {/* capacity */}
              <div className="flex flex-col gap-1">
                <div className="h-[9px] w-full overflow-hidden rounded-full bg-[var(--fill-3)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{ width: `${Math.min(100, pct * 100)}%`, background: barColor(pct) }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-tertiary)]">
                    <span className="font-semibold text-[var(--text-secondary)]">
                      {fmtBytes(sel.available)}
                    </span>{' '}
                    free of {fmtBytes(sel.total)}
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--text-secondary)]">
                    {Math.round(pct * 100)}% used
                  </span>
                </div>
              </div>

              {/* live activity */}
              <div className="grid grid-cols-3 gap-1.5">
                <Stat
                  icon={ArrowDownToLine}
                  label="READ"
                  value={act ? fmtSpeed(act.readBps) : '—'}
                />
                <Stat
                  icon={ArrowUpFromLine}
                  label="WRITE"
                  value={act ? fmtSpeed(act.writeBps) : '—'}
                />
                <Stat
                  icon={Activity}
                  label="ACTIVE"
                  value={act ? `${Math.round(Math.min(100, act.activePct))}%` : '—'}
                  pct={act ? act.activePct : 0}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export const diskInfoDefinition: WidgetDefinition<DiskInfoWidgetType> = {
  type: 'diskinfo',
  label: 'Disk Info',
  icon: HardDrive,
  enabled: true,
  minSize: { width: 230, height: 180 },
  maxSize: { width: 420, height: 360 },
  create: (x, y) => ({
    type: 'diskinfo',
    x,
    y,
    width: 300,
    height: 220,
    locked: false,
  }),
  Renderer: DiskInfoRenderer,
}
