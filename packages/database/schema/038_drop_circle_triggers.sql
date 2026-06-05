-- 038: Drop phantom triggers on `circles` left from partial 035 migrations.
-- Safe to re-run. API also calls dropCircleTriggers() before circle hard-delete.
--
--   npm run db:remote:038 --prefix apps/api

DROP TRIGGER IF EXISTS circles_after_update;
DROP TRIGGER IF EXISTS circles_after_delete;
DROP TRIGGER IF EXISTS circles_before_update;
DROP TRIGGER IF EXISTS circles_before_delete;
DROP TRIGGER IF EXISTS sync_circles_legacy;
DROP TRIGGER IF EXISTS sync_circles_legacy_035;
DROP TRIGGER IF EXISTS trg_circles_is_active;
DROP TRIGGER IF EXISTS trg_circles_soft_delete;
DROP TRIGGER IF EXISTS circles_legacy_sync;
DROP TRIGGER IF EXISTS circles_legacy_035_sync;
