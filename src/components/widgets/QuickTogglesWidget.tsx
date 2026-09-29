import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Moon, EyeOff, Sunset, Trash2, Lock, Zap, AlertTriangle } from 'lucide-react'
import type { QuickTile, QuickWidget as QuickWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'
import {
  emptyRecycleBin,
  getQuickState,
  isTauri,
  lockScreen,
  openUrl,
  setDarkMode,
  setDesktopIconsHidden,
  setNightLight,
  type QuickState,
} from '../../lib/ipc'
import { useToastStore } from '../../store/toastStore'
import { FieldRow, Toggle } from '../ui'
import { Tooltip } from '../Tooltip'
import { cn } from '../../lib/utils'

const TILES: QuickTile[] = ['dark', 'icons', 'nightlight', 'recycle', 'lock']
const POLL_MS = 3000

function fmtBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}

// Looks like the shared Toggle, but it's only a state indicator: the whole
// row is the button, and a button can't contain another button.
function SwitchLook({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative h-[20px] w-[34px] shrink-0 rounded-full transition-all duration-200',
        on ? 'bg-[var(--accent)]' : 'bg-[var(--fill-3)]',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] h-[16px] w-[16px] rounded-full transition-all duration-200',
          on ? 'left-[16px] bg-[var(--on-accent)]' : 'left-[2px] bg-[var(--text-tertiary)]',
        )}
      />
    </span>
  )
}

function Tile({
  icon,
  label,
  sub,
  tip,
  active,
  isToggle,
  danger,
  disabled,
  onClick,
}: {
  icon: ReactNode
  label: string
  sub?: string
  tip: string
  active?: boolean
  // Shows an on/off switch on the right; actions (bin, lock) don't.
  isToggle?: boolean
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip label={tip} side="top">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors active:scale-[0.99] disabled:cursor-default disabled:opacity-50',
          danger
            ? 'bg-[var(--danger)] text-white'
            : 'bg-[var(--fill-1)] text-[var(--text-primary)] hover:bg-[var(--fill-2)]',
        )}
      >
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] transition-colors',
            danger
              ? 'bg-white/20'
              : active
                ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                : 'bg-[var(--fill-2)] text-[var(--text-secondary)]',
          )}
        >
          {icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[12.5px] font-semibold leading-tight">{label}</span>
          {sub && <span className="truncate text-[10.5px] leading-tight opacity-70">{sub}</span>}
        </span>
        {isToggle && <SwitchLook on={!!active} />}
      </button>
    </Tooltip>
  )
}

function QuickRenderer({ widget }: { widget: QuickWidgetType }) {
  const { t } = useTranslation()
  const toast = useToastStore((s) => s.show)
  const [state, setState] = useState<QuickState | null>(null)
  const [busy, setBusy] = useState<QuickTile | null>(null)
  const [armed, setArmed] = useState(false)
  const shown = TILES.filter((k) => widget.tiles?.[k] !== false)

  const refresh = useCallback(() => {
    if (!isTauri()) return
    getQuickState().then(setState).catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
    const id = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  // Emptying the bin is permanent, so it takes a second click; the armed
  // state times out so a stray first click can't fire much later.
  useEffect(() => {
    if (!armed) return
    const id = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(id)
  }, [armed])

  async function run(tile: QuickTile, action: () => Promise<boolean>, optimistic?: Partial<QuickState>) {
    if (busy) return
    setBusy(tile)
    if (optimistic) setState((s) => (s ? { ...s, ...optimistic } : s))
    const ok = await action().catch(() => false)
    if (!ok) toast(t('quick.failed'))
    setBusy(null)
    // Desktop icons toggle asynchronously in Explorer; give it a moment.
    window.setTimeout(refresh, 600)
  }

  function nightLight() {
    if (!state || state.nightLight === null) {
      openUrl('ms-settings:nightlight').catch(() => {})
      return
    }
    const on = !state.nightLight
    void run('nightlight', async () => {
      const ok = await setNightLight(on)
      if (!ok) openUrl('ms-settings:nightlight').catch(() => {})
      return ok
    }, { nightLight: on })
  }

  function recycle() {
    if (!state || state.recycleItems === 0) return
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    void run('recycle', emptyRecycleBin, { recycleItems: 0, recycleBytes: 0 })
  }

  const binEmpty = !!state && state.recycleItems === 0

  const tiles: Record<QuickTile, ReactNode> = {
    dark: (
      <Tile
        key="dark"
        icon={<Moon size={15} strokeWidth={2} />}
        label={t('quick.dark')}
        tip={state?.dark ? t('quick.tips.darkOff') : t('quick.tips.darkOn')}
        active={state?.dark}
        isToggle
        disabled={!state || busy === 'dark'}
        onClick={() => state && run('dark', () => setDarkMode(!state.dark), { dark: !state.dark })}
      />
    ),
    icons: (
      <Tile
        key="icons"
        icon={<EyeOff size={15} strokeWidth={2} />}
        label={t('quick.icons')}
        tip={state?.iconsHidden ? t('quick.tips.iconsShow') : t('quick.tips.iconsHide')}
        active={state?.iconsHidden}
        isToggle
        disabled={!state || busy === 'icons'}
        onClick={() =>
          state &&
          run('icons', () => setDesktopIconsHidden(!state.iconsHidden), {
            iconsHidden: !state.iconsHidden,
          })
        }
      />
    ),
    nightlight: (
      <Tile
        key="nightlight"
        icon={<Sunset size={15} strokeWidth={2} />}
        label={t('quick.nightLight')}
        sub={state?.nightLight === null ? t('quick.openSettings') : undefined}
        tip={
          state?.nightLight === null
            ? t('quick.tips.nightSettings')
            : state?.nightLight
              ? t('quick.tips.nightOff')
              : t('quick.tips.nightOn')
        }
        active={state?.nightLight === true}
        isToggle={state?.nightLight !== null}
        disabled={!state || busy === 'nightlight'}
        onClick={nightLight}
      />
    ),
    recycle: (
      <Tile
        key="recycle"
        icon={armed ? <AlertTriangle size={15} strokeWidth={2} /> : <Trash2 size={15} strokeWidth={2} />}
        label={armed ? t('quick.confirmEmpty') : t('quick.recycle')}
        sub={
          !state
            ? '—'
            : binEmpty
              ? t('quick.binEmpty')
              : t('quick.binInfo', { count: state.recycleItems, size: fmtBytes(state.recycleBytes) })
        }
        tip={armed ? t('quick.tips.recycleConfirm') : t('quick.tips.recycle')}
        danger={armed}
        disabled={!state || binEmpty || busy === 'recycle'}
        onClick={recycle}
      />
    ),
    lock: (
      <Tile
        key="lock"
        icon={<Lock size={15} strokeWidth={2} />}
        label={t('quick.lock')}
        sub={t('quick.lockSub')}
        tip={t('quick.tips.lock')}
        disabled={busy === 'lock'}
        onClick={() => run('lock', lockScreen)}
      />
    ),
  }

  return (
    <div className="glass flex h-full w-full flex-col overflow-y-auto rounded-[14px] border border-[var(--border)] p-2.5">
      {shown.length > 0 ? (
        <div className="flex flex-col gap-1.5">{shown.map((k) => tiles[k])}</div>
      ) : (
        <div className="m-auto text-center text-[12px] text-[var(--text-tertiary)]">
          {t('quick.empty')}
        </div>
      )}
    </div>
  )
}

function QuickSettings({
  widget,
  onUpdate,
}: {
  widget: QuickWidgetType
  onUpdate: (patch: Partial<QuickWidgetType>) => void
}) {
  const { t } = useTranslation()
  const labels: Record<QuickTile, string> = {
    dark: t('quick.dark'),
    icons: t('quick.icons'),
    nightlight: t('quick.nightLight'),
    recycle: t('quick.recycle'),
    lock: t('quick.lock'),
  }
  return (
    <div className="flex w-[200px] flex-col gap-3">
      <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
        {t('quick.show')}
      </span>
      {TILES.map((k) => (
        <FieldRow key={k} label={labels[k]}>
          <Toggle
            checked={widget.tiles?.[k] !== false}
            onChange={(v) => onUpdate({ tiles: { ...widget.tiles, [k]: v } })}
          />
        </FieldRow>
      ))}
    </div>
  )
}

export const quickDefinition: WidgetDefinition<QuickWidgetType> = {
  type: 'quick',
  label: 'Quick Toggles',
  icon: Zap,
  enabled: true,
  minSize: { width: 180, height: 70 },
  create: (x, y) => ({
    type: 'quick',
    x,
    y,
    width: 260,
    height: 268,
    locked: false,
  }),
  Renderer: QuickRenderer,
  Settings: QuickSettings,
}
