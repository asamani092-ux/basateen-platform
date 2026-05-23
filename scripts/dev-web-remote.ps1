# واجهة محلية + API المنشور (بدون Wrangler على Windows ARM64)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$envFile = Join-Path $Root "apps\web\.env.development.local"
$example = Join-Path $Root "apps\web\.env.development.local.remote"
if (-not (Test-Path $example)) {
  @"
VITE_API_PROXY_TARGET=https://winter-term-cb93.a-samani092.workers.dev
VITE_UI_DEV=true
"@ | Set-Content -Encoding utf8 $example
}
if (-not (Test-Path $envFile)) {
  Copy-Item $example $envFile
  Write-Host "Created apps/web/.env.development.local (UI preview + remote API proxy)"
} else {
  $content = Get-Content $envFile -Raw -ErrorAction SilentlyContinue
  if ($content -notmatch "VITE_UI_DEV") {
    Add-Content -Path $envFile -Value "VITE_UI_DEV=true"
    Write-Host "Added VITE_UI_DEV=true to .env.development.local"
  }
}

if (-not (Test-Path "apps\web\node_modules")) {
  npm install --prefix apps\web
}

Write-Host "Web: http://localhost:5173" -ForegroundColor Cyan
Write-Host "VITE_UI_DEV=true - mock API (no Worker required for UI work)" -ForegroundColor Green
Write-Host "Set VITE_UI_DEV=false in .env.development.local to use real remote API." -ForegroundColor Yellow
npm run dev --prefix apps\web
