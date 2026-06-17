import { useTranslation } from 'react-i18next'
import { StickyNote } from 'lucide-react'
import type {
  StickyWidget as StickyWidgetType,
  StickyColor,
} from '../../types/widget'
import { useCanvasStore } from '../../store/canvasStore'
import { useUncontrolledText } from '../../hooks/useUncontrolledText'
import { cn } from '../../lib/utils'
import { Tooltip } from '../Tooltip'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const COLOR_STYLES: Record<
  StickyColor,
  { bg: string; tint: string; ink: string }
> = {
  yellow: { bg: '#fef3a1', tint: '#fbe170', ink: '#5b4a08' },
  pink: { bg: '#ffd1dc', tint: '#ffb3c1', ink: '#6b1d34' },
  blue: { bg: '#c7e5ff', tint: '#a4d3ff', ink: '#0e3a64' },
  green: { bg: '#cdf0c7', tint: '#abe2a3', ink: '#1f4a16' },
  orange: { bg: '#ffd8b0', tint: '#ffc285', ink: '#5b3206' },
  lilac: { bg: '#e1cdf5', tint: '#cdb3ec', ink: '#3a1a5e' },
}

const COLORS: StickyColor[] = [
  'yellow',
  'pink',
  'blue',
  'green',
  'orange',
  'lilac',
]

function StickyRenderer({ widget }: { widget: StickyWidgetType }) {
  const { t } = useTranslation()
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const palette = COLOR_STYLES[widget.color] ?? COLOR_STYLES.yellow
  const { ref, syncKey, onChange } = useUncontrolledText(widget.text, (v) =>
    updateWidget(widget.id, { text: v }),
  )
  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[10px]"
      style={{
        background: palette.bg,
        boxShadow:
          '0 1px 0 rgba(0,0,0,0.05), 0 6px 18px -8px rgba(0,0,0,0.25)',
      }}
    >
      <Tooltip
        label={t('sticky.dragToMove')}
        side="top"
        className="layer-drag-handle layer-grab absolute left-0 right-0 top-0 h-5"
      >
        <span className="h-full w-full" style={{ background: palette.tint }} />
      </Tooltip>
      <textarea
        key={syncKey}
        ref={ref}
        defaultValue={widget.text}
        onChange={onChange}
        placeholder={t('sticky.placeholder')}
        spellCheck={false}
        className="absolute inset-0 mt-5 resize-none border-0 bg-transparent px-3.5 py-2.5 outline-none"
        style={{
          color: palette.ink,
          caretColor: palette.ink,
          fontFamily: "'Caveat', 'Patrick Hand', cursive",
          fontSize: 19,
          lineHeight: 1.35,
          fontWeight: 500,
          WebkitFontSmoothing: 'antialiased',
        }}
      />
    </div>
  )
}

function StickySettings({
  widget,
  onUpdate,
}: {
  widget: StickyWidgetType
  onUpdate: (patch: Partial<StickyWidgetType>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex w-[200px] flex-col gap-2">
      <span className="text-[11px] font-medium text-[var(--text-tertiary)]">
        {t('sticky.colorLabel')}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {COLORS.map((c) => (
          <Tooltip key={c} label={t(`sticky.colors.${c}`)}>
            <button
              type="button"
              onClick={() => onUpdate({ color: c })}
              className={cn(
                'h-7 w-7 rounded-full border-2 transition-transform',
                widget.color === c
                  ? 'scale-110 border-[var(--text-primary)]'
                  : 'border-transparent hover:scale-110',
              )}
              style={{ background: COLOR_STYLES[c].bg }}
            />
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

export const stickyDefinition: WidgetDefinition<StickyWidgetType> = {
  type: 'sticky',
  label: 'Sticky note',
  icon: StickyNote,
  enabled: true,
  minSize: { width: 130, height: 130 },
  maxSize: { width: 420, height: 420 },
  create: (x, y) => ({
    type: 'sticky',
    x,
    y,
    width: 200,
    height: 200,
    locked: false,
    text: '',
    color: 'yellow',
  }),
  Renderer: StickyRenderer,
  Settings: StickySettings,
}
