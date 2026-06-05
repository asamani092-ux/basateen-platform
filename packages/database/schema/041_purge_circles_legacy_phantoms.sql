-- 041 FORENSIC PURGE: circles_legacy_035 phantom refs (post-035 RENAME swap)
--
-- Global search result: NO "CREATE TRIGGER" exists in repo migrations.
-- circles_legacy_035 appears only in:
--   035_admin_staff_role_nullable_assignees.sql  → ALTER TABLE circles RENAME TO circles_legacy_035
--   036_circles_*.sql, 035_drop_legacy_tables.sql → DROP TABLE IF EXISTS circles_legacy_035
--
-- Remote D1 may still have FK metadata or orphan triggers pointing at circles_legacy_035.
-- This file drops every known/guessed trigger name + legacy tables.
--
--   From apps/api:  npm run db:remote:041
--   (also runs migrate-041-remote.mjs to DROP any trigger found in sqlite_master)

PRAGMA foreign_keys = OFF;

-- circles triggers (guessed names from 035 partial runs)
DROP TRIGGER IF EXISTS circles_after_update;
DROP TRIGGER IF EXISTS circles_after_delete;
DROP TRIGGER IF EXISTS circles_before_update;
DROP TRIGGER IF EXISTS circles_before_delete;
DROP TRIGGER IF EXISTS circles_after_insert;
DROP TRIGGER IF EXISTS circles_before_insert;
DROP TRIGGER IF EXISTS sync_circles_legacy;
DROP TRIGGER IF EXISTS sync_circles_legacy_035;
DROP TRIGGER IF EXISTS trg_circles_is_active;
DROP TRIGGER IF EXISTS trg_circles_soft_delete;
DROP TRIGGER IF EXISTS circles_legacy_sync;
DROP TRIGGER IF EXISTS circles_legacy_035_sync;
DROP TRIGGER IF EXISTS circles_legacy_035_insert;
DROP TRIGGER IF EXISTS circles_legacy_035_update;
DROP TRIGGER IF EXISTS circles_legacy_035_delete;

-- students triggers (UPDATE current_circle_id may fire legacy FK lookup)
DROP TRIGGER IF EXISTS students_after_update;
DROP TRIGGER IF EXISTS students_before_update;
DROP TRIGGER IF EXISTS students_after_insert;
DROP TRIGGER IF EXISTS students_before_insert;
DROP TRIGGER IF EXISTS students_circle_sync;
DROP TRIGGER IF EXISTS students_current_circle_sync;
DROP TRIGGER IF EXISTS trg_students_current_circle;
DROP TRIGGER IF EXISTS sync_students_circles_legacy;
DROP TRIGGER IF EXISTS sync_students_circles_legacy_035;
DROP TRIGGER IF EXISTS students_legacy_circle_fk;

-- student_circle_history triggers
DROP TRIGGER IF EXISTS student_circle_history_after_insert;
DROP TRIGGER IF EXISTS student_circle_history_after_update;
DROP TRIGGER IF EXISTS student_circle_history_after_delete;
DROP TRIGGER IF EXISTS sync_history_circles_legacy_035;

-- legacy staging tables (safe IF EXISTS)
DROP TABLE IF EXISTS circles_legacy_035;
DROP TABLE IF EXISTS circles_m035;
DROP TABLE IF EXISTS circles_fix_036;
DROP TABLE IF EXISTS circles_canonical;
DROP TABLE IF EXISTS circles_active;
DROP TABLE IF EXISTS tracks_legacy_035;
DROP TABLE IF EXISTS tracks_m035;

PRAGMA foreign_keys = ON;
