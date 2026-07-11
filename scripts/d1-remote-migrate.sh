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
  # ثلاث حالات صريحة: خطأ قراءة/تحليل → فشل؛ جدول فارغ → لا مخرجات؛ صفوف → أسماء
  local sql="SELECT name FROM _migrations_applied ORDER BY name;"
  local raw wr_rc=0
  raw="$(npx wrangler d1 execute basateen --remote --yes --command "$sql" --json 2>&1)" || wr_rc=$?

  local parsed
  parsed="$(printf '%s' "$raw" | node -e "
    const exitErr = (msg) => { console.error(msg); process.exit(1); };
    let d = '';
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => {
      const trimmed = d.trim();
      if (!trimmed) exitErr('fetch_applied_migrations: empty wrangler response');
      let j;
      try {
        j = JSON.parse(trimmed);
      } catch (e) {
        exitErr('fetch_applied_migrations: JSON parse error: ' + e.message);
      }
      if (j && typeof j === 'object' && !Array.isArray(j) && j.error) {
        exitErr('fetch_applied_migrations: ' + String(j.error));
      }
      const payload = Array.isArray(j) ? j[0] : j;
      if (!payload || typeof payload !== 'object') {
        exitErr('fetch_applied_migrations: unexpected response shape');
      }
      if (payload.success === false) {
        const detail = payload.error ?? payload.errors ?? 'query failed';
        exitErr('fetch_applied_migrations: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)));
      }
      const rows = payload.results ?? payload.result?.results;
      if (!Array.isArray(rows)) {
        exitErr('fetch_applied_migrations: missing results array');
      }
      if (rows.length === 0) {
        console.error('fetch_applied_migrations: tracking table empty (0 rows)');
        process.exit(2);
      }
      for (const row of rows) {
        if (row?.name) console.log(String(row.name));
      }
    });
  ")" || {
    local node_rc=$?
    if [[ "$node_rc" -eq 2 ]]; then
      return 0
    fi
    printf '%s\n' "$parsed" >&2
    return 1
  }

  if [[ "$wr_rc" -ne 0 ]]; then
    echo "fetch_applied_migrations: wrangler exited $wr_rc" >&2
    printf '%s\n' "$raw" >&2
    return 1
  fi

  printf '%s\n' "$parsed"
  return 0
}

load_applied_migrations() {
  # يفشل صراحةً عند خطأ قراءة التتبع — لا يُفسَّر أبداً كـ «لا شيء مطبّق»
  local out
  if ! out="$(fetch_applied_migrations)"; then
    echo "::error::Failed to read _migrations_applied (see errors above)" >&2
    return 1
  fi
  APPLIED_MIGRATIONS_BUFFER="$out"
  return 0
}

read_applied_into() {
  local -n _dest=$1
  _dest=()
  local line
  while IFS= read -r line; do
    [[ -n "$line" ]] && _dest+=("$line")
  done <<< "${APPLIED_MIGRATIONS_BUFFER:-}"
}

d1_query_json() {
  local sql="$1"
  # لا تُخفِ أخطاء wrangler — فشل الاستعلام كان يُرجع unknown ويُبقي صف تتبع كاذب
  npx wrangler d1 execute basateen --remote --yes --command "$sql" --json
}

# ترحيلات لها فحص أثر صريح في migration_effect_status (ليست trusted)
has_guarded_effect_check() {
  case "$1" in
    033_edu_central_event_weights.sql|062_stage_id_backfill.sql|066_semester_plans_columns.sql|067_teacher_competition_task_types.sql|068_student_semester_plans_multi.sql|069_plan_daily_followup.sql|070_competition_source.sql|071_users_staff_deleted_at.sql|072_display_slide_types.sql|073_display_media_r2_urls.sql)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# يتحقق من أثر الترحيل على المخطط (ليس مجرد صف في جدول التتبع)
# يطبع: applied | missing | unknown | unverified | trusted
# O(1) استعلامات لكل ترحيل محروس
#
# صيانة إلزامية: كل ترحيل جديد (066+) يجب إضافة case هنا بفحص أثر المخطط.
# بدون case يُعاد unverified ويُعامل كـ «غير مطبّق» في reconcile — لا يُقبل أبداً كمطبّق.
# unknown = فحص موجود لكن الاستعلام/التحليل فشل — يُزال الصف للترحيلات المحروسة (لا يُبقى تتبع كاذب).
migration_effect_status() {
  local file="$1"
  case "$file" in
    033_edu_central_event_weights.sql)
      d1_query_json "PRAGMA table_info(edu_settings);" | node -e "
        let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
          try {
            const j=JSON.parse(d); const b=Array.isArray(j)?j[0]:j;
            const cols=new Set((b?.results??[]).map(r=>r.name));
            const need=['himma_defaults_json','competition_defaults_json'];
            console.log(need.every(c=>cols.has(c)) ? 'applied' : 'missing');
          } catch { console.log('unknown'); }
        });
      "
      ;;
    062_stage_id_backfill.sql)
      {
        d1_query_json "SELECT name FROM sqlite_master WHERE type='table' AND name='stage_id_review_queue';"
        echo "---SPLIT---"
        d1_query_json "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_students_stage_complex';"
      } | node -e "
        let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
          try {
            const parts=d.split('---SPLIT---');
            const t=JSON.parse(parts[0]||'[]'); const i=JSON.parse(parts[1]||'[]');
            const tb=Array.isArray(t)?t[0]:t; const ib=Array.isArray(i)?i[0]:i;
            const hasTable=(tb?.results??[]).length>0;
            const hasIndex=(ib?.results??[]).length>0;
            console.log(hasTable && hasIndex ? 'applied' : 'missing');
          } catch { console.log('unknown'); }
        });
      "
      ;;
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
    069_plan_daily_followup.sql)
      {
        d1_query_json "PRAGMA table_info(student_semester_plans);"
        echo "---SPLIT---"
        d1_query_json "SELECT name FROM sqlite_master WHERE type='table' AND name='student_plan_days';"
        echo "---SPLIT---"
        d1_query_json "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_student_plan_days_plan';"
      } | node -e "
        let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
          try {
            const parts=d.split('---SPLIT---');
            const info=JSON.parse(parts[0]||'[]');
            const tbl=JSON.parse(parts[1]||'[]');
            const idx=JSON.parse(parts[2]||'[]');
            const ib=Array.isArray(info)?info[0]:info;
            const tb=Array.isArray(tbl)?tbl[0]:tbl;
            const xb=Array.isArray(idx)?idx[0]:idx;
            const cols=new Set((ib?.results??[]).map(r=>r.name));
            const hasRest=cols.has('rest_days');
            const hasTable=(tb?.results??[]).length>0;
            const hasIndex=(xb?.results??[]).length>0;
            console.log(hasRest && hasTable && hasIndex ? 'applied' : 'missing');
          } catch { console.log('unknown'); }
        });
      "
      ;;
    070_competition_source.sql)
      {
        d1_query_json "PRAGMA table_info(competitions);"
        echo "---SPLIT---"
        d1_query_json "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_competitions_complex_source';"
      } | node -e "
        let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
          try {
            const parts=d.split('---SPLIT---');
            const info=JSON.parse(parts[0]||'[]');
            const idx=JSON.parse(parts[1]||'[]');
            const ib=Array.isArray(info)?info[0]:info;
            const xb=Array.isArray(idx)?idx[0]:idx;
            const cols=new Set((ib?.results??[]).map(r=>r.name));
            const hasSource=cols.has('competition_source');
            const hasIndex=(xb?.results??[]).length>0;
            console.log(hasSource && hasIndex ? 'applied' : 'missing');
          } catch { console.log('unknown'); }
        });
      "
      ;;
    071_users_staff_deleted_at.sql)
      d1_query_json "PRAGMA table_info(users);" | node -e "
        let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
          try {
            const j=JSON.parse(d); const b=Array.isArray(j)?j[0]:j;
            const cols=new Set((b?.results??[]).map(r=>r.name));
            console.log(cols.has('deleted_at') ? 'applied' : 'missing');
          } catch { console.log('unknown'); }
        });
      "
      ;;
    072_display_slide_types.sql)
      {
        d1_query_json "PRAGMA table_info(display_media);"
        echo "---SPLIT---"
        d1_query_json "PRAGMA table_info(complex_settings);"
        echo "---SPLIT---"
        d1_query_json "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_display_media_slide_type';"
      } | node -e "
        let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
          try {
            const parts=d.split('---SPLIT---');
            const dm=JSON.parse(parts[0]||'[]'); const cs=JSON.parse(parts[1]||'[]'); const ix=JSON.parse(parts[2]||'[]');
            const dmb=Array.isArray(dm)?dm[0]:dm; const csb=Array.isArray(cs)?cs[0]:cs; const ixb=Array.isArray(ix)?ix[0]:ix;
            const dmCols=new Set((dmb?.results??[]).map(r=>r.name));
            const csCols=new Set((csb?.results??[]).map(r=>r.name));
            const needDm=['slide_type','competition_id','duration_seconds'];
            const hasDm=needDm.every(c=>dmCols.has(c));
            const hasCs=csCols.has('display_indicators_enabled');
            const hasIdx=(ixb?.results??[]).length>0;
            console.log(hasDm && hasCs && hasIdx ? 'applied' : 'missing');
          } catch { console.log('unknown'); }
        });
      "
      ;;
    073_display_media_r2_urls.sql)
      d1_query_json "SELECT COUNT(*) AS c FROM display_media WHERE media_url LIKE 'data:%';" | node -e "
        let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
          try {
            const j=JSON.parse(d); const b=Array.isArray(j)?j[0]:j;
            const c=Number((b?.results??[])[0]?.c ?? -1);
            console.log(c === 0 ? 'applied' : 'missing');
          } catch { console.log('unknown'); }
        });
      "
      ;;
    *)
      local num="${file%%_*}"
      if [[ "$num" =~ ^[0-9]{3}$ ]] && (( 10#$num >= 66 )); then
        echo "unverified"
      else
        echo "trusted"
      fi
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
  if ! load_applied_migrations; then
    return 1
  fi
  local applied_files=()
  read_applied_into applied_files

  local status
  for f in "${applied_files[@]}"; do
    status="$(migration_effect_status "$f" | tr -d '[:space:]')"
    if has_guarded_effect_check "$f"; then
      echo "  effect-check: $f => $status" >&2
    fi
    if [[ "$status" == "missing" ]]; then
      echo "  unmark false-applied: $f (schema effect missing)" >&2
      unrecord_migration "$f"
    elif [[ "$status" == "unverified" ]]; then
      echo "  unmark unverified: $f (no effect check — add migration_effect_status case)" >&2
      unrecord_migration "$f"
    elif [[ "$status" == "unknown" ]]; then
      if has_guarded_effect_check "$f"; then
        echo "  unmark inconclusive: $f (guarded effect check failed — will re-apply)" >&2
        unrecord_migration "$f"
      else
        echo "  skip reconcile: $f (effect check inconclusive, not guarded)" >&2
      fi
    fi
  done
}

list_pending_migrations() {
  ensure_tracking_table >&2
  if ! reconcile_tracking_with_schema; then
    return 1
  fi
  if ! load_applied_migrations; then
    return 1
  fi

  local applied_files=()
  read_applied_into applied_files

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
  local pending_raw list_rc=0
  pending_raw="$(list_pending_migrations)" || list_rc=$?
  list_rc=${list_rc:-0}
  if [[ "$list_rc" -ne 0 ]]; then
    echo "::error::apply-pending aborted: could not list pending migrations" >&2
    return 1
  fi
  while IFS= read -r line; do
    [[ -n "$line" ]] && pending+=("$line")
  done <<< "$pending_raw"

  if [[ ${#pending[@]} -eq 0 ]]; then
    echo "No pending migrations." >&2
    return 0
  fi

  echo "Pending (${#pending[@]}):" >&2
  printf '  %s\n' "${pending[@]}" >&2

  local failed=0
  for f in "${pending[@]}"; do
    # ترحيلات محروسة (فحص أعمدة/فهارس) — لا تُنفَّذ كملف SQL خام فقط
    if [[ "$f" == "033_edu_central_event_weights.sql" ]]; then
      if node "$API_DIR/scripts/migrate-033-remote.mjs"; then
        continue
      else
        failed=1
        break
      fi
    fi
    if [[ "$f" == "062_stage_id_backfill.sql" ]]; then
      if node "$API_DIR/scripts/migrate-062-remote.mjs"; then
        continue
      else
        failed=1
        break
      fi
    fi
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
    if [[ "$f" == "069_plan_daily_followup.sql" ]]; then
      if node "$API_DIR/scripts/migrate-069-remote.mjs"; then
        continue
      else
        failed=1
        break
      fi
    fi
    if [[ "$f" == "070_competition_source.sql" ]]; then
      if node "$API_DIR/scripts/migrate-070-remote.mjs"; then
        continue
      else
        failed=1
        break
      fi
    fi
    if [[ "$f" == "071_users_staff_deleted_at.sql" ]]; then
      if node "$API_DIR/scripts/migrate-071-remote.mjs"; then
        continue
      else
        failed=1
        break
      fi
    fi
    if [[ "$f" == "072_display_slide_types.sql" ]]; then
      if node "$API_DIR/scripts/migrate-072-remote.mjs"; then
        continue
      else
        failed=1
        break
      fi
    fi
    if [[ "$f" == "073_display_media_r2_urls.sql" ]]; then
      if SETUP_KEY="${SETUP_KEY:-}" \
        R2_PUBLIC_BASE_URL="${R2_PUBLIC_BASE_URL:-https://pub-cace01d6ad114b77b5969bb148555a61.r2.dev}" \
        node "$API_DIR/scripts/migrate-073-remote.mjs"; then
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
  if [[ "$failed" -ne 0 ]]; then
    echo "::error::apply-pending failed (migration error)" >&2
    return 1
  fi
  return 0
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
    apply_pending || exit 1
    ;;
  effect-status)
    # إثبات: migration_effect_status لملف واحد (مثال: 033_edu_central_event_weights.sql)
    if [[ -z "${2:-}" ]]; then
      echo "Usage: $0 effect-status <migration_file.sql>" >&2
      exit 1
    fi
    migration_effect_status "$2"
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
  069)
    node "$API_DIR/scripts/migrate-069-remote.mjs"
    ;;
  070)
    node "$API_DIR/scripts/migrate-070-remote.mjs"
    ;;
  071)
    node "$API_DIR/scripts/migrate-071-remote.mjs"
    ;;
  072)
    node "$API_DIR/scripts/migrate-072-remote.mjs"
    ;;
  073)
    node "$API_DIR/scripts/migrate-073-remote.mjs"
    ;;
  *)
    echo "Usage: $0 upgrade|all|demo|apply-pending|effect-status|bootstrap-tracking|048|061|062|063|064|065|066|067|068|069|070|071|072|073|..." >&2
    exit 1
    ;;
esac

echo "" >&2
echo "Done ($MODE)." >&2
