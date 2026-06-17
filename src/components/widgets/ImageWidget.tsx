import { Image as ImageIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { convertFileSrc } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { ImageWidget as ImageWidgetType } from '../../types/widget'
import { useCanvasStore } from '../../store/canvasStore'
import { deleteAsset, importAsset } from '../../lib/ipc'
import { Segmented, Slider, FieldRow } from '../ui'
import type { WidgetDefinition } from '../../lib/widgetRegistry'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif']

async function pickImage(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
  })
  if (!selected || typeof selected !== 'string') return null
  return importAsset(selected)
}

function ImageRenderer({ widget }: { widget: ImageWidgetType }) {
  const mode = useCanvasStore((s) => s.mode)
  return (
    <div
      className="h-full w-full overflow-hidden"
      style={{
        borderRadius: widget.rounded,
        outline:
          mode === 'edit' ? '1px solid var(--border)' : 'none',
      }}
    >
      <img
        src={convertFileSrc(widget.src)}
        alt=""
        draggable={false}
        className="h-full w-full"
        style={{ objectFit: widget.fit }}
      />
    </div>
  )
}

function ImageSettings({
  widget,
  onUpdate,
}: {
  widget: ImageWidgetType
  onUpdate: (patch: Partial<ImageWidgetType>) => void
}) {
  const { t } = useTranslation()
  const replace = async () => {
    const next = await pickImage()
    if (!next) return
    const old = widget.src
    onUpdate({ src: next })
    deleteAsset(old).catch(() => {})
  }

  return (
    <div className="flex w-[220px] flex-col gap-3">
      <Segmented
        value={widget.fit}
        options={[
          { value: 'cover', label: t('image.settings.fitCover') },
          { value: 'contain', label: t('image.settings.fitContain') },
        ]}
        onChange={(v) => onUpdate({ fit: v as ImageWidgetType['fit'] })}
      />
      <FieldRow label={t('image.settings.rounded', { px: widget.rounded })}>
        <div className="w-[110px]">
          <Slider
            value={widget.rounded}
            min={0}
            max={50}
            onChange={(v) => onUpdate({ rounded: v })}
          />
        </div>
      </FieldRow>
      <button
        type="button"
        onClick={replace}
        className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
      >
        {t('image.settings.replace')}
      </button>
    </div>
  )
}

export const imageDefinition: WidgetDefinition<ImageWidgetType> = {
  type: 'image',
  label: 'Image',
  icon: ImageIcon,
  enabled: true,
  minSize: { width: 120, height: 90 },
  create: async (x, y) => {
    const src = await pickImage()
    if (!src) return null
    return {
      type: 'image',
      x,
      y,
      width: 240,
      height: 240,
      locked: false,
      src,
      fit: 'cover',
      rounded: 12,
    }
  },
  Renderer: ImageRenderer,
  Settings: ImageSettings,
}
