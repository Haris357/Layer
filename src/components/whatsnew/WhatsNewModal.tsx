import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Layers, Play, X } from 'lucide-react'
import { useTourStore } from '../../store/tourStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useAnchorMonitor } from '../../store/monitorStore'
import { getAppVersion, isTauri, openUrl } from '../../lib/ipc'
import { Tooltip } from '../Tooltip'
import { releaseToShow, type ReleaseInfo } from './releases'

const ease = [0.32, 0.72, 0, 1] as const

// The release video: a poster with a play button. Nothing downloads until the
// user chooses to watch; offline it offers to watch on the website instead.
function VideoCard({ video, onPlayingChange }: { video: NonNullable<ReleaseInfo['video']>; onPlayingChange: (v: boolean) => void }) {
  const { t } = useTranslation()
  const [state, setState] = useState<'poster' | 'playing' | 'offline'>('poster')
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => onPlayingChange(state === 'playing'), [state, onPlayingChange])

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[14px] border border-[var(--border)] bg-[#0b0b10]">
      <AnimatePresence initial={false}>
        {state === 'playing' ? (
          <motion.div key="video" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease }}>
            <video
              ref={ref}
              src={video.src}
              poster={video.poster}
              autoPlay
              controls
              playsInline
              onEnded={() => setState('poster')}
              onError={() => setState('offline')}
              className="h-full w-full"
            />
            <Tooltip label={t('whatsNew.skipVideo')} side="left" className="absolute right-2.5 top-2.5">
              <button
                type="button"
                onClick={() => setState('poster')}
                className="flex h-7 items-center gap-1 rounded-full bg-black/60 px-2.5 text-[11.5px] font-semibold text-white backdrop-blur transition-colors hover:bg-black/80"
              >
                {t('whatsNew.skipVideo')}
                <X size={12} />
              </button>
            </Tooltip>
          </motion.div>
        ) : state === 'offline' ? (
          <motion.div
            key="offline"
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center"
            style={{ background: 'radial-gradient(ellipse at 50% 130%, rgba(236,72,153,0.4), rgba(124,58,237,0.35) 40%, #0b0b10 75%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-white/10 text-white">
              <Layers size={24} strokeWidth={1.7} />
            </div>
            <p className="max-w-[260px] text-[12.5px] text-white/70">{t('whatsNew.videoOffline')}</p>
            <Tooltip label={t('whatsNew.watchOnline')} side="bottom">
              <button
                type="button"
                onClick={() => openUrl(video.page).catch(() => {})}
                className="flex h-8 items-center gap-1.5 rounded-full bg-white px-3.5 text-[12px] font-semibold text-[#141416]"
              >
                {t('whatsNew.watchOnline')}
                <ArrowRight size={13} />
              </button>
            </Tooltip>
          </motion.div>
        ) : (
          <motion.button
            key="poster"
            type="button"
            className="group absolute inset-0"
            onClick={() => setState('playing')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            <img src={video.poster} alt="" className="h-full w-full object-cover" onError={() => setState('offline')} />
            <span className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
            <Tooltip label={t('whatsNew.play')} side="bottom" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <motion.span
                className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#141416] shadow-2xl"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
              >
                <Play size={22} fill="currentColor" className="ml-0.5" />
              </motion.span>
            </Tooltip>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

// Shown once after updating to a version that has release notes; also opens
// from Settings → About. "See what's new" starts that release's short tour.
export function WhatsNewModal() {
  const { t } = useTranslation()
  const close = useTourStore((s) => s.closeWhatsNew)
  const startTour = useTourStore((s) => s.start)
  const setLastSeenVersion = useSettingsStore((s) => s.setLastSeenVersion)
  const mon = useAnchorMonitor()
  const [version, setVersion] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!isTauri()) return
    getAppVersion().then(setVersion).catch(() => {})
  }, [])

  const release = version ? releaseToShow(version) : undefined

  const later = () => {
    if (version) setLastSeenVersion(version)
    close()
  }
  const see = () => {
    if (version) setLastSeenVersion(version)
    startTour('whatsnew')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') later()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // later only reads `version`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  if (!version || !release) return null
  const ns = `whatsNew.${release.key}`

  return (
    <motion.div
      data-hit
      className="fixed inset-0 z-[10001]"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        className="absolute flex items-center justify-center"
        style={{ left: mon ? mon.x : 0, top: mon ? mon.y : 0, width: mon ? mon.w : '100%', height: mon ? mon.h : '100%' }}
      >
        <motion.div
          className="glass flex max-h-[92vh] w-[min(560px,92vw)] flex-col overflow-y-auto rounded-[22px] border border-[var(--border)] p-5"
          style={{ background: 'linear-gradient(var(--surface), var(--surface)), linear-gradient(var(--surface), var(--surface)), linear-gradient(var(--surface), var(--surface))' }}
          initial={{ opacity: 0, y: 24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 260, damping: 28 }}
        >
          {release.video && <VideoCard video={release.video} onPlayingChange={setPlaying} />}

          {/* Notes fold away while the video plays, and come back after. */}
          <motion.div
            className="overflow-hidden"
            initial={false}
            animate={{ height: playing ? 0 : 'auto', opacity: playing ? 0 : 1 }}
            transition={{ duration: 0.4, ease }}
          >
            <div className="pt-4">
              <span className="inline-flex items-center rounded-full bg-[var(--fill-2)] px-2.5 py-1 text-[11px] font-bold tracking-wide text-[var(--text-secondary)]">
                {t('whatsNew.badge', { version: release.version })}
              </span>
              <h2 className="mt-2.5 text-[21px] font-bold leading-tight tracking-[-0.03em] text-[var(--text-primary)]">{t(`${ns}.headline`)}</h2>
              <motion.ul
                className="mt-3.5 flex flex-col gap-2"
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: 0.2 } } }}
              >
                {release.notes.map(({ id, icon: Icon }) => (
                  <motion.li
                    key={id}
                    className="flex items-start gap-3"
                    variants={{ hidden: { opacity: 0, x: -8 }, show: { opacity: 1, x: 0 } }}
                    transition={{ duration: 0.35, ease }}
                  >
                    <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[var(--fill-1)] text-[var(--text-primary)]">
                      <Icon size={15} strokeWidth={1.7} />
                    </span>
                    <span className="text-[13px] leading-relaxed text-[var(--text-secondary)]">{t(`${ns}.notes.${id}`)}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          </motion.div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={later}
              className="h-9 rounded-full px-4 text-[13px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--fill-2)] hover:text-[var(--text-primary)]"
            >
              {t('whatsNew.later')}
            </button>
            <motion.button
              type="button"
              onClick={see}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              className="flex h-9 items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 text-[13px] font-semibold text-[var(--on-accent)]"
            >
              {t('whatsNew.see')}
              <ArrowRight size={14} />
            </motion.button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
