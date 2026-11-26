import { PenTool } from 'lucide-react'
import type { BoardWidget as BoardWidgetType } from '../../types/widget'
import type { WidgetDefinition } from '../../lib/widgetRegistry'
import { Whiteboard } from './whiteboard/Whiteboard'

// The Whiteboard (formerly the Idea board, same `board` type so saved boards
// keep working: their cards and links open as sticky notes and arrows).
// Added from the Notes icon's style menu.
export const boardDefinition: WidgetDefinition<BoardWidgetType> = {
  type: 'board',
  label: 'Whiteboard',
  icon: PenTool,
  enabled: true,
  minSize: { width: 560, height: 470 },
  create: (x, y) => ({
    type: 'board',
    x,
    y,
    width: 820,
    height: 560,
    locked: false,
    cards: [],
    connections: [],
    bg: 'dots',
  }),
  Renderer: ({ widget }) => <Whiteboard widget={widget} />,
}
