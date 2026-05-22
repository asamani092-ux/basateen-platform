-- بيانات تجريبية (حلقات، مسارات، طلاب) — المستخدمون عبر /api/setup/seed-users

INSERT OR IGNORE INTO tracks (id, complex_id, name_ar) VALUES
  (1, 1, 'مسار الحفظ'),
  (2, 1, 'مسار التثبيت');

INSERT OR IGNORE INTO circles (id, complex_id, track_id, name_ar, capacity) VALUES
  (1, 1, 1, 'حلقة الصديق', 15),
  (2, 1, 1, 'حلقة النور', 12),
  (3, 1, 2, 'حلقة الإتقان', 10);

INSERT OR IGNORE INTO students (id, complex_id, full_name_ar, national_id, phone) VALUES
  (1, 1, 'أحمد محمد العتيبي', '1010000001', '0500000001'),
  (2, 1, 'خالد سعود القحطاني', '1010000002', '0500000002'),
  (3, 1, 'فهد عبدالله الشمري', '1010000003', '0500000003'),
  (4, 1, 'سلمان ناصر الحربي', '1010000004', '0500000004'),
  (5, 1, 'يوسف إبراهيم الدوسري', '1010000005', '0500000005'),
  (6, 1, 'عمر حسن الزهراني', '1010000006', '0500000006'),
  (7, 1, 'ماجد فهد الغامدي', '1010000007', '0500000007'),
  (8, 1, 'تركي سعد المطيري', '1010000008', '0500000008');

INSERT OR IGNORE INTO student_circle_history
  (id, student_id, circle_id, track_id, from_at, to_at, frozen_at)
VALUES
  (1, 1, 1, 1, date('now', '-30 days'), NULL, NULL),
  (2, 2, 1, 1, date('now', '-25 days'), NULL, NULL),
  (3, 3, 1, 1, date('now', '-20 days'), NULL, NULL),
  (4, 4, 2, 1, date('now', '-18 days'), NULL, NULL),
  (5, 5, 2, 1, date('now', '-15 days'), NULL, NULL),
  (6, 6, 2, 1, date('now', '-12 days'), NULL, NULL),
  (7, 7, 3, 2, date('now', '-10 days'), NULL, NULL),
  (8, 8, 3, 2, date('now', '-8 days'), NULL, NULL);

INSERT OR IGNORE INTO daily_attendance_snapshot
  (complex_id, snapshot_date, present_count, absent_count, active_circles)
VALUES
  (1, date('now'), 142, 18, 3);
