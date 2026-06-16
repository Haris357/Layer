# Plan: Per-display widget binding + hotplug (general, N monitors)

## The bug (root cause)
- Widgets store global virtual-desktop coords (`BaseWidget.x/y`, `types/widget.ts:35`)
  and render into one full-virtual-desktop canvas (`WidgetWrapper.tsx:75`,
  `bounds="parent"`). There is **no display binding** on a widget.
- On unplug, `start_hit_poll` shrinks the window to the new virtual desktop
  (`window.rs:343-350`), then `clampViewport` (`canvasStore.ts:486-508`, driven by
  `useResponsive`) yanks now-off-screen widgets to an edge of a remaining screen →
  the "jumps to a random place" behavior.
- DPI "random rescale": `monitorStore.ts:45,50-54` divides everything by a single
  `window.devicePixelRatio` for a virtual desktop that can hold mixed-DPI monitors;
  the value flips with whichever monitor the window origin lands on after hotplug.
- All monitor refs (`uiMonitor`, `notchMonitor`, `useAnchorMonitor`) key by **index**
  — indices reshuffle on hotplug. That's the instability.

## Approach
Bind each widget to a **stable display id** + store coords **relative to that
display**; render a widget only when its display is connected; never reflow.

### Step 1 — Rust: stable monitor id API (`list_displays`)
New command `list_displays() -> Vec<DisplayInfo { id, name, x, y, w, h, scale, primary }>`.
- Reuse `EnumDisplayMonitors` + `GetMonitorInfoW` (pattern in `notch.rs:208-251`),
  switch `MONITORINFO`→`MONITORINFOEXW` for `szDevice` (`\\.\DISPLAYn`).
- Stable `id`: `EnumDisplayDevicesW(szDevice, 0, &dd, EDD_GET_DEVICE_INTERFACE_NAME)`
  → `dd.DeviceID` (EDID-derived device-interface path, stable per physical panel).
  Fallback: hash(szDevice + resolution). Disambiguate identical models by position.
- `scale`: `GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI)/96` (needs `Win32_UI_HiDpi`) —
  fixes the random-DPI problem (stable per display).
- Add windows-sys features (`Win32_UI_HiDpi`, display-device symbols). Register in
  `lib.rs` handler; expose `listDisplays()` in `ipc.ts`. This becomes the single
  source of truth (replaces JS `availableMonitors()` + global-DPR math).
- ⚠️ Tauri's `availableMonitors()` name is NOT stable — fallback key only. Don't mix
  the two enumerations (different order).

### Step 2 — Data model (`types/widget.ts` BaseWidget)
Add `displayId?: string`, `dx?: number`, `dy?: number` (coords relative to that
display's origin). Keep `x/y` as live virtual-desktop coords for `Rnd`, but
`displayId`+`dx/dy` are the **persisted source of truth** (derive x/y on load).

### Step 3 — `monitorStore.ts` around stable ids
Populate from `listDisplays()`; carry `id/scale/primary`. Migrate
`uiMonitor`/`notchMonitor` from index → stable id.

### Step 4 — render mapping (`WidgetWrapper.tsx`)
`displayForWidget(widget, displays)`: present → place at `display.x+dx, display.y+dy`,
`bounds` = that display's rect; absent → **render null** (hidden, not lost);
legacy (no displayId) → migrate; gone-for-good → render on primary w/ `fallback` badge.
On drag/resize stop, rebind to whichever display it was dropped on (write displayId+dx/dy).

### Step 5 — connect/disconnect events
Emit `displays-changed` from `start_hit_poll` (and ideally `WM_DISPLAYCHANGE`);
`useMonitors.ts` listens + refreshes immediately (keep 5s poll as backstop, debounce).

### Step 6 — fix the clamp
Replace global `clampViewport` with **per-display** clamping (only within the bound
display, only when connected). Never clamp a widget whose display is disconnected.

### Step 7 — migration + fallback
On hydrate (`canvasStore.ts:335-353`): assign `displayId`+`dx/dy` from the display
containing the widget's current global x/y; if none, bind to primary `fallback:true`.
Reconnecting the display restores it in place.

### Step 8 — new-widget spawn
`CommandPalette.tsx:44-48` + `TopIsland.tsx:252-254` spawn centered on whole virtual
desktop → spawn centered on the anchor display + set displayId/dx/dy.

### Step 9 — align notch + settings pickers to stable ids (notch.rs:111-122 uses index).

## Files
window.rs, monitorStore.ts, canvasStore.ts, types/widget.ts, WidgetWrapper.tsx
(+ notch.rs, lib.rs, Cargo.toml, ipc.ts, useMonitors.ts, settingsStore.ts,
CommandPalette.tsx, TopIsland.tsx, useResponsive.ts)

## Risks
Two enumeration sources disagree on order (remove index correlation entirely);
mixed-DPI single-canvas is lossy (consider one container per display);
device path empty on virtual/remote displays (need solid fallback);
already-off-screen widgets in old saves (migrate to primary-fallback);
Rnd `bounds` vs snap interplay; event-before-resize race (debounce).
