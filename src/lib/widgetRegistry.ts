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

export interface WidgetSize {
  width: number
  height: number
}

export interface WidgetDefinition<T extends Widget = Widget> {
  type: WidgetType
  label: string
  icon: LucideIcon
  enabled: boolean
  minSize?: WidgetSize
  maxSize?: WidgetSize
  create: (
    x: number,
    y: number,
  ) => Promise<NewWidget | null> | NewWidget | null
  Renderer: (props: { widget: T }) => ReactNode
  Settings?: (props: {
    widget: T
    onUpdate: (patch: Partial<T>) => void
  }) => ReactNode
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
}

export const widgetOrder: WidgetType[] = [
  'note',
  'todo',
  'clock',
  'worldclock',
  'calendar',
  'countdown',
  'search',
  'apps',
  'nowplaying',
  'notifications',
  'converter',
  'link',
  'image',
  'video',
  'gallery',
  'weather',
  'stats',
]

export const widgetList: WidgetDefinition[] = widgetOrder.map(
  (type) => widgetRegistry[type],
)
