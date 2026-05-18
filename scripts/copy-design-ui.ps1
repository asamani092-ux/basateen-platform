# Run once from repo root to copy all UI components from the design guide:
#   powershell -ExecutionPolicy Bypass -File scripts/copy-design-ui.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$design = Join-Path $env:USERPROFILE "Downloads\basateen-design-guide"

if (-not (Test-Path $design)) {
  Write-Host "Design folder not found: $design"
  Write-Host "Edit `$design in this script to match your path."
  exit 1
}

$uiSrc = Join-Path $design "src\app\components\ui"
$uiDst = Join-Path $root "apps\web\src\app\components\ui"
$stylesSrc = Join-Path $design "src\styles"
$stylesDst = Join-Path $root "apps\web\src\styles"

New-Item -ItemType Directory -Force -Path $uiDst, $stylesDst | Out-Null
Copy-Item "$uiSrc\*" $uiDst -Recurse -Force
Copy-Item "$stylesSrc\*" $stylesDst -Recurse -Force

Write-Host "Copied UI -> $uiDst"
Write-Host "Copied styles -> $stylesDst"
Write-Host "Done. Files:" (Get-ChildItem $uiDst).Count
