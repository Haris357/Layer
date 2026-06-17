import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Images } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { convertFileSrc } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { GalleryWidget as GalleryWidgetType } from '../../types/widget'
import { importAsset } from '../../lib/ipc'
import { Segmented, Slider, FieldRow } from '../ui'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const MEDIA_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov']

function isVideo(src: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(src)
}

async function pickMedia(): Promise<string[]> {
  const selected = await open({
    multiple: true,
    filters: [{ name: 'Media', extensions: MEDIA_EXT }],
  })
  if (!selected) return []
  const paths = Array.isArray(selected) ? selected : [selected]
  const out: string[] = []
  for (const p of paths) {
    try {
      out.push(await importAsset(p))
    } catch {
      /* skip failed import */
    }
  }
  return out
}

function Media({
  src,
  className,
  style,
}: {
  src: string
  className?: string
  style?: React.CSSProperties
}) {
  const url = convertFileSrc(src)
  return isVideo(src) ? (
    <video
      src={url}
      autoPlay
      loop
      muted
      playsInline
      className={className}
      style={style}
    />
  ) : (
    <img src={url} alt="" draggable={false} className={className} style={style} />
  )
}

function GalleryRenderer({ widget }: { widget: GalleryWidgetType }) {
  const { t } = useTranslation()
  const { sources, layout, interval, rounded } = widget
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (layout !== 'slideshow' || sources.length < 2) return
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % sources.length),
      Math.max(1, interval) * 1000,
    )
    return () => window.clearInterval(id)
  }, [layout, interval, sources.length])

  if (sources.length === 0) {
    return (
      <div className="glass flex h-full w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-[var(--border)] text-[var(--text-tertiary)]">
        <Images size={28} strokeWidth={1.5} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>
          {t('gallery.renderer.empty')}
        </span>
      </div>
    )
  }

  const safeIndex = index % sources.length

  if (layout === 'slideshow') {
    return (
      <div
        className="relative h-full w-full overflow-hidden"
        style={{ borderRadius: rounded }}
      >
        <AnimatePresence>
          <motion.div
            key={safeIndex}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            <Media
              src={sources[safeIndex] ?? ''}
              className="h-full w-full"
              style={{ objectFit: 'cover' }}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    )
  }

  if (layout === 'polaroid') {
    const shown = sources.slice(0, 6)
    return (
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
        {shown.map((s, i) => {
          const rot = (i - (shown.length - 1) / 2) * 8
          return (
            <div
              key={i}
              className="absolute"
              style={{
                transform: `rotate(${rot}deg) translateY(${Math.abs(rot) * 0.4}px)`,
                width: '58%',
                zIndex: i,
              }}
            >
              <div className="bg-white p-1.5 pb-5 shadow-xl">
                <div className="aspect-square w-full overflow-hidden">
                  <Media
                    src={s}
                    className="h-full w-full"
                    style={{ objectFit: 'cover' }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (layout === 'collage') {
    return (
      <div
        className="h-full w-full overflow-y-auto p-1"
        style={{ columnCount: sources.length > 4 ? 3 : 2, columnGap: 6 }}
      >
        {sources.map((s, i) => (
          <div key={i} className="mb-1.5">
            <Media
              src={s}
              className="w-full"
              style={{ borderRadius: rounded * 0.6, display: 'block' }}
            />
          </div>
        ))}
      </div>
    )
  }

  const cols = sources.length <= 1 ? 1 : sources.length <= 4 ? 2 : 3
  return (
    <div
      className="grid h-full w-full gap-1.5"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridAutoRows: '1fr',
      }}
    >
      {sources.map((s, i) => (
        <Media
          key={i}
          src={s}
          className="h-full w-full"
          style={{ objectFit: 'cover', borderRadius: rounded * 0.6 }}
        />
      ))}
    </div>
  )
}

function GallerySettings({
  widget,
  onUpdate,
}: {
  widget: GalleryWidgetType
  onUpdate: (patch: Partial<GalleryWidgetType>) => void
}) {
  const { t } = useTranslation()
  const addMedia = async () => {
    const added = await pickMedia()
    if (added.length > 0) {
      onUpdate({ sources: [...widget.sources, ...added] })
    }
  }

  return (
    <div className="flex w-[230px] flex-col gap-3">
      <Segmented
        value={widget.layout}
        options={[
          { value: 'slideshow', label: t('gallery.settings.layoutSlides') },
          { value: 'grid', label: t('gallery.settings.layoutGrid') },
          { value: 'polaroid', label: t('gallery.settings.layoutPhotos') },
          { value: 'collage', label: t('gallery.settings.layoutCollage') },
        ]}
        onChange={(v) =>
          onUpdate({ layout: v as GalleryWidgetType['layout'] })
        }
      />
      {widget.layout === 'slideshow' && (
        <FieldRow label={t('gallery.settings.slideEvery', { seconds: widget.interval })}>
          <div className="w-[110px]">
            <Slider
              value={widget.interval}
              min={2}
              max={20}
              onChange={(v) => onUpdate({ interval: v })}
            />
          </div>
        </FieldRow>
      )}
      <FieldRow label={t('gallery.settings.rounded', { px: widget.rounded })}>
        <div className="w-[110px]">
          <Slider
            value={widget.rounded}
            min={0}
            max={32}
            onChange={(v) => onUpdate({ rounded: v })}
          />
        </div>
      </FieldRow>
      <button
        type="button"
        onClick={addMedia}
        className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
      >
        {t('gallery.settings.addMedia', { count: widget.sources.length })}
      </button>
    </div>
  )
}

export const galleryDefinition: WidgetDefinition<GalleryWidgetType> = {
  type: 'gallery',
  label: 'Gallery',
  icon: Images,
  enabled: true,
  minSize: { width: 200, height: 160 },
  create: async (x, y) => {
    const sources = await pickMedia()
    if (sources.length === 0) return null
    return {
      type: 'gallery',
      x,
      y,
      width: 380,
      height: 320,
      locked: false,
      sources,
      layout: 'slideshow',
      interval: 4,
      rounded: 12,
    }
  },
  Renderer: GalleryRenderer,
  Settings: GallerySettings,
}
