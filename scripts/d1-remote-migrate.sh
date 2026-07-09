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
  if npx wrangler d1 execute basateen --remote --yes --file="$path" >&2; then
    echo "OK: $file" >&2
    return 0
  else
    echo "::error::Failed: $file" >&2
    return 1
  fi
}

record_migration() {
  local file="$1"
  npx wrangler d1 execute basateen --remote --yes --command \
    "INSERT OR IGNORE INTO _migrations_applied (name) VALUES ('${file}');" \
    >/dev/null 2>&1 || true
}

unrecord_migration() {
  local file="$1"
  npx wrangler d1 execute basateen --remote --yes --command \
    "DELETE FROM _migrations_applied WHERE name = '${file}';" \
    >/dev/null 2>&1 || true
}

fetch_applied_migrations() {
  npx wrangler d1 execute basateen --remote --yes --command \
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

d1_query_json() {
  local sql="$1"
  npx wrangler d1 execute basateen --remote --yes --command "$sql" --json 2>/dev/null
}

# يتحقق من أثر الترحيل على المخطط (ليس مجرد صف في جدول التتبع)
# يطبع: applied | missing | unknown
# O(1) استعلامات لكل ترحيل محروس
migration_effect_status() {
  local file="$1"
  case "$file" in
    066_semester_plans_columns.sql)
      d1_query_json "PRAGMA table_info(student_semester_plans);" | node -e "
        let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
          try {
            const j=JSON.parse(d); const b=Array.isArray(j)?j[0]:j;
            const cols=new Set((b?.results??[]).map(r=>r.name));
            const need=['starts_at','ends_at','is_active','created_by_user_id'];
            console.log(need.every(c=>cols.has(c)) ? 'applied' : 'missing');
          } catch { console.log('unknown'); }
        });
      "
      ;;
    067_teacher_competition_task_types.sql)
      # يفضّل teacher_competition_tasks ثم competition_tasks (نفس منطق migrate-067)
      {
        d1_query_json "PRAGMA table_info(teacher_competition_tasks);"
        echo "---SPLIT---"
        d1_query_json "PRAGMA table_info(competition_tasks);"
      } | node -e "
        let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
          try {
            const parts=d.split('---SPLIT---');
            const parseCols=(raw)=>{
              try {
                const j=JSON.parse(raw||'[]'); const b=Array.isArray(j)?j[0]:j;
                return new Set((b?.results??[]).map(r=>r.name));
              } catch { return new Set(); }
            };
            const tCols=parseCols(parts[0]);
            const cCols=parseCols(parts[1]);
            const cols = tCols.size ? tCols : cCols;
            if (!cols.size) { console.log('unknown'); return; }
            console.log(cols.has('type') && cols.has('input_type') ? 'applied' : 'missing');
          } catch { console.log('unknown'); }
        });
      "
      ;;
    068_student_semester_plans_multi.sql)
      # مطبّق فقط إذا: duration_weeks موجود + الفهرس الفريد القديم غائب
      {
        d1_query_json "PRAGMA table_info(student_semester_plans);"
        echo "---SPLIT---"
        d1_query_json "PRAGMA index_list(student_semester_plans);"
      } | node -e "
        let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
          try {
            const parts=d.split('---SPLIT---');
            const info=JSON.parse(parts[0]||'[]');
            const idx=JSON.parse(parts[1]||'[]');
            const ib=Array.isArray(info)?info[0]:info;
            const xb=Array.isArray(idx)?idx[0]:idx;
            const cols=new Set((ib?.results??[]).map(r=>r.name));
            const indexes=(xb?.results??[]).map(r=>String(r.name));
            const hasDuration=cols.has('duration_weeks');
            const hasOldUnique=indexes.includes('idx_student_semester_plan_active');
            console.log(hasDuration && !hasOldUnique ? 'applied' : 'missing');
          } catch { console.log('unknown'); }
        });
      "
      ;;
    *)
      echo "unknown"
      ;;
  esac
}

ensure_tracking_table() {
  run_sql "000_migrations_applied.sql"
  record_migration "000_migrations_applied.sql"
}

# إزالة صفوف التتبع الكاذبة: ملف مُسجَّل لكن أثره غير موجود في المخطط
# السبب الجذري: bootstrap_tracking كان يعلّم كل ملفات schema كـ applied دون تنفيذ
reconcile_tracking_with_schema() {
  echo "Reconcile: verify tracked migrations against schema effects" >&2
  local applied_files=()
  local f
  while IFS= read -r f; do
    [[ -n "$f" ]] && applied_files+=("$f")
  done < <(fetch_applied_migrations)

  local status
  for f in "${applied_files[@]}"; do
    status="$(migration_effect_status "$f" | tr -d '[:space:]')"
    if [[ "$status" == "missing" ]]; then
      echo "  unmark false-applied: $f (schema effect missing)" >&2
      unrecord_migration "$f"
    fi
  done
}

list_pending_migrations() {
  ensure_tracking_table >&2
  reconcile_tracking_with_schema >&2

  local applied_files=()
  local f
  while IFS= read -r f; do
    [[ -n "$f" ]] && applied_files+=("$f")
  done < <(fetch_applied_migrations)

  # ترتيب معجمي = ترتيب رقمي لبادئة NNN_
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
    # ترحيلات محروسة (فحص أعمدة/فهارس) — لا تُنفَّذ كملف SQL خام فقط
    if [[ "$f" == "066_semester_plans_columns.sql" ]]; then
      if node "$API_DIR/scripts/migrate-066-remote.mjs"; then
        continue
      else
        failed=1
        break
      fi
    fi
    if [[ "$f" == "067_teacher_competition_task_types.sql" ]]; then
      if node "$API_DIR/scripts/migrate-067-remote.mjs"; then
        continue
      else
        failed=1
        break
      fi
    fi
    if [[ "$f" == "068_student_semester_plans_multi.sql" ]]; then
      if node "$API_DIR/scripts/migrate-068-remote.mjs"; then
        continue
      else
        failed=1
        break
      fi
    fi
    if run_sql "$f"; then
      record_migration "$f"
    else
      failed=1
      break
    fi
  done
  return "$failed"
}

# قاعدة إنتاج موجودة مسبقاً — تسجيل الترحيلات القديمة فقط (≤060)
# لا يُعلَّم 061+ أبداً هنا؛ تلك تُطبَّق عبر apply-pending / الأوامر المرقّمة
bootstrap_tracking() {
  echo "D1 remote migrate: bootstrap-tracking (legacy ≤060 only)" >&2
  ensure_tracking_table >&2
  local base num
  for f in "$SCHEMA"/[0-9][0-9][0-9]_*.sql; do
    [[ -f "$f" ]] || continue
    base="$(basename "$f")"
    num="${base%%_*}"
    # تخطّي غير الرقمي أو ≥061 — لا تُعلَّم كتطبيق كاذب
    if ! [[ "$num" =~ ^[0-9]{3}$ ]]; then
      continue
    fi
    if (( 10#$num >= 61 )); then
      echo "  skip (must apply for real): $base" >&2
      continue
    fi
    record_migration "$base"
    echo "  marked: $base" >&2
  done
  echo "Bootstrap done. Run: $0 apply-pending  (applies any schema file not in tracking)" >&2
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
  068)
    node "$API_DIR/scripts/migrate-068-remote.mjs"
    ;;
  *)
    echo "Usage: $0 upgrade|all|demo|apply-pending|bootstrap-tracking|048|061|062|063|064|065|066|067|068|..." >&2
    exit 1
    ;;
esac

echo "" >&2
echo "Done ($MODE)." >&2
