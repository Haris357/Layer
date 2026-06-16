# Layer — Microsoft Store (MSIX) build

Layer ships to the Store as a **full-trust Win32 MSIX** (Desktop Bridge). The
Store signs it for you, distributes it, and delivers updates — so the in-app
updater is disabled in this build.

## 1. Fill the identity (one time)

After reserving the app name in Partner Center (reserved as **Layer-Desktop**),
open **Partner Center → your app → Product management → Product identity** and
copy the three values into [`identity.json`](./identity.json):

| identity.json key      | Partner Center field        | looks like                 |
| ---------------------- | --------------------------- | -------------------------- |
| `identityName`         | Package/Identity **Name**   | `1234HarisDev.Layer-Desktop` |
| `publisher`            | **Publisher**               | `CN=ABCD1234-…`            |
| `publisherDisplayName` | **Publisher display name**  | `HarisDev`                 |

The `publisher` must match exactly or the Store rejects the upload.

## 2. Build the MSIX

From a shell with the MSVC toolchain (the same env you use for `tauri build`,
e.g. after `vcvars64.bat`):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-msix.ps1 -Build
```

This builds the release exe with the **Store profile** (`VITE_DIST=store`),
stages it with the tile logos + manifest, generates `resources.pri`, and packs
`src-tauri/msix/out/Layer.msix`. Upload that file to Partner Center **unsigned**
— Microsoft signs it.

### ARM64 (native, no emulation)

Build a native ARM64 package too so Snapdragon/Surface users don't run under x64
emulation (a battery/perf hit). One-time setup:

```powershell
rustup target add aarch64-pc-windows-msvc
```

…and install **"MSVC v143 - VS C++ ARM64 build tools"** (VS Installer →
Individual components). Then:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-msix.ps1 -Build -Arm64
```

That cross-compiles for `aarch64-pc-windows-msvc` and packs
`src-tauri/msix/out/Layer-arm64.msix` (manifest `ProcessorArchitecture=arm64`).
**Submit BOTH** `Layer.msix` and `Layer-arm64.msix` in the **same** Partner
Center submission — the Store gives each device the matching architecture (ARM64
to ARM PCs, x64 to everyone else).

> Bump `version` in `tauri.conf.json` before each Store submission (it becomes
> the 4-part MSIX version, e.g. `1.4.4` → `1.4.4.0`). The Store rejects a
> version that isn't higher than the last published one.

## 3. (Optional) Test locally before submitting

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-msix.ps1 -Build -SelfSign
```

Then import the generated `LayerTest.pfx` (password `layertest`) into
**Local Machine → Trusted People**, and install:

```powershell
Add-AppxPackage src-tauri/msix/out/Layer.msix
```

(The self-signed cert is for local sideloading only — never submit a
self-signed package to the Store.)

## 4. Submit

In Partner Center → your app → **Packages**, upload `Layer.msix`, then complete:

- **Listing**: description, 1–4 screenshots, category (Personalization /
  Productivity).
- **Privacy policy URL**: `https://layer-desktop.web.app/privacy`
- **Age ratings** questionnaire.
- Submit for certification (a few hours to a couple of days).

## Store-build differences (by design)

- **Updater off** — the Store updates the app.
- **Autostart** — registry autostart is sandboxed; the manifest declares a
  `StartupTask`, so users enable "Layer" under **Windows Settings → Apps →
  Startup**. (A future enhancement can toggle it in-app via the StartupTask API.)
- **System screensaver** — registering Layer as the Windows `.scr` screensaver
  isn't possible in the sandbox; the in-app preview (Ctrl+Shift+S) still works.
- **WebView2** — required at runtime; present on Win11 and current Win10. The
  manifest targets Win10 1809+ (`10.0.17763`).
