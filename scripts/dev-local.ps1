# تشغيل المنصة محلياً (API + Web)
# الاستخدام من جذر المستودع: .\scripts\dev-local.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (-not (Test-Path "apps\api\.dev.vars")) {
  Copy-Item "apps\api\.dev.vars.example" "apps\api\.dev.vars"
  Write-Host "Created apps/api/.dev.vars from example"
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing root dependencies..."
  npm install
}

if (-not (Test-Path "apps\web\node_modules")) {
  Write-Host "Installing web dependencies..."
  npm install --prefix apps/web
}

if (-not (Test-Path "apps\api\node_modules")) {
  Write-Host "Installing API dependencies..."
  npm install --prefix apps/api
}

Write-Host ""
Write-Host "Starting API (8787) + Web (5173)..."
Write-Host "First time? Run: npm run setup:local"
Write-Host ""

npm run dev
