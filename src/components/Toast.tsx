import { AnimatePresence, motion } from 'framer-motion'
import { useToastStore } from '../store/toastStore'

export function Toast() {
  const message = useToastStore((s) => s.message)
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          data-hit
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="glass fixed bottom-7 left-1/2 z-[10002] -translate-x-1/2 rounded-[11px] border border-[var(--border)] px-4 py-2.5 text-[13px] font-medium text-[var(--text-primary)]"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
