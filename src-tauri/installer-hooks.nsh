; Custom NSIS installer/uninstaller hooks for Layer.
; Wired up via tauri.conf.json -> bundle.windows.nsis.installerHooks.

; --- Uninstall cleanup --------------------------------------------------------
; Layer can register itself as the Windows screensaver: it copies its own exe to
; %LOCALAPPDATA%\Layer\Layer.scr and points HKCU "Control Panel\Desktop"
; SCRNSAVE.EXE at that copy (see src/screensaver.rs). The default uninstall only
; removes the install directory, so the orphaned .scr is left behind and Windows
; keeps running it on idle. Clean both up here.
!macro NSIS_HOOK_PREUNINSTALL
  ; Remove the standalone screensaver copy + its theme sidecar.
  Delete "$LOCALAPPDATA\Layer\Layer.scr"
  Delete "$LOCALAPPDATA\Layer\screensaver-theme.txt"

  ; Clear the screensaver setting ONLY if it now points at a missing file (i.e.
  ; the Layer.scr we just deleted, or any other dangling one). If it points at a
  ; real screensaver the user picked, leave it untouched.
  ReadRegStr $0 HKCU "Control Panel\Desktop" "SCRNSAVE.EXE"
  StrCmp $0 "" layer_ss_done
  IfFileExists "$0" layer_ss_done
    DeleteRegValue HKCU "Control Panel\Desktop" "SCRNSAVE.EXE"
    WriteRegStr HKCU "Control Panel\Desktop" "ScreenSaveActive" "0"
  layer_ss_done:
!macroend
