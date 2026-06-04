// Distribution channel. The Microsoft Store build sets VITE_DIST=store at
// build time (see scripts/build-msix.ps1). In Store builds we disable the
// in-app updater (the Store handles updates) and the features the MSIX
// sandbox can't do (installing a system screensaver, registry autostart).
export const IS_STORE = import.meta.env.VITE_DIST === 'store'
