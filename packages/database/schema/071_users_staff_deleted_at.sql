-- 071: تمييز حذف المنسوب (deleted_at) عن التعليق (is_active=0 فقط)
-- يُفحَص وجود العمود في التطبيق عبر tableHasColumn قبل الاعتماد عليه

ALTER TABLE users ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_staff_deleted_at
  ON users (deleted_at)
  WHERE deleted_at IS NOT NULL;
