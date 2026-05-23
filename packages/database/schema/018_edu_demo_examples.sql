-- أمثلة تعليمية متكاملة: تسكين، خطط مشرف، رصد معلم، منافسات، يوم الهمة، رصد تشاركي
-- يعتمد على 005_seed + 016 + 017 + seed-users (معلم user_id=5، مشرف تعليمي=2)

-- مراحل الطلاب + انتظار تسكين
UPDATE students SET stage_id = 2 WHERE id IN (1, 2, 3, 4, 5, 6);
UPDATE students SET stage_id = 3 WHERE id IN (7, 8);
UPDATE students SET admission_status = 'pending_placement' WHERE id = 2;

INSERT OR IGNORE INTO students (
  id, complex_id, full_name_ar, national_id, phone, stage_id, admission_status, age, school_grade, guardian_phone
) VALUES (
  9, 1, 'نورة عبدالرحمن — انتظار تسكين', '1010000009', '0501111009', 2, 'pending_placement', 10, 'الرابع', '0502222009'
);

-- خطط المشرف التعليمي (تراكمية)
INSERT OR REPLACE INTO student_edu_plans (student_id, targets_json, notes, updated_by_user_id, updated_at)
VALUES
  (1, '{"hifz_pages":3,"muraja_pages":2,"sama_minutes":15}', 'خطة أسبوعية — مثال', 2, datetime('now')),
  (4, '{"hifz_pages":2,"muraja_pages":1,"sama_minutes":10}', NULL, 2, datetime('now'));

-- رصد المعلم (لا يُستبدل بسجلات المنافسة)
INSERT OR IGNORE INTO teacher_daily_marks (student_id, mark_date, score, notes, logged_by_user_id, attendance_auto)
SELECT 1, date('now', '-' || n || ' days'), 8 + (n % 3), CASE WHEN n = 0 THEN 'أداء ممتاز' ELSE NULL END, 5, 1
FROM (SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6);

INSERT OR IGNORE INTO teacher_daily_marks (student_id, mark_date, score, logged_by_user_id, attendance_auto)
VALUES (4, date('now'), 9, 5, 1), (5, date('now'), 7, 5, 1);

-- يوم الهمة — جلسة حية + مستهدفات + رصد
INSERT OR IGNORE INTO yom_himma_sessions (
  id, complex_id, name_ar, session_date, status, tv_launch_key, live_log_token, rules_json, scope_json, stage_id, created_by_user_id
) VALUES (
  1, 1, 'يوم الهمة — مثال تعليمي', date('now'), 'live', 'demo-himma-tv', 'demo-himma-live',
  '{"hizb_points":1,"alert_penalty":1,"error_penalty":2,"alerts_per_error":5,"fail_threshold_errors":3}',
  '{"circle_ids":[1,2],"track_ids":[]}', 2, 2
);

INSERT OR IGNORE INTO yom_himma_targets (session_id, student_id, target_juz, target_hizb) VALUES
  (1, 1, 1, 2),
  (1, 4, 1, 2),
  (1, 5, 1, 2);

INSERT OR REPLACE INTO yom_himma_audit (session_id, student_id, attendance, juz_done, hizb_done, alerts_count, errors_count, current_hizb_failed)
VALUES
  (1, 1, 'present', 1, 2, 1, 0, 0),
  (1, 4, 'present', 0.5, 1, 2, 1, 0),
  (1, 5, 'absent', 0, 0, 0, 0, 0);

-- منافسة 1: سرد ممتد
INSERT OR IGNORE INTO competitions (
  id, complex_id, name_ar, start_date, end_date, status, telemetry_type,
  rules_json, scope_json, stage_id, live_log_token, tv_launch_key, created_by_user_id
) VALUES (
  1, 1, 'سرد ممتد — رمضان (مثال)', date('now'), date('now', '+6 days'), 'active', 'extended_recitation',
  '{}', '{"student_ids":[1,4,5]}', 2, 'demo-comp-extended', 'demo-comp-ext-tv', 2
);

INSERT OR IGNORE INTO competition_targets (competition_id, target_type, student_id) VALUES
  (1, 'student', 1), (1, 'student', 4), (1, 'student', 5);

INSERT OR REPLACE INTO competition_student_plans (competition_id, student_id, total_target_juz, daily_volume_juz, distributed_json)
VALUES
  (1, 1, 3.5, 0.5, '{"day1":0.5,"day2":0.5,"day3":0.5}'),
  (1, 4, 3.5, 0.5, '{"day1":0.5}'),
  (1, 5, 3.5, 0.5, '{"day1":0.5}');

-- منافسة 2: برنامج مكثف + سجلات رصد معزولة
INSERT OR IGNORE INTO competitions (
  id, complex_id, name_ar, start_date, end_date, status, telemetry_type,
  rules_json, scope_json, stage_id, live_log_token, tv_launch_key, created_by_user_id
) VALUES (
  2, 1, 'برنامج مكثف — أسبوع الإتقان (مثال)', date('now'), date('now'), 'active', 'intensive_routine',
  '{}', '{"circle_ids":[1,2]}', 2, 'demo-comp-intensive', 'demo-comp-int-tv', 2
);

INSERT OR IGNORE INTO competition_targets (competition_id, target_type, circle_id) VALUES
  (2, 'circle', 1), (2, 'circle', 2);

INSERT OR IGNORE INTO competition_logs (competition_id, student_id, log_date, metrics_json, source, recorded_by_user_id)
VALUES
  (2, 1, date('now'), '{"hifz_pages":4,"muraja_pages":2,"sama_done":1}', 'edu_supervisor', 2),
  (2, 4, date('now'), '{"hifz_pages":3,"muraja_pages":1,"sama_done":0}', 'live_log', NULL),
  (2, 5, date('now'), '{"hifz_pages":2,"muraja_pages":2,"sama_done":1}', 'edu_supervisor', 2);
