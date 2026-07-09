#!/usr/bin/env bash
# إثبات: استعلام تتبع معطوب → apply-pending يخرج بخطأ واضح (لا «No pending migrations»)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$ROOT/scripts/d1-remote-migrate.sh"
BACKUP="$ROOT/scripts/.d1-remote-migrate.sh.proof-bak"
MOCK_BIN="$(mktemp -d /tmp/migrate-gate-mock.XXXXXX)"
trap 'rm -rf "$MOCK_BIN"; if [[ -f "$BACKUP" ]]; then mv -f "$BACKUP" "$SCRIPT"; fi' EXIT

cp "$SCRIPT" "$BACKUP"
sed -i 's/FROM _migrations_applied ORDER/FROM __no_such_migrations_table ORDER/' "$SCRIPT"

cat > "$MOCK_BIN/npx" <<'MOCK'
#!/usr/bin/env bash
if [[ "$*" == *"__no_such_migrations_table"* ]]; then
  printf '%s\n' '[{"success":false,"error":"no such table: __no_such_migrations_table: SQLITE_ERROR"}]' >&2
  exit 1
fi
if [[ "$*" == *"--file="* ]] || [[ "$*" == *"INSERT OR IGNORE"* ]] || [[ "$*" == *"DELETE FROM"* ]]; then
  printf '%s\n' '[{"success":true,"results":[]}]'
  exit 0
fi
printf '%s\n' '[{"success":true,"results":[{"name":"066_semester_plans_columns.sql"}]}]'
exit 0
MOCK
chmod +x "$MOCK_BIN/npx"

export CLOUDFLARE_API_TOKEN=proof-token
export CLOUDFLARE_ACCOUNT_ID=proof-account
export PATH="$MOCK_BIN:$PATH"

set +e
OUTPUT="$(
  cd "$ROOT" && bash "$SCRIPT" apply-pending 2>&1
)"
RC=$?
set -e

printf '%s\n' "$OUTPUT"
echo "--- EXIT: $RC ---"

if printf '%s\n' "$OUTPUT" | grep -q "No pending migrations"; then
  echo "PROOF FAILED: got silent 'No pending migrations'" >&2
  exit 1
fi
if [[ "$RC" -eq 0 ]]; then
  echo "PROOF FAILED: exit code 0" >&2
  exit 1
fi
if ! printf '%s\n' "$OUTPUT" | grep -Eqi 'fetch_applied_migrations|Failed to read _migrations_applied|no such table'; then
  echo "PROOF FAILED: missing clear tracking read error" >&2
  exit 1
fi

echo "PROOF OK: broken tracking read exits non-zero with explicit error"
