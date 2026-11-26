import type { LucideIcon } from 'lucide-react'
import { Bug, CalendarRange, CircuitBoard, Clipboard, CloudSun, Hand, Keyboard, Monitor, MousePointer2, PanelTopOpen, PenTool, Scaling, Shapes, Sparkles } from 'lucide-react'
import type { TourStep } from '../tour/Tour'
import { DoneVisual } from '../tour/TourVisuals'
import { InsightsVisual, MergedVisual, NewIntroVisual, PebblesVisual, PullVisual, StaysVisual } from './visuals'
import { BoardVisual, ClipVisual, MoreVisual, PointerVisual, QuickPasteVisual, WeatherVisual } from './visuals1121'

// "What's new" content, one entry per release (newest first). Adding the next
// release = one entry here + its text under whatsNew.v<major><minor> in every
// locale; the popup, the update tour and Settings → About all read from this.
// A patch release can have its own entry ("1.12.1"); otherwise it reuses its
// minor version's entry.

export interface ReleaseInfo {
  version: string // "1.12" or "1.12.1"
  key: string // i18n: whatsNew.<key>.headline / notes.<id> / tour.<id>.title|body
  // Hosted on the website (keeps the installer small). The same file plays on
  // layer-desktop.vercel.app/changelog.
  video?: { src: string; poster: string; page: string }
  notes: { id: string; icon: LucideIcon }[]
  tour: TourStep[]
}

const SITE = 'https://layer-desktop.vercel.app'

export const RELEASES: ReleaseInfo[] = [
  {
    version: '1.12.1',
    key: 'v1121',
    video: { src: `${SITE}/videos/layer-1.12.1.mp4`, poster: `${SITE}/videos/layer-1.12.1.jpg`, page: `${SITE}/changelog` },
    notes: [
      { id: 'whiteboard', icon: PenTool },
      { id: 'clipboard', icon: Clipboard },
      { id: 'quickpaste', icon: Keyboard },
      { id: 'weather', icon: CloudSun },
      { id: 'pointer', icon: MousePointer2 },
      { id: 'scale', icon: Scaling },
      { id: 'gpu', icon: CircuitBoard },
      { id: 'fixes', icon: Bug },
    ],
    tour: [
      { id: 'intro', Visual: () => <NewIntroVisual version="1.12.1" /> },
      { id: 'whiteboard', Visual: BoardVisual },
      { id: 'clipboard', Visual: ClipVisual },
      { id: 'quickpaste', Visual: QuickPasteVisual },
      { id: 'weather', Visual: WeatherVisual },
      { id: 'pointer', Visual: PointerVisual },
      { id: 'more', Visual: MoreVisual },
      { id: 'done', Visual: DoneVisual },
    ],
  },
  {
    version: '1.12',
    key: 'v112',
    video: { src: `${SITE}/videos/layer-1.12.mp4`, poster: `${SITE}/videos/layer-1.12.jpg`, page: `${SITE}/changelog` },
    notes: [
      { id: 'hub', icon: PanelTopOpen },
      { id: 'pull', icon: Hand },
      { id: 'pebbles', icon: Sparkles },
      { id: 'merged', icon: Shapes },
      { id: 'insights', icon: CalendarRange },
      { id: 'stays', icon: Monitor },
    ],
    tour: [
      { id: 'intro', Visual: () => <NewIntroVisual version="1.12" /> },
      { id: 'hub', target: 'hub' },
      { id: 'pull', Visual: PullVisual },
      { id: 'merged', Visual: MergedVisual },
      { id: 'pebbles', Visual: PebblesVisual },
      { id: 'insights', Visual: InsightsVisual },
      { id: 'stays', Visual: StaysVisual },
      { id: 'done', Visual: DoneVisual },
    ],
  },
]

/** "1.12.3" → "1.12" */
export const minorOf = (v: string) => v.split('.').slice(0, 2).join('.')

/** The entry for this exact version, else its minor version's, if any. */
export const releaseFor = (appVersion: string): ReleaseInfo | undefined =>
  RELEASES.find((r) => r.version === appVersion) ?? RELEASES.find((r) => r.version === minorOf(appVersion))

/**
 * What Settings → About and the popup show. In development builds the app is
 * usually still on the previous version, so fall back to the newest entry to
 * preview the popup and tour; release builds only ever show their own.
 */
export const releaseToShow = (appVersion: string): ReleaseInfo | undefined =>
  releaseFor(appVersion) ?? (import.meta.env.DEV ? RELEASES[0] : undefined)
