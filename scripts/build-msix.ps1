<#
  Packages Layer as an MSIX for the Microsoft Store.

  Prereqs:
    - Windows 10/11 SDK (makeappx/makepri/signtool) — already installed.
    - src-tauri/msix/identity.json filled from Partner Center.
    - The release exe built. Pass -Build to build it here (needs the MSVC
      toolchain, e.g. run from a VS dev shell or after vcvars64.bat).

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts/build-msix.ps1 -Build
    powershell -ExecutionPolicy Bypass -File scripts/build-msix.ps1 -SelfSign   # local sideload test only

  Output: src-tauri/msix/out/Layer.msix
#>
param(
  [switch]$Build,
  [switch]$SelfSign,
  [switch]$Arm64
)

# Architecture: x64 (default) or arm64. ARM64 needs the Rust target
# (`rustup target add aarch64-pc-windows-msvc`) and the VS "MSVC ARM64 build
# tools" component installed. Output is Layer.msix / Layer-arm64.msix — submit
# BOTH to the same Partner Center submission so each device gets a native build.
$arch = if ($Arm64) { 'arm64' } else { 'x64' }
$rustTarget = if ($Arm64) { 'aarch64-pc-windows-msvc' } else { $null }
$pkgName = if ($Arm64) { 'Layer-arm64.msix' } else { 'Layer.msix' }

$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $PSScriptRoot          # layer-desktop
$tauri  = Join-Path $root 'src-tauri'
$msix   = Join-Path $tauri 'msix'
$stage  = Join-Path $msix 'staging'
$outDir = Join-Path $msix 'out'

function Find-SdkBin {
  $base = 'C:\Program Files (x86)\Windows Kits\10\bin'
  $ver = Get-ChildItem $base -Directory |
    Where-Object { $_.Name -match '^10\.' -and (Test-Path (Join-Path $_.FullName 'x64\makeappx.exe')) } |
    Sort-Object Name -Descending | Select-Object -First 1
  if (-not $ver) { throw "Windows SDK with makeappx.exe not found under $base" }
  return (Join-Path $ver.FullName 'x64')
}
$sdk = Find-SdkBin
$makeappx = Join-Path $sdk 'makeappx.exe'
$makepri  = Join-Path $sdk 'makepri.exe'
$signtool = Join-Path $sdk 'signtool.exe'

# --- identity + version -----------------------------------------------------
$idFile = Join-Path $msix 'identity.json'
$id = Get-Content $idFile -Raw | ConvertFrom-Json
if ($id.identityName -like 'REPLACE*' -or $id.publisher -like '*REPLACE*') {
  throw "Fill src-tauri/msix/identity.json with your Partner Center values first."
}
$conf = Get-Content (Join-Path $tauri 'tauri.conf.json') -Raw | ConvertFrom-Json
$ver4 = "$($conf.version).0"   # 1.4.3 -> 1.4.3.0 (MSIX needs 4 parts)
Write-Host "Packaging Layer $ver4  ($arch, identity: $($id.identityName))"

# --- build the exe (optional) ----------------------------------------------
# VITE_DIST=store bakes the Store behaviour into the embedded frontend (no
# in-app updater, no system-screensaver/registry-autostart). If you build the
# exe yourself instead of using -Build, set this env var first.
if ($Build) {
  Write-Host "Building release exe (Store profile, $arch)..."
  $env:VITE_DIST = 'store'
  Push-Location $root
  try {
    if ($rustTarget) {
      & npm run tauri build -- --no-bundle --target $rustTarget
    } else {
      & npm run tauri build -- --no-bundle
    }
  } finally { Pop-Location }
}
$exe = if ($rustTarget) {
  Join-Path $tauri "target\$rustTarget\release\Layer.exe"
} else {
  Join-Path $tauri 'target\release\Layer.exe'
}
if (-not (Test-Path $exe)) {
  throw "Layer.exe not found at $exe. Build it first (or pass -Build)."
}

# --- stage ------------------------------------------------------------------
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stage 'Assets') | Out-Null
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

Copy-Item $exe (Join-Path $stage 'Layer.exe')
Copy-Item (Join-Path $msix 'Assets\*') (Join-Path $stage 'Assets')

# fill manifest placeholders
$man = Get-Content (Join-Path $msix 'AppxManifest.xml') -Raw
$man = $man.Replace('__IDENTITY_NAME__', $id.identityName).
            Replace('__PUBLISHER__', $id.publisher).
            Replace('__PUBLISHER_DISPLAY__', $id.publisherDisplayName).
            Replace('__VERSION__', $ver4).
            Replace('__ARCH__', $arch)
$manPath = Join-Path $stage 'AppxManifest.xml'
Set-Content -Path $manPath -Value $man -Encoding UTF8

# --- resources.pri ----------------------------------------------------------
$priConfig = Join-Path $msix 'priconfig.xml'
& $makepri createconfig /cf $priConfig /dq en-US /o | Out-Null
Push-Location $stage
try {
  & $makepri new /pr $stage /cf $priConfig /of (Join-Path $stage 'resources.pri') /mn $manPath /o | Out-Null
} finally { Pop-Location }

# --- pack -------------------------------------------------------------------
$pkg = Join-Path $outDir $pkgName
& $makeappx pack /d $stage /p $pkg /o
if ($LASTEXITCODE -ne 0) { throw "makeappx failed ($LASTEXITCODE)" }
Write-Host "Built $pkg"

# --- optional self-sign for local sideload testing -------------------------
if ($SelfSign) {
  $pfx = Join-Path $msix 'LayerTest.pfx'
  $pwd = ConvertTo-SecureString 'layertest' -AsPlainText -Force
  if (-not (Test-Path $pfx)) {
    Write-Host "Creating a self-signed test cert (subject must match Publisher)..."
    $cert = New-SelfSignedCertificate -Type Custom -Subject $id.publisher `
      -KeyUsage DigitalSignature -FriendlyName 'Layer MSIX test' `
      -CertStoreLocation 'Cert:\CurrentUser\My' `
      -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
    Export-PfxCertificate -Cert "Cert:\CurrentUser\My\$($cert.Thumbprint)" -FilePath $pfx -Password $pwd | Out-Null
    Write-Host "NOTE: to install locally, import LayerTest.pfx into 'Trusted People' (Local Machine)."
  }
  & $signtool sign /fd SHA256 /a /f $pfx /p 'layertest' $pkg
  if ($LASTEXITCODE -ne 0) { throw "signtool failed ($LASTEXITCODE)" }
  Write-Host "Signed $pkg for local testing."
} else {
  Write-Host "Unsigned package ready for Partner Center upload (Microsoft signs it)."
}
