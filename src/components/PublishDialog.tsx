import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { Space } from '../types/widget'

export function PublishDialog({
  space,
  onCancel,
  onPublish,
}: {
  space: Space
  onCancel: () => void
  onPublish: (author: string, description: string) => void
}) {
  const { t } = useTranslation()
  const [author, setAuthor] = useState('')
  const [description, setDescription] = useState('')

  return (
    <div
      data-hit
      className="fixed inset-0 z-[10001] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
      onMouseDown={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="glass flex w-[420px] flex-col rounded-[16px] border border-[var(--border)] p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2
            className="text-[var(--text-primary)]"
            style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-1px' }}
          >
            {t('publishDialog.title')}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X size={18} />
          </button>
        </div>
        <p
          className="mb-4 text-[var(--text-secondary)]"
          style={{ fontSize: 12.5, lineHeight: 1.5 }}
        >
          “{space.name}” {t('publishDialog.description')}
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[var(--text-secondary)]">
              {t('publishDialog.authorLabel')}
            </span>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder={t('publishDialog.authorPlaceholder')}
              maxLength={40}
              className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[var(--text-secondary)]">
              {t('publishDialog.descriptionLabel')}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('publishDialog.descriptionPlaceholder')}
              maxLength={160}
              rows={2}
              className="resize-none rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--border-strong)]"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => onPublish(author, description)}
            className="flex-1 rounded-[8px] bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[var(--on-accent)] transition-transform hover:scale-[1.02]"
          >
            {t('publishDialog.publish')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
          >
            {t('publishDialog.cancel')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
