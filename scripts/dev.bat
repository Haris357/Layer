@echo off
REM Launches Layer in dev mode with the MSVC + cargo environment set up.
call "C:\Program Files\Microsoft Visual Studio\18\Insiders\VC\Auxiliary\Build\vcvars64.bat" >nul
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
cd /d "C:\Projects\Layer"
npm run tauri dev
