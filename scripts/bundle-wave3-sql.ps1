# يدمج ترحيلات Wave-3 (008–010) في ملف واحد لنسخه إلى Cloudflare D1 Console
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Schema = Join-Path $Root "packages\database\schema"
$Out = Join-Path $Schema "_wave3_bundle.sql"

$files = @(
  "008_yom_himma.sql",
  "009_complex_settings.sql",
  "010_semester_plans.sql",
  "011_gm_structure.sql",
  "012_gm_phase2.sql",
  "013_general_supervisor.sql",
  "014_student_attendance.sql"
)

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine("-- Basateen Wave-3 bundle (008 + 009 + 010)")
[void]$sb.AppendLine("-- Paste into: Cloudflare Dashboard > D1 > basateen > Console")
[void]$sb.AppendLine("")

foreach ($name in $files) {
  $path = Join-Path $Schema $name
  if (-not (Test-Path $path)) {
    throw "Missing: $path"
  }
  [void]$sb.AppendLine("-- ========== $name ==========")
  [void]$sb.AppendLine((Get-Content -Path $path -Raw -Encoding UTF8))
  [void]$sb.AppendLine("")
}

Set-Content -Path $Out -Value $sb.ToString() -Encoding UTF8 -NoNewline
Write-Host "Written: $Out" -ForegroundColor Green
Write-Host ""
Write-Host "Next: Cloudflare Dashboard > Workers & Pages > D1 > basateen > Console" -ForegroundColor Cyan
Write-Host "Paste the file contents and Run." -ForegroundColor Cyan
