<!--
  Release notes for the CURRENT version. The release workflow strips this
  comment and reuses the text for the GitHub release body, the in-app updater
  popup, the Layer-releases README changelog, AND (unless skipped) the
  subscriber email. REWRITE THIS BEFORE EACH TAG.
  This release intentionally skips the subscriber email: skip-email
-->
## 🎯 Quick Capture now works over any app, plus Hide All and monitor profiles

Layer v1.10.0.

- 🐛 **Quick Capture (Ctrl+Shift+N) now pops up over whatever you're using** — it was rendering behind other windows instead of on top, so it only ever seemed to work with nothing else open. Fixed.
- 🙈 **New: Hide everything, instantly** — `Ctrl+Shift+H` hides the whole canvas in one press (handy in public or before a screen share); press again to bring it back. Remappable in Settings → Shortcuts.
- 🖥️ **New: Layer remembers your setup** — switch between your office multi-monitor rig and your laptop, and Layer automatically switches to whichever Space you last used with that exact monitor setup. Fully automatic, nothing to configure.
- 📏 **New: Quick size presets** — right-click any widget for Small/Medium/Large sizing, scaled sensibly for that widget type.
- ✨ Reduced a visual flicker when adding new widgets.
- 🧹 Removed cloud sync and "export canvas as image." Everything now stays local — one less thing to configure, and one less service Layer depends on.

**Updates are automatic** — Layer will grab this in the background and let you relaunch when you're ready.
