# تطوير الواجهة فقط (افتراضي المشروع)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Test-Path "apps\web\node_modules")) {
  npm run install:ui
}

Write-Host "UI dev: http://localhost:5173" -ForegroundColor Cyan
Write-Host "API proxy: remote Worker (see apps/web/.env.development)" -ForegroundColor Yellow
npm run dev
