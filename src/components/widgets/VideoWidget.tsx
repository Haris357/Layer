import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Video as VideoIcon } from 'lucide-react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { VideoWidget as VideoWidgetType } from '../../types/widget'
import { useCanvasStore } from '../../store/canvasStore'
import { deleteAsset, importAsset } from '../../lib/ipc'
import { Toggle, FieldRow } from '../ui'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov']

async function pickVideo(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Videos', extensions: VIDEO_EXTENSIONS }],
  })
  if (!selected || typeof selected !== 'string') return null
  return importAsset(selected)
}

function VideoRenderer({ widget }: { widget: VideoWidgetType }) {
  const mode = useCanvasStore((s) => s.mode)
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.loop = widget.loop
    el.muted = widget.muted
    if (widget.autoplay) {
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [widget.autoplay, widget.loop, widget.muted])

  return (
    <video
      ref={ref}
      src={convertFileSrc(widget.src)}
      autoPlay={widget.autoplay}
      loop={widget.loop}
      muted={widget.muted}
      playsInline
      preload="metadata"
      className="h-full w-full"
      style={{
        objectFit: 'cover',
        borderRadius: 12,
        outline: mode === 'edit' ? '1px solid var(--border)' : 'none',
      }}
    />
  )
}

function VideoSettings({
  widget,
  onUpdate,
}: {
  widget: VideoWidgetType
  onUpdate: (patch: Partial<VideoWidgetType>) => void
}) {
  const { t } = useTranslation()
  const replace = async () => {
    const next = await pickVideo()
    if (!next) return
    const old = widget.src
    onUpdate({ src: next })
    deleteAsset(old).catch(() => {})
  }

  return (
    <div className="flex w-[220px] flex-col gap-3">
      <FieldRow label={t('video.settings.autoplay')}>
        <Toggle
          checked={widget.autoplay}
          onChange={(v) => onUpdate({ autoplay: v })}
        />
      </FieldRow>
      <FieldRow label={t('video.settings.loop')}>
        <Toggle checked={widget.loop} onChange={(v) => onUpdate({ loop: v })} />
      </FieldRow>
      <FieldRow label={t('video.settings.muted')}>
        <Toggle
          checked={widget.muted}
          onChange={(v) => onUpdate({ muted: v })}
        />
      </FieldRow>
      <button
        type="button"
        onClick={replace}
        className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
      >
        {t('video.settings.replace')}
      </button>
    </div>
  )
}

export const videoDefinition: WidgetDefinition<VideoWidgetType> = {
  type: 'video',
  label: 'Video',
  icon: VideoIcon,
  enabled: true,
  minSize: { width: 160, height: 110 },
  create: async (x, y) => {
    const src = await pickVideo()
    if (!src) return null
    return {
      type: 'video',
      x,
      y,
      width: 320,
      height: 180,
      locked: false,
      src,
      loop: true,
      muted: true,
      autoplay: true,
    }
  },
  Renderer: VideoRenderer,
  Settings: VideoSettings,
}
