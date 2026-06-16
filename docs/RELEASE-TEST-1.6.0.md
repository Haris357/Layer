# Layer 1.6.0 — pre-release test checklist

Test on a **clean restart**: close the running app, Ctrl+C the dev terminal,
clear the Vite cache (`rm -rf node_modules/.vite`), restart the dev bat. For the
final pass, test the **built** app (`npm run tauri build`) too, not just dev.

Tip: most of this session's work is visual/interaction — go slowly and actually
look. Mark ✅/❌ per line.

---

## 0. Smoke / no-regression (do first)
- [ ] App launches; widgets from your saved space appear in place.
- [ ] Hotkey toggles edit/view mode; widgets are click-through in view mode.
- [ ] No freezes, no "not responding", dock + widgets stay responsive.
- [ ] Add one of each existing widget from the bar — none error.

## 1. Visual cleanup (the artifacts we removed)
- [ ] **No drop-shadow halos** anywhere — widgets, top bar, tooltips, menus sit
      flat with just a 1px border (no dark glow on the wallpaper).
- [ ] **No blur/smear** on hover, on the top bar, or behind tooltips.
- [ ] **No ambient blobs** — the right-side "circular glow" is gone; no drifting
      color clouds; no rain/snow.
- [ ] Settings → Appearance has **no "Ambient effects" toggle** anymore.
- [ ] Try a **bright wallpaper** (the earlier bug showed on bright bg) — panels
      look clean, no murky band by the right edge.

## 2. Bug fixes
- [ ] **Reset this space**: click the ↺ icon once → it arms (turns red/triangle).
      Move the mouse away / wait ~3s → it disarms (no wipe). Click it twice fast
      → space resets. (Ctrl+Z restores.)
- [ ] **Hot corner** (enable in Settings → General): a quick bump into the
      top-left corner does NOT switch spaces; you must **park** the cursor there
      ~0.3s to cycle. With it off, corner does nothing.
- [ ] **Spaces don't switch on their own** during normal use.
- [ ] If you use **Cloud Sync** on 2 devices: launching one doesn't yank your
      active space to the other device's.

## 3. Now Playing (big rework — test thoroughly)
Play something in **Spotify** (gives art + title + source), then:
- [ ] **Album art** shows blurred behind the content.
- [ ] A **color wash** tints the card to match the album; text stays readable.
- [ ] The **source badge** reads "SPOTIFY" (or the right app).
- [ ] **Change track** → the art + color **cross-fade** smoothly (no hard snap).
- [ ] **Play/Pause** is a **single, instant** toggle (no 3–5s lag, no double
      toggle / flicker). Next/Prev are snappy too.
- [ ] **Volume knob** works; the number updates.
- [ ] **Resize** the widget narrow/short → the volume knob **hides cleanly**
      (never clips); it can't be shrunk small enough to cut the knob off.
- [ ] Nothing playing → calm "Nothing playing" state.
- [ ] A source with no art (some browsers) → falls back to the flat card.

## 4. New widgets
### Audio Devices
- [ ] Add it. Output + Input devices list; current default has a check.
- [ ] Click another **output** (e.g. headphones↔speakers) → system default
      switches (verify audio actually moves). Repeat for **input** (mic).
- [ ] Plug/unplug a device → list updates within a few seconds.
- [ ] Settings: Both / Output / Input filter works.

### Board (connected notes)
- [ ] Add the **Board** widget. Click **+** → a card appears; type in it.
- [ ] **Drag** a card by its grip — moves smoothly; the outer widget doesn't move.
- [ ] Drag from a card's **connection dot** to another card → a **curved
      connector** with an arrow is created.
- [ ] **Delete** a card → its connectors disappear too.
- [ ] **Delete** a connector (click the line).
- [ ] Change a card's **color**.
- [ ] **Reload the app** → the board (cards + connections) **persists**. ← critical
      (this also confirms the `KNOWN_TYPES` fix; verify the **Audio** widget
      persists on reload too, since that was fixed in the same change).

### Calendar subscriptions (iCal)
- [ ] Add a **Calendar** widget → open its **settings gear** → paste an `.ics`
      URL (Google "secret address in iCal format", or a Proton/Outlook share
      link, or any public `.ics`), pick a color, **Add**.
- [ ] Within a few seconds, **external events appear** color-coded.
- [ ] Click an external event → opens **read-only** ("From a subscribed calendar").
- [ ] Your own local events still add/edit/delete normally.
- [ ] Toggle a source **Off** → its events disappear; **remove** → gone.
- [ ] Bad URL → shows "Couldn't load", doesn't crash.
- [ ] Recurring events show on the right days (simple repeats; complex `BYDAY`
      lists are approximated — known limitation).

## 5. Widget tweaks
- [ ] **Link – URLs**: set a Link to `http://localhost:3000/` → saves (no "invalid
      URL"); double-click opens it. Try a custom scheme (e.g. `obsidian://...`).
- [ ] **Link – icons**: open Link settings → **search icons** (type "calendar",
      "rocket"…) → pick from the full lucide set; it applies.
- [ ] **Search – custom engine**: settings → Custom → enter `https://…/?q=%s` →
      searching substitutes the query. Built-in Google/Bing/DDG still work.
- [ ] **Stats/DiskInfo – disk picker**: settings → choose a different drive →
      widget shows that disk.
- [ ] **Shelf – folders**: "Add folder" (or drag a folder in) → a folder entry
      appears; clicking it **opens the folder in Explorer**. Files still work.
- [ ] **Clock resize**: digital clock → resize the widget → the time **scales**
      with it (font grows/shrinks). Analog + Display already scaled.

## 6. Support link
- [ ] **Dev / direct-download build**: Settings → About shows **☕ Support Layer**
      → opens your Ko-fi/Sponsors URL. (Set `SUPPORT_URL` to your real handle!)
- [ ] **Store build** (`VITE_DIST=store`): the Support button is **hidden**.

## 7. Build / Store specifics
- [ ] `npm run tauri build` succeeds; install the NSIS exe; app runs.
- [ ] Store MSIX: `build-msix.ps1 -Build` packs `Layer.msix`; (optional)
      `-Arm64` packs `Layer-arm64.msix`.
- [ ] Store build: in-app updater is off; About shows the Store/▸rating button.

## NOT in this release (don't test / don't treat as bugs)
- **Multi-display per-monitor binding** — deferred to a later, tested release.
  Unplugging a monitor may still move widgets / rescale. Expected for now.
- **Layer Dock** — intentionally stashed (no dock should appear).
- Native Google OAuth calendar (iCal covers Google).
