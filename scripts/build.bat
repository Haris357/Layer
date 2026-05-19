@echo off
REM Builds the Layer installers (.msi and .exe) with the MSVC + cargo environment.
call "C:\Program Files\Microsoft Visual Studio\18\Insiders\VC\Auxiliary\Build\vcvars64.bat" >nul
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
cd /d "C:\Projects\Layer"
npm run tauri build
echo.
echo Installers are in: src-tauri\target\release\bundle\
pause
