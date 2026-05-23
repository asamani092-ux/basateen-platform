# تثبيت محلي — يتجاوز فشل apps/api على Windows ARM64
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$isArm = ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") -or ($env:PROCESSOR_IDENTIFIER -match "ARM")

Write-Host "=== Basateen local install ===" -ForegroundColor Cyan
npm install
npm install --prefix apps\web

if ($isArm) {
  Write-Host ""
  Write-Host "Windows ARM64 detected." -ForegroundColor Yellow
  Write-Host "workerd (Wrangler) often fails with: Unsupported platform: win32 arm64 LE" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Choose ONE:" -ForegroundColor Yellow
  Write-Host "  A) Web only + remote API:  .\scripts\dev-web-remote.ps1" -ForegroundColor Green
  Write-Host "  B) Node.js x64 (emulated):  install Node 22 x64, then: npm install --prefix apps\api" -ForegroundColor Green
  Write-Host "  C) WSL2 Ubuntu:           npm install && npm run setup:local && npm run dev" -ForegroundColor Green
  Write-Host ""
  $tryApi = Read-Host "Try apps/api install anyway? (y/N)"
  if ($tryApi -ne "y" -and $tryApi -ne "Y") {
    Write-Host "Skipped apps/api. Web is ready." -ForegroundColor Green
    exit 0
  }
}

npm install --prefix apps\api
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "apps/api install failed — use option A, B, or C above." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "All packages installed." -ForegroundColor Green
