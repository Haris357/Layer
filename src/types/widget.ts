export type WidgetType =
  | 'note'
  | 'link'
  | 'clock'
  | 'image'
  | 'video'
  | 'gallery'
  | 'weather'
  | 'stats'
  | 'todo'
  | 'countdown'
  | 'worldclock'
  | 'calendar'
  | 'apps'
  | 'search'
  | 'nowplaying'
  | 'notifications'
  | 'converter'
  | 'pomodoro'
  | 'sticky'
  | 'inbox'
  | 'clipboard'
  | 'webembed'
  | 'diskinfo'
  | 'greeting'
  | 'shelf'

export type Mode = 'edit' | 'view'

export interface BaseWidget {
  id: string
  type: WidgetType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  locked: boolean
  opacity?: number
  background?: boolean
}

export interface NoteWidget extends BaseWidget {
  type: 'note'
  activeEntryId: string | null
  fontSize: number
  font: string
  theme: 'dark' | 'light'
}

export interface JournalEntry {
  id: string
  content: string
  createdAt: string
  updatedAt: string
  title?: string
  pinned?: boolean
  /** Number of completed freewriting sessions on this entry. */
  freewrites?: number
}

export interface JournalFile {
  version: 1
  entries: JournalEntry[]
  savedAt: string
}

export interface LinkWidget extends BaseWidget {
  type: 'link'
  url: string
  label: string
  iconKey: string
  background: boolean
}

export interface ClockWidget extends BaseWidget {
  type: 'clock'
  variant: 'digital' | 'analog'
  format: '12h' | '24h'
  showSeconds: boolean
  showDate: boolean
  background: boolean
}

export interface ImageWidget extends BaseWidget {
  type: 'image'
  src: string
  fit: 'cover' | 'contain'
  rounded: number
}

export interface VideoWidget extends BaseWidget {
  type: 'video'
  src: string
  loop: boolean
  muted: boolean
  autoplay: boolean
}

export interface GalleryWidget extends BaseWidget {
  type: 'gallery'
  sources: string[]
  layout: 'slideshow' | 'grid' | 'polaroid' | 'collage'
  interval: number
  rounded: number
}

export interface WeatherWidget extends BaseWidget {
  type: 'weather'
  city: string
  lat: number
  lon: number
}

export interface StatsWidget extends BaseWidget {
  type: 'stats'
}

export interface TodoItem {
  id: string
  text: string
  done: boolean
}

export interface TodoWidget extends BaseWidget {
  type: 'todo'
  items: TodoItem[]
}

export interface CountdownWidget extends BaseWidget {
  type: 'countdown'
  label: string
  target: string
  background: boolean
}

export interface WorldZone {
  id: string
  label: string
  tz: string
}

export interface WorldClockWidget extends BaseWidget {
  type: 'worldclock'
  zones: WorldZone[]
}

export interface CalendarWidget extends BaseWidget {
  type: 'calendar'
}

export interface PinnedApp {
  name: string
  path: string
  isFolder?: boolean
  icon?: string
}

export interface AppsWidget extends BaseWidget {
  type: 'apps'
  pinned: PinnedApp[]
  layout: 'list' | 'grid'
}

export interface SearchWidget extends BaseWidget {
  type: 'search'
  engine: 'google' | 'bing' | 'duckduckgo'
}

export interface NowPlayingWidget extends BaseWidget {
  type: 'nowplaying'
}

export interface NotificationsWidget extends BaseWidget {
  type: 'notifications'
}

export interface ConverterWidget extends BaseWidget {
  type: 'converter'
  category: 'length' | 'weight' | 'temperature' | 'currency'
  from: string
  to: string
}

export interface PomodoroWidget extends BaseWidget {
  type: 'pomodoro'
  workMinutes: number
  shortBreak: number
  longBreak: number
  cyclesUntilLong: number
  completedToday: number
  statsDate: string
  sound:
    | 'none'
    | 'rain'
    | 'ocean'
    | 'forest'
    | 'fireplace'
    | 'brown'
    | 'pink'
    | 'white'
  soundVolume: number
}

export type StickyColor =
  | 'yellow'
  | 'pink'
  | 'blue'
  | 'green'
  | 'orange'
  | 'lilac'

export interface StickyWidget extends BaseWidget {
  type: 'sticky'
  text: string
  color: StickyColor
}

export interface InboxWidget extends BaseWidget {
  type: 'inbox'
}

export interface ClipboardWidget extends BaseWidget {
  type: 'clipboard'
}

export interface WebEmbedWidget extends BaseWidget {
  type: 'webembed'
  url: string
  zoom: number // 1 = 100%
  refreshSec: number // 0 = no auto-refresh
}

export interface DiskInfoWidget extends BaseWidget {
  type: 'diskinfo'
}

export type GreetingStyle = 'classic' | 'serif' | 'gradient'

export interface GreetingWidget extends BaseWidget {
  type: 'greeting'
  name: string
  style: GreetingStyle
}

export interface ShelfWidget extends BaseWidget {
  type: 'shelf'
}

export type Widget =
  | NoteWidget
  | LinkWidget
  | ClockWidget
  | ImageWidget
  | VideoWidget
  | GalleryWidget
  | WeatherWidget
  | StatsWidget
  | TodoWidget
  | CountdownWidget
  | WorldClockWidget
  | CalendarWidget
  | AppsWidget
  | SearchWidget
  | NowPlayingWidget
  | NotificationsWidget
  | ConverterWidget
  | PomodoroWidget
  | StickyWidget
  | InboxWidget
  | ClipboardWidget
  | WebEmbedWidget
  | DiskInfoWidget
  | GreetingWidget
  | ShelfWidget

export type NewWidget = Omit<Widget, 'id' | 'zIndex'>

export interface CanvasFile {
  version: 1
  widgets: Widget[]
  savedAt: string
}

export interface Space {
  id: string
  name: string
  builtin: boolean
  widgets: Widget[]
}

export interface SpacesFile {
  version: 1
  templates: Space[]
  activeId: string
  savedAt: string
}
