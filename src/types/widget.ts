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
  | 'quicksettings'

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

export interface QuickSettingsWidget extends BaseWidget {
  type: 'quicksettings'
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
  | QuickSettingsWidget

export type NewWidget = Omit<Widget, 'id' | 'zIndex'>

export interface CanvasFile {
  version: 1
  widgets: Widget[]
  savedAt: string
}

export interface Template {
  id: string
  name: string
  builtin: boolean
  widgets: Widget[]
}

export interface TemplatesFile {
  version: 1
  templates: Template[]
  activeId: string
  savedAt: string
}
