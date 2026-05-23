#!/usr/bin/env bash
# ترحيل D1 السحابية — يُشغَّل من GitHub Actions (Ubuntu) أو Linux/macOS
# الاستخدام: ./scripts/d1-remote-migrate.sh upgrade|all|demo
set -u

MODE="${1:-upgrade}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA="$ROOT/packages/database/schema"
API_DIR="$ROOT/apps/api"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is required"
  exit 1
fi

cd "$API_DIR"
npm install

run_sql() {
  local file="$1"
  local path="$SCHEMA/$file"
  if [[ ! -f "$path" ]]; then
    echo "Missing: $path"
    exit 1
  fi
  echo ""
  echo ">>> $file"
  if npx wrangler d1 execute basateen --remote --file="$path"; then
    echo "OK: $file"
  else
    echo "::warning::Skipped or failed (often already applied): $file"
  fi
}

FILES_UPGRADE=(
  "006_students_extended.sql"
  "007_roles_mobile.sql"
  "008_yom_himma.sql"
  "009_complex_settings.sql"
  "010_semester_plans.sql"
  "011_gm_structure.sql"
  "012_gm_phase2.sql"
  "013_general_supervisor.sql"
  "014_student_attendance.sql"
  "015_student_attendance_gs_source.sql"
  "016_competitions.sql"
  "017_student_edu_plans.sql"
  "019_prog_supervisor.sql"
  "020_teacher_full.sql"
)

FILES_ALL=(
  "001_core.sql"
  "002_admin.sql"
  "003_education.sql"
  "004_programs.sql"
  "005_seed.sql"
  "${FILES_UPGRADE[@]}"
)

case "$MODE" in
  upgrade)
    echo "D1 remote migrate: upgrade (006–020, no demo 018)"
    for f in "${FILES_UPGRADE[@]}"; do run_sql "$f"; done
    ;;
  all)
    echo "D1 remote migrate: full (001–020, no demo 018)"
    for f in "${FILES_ALL[@]}"; do run_sql "$f"; done
    ;;
  demo)
    echo "D1 remote migrate: demo examples only (018)"
    run_sql "018_edu_demo_examples.sql"
    ;;
  *)
    echo "Usage: $0 upgrade|all|demo"
    exit 1
    ;;
esac

echo ""
echo "Done ($MODE)."
