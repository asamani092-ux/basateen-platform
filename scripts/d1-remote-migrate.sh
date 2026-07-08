#!/usr/bin/env bash
# ترحيل D1 السحابية — يُشغَّل من GitHub Actions (Ubuntu) أو Linux/macOS
# الاستخدام: ./scripts/d1-remote-migrate.sh upgrade|all|demo|apply-pending|061|...
set -u

MODE="${1:-upgrade}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA="$ROOT/packages/database/schema"
API_DIR="$ROOT/apps/api"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_API_TOKEN is required" >&2
  exit 1
fi

cd "$API_DIR"
npm install >/dev/null 2>&1

run_sql() {
  local file="$1"
  local path="$SCHEMA/$file"
  if [[ ! -f "$path" ]]; then
    echo "Missing: $path" >&2
    exit 1
  fi
  echo "" >&2
  echo ">>> $file" >&2
  if npx wrangler d1 execute basateen --remote --file="$path" >&2; then
    echo "OK: $file" >&2
    return 0
  else
    echo "::error::Failed: $file" >&2
    return 1
  fi
}

record_migration() {
  local file="$1"
  npx wrangler d1 execute basateen --remote --command \
    "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('${file}');" \
    >/dev/null 2>&1 || true
}

fetch_applied_migrations() {
  npx wrangler d1 execute basateen --remote --command \
    "SELECT name FROM _migrations_applied ORDER BY name;" --json 2>/dev/null \
    | node -e "
      let d = '';
      process.stdin.on('data', (c) => (d += c));
      process.stdin.on('end', () => {
        try {
          const j = JSON.parse(d);
          const payload = Array.isArray(j) ? j[0] : j;
          const rows = payload?.results ?? payload?.result?.results ?? [];
          for (const row of rows) {
            if (row?.name) console.log(String(row.name));
          }
        } catch {
          /* empty — table may not exist yet */
        }
      });
    "
}

ensure_tracking_table() {
  run_sql "000_migrations_applied.sql"
  record_migration "000_migrations_applied.sql"
}

list_pending_migrations() {
  ensure_tracking_table >&2
  local applied_files=()
  local f
  while IFS= read -r f; do
    [[ -n "$f" ]] && applied_files+=("$f")
  done < <(fetch_applied_migrations)

  for f in "$SCHEMA"/[0-9][0-9][0-9]_*.sql; do
    [[ -f "$f" ]] || continue
    local base
    base="$(basename "$f")"
    local found=0
    for a in "${applied_files[@]}"; do
      if [[ "$a" == "$base" ]]; then
        found=1
        break
      fi
    done
    if [[ "$found" -eq 0 ]]; then
      echo "$base"
    fi
  done
}

apply_pending() {
  echo "D1 remote migrate: apply-pending (tracked)" >&2
  local pending=()
  local line
  while IFS= read -r line; do
    [[ -n "$line" ]] && pending+=("$line")
  done < <(list_pending_migrations)

  if [[ ${#pending[@]} -eq 0 ]]; then
    echo "No pending migrations." >&2
    return 0
  fi

  echo "Pending (${#pending[@]}):" >&2
  printf '  %s\n' "${pending[@]}" >&2

  local failed=0
  for f in "${pending[@]}"; do
    if run_sql "$f"; then
      record_migration "$f"
    else
      failed=1
      break
    fi
  done
  return "$failed"
}

# قاعدة إنتاج موجودة مسبقاً — تسجيل الترحيلات القديمة دون إعادة تنفيذها
bootstrap_tracking() {
  echo "D1 remote migrate: bootstrap-tracking (existing DB)" >&2
  ensure_tracking_table >&2
  local skip='^(061|062|063|064)_'
  for f in "$SCHEMA"/[0-9][0-9][0-9]_*.sql; do
    [[ -f "$f" ]] || continue
    local base
    base="$(basename "$f")"
    if [[ "$base" =~ $skip ]]; then
      continue
    fi
    record_migration "$base"
    echo "  marked: $base" >&2
  done
  echo "Bootstrap done. Run: $0 apply-pending  (will apply 061–063 only)" >&2
}

run_numbered_migration() {
  local file="$1"
  ensure_tracking_table >&2
  run_sql "$file"
  record_migration "$file"
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
  "021_reciter_gate.sql"
  "024_admin_department.sql"
  "024_admin_department_alters.sql"
  "025_admin_tweaks.sql"
  "026_edu_department_core.sql"
  "027_edu_mega_update.sql"
  "028_quranic_day_refactor.sql"
  "029_edu_hotfixes.sql"
  "030_programs_and_display_core.sql"
  "031_quiz_require_student_name.sql"
  "032_quiz_grading_and_display.sql"
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
    echo "D1 remote migrate: upgrade (006–020, no demo 018)" >&2
    for f in "${FILES_UPGRADE[@]}"; do run_sql "$f"; done
    ;;
  all)
    echo "D1 remote migrate: full (001–020, no demo 018)" >&2
    for f in "${FILES_ALL[@]}"; do run_sql "$f"; done
    ;;
  demo)
    echo "D1 remote migrate: demo examples only (018)" >&2
    run_sql "018_edu_demo_examples.sql"
    ;;
  apply-pending)
    apply_pending
    ;;
  bootstrap-tracking)
    bootstrap_tracking
    ;;
  048)
    echo "D1 remote migrate: 048 competition engine" >&2
    cd "$API_DIR"
    npm run db:remote:048
    ;;
  competition-stack)
    echo "D1 remote migrate: 045–056 competition engine stack" >&2
    cd "$API_DIR"
    npm run db:remote:competition-stack
    ;;
  051|052|053|054|055|056|057|058|059|060)
    cd "$API_DIR"
    npm run "db:remote:${MODE}"
    ;;
  061)
    run_numbered_migration "061_staff_role_assignment_cleanup.sql"
    ;;
  062)
    run_numbered_migration "062_stage_id_backfill.sql"
    ;;
  063)
    run_numbered_migration "063_security_hardening.sql"
    ;;
  064)
    run_numbered_migration "064_clear_must_change_password.sql"
    ;;
  065)
    run_numbered_migration "065_edu_daily_recitation_complex_date_index.sql"
    ;;
  066)
    node "$API_DIR/scripts/migrate-066-remote.mjs"
    ;;
  067)
    node "$API_DIR/scripts/migrate-067-remote.mjs"
    ;;
  *)
    echo "Usage: $0 upgrade|all|demo|apply-pending|bootstrap-tracking|048|061|062|063|064|065|066|067|..." >&2
    exit 1
    ;;
esac

echo "" >&2
echo "Done ($MODE)." >&2
