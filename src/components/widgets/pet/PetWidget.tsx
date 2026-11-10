import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { Heart, Trash2 } from 'lucide-react'
import { PebbleIcon } from './PebbleIcon'
import type { PetWidget as PetWidgetType } from '../../../types/widget'
import type { WidgetDefinition } from '../../../lib/widgetRegistry'
import { useCanvasStore } from '../../../store/canvasStore'
import { FieldRow, TextField, Toggle } from '../../ui'
import { Tooltip } from '../../Tooltip'
import { cn } from '../../../lib/utils'
import { DEFAULT_PET_COLOR, PET_COLORS, PetArt } from './PetArt'
import { PET_SIZE } from './FreePet'
import { newBrain, usualBedtime } from './petBrain'

// The pet's color is its widget accent, the same one the right-click menu
// sets on any widget, so picking one here and there stay in sync.
function Swatches({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex justify-center gap-1.5">
      {PET_COLORS.map((hex, i) => (
        <Tooltip key={hex} label={t('pet.color', { n: i + 1 })} side="top">
          <button
            type="button"
            onClick={() => onPick(hex)}
            className={cn('h-6 w-6 rounded-full border-2 transition-transform hover:scale-110', hex.toLowerCase() === value.toLowerCase() ? 'border-[var(--text-primary)]' : 'border-transparent')}
            style={{ background: hex }}
          />
        </Tooltip>
      ))}
    </div>
  )
}

// ── Setup ────────────────────────────────────────────────────────────────
function Setup({ widget }: { widget: PetWidgetType }) {
  const { t } = useTranslation()
  const updateWidget = useCanvasStore((s) => s.updateWidget)
  const [color, setColor] = useState(widget.accent || DEFAULT_PET_COLOR)
  const [name, setName] = useState('')
  const [owner, setOwner] = useState(widget.ownerName ?? '')
  const ready = name.trim().length > 0

  return (
    <div className="glass flex h-full w-full flex-col gap-2.5 overflow-y-auto rounded-[16px] border border-[var(--border)] p-3">
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--text-primary)]">
        <PebbleIcon size={14} strokeWidth={2} className="text-[var(--accent)]" />
        {t('pet.setup.title')}
      </div>
      <motion.div
        initial={{ scale: 0.6, y: 10, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        className="mx-auto h-[80px] w-[80px] shrink-0"
      >
        <motion.div className="h-full w-full" animate={{ y: [0, -4, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
          <PetArt color={color} eyes="happy" />
        </motion.div>
      </motion.div>
      <Swatches value={color} onPick={setColor} />
      <TextField value={name} maxLength={20} placeholder={t('pet.setup.petName')} onChange={setName} />
      <TextField value={owner} maxLength={24} placeholder={t('pet.setup.yourName')} onChange={setOwner} />
      <button
        type="button"
        disabled={!ready}
        onClick={() =>
          updateWidget(widget.id, {
            petName: name.trim(),
            ownerName: owner.trim() || undefined,
            accent: color,
            brain: widget.brain ?? newBrain(),
            // The card goes away and the pet pops out of where the preview
            // was, then drops onto whatever is below.
            x: widget.x + widget.width / 2 - PET_SIZE / 2,
            y: widget.y + 30,
            width: PET_SIZE,
            height: PET_SIZE,
            background: false,
          })
        }
        className="mt-auto rounded-[10px] bg-[var(--accent)] py-2 text-[12.5px] font-semibold text-[var(--on-accent)] transition-all active:scale-[0.97] disabled:opacity-40"
      >
        {t('pet.setup.adopt')}
      </button>
    </div>
  )
}

function PetRenderer({ widget }: { widget: PetWidgetType }) {
  // Once adopted the pet roams the whole canvas (FreePet); the card is only
  // the adoption form.
  return widget.petName ? null : <Setup widget={widget} />
}

// ── Settings ─────────────────────────────────────────────────────────────
function PetSettings({
  widget,
  onUpdate,
}: {
  widget: PetWidgetType
  onUpdate: (patch: Partial<PetWidgetType>) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(widget.petName)
  const [owner, setOwner] = useState(widget.ownerName ?? '')
  if (!widget.petName) return null
  const brain = widget.brain ?? newBrain()
  const days = Math.max(1, Math.round((Date.now() - brain.born) / 86_400_000))
  const bed = usualBedtime(brain.hours)

  return (
    <div className="flex w-[240px] flex-col gap-3">
      <FieldRow label={t('pet.settings.name')}>
        <div className="w-[120px]">
          <TextField value={name} maxLength={20} onChange={setName} onBlur={() => name.trim() && onUpdate({ petName: name.trim() })} />
        </div>
      </FieldRow>
      <FieldRow label={t('pet.settings.you')}>
        <div className="w-[120px]">
          <TextField value={owner} maxLength={24} onChange={setOwner} onBlur={() => onUpdate({ ownerName: owner.trim() || undefined })} />
        </div>
      </FieldRow>
      <Swatches value={widget.accent || DEFAULT_PET_COLOR} onPick={(hex) => onUpdate({ accent: hex })} />
      <FieldRow label={t('pet.settings.glow')}>
        <Toggle checked={widget.glow === true} onChange={(v) => onUpdate({ glow: v })} />
      </FieldRow>
      <FieldRow label={t('pet.settings.bubbles')}>
        <Toggle checked={widget.bubbles !== false} onChange={(v) => onUpdate({ bubbles: v })} />
      </FieldRow>
      <div className="flex flex-col gap-1 rounded-[10px] bg-[var(--fill-1)] p-2.5 text-[11.5px] text-[var(--text-secondary)]">
        <span className="flex items-center gap-1">
          <Heart size={12} fill="#FF6B9A" strokeWidth={0} />
          {t('pet.settings.bond', { n: Math.round(brain.affection) })}
        </span>
        <span>{t('pet.settings.age', { count: days })}</span>
        <span>{bed !== null ? t('pet.settings.bedtime', { h: `${bed + 1}:00` }) : t('pet.settings.learning')}</span>
      </div>
      {/* The pet has no right-click menu, so removing it lives here. */}
      <button
        type="button"
        onClick={() => useCanvasStore.getState().deleteWidget(widget.id)}
        className="flex h-8 items-center justify-center gap-1.5 rounded-[10px] bg-[var(--fill-1)] text-[12px] font-medium text-[#E5484D] transition-colors hover:bg-[var(--fill-2)]"
      >
        <Trash2 size={13} />
        {t('contextMenu.delete')}
      </button>
    </div>
  )
}

export const petDefinition: WidgetDefinition<PetWidgetType> = {
  type: 'pet',
  label: 'Desktop Pebbles',
  icon: PebbleIcon,
  enabled: true,
  minSize: { width: 100, height: 90 },
  create: (x, y) => ({
    type: 'pet',
    x,
    y,
    width: 250,
    height: 330,
    locked: false,
    petName: '',
    // On for the setup card; adopting turns it off so the pet stands
    // straight on the desktop.
    background: true,
  }),
  Renderer: PetRenderer,
  Settings: PetSettings,
}
