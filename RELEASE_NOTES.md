<!--
  Release notes for the CURRENT version. The release workflow strips this
  comment and reuses the text for the GitHub release body, the in-app updater
  popup, the Layer-releases README changelog, AND (unless skipped) the
  subscriber email. REWRITE THIS BEFORE EACH TAG.
  This release intentionally skips the subscriber email: skip-email
-->
## 🩹 Fix: Layer freezing after copying certain file paths

Layer v1.11.2.

- 🐛 **No more freezes from the clipboard** — copying a Windows file path that ends in a line number (like `C:\project\app.ts:142`) could freeze Layer completely, and the freeze came back every time Layer restarted. Fixed — and if you were stuck, this update unfreezes Layer on its own; you don't need to clear anything.
- 📋 **File paths with line numbers are recognized** — the Clipboard widget now shows paths like `app.ts:142` as paths.
- 🛡️ **Hardened everywhere** — we checked every pattern Layer uses on text you copy or type and fixed six more that could slow it down on very long or unusual text. A new automatic check now stops this kind of bug from ever shipping again.

Thanks to the community member who tracked this down and reported it.

**Updates are automatic** — Layer will grab this in the background and let you relaunch when you're ready.
