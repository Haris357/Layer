import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  Plus,
  Upload,
  Download,
  Share2,
  Pencil,
  Trash2,
  RotateCcw,
  Check,
  X,
} from 'lucide-react'
import { useCanvasStore } from '../store/canvasStore'
import { useToastStore } from '../store/toastStore'
import { useAnchorMonitor } from '../store/monitorStore'
import { isTauri } from '../lib/ipc'
import {
  captureCanvas,
  exportSpaceZip,
  importSpaceFile,
  publishToGallery,
} from '../lib/spaceShare'
import { notify } from '../lib/notify'
import { PublishDialog } from './PublishDialog'
import { Tooltip } from './Tooltip'
import type { Space } from '../types/widget'
import { cn } from '../lib/utils'

export function SpacesModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const spaces = useCanvasStore((s) => s.spaces)
  const activeId = useCanvasStore((s) => s.activeId)
  const switchSpace = useCanvasStore((s) => s.switchSpace)
  const createSpace = useCanvasStore((s) => s.createSpace)
  const renameSpace = useCanvasStore((s) => s.renameSpace)
  const deleteSpace = useCanvasStore((s) => s.deleteSpace)
  const resetSpace = useCanvasStore((s) => s.resetSpace)
  const importSpace = useCanvasStore((s) => s.importSpace)
  const toast = useToastStore((s) => s.show)

  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [publishing, setPublishing] = useState<Space | null>(null)
  const primary = useAnchorMonitor()

  const startRename = (sp: Space) => {
    setRenaming(sp.id)
    setDraft(sp.name)
  }
  const commitRename = () => {
    if (renaming && draft.trim()) renameSpace(renaming, draft.trim())
    setRenaming(null)
  }

  const newSpace = () => {
    const count = spaces.filter((sp) => !sp.builtin).length
    createSpace(`Space ${count + 1}`)
  }

  // Export a template as a ZIP (template.json + canvas screenshot).
  const exportZip = (sp: Space) => {
    if (!isTauri()) return
    switchSpace(sp.id)
    onClose()
    setTimeout(async () => {
      try {
        const png = await captureCanvas()
        await exportSpaceZip(sp, png)
        toast(t('spaces.feedback.exported'))
      } catch {
        toast(t('spaces.feedback.exportFailed'))
      }
    }, 600)
  }

  const importTpl = async () => {
    if (!isTauri()) return
    const result = await importSpaceFile()
    if (result) {
      importSpace(result.name, result.widgets)
      toast(t('spaces.feedback.imported', { name: result.name }))
      notify({
        kind: 'import',
        title: t('spaces.notify.importedTitle', { name: result.name }),
        body: t('spaces.notify.importedBody', { count: result.widgets.length }),
      })
    }
  }

  // Publish: capture the canvas with all UI hidden, then upload.
  const doPublish = (author: string, description: string) => {
    const sp = publishing
    if (!sp) return
    setPublishing(null)
    switchSpace(sp.id)
    onClose()
    setTimeout(async () => {
      try {
        const png = await captureCanvas()
        await publishToGallery({
          space: sp,
          author,
          description,
          screenshotPng: png,
        })
        toast(t('spaces.feedback.published'))
      } catch {
        toast(t('spaces.feedback.publishFailed'))
      }
    }, 600)
  }

  return (
    <>
      <div
        data-hit
        className="fixed inset-0 z-[10000]"
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
        onMouseDown={onClose}
      >
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: primary ? primary.x : 0,
            top: primary ? primary.y : 0,
            width: primary ? primary.w : '100%',
            height: primary ? primary.h : '100%',
          }}
        >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="glass flex max-h-[88vh] w-[480px] flex-col rounded-[16px] border border-[var(--border)] p-6"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex items-center justify-between">
            <h2
              className="text-[var(--text-primary)]"
              style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-1.2px' }}
            >
              {t('spaces.heading')}
            </h2>
            <Tooltip label={t('common.close')} side="bottom">
              <button
                type="button"
                onClick={onClose}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X size={18} />
              </button>
            </Tooltip>
          </div>
          <p
            className="mb-4 text-[var(--text-secondary)]"
            style={{ fontSize: 12.5 }}
          >
            {t('spaces.description')}
          </p>

          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
            {spaces.map((sp) => {
              const active = sp.id === activeId
              return (
                <div
                  key={sp.id}
                  className={cn(
                    'flex items-center gap-2 rounded-[10px] border px-3 py-2.5 transition-colors',
                    active
                      ? 'border-[var(--border-strong)] bg-[var(--fill-2)]'
                      : 'border-[var(--border)] bg-[var(--fill-1)]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => switchSpace(sp.id)}
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
                    style={{
                      borderColor: active
                        ? 'var(--accent)'
                        : 'var(--border-strong)',
                    }}
                  >
                    {active && (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: 'var(--accent)' }}
                      />
                    )}
                  </button>

                  {renaming === sp.id ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      className="min-w-0 flex-1 rounded-[6px] border border-[var(--border)] bg-[var(--fill-1)] px-2 py-1 text-[13px] text-[var(--text-primary)] outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => switchSpace(sp.id)}
                      className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-[var(--text-primary)]"
                    >
                      {sp.name}
                    </button>
                  )}

                  {sp.builtin && (
                    <span className="shrink-0 rounded-[5px] bg-[var(--fill-2)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                      {t('spaces.badge.default')}
                    </span>
                  )}

                  <div className="flex shrink-0 items-center gap-0.5">
                    {renaming === sp.id ? (
                      <Tooltip label={t('spaces.actions.save')}>
                        <button
                          type="button"
                          onClick={commitRename}
                          className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                        >
                          <Check size={14} />
                        </button>
                      </Tooltip>
                    ) : (
                      !sp.builtin && (
                        <Tooltip label={t('spaces.actions.rename')}>
                          <button
                            type="button"
                            onClick={() => startRename(sp)}
                            className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                          >
                            <Pencil size={13} />
                          </button>
                        </Tooltip>
                      )
                    )}
                    <Tooltip label={t('spaces.actions.publish')}>
                      <button
                        type="button"
                        onClick={() => setPublishing(sp)}
                        className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                      >
                        <Share2 size={13} />
                      </button>
                    </Tooltip>
                    <Tooltip label={t('spaces.actions.export')}>
                      <button
                        type="button"
                        onClick={() => exportZip(sp)}
                        className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                      >
                        <Download size={13} />
                      </button>
                    </Tooltip>
                    {!sp.builtin && (
                      <Tooltip
                        label={
                          confirmReset === sp.id
                            ? t('spaces.actions.resetConfirm')
                            : t('spaces.actions.reset')
                        }
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (confirmReset === sp.id) {
                              resetSpace(sp.id)
                              setConfirmReset(null)
                              toast(t('spaces.feedback.reset', { name: sp.name }))
                            } else {
                              setConfirmReset(sp.id)
                            }
                          }}
                          onMouseLeave={() =>
                            setConfirmReset((c) => (c === sp.id ? null : c))
                          }
                          className={cn(
                            'rounded-[6px] p-1.5 transition-colors',
                            confirmReset === sp.id
                              ? 'text-[var(--danger)] bg-[var(--fill-2)]'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--fill-2)]',
                          )}
                        >
                          <RotateCcw size={13} />
                        </button>
                      </Tooltip>
                    )}
                    {!sp.builtin && (
                      <Tooltip label={t('spaces.actions.delete')}>
                        <button
                          type="button"
                          onClick={() => deleteSpace(sp.id)}
                          className="rounded-[6px] p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--fill-2)] hover:text-[var(--danger)]"
                        >
                          <Trash2 size={13} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 flex gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={newSpace}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[var(--on-accent)] transition-transform hover:scale-[1.02]"
            >
              <Plus size={15} strokeWidth={2.4} />
              {t('spaces.newSpace')}
            </button>
            <button
              type="button"
              onClick={importTpl}
              className="flex items-center justify-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
            >
              <Upload size={14} />
              {t('spaces.import')}
            </button>
          </div>
        </motion.div>
        </div>
      </div>

      {publishing && (
        <PublishDialog
          space={publishing}
          onCancel={() => setPublishing(null)}
          onPublish={doPublish}
        />
      )}
    </>
  )
}
