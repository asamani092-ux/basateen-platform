-- Optional wipe — run after 024_admin_department, 026, 027, 028 if applied
-- Run AFTER 034_admin_data_wipe.sql (or alone if only extension tables have data)

PRAGMA foreign_keys = OFF;

DELETE FROM student_comp_scores;
DELETE FROM competition_tasks;
DELETE FROM quranic_day_records;
DELETE FROM edu_daily_recitation;
DELETE FROM student_disciplinary_summary;
DELETE FROM student_pledges;
DELETE FROM teacher_requests;
DELETE FROM quranic_day_students;
DELETE FROM teacher_competitions;
DELETE FROM quranic_days;
DELETE FROM shared_access_tokens;

PRAGMA foreign_keys = ON;
