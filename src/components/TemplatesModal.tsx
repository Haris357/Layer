import { useState } from 'react'
import { motion } from 'framer-motion'
import { save, open } from '@tauri-apps/plugin-dialog'
import {
  Plus,
  Upload,
  Download,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react'
import { useCanvasStore } from '../store/canvasStore'
import { isTauri, readTextFile, writeTextFile } from '../lib/ipc'
import type { Template } from '../types/widget'
import { cn } from '../lib/utils'

export function TemplatesModal({ onClose }: { onClose: () => void }) {
  const templates = useCanvasStore((s) => s.templates)
  const activeId = useCanvasStore((s) => s.activeId)
  const switchTemplate = useCanvasStore((s) => s.switchTemplate)
  const createTemplate = useCanvasStore((s) => s.createTemplate)
  const renameTemplate = useCanvasStore((s) => s.renameTemplate)
  const deleteTemplate = useCanvasStore((s) => s.deleteTemplate)
  const importTemplate = useCanvasStore((s) => s.importTemplate)

  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startRename = (t: Template) => {
    setRenaming(t.id)
    setDraft(t.name)
  }
  const commitRename = () => {
    if (renaming && draft.trim()) renameTemplate(renaming, draft.trim())
    setRenaming(null)
  }

  const newTemplate = () => {
    const count = templates.filter((t) => !t.builtin).length
    createTemplate(`Template ${count + 1}`)
  }

  const exportTpl = async (t: Template) => {
    if (!isTauri()) return
    const path = await save({
      defaultPath: `${t.name}.layer`,
      filters: [{ name: 'Layer template', extensions: ['layer'] }],
    })
    if (path) {
      writeTextFile(
        path,
        JSON.stringify({ name: t.name, widgets: t.widgets }, null, 2),
      ).catch(() => {})
    }
  }

  const importTpl = async () => {
    if (!isTauri()) return
    const path = await open({
      multiple: false,
      filters: [{ name: 'Layer template', extensions: ['layer', 'json'] }],
    })
    if (path && typeof path === 'string') {
      try {
        const raw = await readTextFile(path)
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.widgets)) {
          importTemplate(
            typeof parsed.name === 'string' ? parsed.name : 'Imported',
            parsed.widgets,
          )
        }
      } catch {
        /* ignore bad file */
      }
    }
  }

  return (
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
        className="glass flex max-h-[560px] w-[460px] flex-col rounded-[16px] border border-[var(--border)] p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <h2
            className="text-[var(--text-primary)]"
            style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-1.2px' }}
          >
            Templates
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X size={18} />
          </button>
        </div>
        <p
          className="mb-4 text-[var(--text-secondary)]"
          style={{ fontSize: 12.5 }}
        >
          Switch layouts, build your own, and share them.
        </p>

        <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {templates.map((t) => {
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
                  onClick={() => switchTemplate(t.id)}
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
                    onClick={() => switchTemplate(t.id)}
                    className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-[var(--text-primary)]"
                  >
                    {t.name}
                  </button>
                )}

                {t.builtin && (
                  <span
                    className="shrink-0 rounded-[5px] bg-[var(--fill-2)] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[var(--text-tertiary)]"
                  >
                    Default
                  </span>
                )}

                <div className="flex shrink-0 items-center gap-0.5">
                  {renaming === t.id ? (
                    <button
                      type="button"
                      onClick={commitRename}
                      className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                    >
                      <Check size={14} />
                    </button>
                  ) : (
                    !t.builtin && (
                      <button
                        type="button"
                        title="Rename"
                        onClick={() => startRename(t)}
                        className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                      >
                        <Pencil size={13} />
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    title="Share / export"
                    onClick={() => exportTpl(t)}
                    className="rounded-[6px] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--fill-2)]"
                  >
                    <Download size={13} />
                  </button>
                  {!t.builtin && (
                    <button
                      type="button"
                      title="Delete"
                      onClick={() => deleteTemplate(t.id)}
                      className="rounded-[6px] p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--fill-2)] hover:text-[var(--danger)]"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex gap-2 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={newTemplate}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-[var(--accent)] px-3 py-2 text-[13px] font-semibold text-[var(--on-accent)] transition-transform hover:scale-[1.02]"
          >
            <Plus size={15} strokeWidth={2.4} />
            New template
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
  )
}
