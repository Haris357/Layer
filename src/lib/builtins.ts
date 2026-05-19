import { uid } from './utils'
import type {
  Template,
  Widget,
  ClockWidget,
  NoteWidget,
  TodoWidget,
  CountdownWidget,
  WorldClockWidget,
  WeatherWidget,
  CalendarWidget,
  StatsWidget,
  NowPlayingWidget,
  AppsWidget,
  SearchWidget,
  LinkWidget,
  NotificationsWidget,
} from '../types/widget'

let z = 0

function base(x: number, y: number, w: number, h: number) {
  return {
    id: uid(),
    x,
    y,
    width: w,
    height: h,
    zIndex: ++z,
    locked: false,
  }
}

function newYear(): string {
  return new Date(new Date().getFullYear() + 1, 0, 1).toISOString()
}

function zone(label: string, tz: string) {
  return { id: uid(), label, tz }
}

function task(text: string, done = false) {
  return { id: uid(), text, done }
}

function minimal(): Widget[] {
  return [
    {
      ...base(140, 130, 240, 240),
      type: 'clock',
      variant: 'analog',
      format: '12h',
      showSeconds: true,
      showDate: false,
      background: false,
    } as ClockWidget,
    {
      ...base(140, 420, 560, 460),
      type: 'note',
      activeEntryId: null,
      fontSize: 19,
      font: "'Lora', serif",
      theme: 'dark',
    } as NoteWidget,
    {
      ...base(470, 130, 330, 160),
      type: 'countdown',
      label: 'New Year',
      target: newYear(),
      background: false,
    } as CountdownWidget,
    {
      ...base(760, 420, 320, 320),
      type: 'todo',
      items: [
        task('Take it slow today'),
        task('One deep-work block'),
        task('Step outside'),
      ],
    } as TodoWidget,
    {
      ...base(880, 130, 300, 200),
      type: 'worldclock',
      zones: [
        zone('San Francisco', 'America/Los_Angeles'),
        zone('London', 'Europe/London'),
        zone('Tokyo', 'Asia/Tokyo'),
      ],
    } as WorldClockWidget,
  ]
}

function dashboard(): Widget[] {
  return [
    {
      ...base(150, 120, 300, 160),
      type: 'clock',
      variant: 'digital',
      format: '24h',
      showSeconds: true,
      showDate: true,
      background: true,
    } as ClockWidget,
    {
      ...base(490, 120, 270, 200),
      type: 'weather',
      city: 'London',
      lat: 51.5072,
      lon: -0.1276,
    } as WeatherWidget,
    {
      ...base(800, 120, 300, 170),
      type: 'stats',
    } as StatsWidget,
    {
      ...base(150, 320, 300, 300),
      type: 'calendar',
    } as CalendarWidget,
    {
      ...base(490, 350, 290, 210),
      type: 'worldclock',
      zones: [
        zone('New York', 'America/New_York'),
        zone('Berlin', 'Europe/Berlin'),
        zone('Dubai', 'Asia/Dubai'),
        zone('Singapore', 'Asia/Singapore'),
      ],
    } as WorldClockWidget,
    {
      ...base(820, 320, 380, 200),
      type: 'nowplaying',
    } as NowPlayingWidget,
    {
      ...base(1140, 120, 320, 360),
      type: 'todo',
      items: [task('Review inbox'), task('Stand-up at 10'), task('Ship build')],
    } as TodoWidget,
  ]
}

function command(): Widget[] {
  return [
    {
      ...base(150, 130, 320, 320),
      type: 'apps',
      pinned: [],
      layout: 'list',
    } as AppsWidget,
    {
      ...base(510, 130, 380, 54),
      type: 'search',
      engine: 'google',
    } as SearchWidget,
    {
      ...base(510, 215, 380, 200),
      type: 'nowplaying',
    } as NowPlayingWidget,
    {
      ...base(510, 445, 185, 52),
      type: 'link',
      url: 'https://github.com',
      label: 'GitHub',
      iconKey: 'Github',
      background: true,
    } as LinkWidget,
    {
      ...base(705, 445, 185, 52),
      type: 'link',
      url: 'https://youtube.com',
      label: 'YouTube',
      iconKey: 'Youtube',
      background: true,
    } as LinkWidget,
    {
      ...base(930, 130, 330, 360),
      type: 'notifications',
    } as NotificationsWidget,
    {
      ...base(1300, 130, 290, 150),
      type: 'clock',
      variant: 'digital',
      format: '12h',
      showSeconds: false,
      showDate: true,
      background: false,
    } as ClockWidget,
  ]
}

export function buildBuiltins(): Template[] {
  return [
    { id: 'builtin-minimal', name: 'Minimal', builtin: true, widgets: minimal() },
    {
      id: 'builtin-dashboard',
      name: 'Dashboard',
      builtin: true,
      widgets: dashboard(),
    },
    { id: 'builtin-command', name: 'Command', builtin: true, widgets: command() },
  ]
}
