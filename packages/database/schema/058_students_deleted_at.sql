-- 058: student soft-delete timestamp (is_active remains primary flag).
-- Applied via apps/api/scripts/migrate-058-remote.mjs

ALTER TABLE students ADD COLUMN deleted_at TEXT;
