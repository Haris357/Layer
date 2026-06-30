import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <div
      data-hit
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
      onMouseDown={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="glass w-[340px] rounded-[16px] border border-[var(--border)] p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          className="text-[var(--text-primary)]"
          style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.4px' }}
        >
          {title}
        </h2>
        <p
          className="mt-1.5 text-[var(--text-secondary)]"
          style={{ fontSize: 13, fontWeight: 400 }}
        >
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-[8px] px-3 py-1.5 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
          >
            {t('dialog.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-[8px] px-3 py-1.5 text-[13px] font-medium transition-colors"
            style={{
              background: 'var(--danger)',
              color: '#1a1a1f',
            }}
          >
            {confirmLabel ?? t('dialog.confirm')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
