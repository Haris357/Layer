import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Plus,
  Upload,
  Download,
  Share2,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react'
import { useCanvasStore } from '../store/canvasStore'
import { useToastStore } from '../store/toastStore'
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
  const spaces = useCanvasStore((s) => s.spaces)
  const activeId = useCanvasStore((s) => s.activeId)
  const switchSpace = useCanvasStore((s) => s.switchSpace)
  const createSpace = useCanvasStore((s) => s.createSpace)
  const renameSpace = useCanvasStore((s) => s.renameSpace)
  const deleteSpace = useCanvasStore((s) => s.deleteSpace)
  const importSpace = useCanvasStore((s) => s.importSpace)
  const toast = useToastStore((s) => s.show)

  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [publishing, setPublishing] = useState<Space | null>(null)

  const startRename = (t: Space) => {
    setRenaming(t.id)
    setDraft(t.name)
  }
  const commitRename = () => {
    if (renaming && draft.trim()) renameSpace(renaming, draft.trim())
    setRenaming(null)
  }

  const newSpace = () => {
    const count = spaces.filter((t) => !t.builtin).length
    createSpace(`Space ${count + 1}`)
  }

  // Export a template as a ZIP (template.json + canvas screenshot).
  const exportZip = (t: Space) => {
    if (!isTauri()) return
    switchSpace(t.id)
    onClose()
    setTimeout(async () => {
      try {
        const png = await captureCanvas()
        await exportSpaceZip(t, png)
        toast('Space exported ✦')
      } catch {
        toast('Couldn’t export the space.')
      }
    }, 600)
  }

  const importTpl = async () => {
    if (!isTauri()) return
    const result = await importSpaceFile()
    if (result) {
      importSpace(result.name, result.widgets)
      toast(`Imported “${result.name}”`)
      notify({
        kind: 'import',
        title: `Imported "${result.name}"`,
        body: `${result.widgets.length} widgets added as a new space.`,
      })
    }
  }

  // Publish: capture the canvas with all UI hidden, then upload.
  const doPublish = (author: string, description: string) => {
    const t = publishing
    if (!t) return
    setPublishing(null)
    switchSpace(t.id)
    onClose()
    setTimeout(async () => {
      try {
        const png = await captureCanvas()
        await publishToGallery({
          space: t,
          author,
          description,
          screenshotPng: png,
        })
        toast('Published to the gallery ✦')
      } catch {
        toast('Couldn’t publish — try again.')
      }
    }, 600)
  }

  return (
    <>
      <div
        data-hit
        className="fixed inset-0 z-[10000] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
        onMouseDown={onClose}
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
              Spaces
            </h2>
            <Tooltip label="Close" side="bottom">
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
            Switch layouts, build your own, export them, or publish to the
            gallery.
          </p>

          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
            {spaces.map((t) => {
              const active = t.id === activeId
              return (
                <div
                  key={t.id}
                  className={cn(
                    'flex items-center gap-2 rounded-[10px] border px-3 py-2.5 transition-colors',
                    active
                      ? 'border-[var(--border-strong)] bg-[var(--fill-2)]'
                      : 'border-[var(--border)] bg-[var(--fill-1)]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => switchSpace(t.id)}
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

                  {renaming === t.id ? (
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
                      onClick={() => switchSpace(t.id)}
                      className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-[var(--text-primary)]"
                    >
                      {t.name}
                    </button>
                  )}

                  {t.builtin && (
                    <span className="shrink-0 rounded-[5px] bg-[var(--fill-2)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                      Default
                    </span>
                  )}

                  <div className="flex shrink-0 items-center gap-0.5">
                    {renaming === t.id ? (
                      <Tooltip label="Save">
                        <button
                          type="button"
                          onClick={commitRename}
                          className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                        >
                          <Check size={14} />
                        </button>
                      </Tooltip>
                    ) : (
                      !t.builtin && (
                        <Tooltip label="Rename">
                          <button
                            type="button"
                            onClick={() => startRename(t)}
                            className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                          >
                            <Pencil size={13} />
                          </button>
                        </Tooltip>
                      )
                    )}
                    <Tooltip label="Publish to gallery">
                      <button
                        type="button"
                        onClick={() => setPublishing(t)}
                        className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                      >
                        <Share2 size={13} />
                      </button>
                    </Tooltip>
                    <Tooltip label="Export as ZIP">
                      <button
                        type="button"
                        onClick={() => exportZip(t)}
                        className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                      >
                        <Download size={13} />
                      </button>
                    </Tooltip>
                    {!t.builtin && (
                      <Tooltip label="Delete">
                        <button
                          type="button"
                          onClick={() => deleteSpace(t.id)}
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
              New space
            </button>
            <button
              type="button"
              onClick={importTpl}
              className="flex items-center justify-center gap-1.5 rounded-[8px] border border-[var(--border)] bg-[var(--fill-1)] px-3 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)]"
            >
              <Upload size={14} />
              Import
            </button>
          </div>
        </motion.div>
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
