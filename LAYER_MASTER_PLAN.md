# Layer — Complete Master Plan

> A transparent always-on-top desktop canvas for Windows. Drop widgets onto your screen, arrange them however you want.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Tech Stack (Final)](#2-tech-stack-final)
3. [Design System](#3-design-system)
4. [Architecture](#4-architecture)
5. [Data Model](#5-data-model)
6. [Folder Structure](#6-folder-structure)
7. [Rust Commands](#7-rust-commands)
8. [Development Phases Overview](#8-development-phases-overview)
9. [Phase 1: Foundation + Note Widget](#phase-1-foundation--note-widget)
10. [Phase 2: Clock Widget + Polish](#phase-2-clock-widget--polish)
11. [Phase 3: Link Widget](#phase-3-link-widget)
12. [Phase 4: Image Widget](#phase-4-image-widget)
13. [Phase 5: Video Widget](#phase-5-video-widget)
14. [Phase 6: Settings + Polish + Ship](#phase-6-settings--polish--ship)
15. [Post-Launch Roadmap](#post-launch-roadmap)
16. [Naming & Branding Reference](#naming--branding-reference)

---

## 1. Product Overview

**Name:** Layer
**Tagline:** a quiet layer on your desktop
**Platform:** Windows 10/11 only (v1)
**Storage:** 100% local, no cloud, no database

### What it does
Layer runs as a fullscreen transparent always-on-top window. Users press `Ctrl+Shift+Space` to enter **edit mode**, which reveals a left sidebar with widget options. They click to add widgets (Note, Link, Clock, Image, Video) onto the canvas, drag/resize them, customize them. Pressing the hotkey again returns to **view mode** where the window becomes click-through and widgets just sit there.

### Two modes
| Mode | Behavior |
|------|----------|
| **Edit** | Sidebar visible, cursor events enabled, widgets show resize handles, faint grid dots visible |
| **View** | Sidebar hidden, window click-through, widgets render normally, no UI chrome |

### Core widgets (v1)
- **Note** — editable text block, configurable font size
- **Link** — clickable shortcut to any URL with custom label and icon
- **Clock** — digital or analog, 12h or 24h, optional date
- **Image** — local image file, configurable fit and corner radius
- **Video** — local video file, autoplay/loop/mute options
- **Reset** — wipes the canvas

---

## 2. Tech Stack (Final)

| Layer | Choice | Why |
|-------|--------|-----|
| Shell | Tauri 2.x | Tiny bundle, transparent windows work properly, Rust backend |
| Backend | Rust (minimal) | Window management, fs, hotkeys |
| Frontend | React 18 + TypeScript | Mature, typed, huge ecosystem |
| Build | Vite | Fast HMR, modern |
| Styling | Tailwind CSS v4 | Utility-first, matches the minimal aesthetic |
| Components | shadcn/ui (selective) | Only what we need, no bloat |
| State | Zustand | Lightweight, perfect for this scope |
| Drag/Resize | react-rnd | Battle-tested, simple API |
| Animations | Framer Motion | Smooth mode transitions |
| Icons | lucide-react | Clean line icons, 1.5px stroke |
| Persistence | tauri-plugin-fs + serde_json | Raw JSON, easy to debug |
| Hotkeys | tauri-plugin-global-shortcut | Native global shortcuts |

---

## 3. Design System

### Typography
Font: **Inter** (loaded from Google Fonts in `index.html`)

| Use case | Weight | Letter-spacing |
|----------|--------|----------------|
| Display / hero text | 700 | -2.1px |
| Large headings | 700 | -1.2px |
| UI labels, buttons | 500 | normal |
| Body, note content | 400 | normal |
| Small captions | 500 | 0.2px |

### Color tokens
Set as CSS variables in `index.css`:

```css
:root {
  --surface: rgba(20, 20, 22, 0.72);
  --surface-hover: rgba(28, 28, 32, 0.85);
  --surface-active: rgba(36, 36, 42, 0.9);
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);
  --text-primary: rgba(255, 255, 255, 0.96);
  --text-secondary: rgba(255, 255, 255, 0.6);
  --text-tertiary: rgba(255, 255, 255, 0.4);
  --accent: rgba(255, 255, 255, 1);
  --danger: rgba(248, 113, 113, 0.9);
  --grid-dot: rgba(255, 255, 255, 0.08);
}
```

### Surfaces
- All cards, sidebars, widgets: `backdrop-filter: blur(24px) saturate(180%)`
- Background uses `--surface`
- Border 1px solid `--border` (use `--border-strong` on hover/focus)

### Radii
| Element | Radius |
|---------|--------|
| Widgets | 12px |
| Sidebar | 16px |
| Buttons | 8px |
| Context menu | 10px |
| Input fields | 8px |

### Motion
- All transitions: `200ms ease-out`
- Mode switch (sidebar slide, grid fade): `300ms ease-out`
- Widget add: scale from 0.95 to 1 + opacity 0 to 1, 200ms
- Widget delete: scale to 0.95 + opacity to 0, 150ms

### Icons
- Library: `lucide-react`
- Sidebar icons: 18px, stroke-width 1.5
- Context menu icons: 14px, stroke-width 1.5
- Button icons: 16px, stroke-width 1.5

### Sidebar layout
- Width: 240px
- Padding: 20px
- Slides in from left in edit mode
- Top: "Layer" wordmark in Inter 700
- Below: widget buttons (vertical list)
- Bottom: Reset button (separated by divider)

---

## 4. Architecture

### Window strategy
**One single Tauri window** with these properties:
- Fullscreen
- Frameless (no decorations)
- Transparent
- Always-on-top
- Skip taskbar
- Starts in view mode with `set_ignore_cursor_events(true)`

### Mode toggling
- Global hotkey `Ctrl+Shift+Space` toggles edit/view
- On switch to edit: enable cursor events, slide sidebar in, fade grid in
- On switch to view: disable cursor events, slide sidebar out, fade grid out

### Click-through nuance
V1 uses **full toggle** — the whole window is interactive in edit mode, fully click-through in view mode. A small floating "edit pill" for view mode is deferred to post-v1.

### State management
Two Zustand stores:

**canvasStore.ts** — runtime state
- `widgets: Widget[]`
- `mode: 'edit' | 'view'`
- `selectedId: string | null`
- actions: `addWidget`, `updateWidget`, `deleteWidget`, `setMode`, `setSelected`, `resetAll`, `bringToFront`, `sendToBack`, `duplicateWidget`, `lockWidget`

**settingsStore.ts** — user preferences
- `gridSize: number` (default 20)
- `snapEnabled: boolean`
- `hotkey: string` (default `Ctrl+Shift+Space`)
- `clockFormat24h: boolean` (global default)

### Widget registry pattern
Every widget type lives in `src/components/widgets/` and registers itself:

```ts
interface WidgetDefinition<T extends Widget> {
  type: T['type']
  label: string
  icon: LucideIcon
  defaultState: (x: number, y: number) => T
  Renderer: React.FC<{ widget: T }>
  Settings?: React.FC<{ widget: T; onUpdate: (patch: Partial<T>) => void }>
}
```

The sidebar iterates the registry to render buttons. Adding a new widget type = drop one file, register it, done.

### Persistence flow
1. On any state change → debounced 500ms → serialize to JSON → call Rust `save_canvas`
2. Rust writes to `%APPDATA%/Layer/canvas.json`
3. On app start → Rust `load_canvas` → hydrate Zustand store
4. Imported assets (images, videos) copied to `%APPDATA%/Layer/assets/` so they persist even if originals are deleted

---

## 5. Data Model

```ts
type WidgetType = 'note' | 'link' | 'clock' | 'image' | 'video'

interface BaseWidget {
  id: string
  type: WidgetType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  locked: boolean
}

interface NoteWidget extends BaseWidget {
  type: 'note'
  content: string
  fontSize: number
  fontWeight: 400 | 500 | 700
}

interface LinkWidget extends BaseWidget {
  type: 'link'
  url: string
  label: string
  iconKey: string
}

interface ClockWidget extends BaseWidget {
  type: 'clock'
  variant: 'digital' | 'analog'
  format: '12h' | '24h'
  showSeconds: boolean
  showDate: boolean
}

interface ImageWidget extends BaseWidget {
  type: 'image'
  src: string
  fit: 'cover' | 'contain'
  rounded: number
}

interface VideoWidget extends BaseWidget {
  type: 'video'
  src: string
  loop: boolean
  muted: boolean
  autoplay: boolean
}

type Widget = NoteWidget | LinkWidget | ClockWidget | ImageWidget | VideoWidget

interface CanvasFile {
  version: 1
  widgets: Widget[]
  savedAt: string
}
```

---

## 6. Folder Structure

```
layer/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              entry point
│   │   ├── commands.rs          tauri commands
│   │   ├── window.rs            transparency, click-through setup
│   │   └── storage.rs           json read/write + asset import
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   ├── build.rs
│   └── icons/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css                tailwind + font + tokens
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── Canvas.tsx
│   │   ├── GridBackground.tsx
│   │   ├── ContextMenu.tsx
│   │   ├── ConfirmDialog.tsx
│   │   └── widgets/
│   │       ├── WidgetWrapper.tsx
│   │       ├── NoteWidget.tsx
│   │       ├── LinkWidget.tsx
│   │       ├── ClockWidget.tsx
│   │       ├── ImageWidget.tsx
│   │       └── VideoWidget.tsx
│   ├── store/
│   │   ├── canvasStore.ts
│   │   └── settingsStore.ts
│   ├── hooks/
│   │   ├── useHotkey.ts
│   │   ├── usePersistence.ts
│   │   └── useSnapToGrid.ts
│   ├── lib/
│   │   ├── widgetRegistry.ts
│   │   ├── ipc.ts
│   │   └── utils.ts
│   └── types/
│       └── widget.ts
├── package.json
├── tailwind.config.ts
├── vite.config.ts
├── tsconfig.json
└── index.html
```

---

## 7. Rust Commands

Full surface area across all phases:

```rust
toggle_click_through(enabled: bool) -> Result<()>
set_always_on_top(enabled: bool) -> Result<()>
save_canvas(json: String) -> Result<()>
load_canvas() -> Result<String>
import_asset(source_path: String) -> Result<String>
delete_asset(asset_path: String) -> Result<()>
reset_all() -> Result<()>
open_url(url: String) -> Result<()>
quit_app() -> Result<()>
get_app_version() -> Result<String>
```

---

## 8. Development Phases Overview

Six phases, each builds on the last. Don't skip ahead — ship each phase fully working before moving on.

| Phase | Scope | Estimated time |
|-------|-------|----------------|
| **Phase 1** | Foundation: Tauri setup, window config, sidebar shell, canvas, registry pattern, Note widget end-to-end, persistence, hotkey, context menu | 1–2 days |
| **Phase 2** | Clock widget (digital + analog), polish on Note, fix any P1 bugs from phase 1 | 1 day |
| **Phase 3** | Link widget with icon picker, URL validation, click-to-open via Rust | 1 day |
| **Phase 4** | Image widget with file picker, asset import, fit modes, rounded corners | 1 day |
| **Phase 5** | Video widget with file picker, asset import, autoplay/loop/mute controls | 1 day |
| **Phase 6** | Settings panel, hotkey customization, theme tweaks, installer build, app icon, ship | 1–2 days |

**Total: ~7–10 days of focused work for v1.**

---

## Phase 1: Foundation + Note Widget

**Goal:** Working app with Note widget fully functional end-to-end. Everything else is scaffolded but disabled.

### What's working after Phase 1
- App launches as fullscreen transparent overlay
- `Ctrl+Shift+Space` toggles edit/view mode
- Sidebar slides in/out smoothly
- Click "Note" → adds note at canvas center
- Edit note text, drag with snap-to-grid, resize, right-click menu (Duplicate, Lock, Bring to Front, Send to Back, Delete)
- Notes persist across app restarts
- Reset button wipes canvas with confirm dialog
- Other widget buttons disabled with "coming soon" tooltip

### Claude Code prompt for Phase 1

```
Build Phase 1 of "Layer" — a Windows desktop canvas app using Tauri 2 + React 18 
+ TypeScript + Vite + Tailwind v4. This phase establishes the foundation and 
ships the Note widget fully working end-to-end.

# Product context
Layer is a transparent always-on-top fullscreen overlay that sits over the 
Windows desktop. Users press Ctrl+Shift+Space to toggle edit mode, which shows 
a sidebar with widget options. They drop widgets (Note, Link, Clock, Image, 
Video) onto the canvas, drag/resize them, customize them. Pressing the hotkey 
again switches to view mode where the window is click-through.

In this phase: only Note widget is functional. Others render as disabled 
buttons with "coming soon" tooltip.

# Hard requirements

## Window
- Fullscreen, frameless, transparent, always-on-top, skip taskbar, no decorations
- Starts in view mode with cursor events ignored
- Global hotkey Ctrl+Shift+Space toggles edit/view mode

## Edit mode
- Sidebar slides in from left (240px wide, glassmorphism)
- Faint grid dots appear at 8% opacity, 20px spacing
- Widgets show resize handles
- Right-click any widget shows context menu (Duplicate, Lock, Bring to Front, 
  Send to Back, Delete)

## View mode
- Sidebar hidden
- Window click-through (Rust: set_ignore_cursor_events(true))
- Grid hidden
- Widgets render normally without handles

## Note widget
- Click sidebar Note button → adds note at canvas center (400x200)
- Placeholder: "Start typing..."
- Click to edit (use contentEditable div, not textarea — better styling control)
- Inter font, weight 400, size 16px by default
- Background: var(--surface), border 1px var(--border), radius 12px, padding 16px
- Drag with react-rnd, snap to 20px grid
- Hold Alt while dragging to disable snap temporarily
- Resize handles on all 4 corners + 4 sides in edit mode only
- Min size: 120x60

## Persistence
- Autosave debounced 500ms after any state change
- File location: %APPDATA%/Layer/canvas.json
- Format: { version: 1, widgets: [...], savedAt: ISO string }
- Load on app start, hydrate Zustand store

## Reset
- Bottom of sidebar, separated by divider, red-tinted text
- Click → confirm dialog ("This will delete all widgets. Continue?")
- Confirm → wipes canvas.json and state

## Other widgets (disabled state)
- Render Link, Clock, Image, Video buttons in sidebar but with opacity 40%, 
  cursor not-allowed, tooltip on hover saying "Coming in next update"

# Design system

## Font
Load Inter from Google Fonts in index.html (weights 400, 500, 700)

## CSS variables in index.css
:root {
  --surface: rgba(20, 20, 22, 0.72);
  --surface-hover: rgba(28, 28, 32, 0.85);
  --surface-active: rgba(36, 36, 42, 0.9);
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);
  --text-primary: rgba(255, 255, 255, 0.96);
  --text-secondary: rgba(255, 255, 255, 0.6);
  --text-tertiary: rgba(255, 255, 255, 0.4);
  --accent: rgba(255, 255, 255, 1);
  --danger: rgba(248, 113, 113, 0.9);
  --grid-dot: rgba(255, 255, 255, 0.08);
}

## Typography rules
- Sidebar wordmark "Layer": Inter 700, 24px, letter-spacing -1.2px
- Sidebar button labels: Inter 500, 14px
- Note content: Inter 400, 16px
- All transitions 200ms ease-out, mode-switch 300ms ease-out

## Glassmorphism
- Sidebar and widgets: backdrop-filter: blur(24px) saturate(180%)

## Radii
- Widgets 12px, Sidebar 16px, Buttons 8px, Context menu 10px

## Icons
- lucide-react, 18px in sidebar (stroke 1.5), 14px in context menu (stroke 1.5)

# Architecture

## State
- Zustand with two stores:
  - canvasStore: widgets[], mode, selectedId + actions (addWidget, updateWidget, 
    deleteWidget, setMode, setSelected, resetAll, bringToFront, sendToBack, 
    duplicateWidget, toggleLock)
  - settingsStore: gridSize (20), snapEnabled (true), hotkey

## Widget registry pattern (scaffold for all 5 types)
File: src/lib/widgetRegistry.ts
Each widget type implements WidgetDefinition with: type, label, icon, 
defaultState(x,y), Renderer, optional Settings. Even though only Note is 
implemented, scaffold the registry so adding Clock/Link/etc later means 
dropping one file and registering it.

## Rust commands needed for Phase 1
- toggle_click_through(enabled: bool)
- save_canvas(json: String)
- load_canvas() -> String
- reset_all()
- quit_app()

Use tauri-plugin-fs and tauri-plugin-global-shortcut. Use serde_json for 
serialization.

## Types
Strict TypeScript everywhere. No `any`. Use discriminated unions on Widget 
based on the `type` field.

# Folder structure (create exactly)

layer/
├── src-tauri/
│   ├── src/{main.rs, commands.rs, window.rs, storage.rs}
│   ├── tauri.conf.json
│   ├── Cargo.toml
│   ├── build.rs
│   └── icons/
├── src/
│   ├── main.tsx, App.tsx, index.css
│   ├── components/
│   │   ├── Sidebar.tsx, Canvas.tsx, GridBackground.tsx
│   │   ├── ContextMenu.tsx, ConfirmDialog.tsx
│   │   └── widgets/{WidgetWrapper.tsx, NoteWidget.tsx}
│   ├── store/{canvasStore.ts, settingsStore.ts}
│   ├── hooks/{useHotkey.ts, usePersistence.ts, useSnapToGrid.ts}
│   ├── lib/{widgetRegistry.ts, ipc.ts, utils.ts}
│   └── types/widget.ts
├── package.json, tailwind.config.ts, vite.config.ts, tsconfig.json, index.html

# tauri.conf.json key values
- productName: "Layer"
- identifier: "app.layer.desktop"
- window: fullscreen true, transparent true, decorations false, 
  alwaysOnTop true, skipTaskbar true, title "Layer"

# Code style
- NO COMMENTS anywhere in any code file
- Functional components only
- Named exports preferred, default exports only for top-level components
- Use cn() utility (clsx + tailwind-merge) for className composition
- Tailwind for all styling, inline styles only for dynamic positioning via 
  react-rnd
- Strict null checks, no `any`

# Acceptance criteria
1. pnpm tauri dev launches a transparent fullscreen overlay
2. Ctrl+Shift+Space → sidebar slides in, grid appears, can click Note to add 
   a note at canvas center
3. Note is editable, draggable (snaps to 20px grid), resizable
4. Right-click a note → context menu appears with all 5 actions, each works
5. Close app, reopen → notes are exactly where I left them
6. Ctrl+Shift+Space again → sidebar slides out, click-through activates
7. Reset button → confirm dialog → confirm → all widgets gone, file cleared
8. Other sidebar buttons appear disabled with "coming soon" tooltip
9. No console errors, no TypeScript errors

# How to deliver
Start by showing me:
1. package.json with all dependencies
2. src-tauri/tauri.conf.json
3. src-tauri/Cargo.toml
4. The full widget registry pattern in src/lib/widgetRegistry.ts

I'll confirm those look right before you write the rest. Then proceed to 
build outward in this order: Rust window setup → state stores → ipc layer → 
App shell → Sidebar → Canvas → GridBackground → WidgetWrapper → NoteWidget 
→ persistence hook → hotkey hook → ContextMenu → ConfirmDialog → final wire-up.
```

---

## Phase 2: Clock Widget + Polish

**Goal:** Add Clock widget, fix any Phase 1 bugs, polish interactions.

### What's new in Phase 2
- **Clock widget** with two variants:
  - **Digital**: large Inter 700 numbers, optional seconds, optional date below
  - **Analog**: minimal circular face, thin hands, no numbers (or 12/3/6/9 only)
- 12h or 24h format toggle per-clock
- Settings popover when clock is selected in edit mode
- Polish: keyboard shortcuts (Delete to remove selected, Esc to deselect, Cmd/Ctrl+D to duplicate)

### Claude Code prompt for Phase 2

```
Phase 2 of Layer. Phase 1 is shipped and working. Now add the Clock widget and 
polish interactions.

# What to build

## Clock widget
File: src/components/widgets/ClockWidget.tsx
Register it in src/lib/widgetRegistry.ts (replace the disabled placeholder).
Enable the Clock button in the sidebar.

### Two variants

**Digital clock**
- Large time display: Inter 700, 56px, letter-spacing -2.1px, color var(--text-primary)
- Optional seconds: smaller, Inter 500, 32px, color var(--text-secondary), 
  appears to the right of minutes with a subtle separator
- Optional date below: Inter 500, 14px, color var(--text-tertiary), format 
  "Mon, Jan 15"
- 12h format shows AM/PM in Inter 500 14px to the right
- Default size: 280x120 (no date) or 280x160 (with date)

**Analog clock**
- Circular face, transparent background, 1px border var(--border-strong)
- 4 tick marks at 12/3/6/9 positions (small lines, 2px wide, color var(--text-tertiary))
- Hour hand: thicker, 60% radius, color var(--text-primary)
- Minute hand: thinner, 85% radius, color var(--text-primary)
- Second hand: very thin, 90% radius, color var(--accent), smooth animation
- Center dot: 6px circle, color var(--text-primary)
- Default size: 200x200 (square, locked aspect ratio)

### Settings popover
When a Clock widget is selected in edit mode, show a small popover above it 
with controls:
- Variant toggle (Digital / Analog) — segmented control
- Format toggle (12h / 24h) — segmented control
- Show seconds — toggle switch
- Show date — toggle switch (digital only, hide for analog)

Popover styling: glassmorphism, 8px padding, 10px radius, appears 8px above 
the widget, smooth fade-in 150ms.

### Implementation notes
- Use a single useEffect with setInterval(1000) at the top of ClockWidget 
  to update time
- For analog, calculate hand rotations: 
  hours: (h % 12) * 30 + m * 0.5 degrees
  minutes: m * 6 + s * 0.1 degrees
  seconds: s * 6 degrees
- Use SVG for analog clock (not canvas), it's simpler and crisper

## Polish from Phase 1

### Keyboard shortcuts (only active in edit mode)
- Delete or Backspace → delete selected widget
- Escape → deselect
- Ctrl+D → duplicate selected widget
- Ctrl+] → bring selected to front
- Ctrl+[ → send selected to back

Implement in a new hook: src/hooks/useKeyboardShortcuts.ts

### Selection visual
When a widget is selected in edit mode, show a 2px outline in var(--border-strong) 
with 4px offset (use outline, not border, to avoid affecting layout). 
Smooth 150ms fade-in.

### Click empty canvas to deselect
Add an onClick handler on Canvas that calls setSelected(null) if the click 
target is the canvas itself (not a widget child).

### Sidebar button hover state
On hover: background changes to var(--surface-hover), icon scales 1.05, 
both transitions 150ms ease-out.

# Code style
- No comments
- Strict TS
- Follow patterns from Phase 1

# Acceptance criteria
1. Click Clock button in sidebar → analog clock appears at canvas center 
   (default variant)
2. Select the clock → settings popover appears above it
3. Toggle to Digital → re-renders correctly with current time
4. Toggle 12h/24h → format updates immediately
5. Toggle show seconds and show date → both work
6. Time updates every second smoothly
7. Analog second hand sweeps smoothly
8. All keyboard shortcuts work in edit mode only
9. Clicking empty canvas deselects current widget
10. Multiple clocks can be added independently with independent settings
11. Clocks persist across restarts with their settings intact

Start by showing me ClockWidget.tsx and the updated widgetRegistry.ts. Then 
proceed with the polish items.
```

---

## Phase 3: Link Widget

**Goal:** Add Link widget for quick desktop shortcuts.

### What's new in Phase 3
- **Link widget**: clickable tile that opens a URL in default browser
- Custom label, URL, and icon (picker from common social/web services)
- URL validation
- Click in view mode opens link, click in edit mode selects widget

### Claude Code prompt for Phase 3

```
Phase 3 of Layer. Clock widget is shipped. Now add the Link widget.

# What to build

## Link widget
File: src/components/widgets/LinkWidget.tsx
Register and enable in sidebar.

### Behavior
- Clickable tile that opens URL in default browser
- In edit mode: click selects the widget, does NOT navigate
- In view mode: click opens the URL via Rust command `open_url(url)`
- Default size: 160x160

### Visual
- Square tile, glassmorphism background
- Centered vertically:
  - Icon at top: 40px, color var(--text-primary)
  - Label below: Inter 500, 14px, color var(--text-primary), max 2 lines with 
    ellipsis, centered
- Padding 16px
- On hover (edit or view): background brightens to var(--surface-hover), 
  icon scales 1.1, 200ms transition

### Settings popover (when selected in edit mode)
- URL input: text field, full width, placeholder "https://...", validates 
  on blur (must start with http:// or https://)
- Label input: text field, max 30 chars, placeholder "Label"
- Icon picker: grid of 20 common icons from lucide-react

Icon options for picker (use these lucide-react icons):
Link, Globe, Github, Twitter, Youtube, Instagram, Linkedin, Facebook, 
Twitch, Figma, Slack, Mail, Music, Image, FileText, Folder, Calendar, 
ShoppingCart, BookOpen, Code

Store icon name as string in widget.iconKey. Renderer maps string → component 
via a lookup table.

### URL validation
- Strip whitespace
- If no protocol, prepend https://
- Reject obviously invalid URLs (no dots, contains spaces, etc.)
- Show small red text below input if invalid: Inter 500 12px var(--danger)

## Rust command
Add to src-tauri/src/commands.rs:

```rust
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    use std::process::Command;
    Command::new("cmd")
        .args(["/C", "start", "", &url])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

Register it in main.rs invoke_handler.

Add the TS wrapper in src/lib/ipc.ts:
```ts
export const openUrl = (url: string) => invoke<void>('open_url', { url })
```

## Acceptance criteria
1. Click Link button → new link widget appears with default icon (Link) and 
   placeholder label "New Link"
2. Select it in edit mode → settings popover appears with URL, label, icon picker
3. Set URL to a real site (e.g. github.com) → on blur it becomes https://github.com
4. Pick a different icon → updates immediately
5. Switch to view mode, click the link → opens in default browser
6. In edit mode, click does NOT open the link (only selects)
7. Invalid URLs show error message
8. All settings persist across restarts

Code style: no comments, strict TS, no `any`.
```

---

## Phase 4: Image Widget

**Goal:** Add Image widget with file picker and local asset management.

### What's new in Phase 4
- **Image widget**: displays a local image file
- File picker via Tauri dialog
- Imported images copied to `%APPDATA%/Layer/assets/`
- Fit modes (cover/contain) and configurable corner radius
- Delete asset on widget delete

### Claude Code prompt for Phase 4

```
Phase 4 of Layer. Link widget is shipped. Now add the Image widget with proper 
local asset management.

# What to build

## Image widget
File: src/components/widgets/ImageWidget.tsx

### Behavior
- When user clicks Image button in sidebar → open Tauri file dialog filtered 
  to image files (png, jpg, jpeg, webp, gif)
- On file selected → call Rust import_asset → returns new path inside 
  %APPDATA%/Layer/assets/ → create widget with src = that path
- If user cancels dialog → don't create widget
- Default size: 240x240, fit "cover", rounded 12px

### Visual
- Pure image rendering, no border
- Use CSS object-fit based on widget.fit
- Apply border-radius: widget.rounded + "px"
- In edit mode: show a subtle 1px var(--border) outline so empty/transparent 
  images are still visible

### Settings popover (when selected in edit mode)
- Fit toggle: Cover / Contain — segmented control
- Rounded slider: 0 to 50, default 12, shows current value
- Replace image button: opens file picker again, calls import_asset, deletes 
  old asset

### On widget delete
- Call Rust delete_asset to remove the file from disk
- Important: only delete if no other widgets reference the same asset path

## Rust commands

Add to src-tauri/src/commands.rs:

```rust
#[tauri::command]
pub fn import_asset(app: tauri::AppHandle, source_path: String) -> Result<String, String> {
    use std::fs;
    use std::path::Path;
    
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let assets_dir = app_data.join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| e.to_string())?;
    
    let source = Path::new(&source_path);
    let ext = source.extension().and_then(|s| s.to_str()).unwrap_or("");
    let new_name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let dest = assets_dir.join(&new_name);
    
    fs::copy(source, &dest).map_err(|e| e.to_string())?;
    
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_asset(asset_path: String) -> Result<(), String> {
    use std::fs;
    if std::path::Path::new(&asset_path).exists() {
        fs::remove_file(&asset_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

Add uuid to Cargo.toml: `uuid = { version = "1", features = ["v4"] }`

## Frontend file picker
Use @tauri-apps/plugin-dialog:

```ts
import { open } from '@tauri-apps/plugin-dialog'

const filePath = await open({
  multiple: false,
  filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
})
```

Then call import_asset with the result.

## Loading images from disk
Tauri 2 requires using convertFileSrc to load local files in webview:

```ts
import { convertFileSrc } from '@tauri-apps/api/core'
const displaySrc = convertFileSrc(widget.src)
```

Use this in the img tag's src attribute.

Configure tauri.conf.json to allow the assets directory in asset protocol scope.

## Acceptance criteria
1. Click Image button → file picker opens, filtered to image types
2. Select an image → it's copied to %APPDATA%/Layer/assets/ with a UUID 
   filename, widget appears at canvas center
3. Image renders correctly with cover fit and 12px radius
4. Select widget → settings popover with fit toggle, rounded slider, replace button
5. Change fit to Contain → re-renders with letterboxing
6. Slide rounded to 50 → becomes fully circular (if square)
7. Replace image → old file deleted from disk, new one imported
8. Delete widget → asset file deleted from disk
9. App restart → all images load correctly from their stored paths
10. Move original source file after import → widget still works (because 
    we copied it)

Code style: no comments, strict TS.
```

---

## Phase 5: Video Widget

**Goal:** Add Video widget with similar asset management.

### What's new in Phase 5
- **Video widget**: plays a local video file
- Same import flow as images
- Autoplay, loop, mute controls
- Performance considerations for transparent webview

### Claude Code prompt for Phase 5

```
Phase 5 of Layer. Image widget is shipped. Now add the Video widget with 
similar asset management.

# What to build

## Video widget
File: src/components/widgets/VideoWidget.tsx

### Behavior
- Click Video button → Tauri file picker filtered to video files (mp4, webm, mov)
- On select → import_asset → create widget
- Default size: 320x180 (16:9), autoplay true, loop true, muted true

### Visual
- HTML5 video element
- object-fit: cover, border-radius: 12px (fixed, no customization in v1)
- In edit mode: subtle 1px var(--border) outline

### Settings popover (when selected in edit mode)
- Autoplay toggle
- Loop toggle
- Muted toggle
- Replace video button (same flow as image replace)

### Implementation
- video.autoplay = widget.autoplay
- video.loop = widget.loop
- video.muted = widget.muted (must be true for autoplay to work in webview)
- Use convertFileSrc(widget.src) for the src attribute
- Add playsInline attribute
- preload="metadata" to avoid loading entire file on app start

### Performance notes
- When in view mode and autoplay is true, videos play
- When the widget is off-screen due to viewport, the browser handles 
  throttling automatically — no manual intervention needed in v1
- If user adds 10+ videos and performance suffers, that's a v2 problem 
  (intersection observer based pause)

## Reuse from Phase 4
- Same import_asset and delete_asset Rust commands
- Same file picker pattern (just different extensions filter)
- Same asset cleanup on widget delete

## Acceptance criteria
1. Click Video button → file picker opens, filtered to mp4/webm/mov
2. Select video → imported to assets folder, widget appears, video starts 
   playing muted and looping
3. Select widget → settings popover with 3 toggles + replace button
4. Toggle autoplay off → video pauses
5. Toggle loop off → video plays once and stops
6. Toggle muted off → audio plays (test with a video that has audio)
7. Replace video → old file deleted, new one imported
8. Delete widget → file removed from disk
9. App restart → videos load and behave per their saved settings

Code style: no comments, strict TS.
```

---

## Phase 6: Settings + Polish + Ship

**Goal:** Settings panel, hotkey customization, app icon, installer.

### What's new in Phase 6
- Global settings panel (gear icon in sidebar)
- Custom hotkey
- Adjustable grid size
- Snap toggle
- App icon designed
- Windows installer built with `tauri build`
- Startup-on-boot option

### Claude Code prompt for Phase 6

```
Phase 6 of Layer — the final phase. Video widget is shipped. Now add settings 
panel, polish, and prepare for distribution.

# What to build

## Settings panel
- Trigger: gear icon at the bottom of the sidebar (above Reset)
- Opens a centered modal: 480x520, glassmorphism, 16px radius
- Backdrop: black at 40% opacity, blur 8px, click to close
- Animate in/out: scale 0.95 → 1, opacity 0 → 1, 200ms

### Settings fields

**Hotkey**
- Label: "Toggle edit mode"
- Input: clickable button showing current hotkey (e.g. "Ctrl + Shift + Space")
- On click: button shows "Press a key combination..." and listens for next 
  key event, captures, updates settingsStore.hotkey
- Must include at least one modifier (Ctrl, Shift, Alt, Meta)
- Re-register the hotkey with Rust when changed

**Grid size**
- Label: "Snap grid size"
- Slider: 8 to 40, default 20, shows "20px" current value

**Snap to grid**
- Label: "Snap widgets to grid"
- Toggle switch, default on

**Start with Windows**
- Label: "Launch Layer on startup"
- Toggle switch
- Uses tauri-plugin-autostart

**About**
- Section at bottom
- "Layer v1.0.0" in Inter 700 18px
- "a quiet layer on your desktop" in Inter 400 14px var(--text-secondary)
- Small "Quit Layer" link in var(--danger) that calls quit_app

## App icon
Design spec:
- 1024x1024 base size
- Background: rounded square, gradient from #1a1a1f top-left to #0d0d10 
  bottom-right, 22% corner radius (Apple-style)
- Foreground: uppercase "L" in Inter 700, white, centered, 60% of canvas height, 
  letter-spacing -2px
- Export to .ico (Windows) at sizes 16, 32, 48, 64, 128, 256
- Place in src-tauri/icons/

Generate this with the canvas-design skill or use a tool like 
https://realfavicongenerator.net to produce the .ico.

## Tauri build configuration

Update tauri.conf.json bundle section:
```json
{
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "identifier": "app.layer.desktop",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "publisher": "Layer",
    "category": "Productivity",
    "shortDescription": "A quiet layer on your desktop",
    "longDescription": "Drop widgets onto your desktop. Notes, clocks, links, images, videos. Customize your view, your way."
  }
}
```

Run `pnpm tauri build` to produce both .msi and .exe (NSIS) installers.

## Polish pass
- Audit all transitions for consistency (200ms ease-out standard, 300ms for 
  mode switch only)
- Verify keyboard shortcuts work in all phases (Delete, Esc, Ctrl+D, Ctrl+[, 
  Ctrl+])
- Test with 20+ widgets on screen for performance
- Verify all widgets persist correctly through restart
- Verify reset properly deletes all assets, not just the json
- Add empty state to canvas in edit mode when no widgets exist: 
  centered text "Add your first widget from the sidebar →" in Inter 500 
  16px var(--text-tertiary)

## Plugins to add
- tauri-plugin-autostart for launch-on-boot
- Already added in earlier phases: fs, dialog, global-shortcut

## Acceptance criteria
1. Gear icon opens settings modal with all 4 settings + about section
2. Changing hotkey re-registers it immediately and persists
3. Changing grid size updates snap behavior immediately
4. Snap toggle disables snapping in real time
5. Autostart toggle enables/disables launch on Windows boot
6. Quit link closes the app cleanly
7. App icon shows correctly in taskbar, alt-tab, and installer
8. Running pnpm tauri build produces a working .msi installer
9. Fresh install on a clean Windows machine launches correctly
10. No console errors, no TypeScript errors, no Rust warnings (or all 
    warnings explained)

Code style: no comments, strict TS.

After this phase ships I have a v1 product ready to distribute.
```

---

## Post-Launch Roadmap

Stuff to consider for v2+, in rough priority order:

### v1.1 (quick wins)
- Floating "edit" pill in view mode (small clickable button in corner that 
  enables interaction without the hotkey)
- Widget templates / presets ("desktop preset" library)
- Multi-select widgets (Shift+click, group drag)
- Undo/redo (last 20 actions)

### v1.2 (more widgets)
- Calendar widget (read-only, current month)
- Weather widget (free API like Open-Meteo)
- Quick note with markdown support
- RSS feed widget
- Spotify "now playing" widget (web API)

### v1.3 (power user)
- Workspaces (multiple canvases, switch with hotkey)
- Multi-monitor support (per-monitor canvas)
- Export/import canvas as .layer file (shareable)
- Custom themes (light mode, accent colors)

### v2.0 (bigger leap)
- macOS support
- Cloud sync via optional account (still local-first)
- Widget marketplace (community-built widgets)
- Scripting API (lightweight Lua or JS for custom widgets)

---

## Naming & Branding Reference

| Field | Value |
|-------|-------|
| Product name | Layer |
| Tagline | a quiet layer on your desktop |
| Bundle identifier | app.layer.desktop |
| Executable | layer.exe |
| AppData folder | %APPDATA%/Layer/ |
| Config file | %APPDATA%/Layer/canvas.json |
| Assets folder | %APPDATA%/Layer/assets/ |
| Window title | Layer |
| Default hotkey | Ctrl+Shift+Space |
| Primary font | Inter (Google Fonts) |
| Logo | Single uppercase "L" in Inter 700, white on translucent dark square, 12px radius |

---

## How to use this document

1. **Read sections 1–7** once to understand the whole picture
2. **Pick the phase you're on** (start with Phase 1)
3. **Copy the Claude Code prompt** for that phase verbatim
4. **Paste it as your first message** to Claude Code in an empty folder
5. **Validate the acceptance criteria** before moving to the next phase
6. **Don't skip phases** — each builds on the last

When you come back tomorrow or next week and forget where you were, this file 
tells you exactly what's done and what's next. That's the whole point.
