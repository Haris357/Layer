# Layer

> a quiet layer on your desktop

A transparent, always-on-top desktop canvas for Windows. Press `Ctrl+Shift+Space`
to enter edit mode, drop widgets onto the canvas, arrange them however you want,
then press the hotkey again to make the window click-through.

Widgets include Notes, Clocks, World Clocks, Weather, a Now Playing media player
(with blurred album art), an Audio device switcher, a connected-notes Board,
Calendar (with iCal/.ics subscriptions), To-do, Countdown, Stats, Search, Links,
App launchers, a Shelf for files & folders, Images, Video, Galleries, and more.

## Get Layer

**[⬇️ Get it from the Microsoft Store](https://apps.microsoft.com/detail/9NL577X16L1N)** — recommended. One-click install, Microsoft-verified (no SmartScreen/antivirus warnings), and updates automatically through the Store.

Prefer a plain installer? Grab the latest
**[direct download](https://github.com/Haris357/Layer-releases/releases/latest)** —
these builds keep themselves up to date in the background:

- **Intel/AMD (x64):** `Layer-Setup.exe`
- **Windows on ARM (ARM64):** `Layer-Setup-arm64.exe` — native build, no emulation

Works on Windows 10 & 11.

---

The rest of this document is for building Layer from source.

## Prerequisites

- **Node.js** 18+ (installed)
- **Rust** toolchain — install from <https://rustup.rs> (`rustup`, `cargo`)
- **Tauri 2** system deps for Windows: WebView2 runtime (preinstalled on
  Windows 11) and the MSVC build tools.

## Install

```sh
npm install
npm run gen-icons   # regenerates src-tauri/icons (already generated)
```

## Develop

```sh
npm run tauri dev
```

Launches the transparent fullscreen overlay with hot reload.

## Build installers

```sh
npm run tauri build
```

Produces `.msi` and NSIS `.exe` installers under
`src-tauri/target/release/bundle/`.

## Usage

| Action | How |
|--------|-----|
| Toggle edit / view mode | `Ctrl+Shift+Space` (customizable in Settings) |
| Add a widget | Click it in the sidebar (edit mode) |
| Move / resize | Drag widgets; hold `Alt` to bypass grid snapping |
| Widget actions | Right-click a widget |
| Delete selected | `Delete` / `Backspace` |
| Duplicate selected | `Ctrl+D` |
| Layer order | `Ctrl+]` / `Ctrl+[` |
| Deselect | `Esc` or click empty canvas |

## Data location

- Canvas state: `%APPDATA%\Layer\canvas.json`
- Imported images/videos: `%APPDATA%\Layer\assets\`

## Notes

- v1 uses a **full click-through toggle**: the whole window is interactive in
  edit mode and fully click-through in view mode. Because of this, clicking a
  Link widget only works while in edit mode — per-region click-through (and a
  floating "edit" pill for view mode) is on the post-v1 roadmap.
- The frontend (`npm run build`) compiles and type-checks cleanly. The Rust
  shell needs the Rust toolchain installed before `tauri dev` / `tauri build`
  will run.
