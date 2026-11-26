import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { Check, ChevronLeft, ChevronRight, Download, Loader2, Moon, RotateCcw, Sun } from 'lucide-react'
import { showInFolder } from '../../lib/ipc'
import {
  ANIMATED,
  LAYER_CURSORS,
  POINTER_EVENT,
  POINTER_EXTRAS,
  POINTER_ROLES,
  POINTER_SIZES,
  POINTER_THEMES,
  PREVIEW,
  cursorValue,
  previewUrl,
  refreshPointer,
  type PointerStatus,
} from '../../lib/pointerTheme'
import { useToastStore } from '../../store/toastStore'
import { Tooltip } from '../Tooltip'
import { cn } from '../../lib/utils'

// Settings → Appearance → Pointer: Prism Pointer's cursor themes for Windows,
// previewed crisp (hover any tile to try it) and applied by Layer
// (src-tauri/src/cursors.rs). Applying also re-skins Layer's own cursors.

const ease = [0.32, 0.72, 0, 1] as const
type Set_ = 'windows' | 'extras' | 'layer'

/** An animated role: its frame strip, stepped at Prism Pointer's 30 fps. */
function Sprite({ src, size }: { src: string; size: number }) {
  return (
    <span
      className="ptr-sprite block"
      style={{
        width: size,
        height: size,
        backgroundImage: `url("${src}")`,
        backgroundSize: `${size * PREVIEW.frames}px ${size}px`,
        ['--ptr-w' as string]: `${size * PREVIEW.frames}px`,
        animationDuration: `${PREVIEW.frames / PREVIEW.fps}s`,
        animationTimingFunction: `steps(${PREVIEW.frames})`,
      }}
    />
  )
}

function Cursor({ theme, role, size }: { theme: string; role: string; size: number }) {
  const src = previewUrl(theme, role)
  if (!src) return <span style={{ width: size, height: size }} />
  return ANIMATED.has(role) ? <Sprite src={src} size={size} /> : <img src={src} alt="" draggable={false} style={{ width: size, height: size }} />
}

export function PointerSettings() {
  const { t } = useTranslation()
  const toast = useToastStore((s) => s.showToast)
  const [status, setStatus] = useState<PointerStatus | null>(null)
  const [themeId, setThemeId] = useState<string | null>(null)
  const [size, setSize] = useState(32)
  const [dark, setDark] = useState(true)
  const [set, setSet] = useState<Set_>('windows')
  const [busy, setBusy] = useState<'apply' | 'restore' | 'export' | null>(null)

  useEffect(() => {
    const on = (e: Event) => setStatus((e as CustomEvent<PointerStatus>).detail)
    window.addEventListener(POINTER_EVENT, on)
    refreshPointer().then((s) => {
      if (!s) return
      setStatus(s)
      if (s.theme) setThemeId(s.theme)
      if (s.size) setSize(s.size)
    })
    return () => window.removeEventListener(POINTER_EVENT, on)
  }, [])

  const theme = POINTER_THEMES.find((x) => x.id === themeId) ?? POINTER_THEMES.find((x) => x.id === 'mono') ?? POINTER_THEMES[0]!
  const facet = theme.id === 'facet' || theme.id === 'facet-outline'
  const order = POINTER_THEMES.filter((x) => x.id !== 'facet-outline')
  const idx = Math.max(0, order.findIndex((x) => x.id === theme.id || (x.id === 'facet' && facet)))
  const step = (d: number) => setThemeId(order[(idx + d + order.length) % order.length]!.id)
  const applied = status?.theme === theme.id && status?.size === size
  const stage = dark ? '#121215' : '#f4f4f1'
  const plain = ['#FFFFFF', '#EDF1F7'].includes(theme.color.toUpperCase())
  const glow = plain ? (dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)') : `${theme.color}38`
  const soft = dark ? 'text-white/55' : 'text-black/50'

  const run = async (kind: 'apply' | 'restore' | 'export') => {
    setBusy(kind)
    try {
      if (kind === 'apply') {
        await invoke('pointer_apply', { theme: theme.id, size, name: theme.name })
        toast({ message: t('pointer.applied', { name: theme.name, size }), icon: 'success' })
      } else if (kind === 'restore') {
        await invoke('pointer_restore')
        toast({ message: t('pointer.restored'), icon: 'success' })
      } else {
        const dest = await open({ directory: true, title: t('pointer.exportTitle') })
        if (typeof dest !== 'string') return
        const folder = await invoke<string>('pointer_export', { theme: theme.id, size, name: theme.name, dest })
        toast({ message: t('pointer.exported'), icon: 'success' })
        showInFolder(folder).catch(() => {})
      }
      await refreshPointer()
    } catch (e) {
      toast({ message: `${t('pointer.failed')} ${String(e)}`, icon: 'error' })
    } finally {
      setBusy(null)
    }
  }

  // The tiles for the chosen set. Layer's set shows each of Layer's own
  // cursors with the theme role it turns into.
  const tiles: { role: string; label: string }[] =
    set === 'layer'
      ? LAYER_CURSORS.map((c) => ({ role: c.role, label: t(`pointer.layerRoles.${c.label}`) }))
      : (set === 'extras' ? POINTER_EXTRAS : POINTER_ROLES).map((r) => ({ role: r, label: t(`pointer.roles.${r}`) }))

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{t('settings.appearance.pointer')}</span>
        <span className={cn('flex min-w-0 items-center gap-1.5 truncate rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold', status?.theme ? 'bg-[var(--fill-2)] text-[var(--text-primary)]' : 'bg-[var(--fill-1)] text-[var(--text-tertiary)]')}>
          {status?.theme && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />}
          <span className="truncate">{status?.theme ? t('pointer.active', { name: POINTER_THEMES.find((x) => x.id === status.theme)?.name ?? status.theme, size: status.size }) : t('pointer.windowsDefault')}</span>
        </span>
      </div>

      {/* stage: the theme up close */}
      <div className="relative h-[132px] overflow-hidden rounded-[14px] border border-[var(--border)]" style={{ background: stage }}>
        <div className="pointer-events-none absolute inset-0 transition-[background] duration-500" style={{ background: `radial-gradient(120% 90% at 50% 110%, ${glow}, transparent 70%)` }} />
        <motion.div key={theme.id} className="absolute inset-0 flex items-center justify-center gap-6 pb-5" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease }}>
          <Cursor theme={theme.id} role="Hand" size={40} />
          <span style={{ cursor: cursorValue(theme.id, 'Arrow', size) ? `${cursorValue(theme.id, 'Arrow', size)}, auto` : undefined }}>
            <Cursor theme={theme.id} role="Arrow" size={64} />
          </span>
          <Cursor theme={theme.id} role="Wait" size={40} />
        </motion.div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between px-3 pb-2.5">
          <div className="min-w-0">
            <div className={cn('truncate text-[13.5px] font-semibold tracking-[-0.2px]', dark ? 'text-white' : 'text-black/85')}>{theme.name}</div>
            <div className={cn('text-[10.5px] font-medium tabular-nums', soft)}>{size} px</div>
          </div>
          <div className="flex items-center gap-1">
            {facet && (
              <div className={cn('flex rounded-[8px] p-0.5', dark ? 'bg-white/10' : 'bg-black/5')}>
                {(['facet', 'facet-outline'] as const).map((id) => (
                  <button key={id} type="button" onClick={() => setThemeId(id)} className={cn('h-6 rounded-[6px] px-2 text-[10.5px] font-semibold transition-colors duration-150', theme.id === id ? (dark ? 'bg-white/20 text-white' : 'bg-white text-black/85 shadow-sm') : soft)}>
                    {t(id === 'facet' ? 'pointer.filled' : 'pointer.outline')}
                  </button>
                ))}
              </div>
            )}
            <Tooltip label={dark ? t('pointer.canvasLight') : t('pointer.canvasDark')} side="top">
              <button type="button" onClick={() => setDark(!dark)} className={cn('flex h-7 w-7 items-center justify-center rounded-[8px] transition-colors duration-150', dark ? 'text-white/60 hover:bg-white/10 hover:text-white' : 'text-black/50 hover:bg-black/5 hover:text-black/85')}>
                {dark ? <Moon size={13} /> : <Sun size={13} />}
              </button>
            </Tooltip>
          </div>
        </div>
        {(['prev', 'next'] as const).map((d) => (
          <Tooltip key={d} label={t(d === 'prev' ? 'pointer.prevTheme' : 'pointer.nextTheme')} side="top">
            <button type="button" onClick={() => step(d === 'prev' ? -1 : 1)} className={cn('absolute top-[42px] flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150', d === 'prev' ? 'left-2' : 'right-2', dark ? 'text-white/50 hover:bg-white/10 hover:text-white' : 'text-black/40 hover:bg-black/5 hover:text-black/85')}>
              {d === 'prev' ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* theme chips: equal size, evenly spaced */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${order.length}, minmax(0, 1fr))` }}>
        {order.map((x, i) => (
          <Tooltip key={x.id} label={x.name} side="bottom" className="w-full">
            <button
              type="button"
              onClick={() => setThemeId(x.id)}
              className="relative flex aspect-square w-full items-center justify-center rounded-[10px] transition-[box-shadow,transform] duration-200 hover:-translate-y-px"
              style={{ background: stage, boxShadow: i === idx ? '0 0 0 2px var(--accent)' : 'inset 0 0 0 1px var(--border)' }}
            >
              <img src={previewUrl(x.id, 'Arrow')} alt="" draggable={false} className="h-[60%] w-[60%] object-contain" />
              <span className="absolute bottom-[5px] right-[5px] h-[5px] w-[5px] rounded-full" style={{ background: x.color, boxShadow: '0 0 0 1px rgba(0,0,0,0.3)' }} />
            </button>
          </Tooltip>
        ))}
      </div>

      {/* size */}
      <div className="flex rounded-[10px] bg-[var(--fill-1)] p-0.5">
        {POINTER_SIZES.map((s) => (
          <Tooltip key={s} label={t('pointer.sizeTooltip', { size: s })} side="top" className="flex-1">
            <button type="button" onClick={() => setSize(s)} className={cn('h-7 w-full rounded-[8px] text-[11.5px] font-semibold tabular-nums transition-colors duration-150', s === size ? 'bg-[var(--fill-3)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]')}>
              {s}
            </button>
          </Tooltip>
        ))}
      </div>

      {/* which cursors to look at */}
      <div className="flex rounded-[10px] bg-[var(--fill-1)] p-0.5">
        {(['windows', 'extras', 'layer'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setSet(k)} className={cn('h-7 flex-1 rounded-[8px] text-[11.5px] font-semibold transition-colors duration-150', set === k ? 'bg-[var(--fill-3)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]')}>
            {t(`pointer.sets.${k}`)}
          </button>
        ))}
      </div>
      <span className="text-[11px] leading-relaxed text-[var(--text-tertiary)]">{t(`pointer.setHint.${set}`)}</span>

      {/* every cursor: hover a tile to try it */}
      <motion.div
        key={`${theme.id}-${set}`}
        className="grid gap-1.5"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))' }}
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.01 } } }}
      >
        {tiles.map(({ role, label }) => {
          const cur = cursorValue(theme.id, role, size)
          return (
            <motion.div
              key={role}
              variants={{ hidden: { opacity: 0, y: 5 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.25, ease }}
              className="flex h-[74px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-[10px] p-1 transition-[box-shadow] duration-150 hover:shadow-[inset_0_0_0_1px_var(--border-strong)]"
              style={{ background: stage, cursor: cur ? `${cur}, auto` : undefined }}
            >
              <Cursor theme={theme.id} role={role} size={34} />
              <span className={cn('w-full truncate px-0.5 text-center text-[9.5px] font-medium', soft)}>{label}</span>
            </motion.div>
          )
        })}
      </motion.div>

      {/* actions */}
      <div className="mt-1 flex items-center gap-1">
        <Tooltip label={t('pointer.restoreTooltip')} side="top">
          <button type="button" disabled={!status?.hasBackup || !!busy} onClick={() => run('restore')} className="flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:bg-transparent">
            {busy === 'restore' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            {t('pointer.restore')}
          </button>
        </Tooltip>
        <Tooltip label={t('pointer.exportTooltip')} side="top">
          <button type="button" disabled={!!busy} onClick={() => run('export')} className="flex h-9 items-center gap-1.5 rounded-[10px] px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors duration-150 hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)] disabled:opacity-40">
            {busy === 'export' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {t('pointer.export')}
          </button>
        </Tooltip>
        <motion.button
          type="button"
          disabled={!!busy || applied}
          onClick={() => run('apply')}
          whileTap={{ scale: 0.97 }}
          className={cn('ml-auto flex h-9 items-center gap-1.5 rounded-[10px] px-4 text-[12.5px] font-semibold transition-colors duration-200', applied ? 'bg-[var(--fill-2)] text-[var(--text-primary)]' : 'bg-[var(--accent)] text-[var(--on-accent)] hover:opacity-90')}
        >
          {busy === 'apply' ? <Loader2 size={14} className="animate-spin" /> : applied ? <Check size={14} /> : null}
          {applied ? t('pointer.inUse') : t('pointer.apply')}
        </motion.button>
      </div>
    </div>
  )
}
