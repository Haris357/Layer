; Custom NSIS installer/uninstaller hooks for Layer.
; Wired up via tauri.conf.json -> bundle.windows.nsis.installerHooks.

; --- Uninstall cleanup --------------------------------------------------------
; Layer can register itself as the Windows screensaver: it copies its own exe to
; %LOCALAPPDATA%\Layer\Layer.scr and points HKCU "Control Panel\Desktop"
; SCRNSAVE.EXE at that copy (see src/screensaver.rs). The default uninstall only
; removes the install directory, so Windows would keep running the orphaned .scr.
;
; The path comes from the registry value itself, NOT $LOCALAPPDATA: on a
; per-machine install the uninstaller runs with SetShellVarContext all, where
; $LOCALAPPDATA is C:\ProgramData — the wrong folder — so the old cleanup never
; found the file and left the screensaver registered.
!macro NSIS_HOOK_PREUNINSTALL
  ReadRegStr $0 HKCU "Control Panel\Desktop" "SCRNSAVE.EXE"
  StrCmp $0 "" layer_ss_done

  ; Only touch Layer's own screensaver ("...\Layer\Layer.scr", compared
  ; case-insensitively). Anything else is the user's choice and is left alone —
  ; don't try to detect "missing" files either: this uninstaller is 32-bit, so
  ; C:\Windows\System32 is redirected and real built-in screensavers like
  ; Mystify.scr look missing.
  StrCpy $1 $0 "" -16
  StrCmp $1 "\Layer\Layer.scr" 0 layer_ss_done
    StrCpy $2 $0 -9 ; strip "Layer.scr" -> "...\Layer\"
    Delete "$0"
    Delete "$2screensaver-theme.txt"
    DeleteRegValue HKCU "Control Panel\Desktop" "SCRNSAVE.EXE"
    WriteRegStr HKCU "Control Panel\Desktop" "ScreenSaveActive" "0"

  layer_ss_done:
!macroend
