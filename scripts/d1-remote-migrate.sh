#!/usr/bin/env bash
# ترحيل D1 السحابية — يُشغَّل من GitHub Actions (Ubuntu) أو Linux/macOS
# الاستخدام: ./scripts/d1-remote-migrate.sh upgrade|all|demo|apply-pending|060|...
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
    return 0
  else
    echo "::error::Failed: $file"
    return 1
  fi
}

record_migration() {
  local file="$1"
  npx wrangler d1 execute basateen --remote --command \
    "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('${file}');" \
    >/dev/null 2>&1 || true
}

ensure_tracking_table() {
  run_sql "000_migrations_applied.sql"
  record_migration "000_migrations_applied.sql"
}

list_pending_migrations() {
  ensure_tracking_table
  local applied
  applied="$(npx wrangler d1 execute basateen --remote --command \
    "SELECT name FROM _migrations_applied ORDER BY name;" --json 2>/dev/null \
    | node -e "
      let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
        try {
          const j=JSON.parse(d);
          const rows=j[0]?.results ?? [];
          console.log(rows.map(r=>r.name).join('\n'));
        } catch { console.log(''); }
      });
    ")"
  for f in $(ls -1 "$SCHEMA" | grep -E '^[0-9]{3}_.+\.sql$' | sort); do
    if ! echo "$applied" | grep -qxF "$f"; then
      echo "$f"
    fi
  done
}

apply_pending() {
  echo "D1 remote migrate: apply-pending (tracked)"
  local pending=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && pending+=("$line")
  done < <(list_pending_migrations)

  if [[ ${#pending[@]} -eq 0 ]]; then
    echo "No pending migrations."
    return 0
  fi

  echo "Pending (${#pending[@]}): ${pending[*]}"
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
  apply-pending)
    apply_pending
    ;;
  048)
    echo "D1 remote migrate: 048 competition engine (teacher tasks rename + platform tables)"
    cd "$API_DIR"
    npm run db:remote:048
    ;;
  competition-stack)
    echo "D1 remote migrate: 045–056 competition engine stack"
    cd "$API_DIR"
    npm run db:remote:competition-stack
    ;;
  051)
    echo "D1 remote migrate: 051 competition task input_type"
    npm run db:remote:051
    ;;
  052)
    echo "D1 remote migrate: 052 sird periods matrix"
    npm run db:remote:052
    ;;
  053)
    echo "D1 remote migrate: 053 competition criterion_id"
    npm run db:remote:053
    ;;
  054)
    echo "D1 remote migrate: 054 tasks_snapshot columns"
    npm run db:remote:054
    ;;
  055)
    echo "D1 remote migrate: 055 competition_logs metrics_json"
    npm run db:remote:055
    ;;
  056)
    echo "D1 remote migrate: 056 student memorization_faces"
    npm run db:remote:056
    ;;
  057)
    echo "D1 remote migrate: 057 competitions.created_by_user_id"
    cd "$API_DIR"
    npm run db:remote:057
    ;;
  058)
    echo "D1 remote migrate: 058 circles/tracks assignee FK ON DELETE SET NULL"
    cd "$API_DIR"
    npm run db:remote:058
    ;;
  059)
    echo "D1 remote migrate: 059 whatsapp absence template column"
    cd "$API_DIR"
    npm run db:remote:059
    ;;
  060)
    echo "D1 remote migrate: 060 semester historical snapshots"
    cd "$API_DIR"
    npm run db:remote:060
    ;;
  061)
    run_sql "061_staff_role_assignment_cleanup.sql"
    ;;
  062)
    run_sql "062_stage_id_backfill.sql"
    ;;
  063)
    run_sql "063_security_hardening.sql"
    ;;
  *)
    echo "Usage: $0 upgrade|all|demo|apply-pending|048|competition-stack|051|052|053|054|055|056|057|058|059|060|061|062|063"
    exit 1
    ;;
esac

echo ""
echo "Done ($MODE)."
