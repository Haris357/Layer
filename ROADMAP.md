# Layer — task backlog

Working list, roughly priority-ordered. We tackle these one at a time. Check off
as shipped. (E = rough effort: S/M/L.)

---

## P0 — Bugs (fix before features)
- [x] **"Setup/template changes by itself randomly"** — FIXED. Two causes: the
      hot-corner fired on a 3px touch (now requires a ~300ms dwell), and a cloud
      restore applied the remote `activeId` (now keeps your current space).
- [ ] **Cut the release (was 1.5.1 → now 1.6.0)** — commit everything + run the
      release workflow + build/upload the MSIX. Bundles the whole session's work.

## P0 — Platform & device robustness
The stuff real users are already hitting. An overlay that spans the whole
virtual desktop is unusually sensitive to hardware spread.

- [~] **Native ARM64 build** _(E: M)_ — kills the emulation battery drain.
      - [x] **Store MSIX**: `build-msix.ps1 -Arm64` → `Layer-arm64.msix`
            (manifest `ProcessorArchitecture=arm64`); manifest arch is now a
            placeholder. Needs `rustup target add aarch64-pc-windows-msvc` + the
            VS ARM64 build-tools component. Submit both msix in one submission.
      - [x] **Direct download + auto-update (CI)**: `release.yml` now has a
            non-blocking `build-arm64` job on a `windows-11-arm` runner;
            `make-latest-json.mjs` emits a `windows-aarch64` entry when an ARM64
            bundle is present; publish ships versioned + stable ARM64 installers.
            If the ARM job fails, x64 still releases. **Verify on next tag.**
- [ ] **Mixed-DPI multi-monitor correctness** _(E: M/L)_ — `window.rs` covers the
      desktop in physical px and `useHitRegions` uses a single `devicePixelRatio`.
      On mixed-scale setups (e.g. 4K@150% + 1080p@100%) widget placement and the
      click-through hit-regions can drift on the secondary monitor. Audit + fix
      the coordinate mapping. **Audit first to confirm exact behavior.**
- [ ] **Per-display widget binding + hotplug (general, N monitors)** _(E: M/L)_ —
      **user-reported.** Today, removing a display makes its widgets jump onto a
      remaining screen and land in a random spot, and the scale changes randomly.
      Generalize for **any number of displays (1, 2, 3+)** and **any** connect /
      disconnect / rearrange combination:
      - Each widget is **bound to a specific display by a stable id** (EDID /
        device path / GUID — NOT the monitor index, which reshuffles on hotplug).
      - A widget **only renders when its display is connected**; it never reflows
        onto another screen. When that display returns, it reappears in place.
      - Persist widget positions **per display** (coords relative to that
        display's origin), so layouts survive docking/undocking and reordering.
      - Keep **DPI/scale stable per display** across hotplug — no random rescale.
      - Optional: a "move to this monitor" action + a fallback for widgets whose
        display is permanently gone (show on primary, flagged, not lost).
      Supersedes the mixed-DPI item's monitor concerns; do the coordinate/DPI
      audit as part of this. **Plan ready → `docs/plans/multi-display.md`**
      (root cause: widgets use global coords + index-keyed monitors; fix = bind to
      a stable display id + per-display coords + per-display DPI).
- [ ] **WebView2-missing UX** _(E: S)_ — installer uses the download bootstrapper,
      but if WebView2 is absent and the download fails the window renders blank.
      Add a graceful message / guard.

## P1 — Finish & verify recent work
- [ ] **Verify v1.5.0 audio switching on real hardware** _(E: S)_ — the
      `IPolicyConfig` default-device switch is unverified in a real run. Confirm
      output + input switching works; if a device won't switch, fall back to the
      alternate `IPolicyConfig` GUID variant.
- [ ] **Layer Dock — decide & finish or remove** _(E: M)_ — the in-window version
      works but the design wasn't loved; floating-over-apps froze (separate
      always-on-top window vs the main window's z-order pinning). Either polish
      the in-window dock to a design you like, or remove it cleanly. Parked.

## P1 — Feature requests (from users)
- [x] **Blurred album art in Now Playing** — DONE. Rust reads the SMTC thumbnail
      (cached per track, `poll_op` so non-Send streams stay on-thread) → base64
      data URL; widget renders it blurred behind the content with a dim overlay.
- [x] **Milanote-style connected notes (Board widget)** — DONE ✅ — draggable
      cards + SVG bezier connectors, drag-to-connect, per-card colors, cascade
      delete. Also fixed the pre-existing missing `'audio'` in `KNOWN_TYPES`.
- [x] **Calendar connection** — **iCal/.ics subscriptions DONE** ✅ (covers Google
      secret-iCal address, Proton/Outlook share links, any .ics URL). Read-only
      external events merged into the widget; managed in the Calendar widget's
      settings gear. Zero deps / no API keys. **Google OAuth dropped** — iCal
      already covers Google, no need for paid/OAuth setup.
- [x] **"Buy me a coffee" / support link** — DONE. Link in Settings → About,
      gated `!IS_STORE` (hidden in the Store build). Set `SUPPORT_URL` to your
      real Ko-fi / GitHub Sponsors handle.

## P1 — Widget tweaks (user-requested, quick wins) — DONE ✅
- [x] **Link: custom / arbitrary URLs** — `normalizeUrl` loosened (accepts explicit
      schemes incl. `http://localhost:3000/`, ports, custom schemes; no dotted-host rule).
- [x] **Link: full lucide icon picker** — searchable list over the whole lucide set.
- [x] **Stats / DiskInfo: choose which disk** — Settings drive picker via `getDisks`.
- [x] **Search: custom search engine** — `engine:'custom'` + `customUrl` (`%s` template).
- [x] **Shelf: folders too** — `shelf_import` branches on `is_dir`; folder entries open
      in Explorer; "Add folder" button + drag-drop. tsc + cargo check clean.

## P2 — Feature ideas (verify still open before building)
- [ ] **Lo-fi / ambient sound** — focus sounds (rain, café, brown noise) built
      **into the Pomodoro widget**, not standalone.
- [ ] **Widget automations** — small inter-widget links (Pomodoro done → habit +1;
      todo checked → confetti).
- [ ] **Screensaver themes** — pickable ambient styles (photo slideshow, quotes,
      minimal clock) on top of the existing ambient view.

## P3 — Distribution (all-free, no paid signing)
- [ ] **winget manifest** — submit to winget-pkgs so `winget install Layer` works.
- [ ] **Scoop manifest** — add to a bucket for `scoop install layer`.

## Edges — acknowledge, low priority (degrade gracefully, don't over-engineer)
- [ ] RDP / VM / software-rendering: layered transparency renders black/slow —
      document as a known limitation (don't fight it).
- [ ] Initial window is hardcoded `1920×1080 @ (0,0)` then re-fit by Rust → brief
      mis-size flash on HiDPI/odd resolutions. Cosmetic.
- [ ] High-contrast / forced-colors mode + RTL locales — minor styling gaps.

---

## Done recently (for context)
- v1.5.0: Audio Devices widget, resizable digital clock.
- Microsoft Store launch (MSIX), website Store-primary CTAs, announcement email.
- Cloud Sync (email OTP), per-widget color, light/dark theming.
- Spaces, peek gesture, wallpaper-reactive theming, web-embed widget,
  per-monitor screensaver.
