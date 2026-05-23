# Captures a clean screenshot of the Layer screensaver.
#
# The screensaver closes on any key/mouse input, so we can't press PrtScn.
# This minimizes everything, launches the screensaver, waits (no input), then
# grabs the screen straight to a PNG. Don't touch the mouse/keyboard until it
# says "Saved".
#
#   powershell -ExecutionPolicy Bypass -File scripts\capture-screensaver.ps1
#   ...optionally:  -Delay 8  -Out "C:\path\shot.png"

param(
  [int]$Delay = 6,
  [string]$Exe = "C:\Projects\Layer\layer-desktop\src-tauri\target\debug\layer.exe",
  [string]$Out = "C:\Projects\Layer\layer-web\public\screensaver.png"
)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

# Become DPI-aware BEFORE reading screen bounds, otherwise Windows hands back
# scaled-down logical sizes (e.g. 1536x960 on a 1920x1200 screen at 125%) and
# the capture comes out soft and not full resolution.
Add-Type @"
using System.Runtime.InteropServices;
public static class Dpi { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); }
"@
[Dpi]::SetProcessDPIAware() | Out-Null

if (-not (Test-Path $Exe)) { Write-Error "Layer exe not found: $Exe"; exit 1 }

# Make sure the destination folder exists (Pictures is often a OneDrive
# redirect that isn't on this path, which is what made GDI+ fail before).
$dir = Split-Path -Parent $Out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

# Clear the screen so nothing (including this terminal) sits over the shot.
(New-Object -ComObject Shell.Application).MinimizeAll()
Start-Sleep -Milliseconds 600

Start-Process -FilePath $Exe -ArgumentList "/s"
Write-Host "Screensaver launching - hands off the mouse & keyboard for $Delay s..."
Start-Sleep -Seconds $Delay

$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
try {
  $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "Saved: $Out ($($b.Width)x$($b.Height)). Move the mouse to dismiss the screensaver."
} catch {
  Write-Error "Save failed: $($_.Exception.Message)"
} finally {
  $g.Dispose(); $bmp.Dispose()
}
