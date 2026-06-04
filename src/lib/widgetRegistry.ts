import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { NewWidget, Widget, WidgetType } from '../types/widget'
import { noteDefinition } from '../components/widgets/NoteWidget'
import { clockDefinition } from '../components/widgets/ClockWidget'
import { linkDefinition } from '../components/widgets/LinkWidget'
import { imageDefinition } from '../components/widgets/ImageWidget'
import { videoDefinition } from '../components/widgets/VideoWidget'
import { galleryDefinition } from '../components/widgets/GalleryWidget'
import { weatherDefinition } from '../components/widgets/WeatherWidget'
import { statsDefinition } from '../components/widgets/StatsWidget'
import { todoDefinition } from '../components/widgets/TodoWidget'
import { countdownDefinition } from '../components/widgets/CountdownWidget'
import { worldClockDefinition } from '../components/widgets/WorldClockWidget'
import { calendarDefinition } from '../components/widgets/CalendarWidget'
import { appsDefinition } from '../components/widgets/AppsWidget'
import { searchDefinition } from '../components/widgets/SearchWidget'
import { converterDefinition } from '../components/widgets/ConverterWidget'
import { nowPlayingDefinition } from '../components/widgets/NowPlayingWidget'
import { notificationsDefinition } from '../components/widgets/NotificationsWidget'
import { pomodoroDefinition } from '../components/widgets/PomodoroWidget'
import { stickyDefinition } from '../components/widgets/StickyWidget'
import { inboxDefinition } from '../components/widgets/InboxWidget'
import { clipboardDefinition } from '../components/widgets/ClipboardWidget'
import { webEmbedDefinition } from '../components/widgets/WebEmbedWidget'
import { diskInfoDefinition } from '../components/widgets/DiskInfoWidget'
import { greetingDefinition } from '../components/widgets/GreetingWidget'
import { shelfDefinition } from '../components/widgets/ShelfWidget'

export interface WidgetSize {
  width: number
  height: number
}

// A selectable style for a widget, shown as a dropdown in the top bar when you
// add it. `patch` is merged onto the freshly-created widget.
export interface WidgetStyle {
  key: string
  label: string
  patch?: Record<string, unknown>
}

export interface WidgetDefinition<T extends Widget = Widget> {
  type: WidgetType
  label: string
  icon: LucideIcon
  enabled: boolean
  minSize?: WidgetSize
  maxSize?: WidgetSize
  // If present, adding from the bar opens a style dropdown instead of adding
  // the default straight away.
  styles?: WidgetStyle[]
  create: (
    x: number,
    y: number,
  ) => Promise<NewWidget | null> | NewWidget | null
  Renderer: (props: { widget: T }) => ReactNode
  Settings?: (props: {
    widget: T
    onUpdate: (patch: Partial<T>) => void
  }) => ReactNode
  // Optional gate: when it returns false for a given instance, the in-canvas
  // settings popover is hidden (e.g. an analog clock has no options).
  hasSettings?: (widget: T) => boolean
}

export const widgetRegistry: Record<WidgetType, WidgetDefinition> = {
  note: noteDefinition as WidgetDefinition,
  clock: clockDefinition as WidgetDefinition,
  link: linkDefinition as WidgetDefinition,
  image: imageDefinition as WidgetDefinition,
  video: videoDefinition as WidgetDefinition,
  gallery: galleryDefinition as WidgetDefinition,
  weather: weatherDefinition as WidgetDefinition,
  stats: statsDefinition as WidgetDefinition,
  todo: todoDefinition as WidgetDefinition,
  countdown: countdownDefinition as WidgetDefinition,
  worldclock: worldClockDefinition as WidgetDefinition,
  calendar: calendarDefinition as WidgetDefinition,
  apps: appsDefinition as WidgetDefinition,
  search: searchDefinition as WidgetDefinition,
  nowplaying: nowPlayingDefinition as WidgetDefinition,
  notifications: notificationsDefinition as WidgetDefinition,
  converter: converterDefinition as WidgetDefinition,
  pomodoro: pomodoroDefinition as WidgetDefinition,
  sticky: stickyDefinition as WidgetDefinition,
  inbox: inboxDefinition as WidgetDefinition,
  clipboard: clipboardDefinition as WidgetDefinition,
  webembed: webEmbedDefinition as WidgetDefinition,
  diskinfo: diskInfoDefinition as WidgetDefinition,
  greeting: greetingDefinition as WidgetDefinition,
  shelf: shelfDefinition as WidgetDefinition,
}

export const widgetOrder: WidgetType[] = [
  'note',
  'sticky',
  'shelf',
  'greeting',
  'inbox',
  'todo',
  'pomodoro',
  'clock',
  'worldclock',
  'calendar',
  'countdown',
  'search',
  'apps',
  'clipboard',
  'webembed',
  'nowplaying',
  'notifications',
  'converter',
  'link',
  'image',
  'video',
  'gallery',
  'weather',
  'stats',
  'diskinfo',
]

export const widgetList: WidgetDefinition[] = widgetOrder.map(
  (type) => widgetRegistry[type],
)
