import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Layers, Keyboard, MousePointer2, Sparkles } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'

const STEPS = [
  { icon: Keyboard, key: 'hotkey' },
  { icon: Layers, key: 'island' },
  { icon: MousePointer2, key: 'arrange' },
] as const

export function Onboarding() {
  const { t } = useTranslation()
  const setOnboarded = useSettingsStore((s) => s.setOnboarded)

  return (
    <div
      data-hit
      className="fixed inset-0 z-[10001] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="glass flex w-[460px] flex-col rounded-[18px] border border-[var(--border)] p-7"
      >
        <div className="mb-1 flex items-center gap-2 text-[var(--text-primary)]">
          <Sparkles size={20} strokeWidth={1.8} />
          <h2
            style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-1.2px' }}
          >
            {t('onboarding.welcome')}
          </h2>
        </div>
        <p
          className="mb-5 text-[var(--text-secondary)]"
          style={{ fontSize: 13 }}
        >
          {t('onboarding.subtitle')}
        </p>

        <div className="flex flex-col gap-3.5">
          {STEPS.map((s) => (
            <div key={s.key} className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--fill-2)] text-[var(--text-primary)]">
                <s.icon size={17} strokeWidth={1.8} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span
                  className="text-[var(--text-primary)]"
                  style={{ fontSize: 13.5, fontWeight: 700 }}
                >
                  {t(`onboarding.steps.${s.key}.title`)}
                </span>
                <span
                  className="text-[var(--text-secondary)]"
                  style={{ fontSize: 12.5, lineHeight: 1.5 }}
                >
                  {t(`onboarding.steps.${s.key}.body`)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setOnboarded(true)}
          className="mt-6 rounded-[10px] bg-[var(--accent)] py-2.5 text-[14px] font-semibold text-[var(--on-accent)] transition-transform hover:scale-[1.02]"
        >
          {t('onboarding.getStarted')}
        </button>
      </motion.div>
    </div>
  )
}
