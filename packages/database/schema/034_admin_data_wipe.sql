-- Admin data wipe — v2.5 core (023_rebuild_v25.sql only)
-- Keeps: complexes, complex_settings, users.id = 1 (المشرف العام)
--
-- Local:  npm run db:wipe:local --prefix apps/api
-- Remote: npm run db:wipe:remote --prefix apps/api
--
-- After migrations 024–028, also run: 034_admin_data_wipe_extensions.sql

PRAGMA foreign_keys = OFF;

DELETE FROM quiz_attempts;
DELETE FROM quiz_questions;
DELETE FROM quran_daily_ledger;
DELETE FROM student_attendance;
DELETE FROM student_semester_plans;
DELETE FROM student_circle_history;
DELETE FROM students;
DELETE FROM tracks;
DELETE FROM circles;
DELETE FROM competitions;
DELETE FROM yom_himma_sessions;
DELETE FROM quizzes;
DELETE FROM knowledge_vault_items;
DELETE FROM staff_attendance WHERE user_id != 1;
DELETE FROM sessions WHERE user_id != 1;
DELETE FROM users WHERE id != 1;

PRAGMA foreign_keys = ON;
