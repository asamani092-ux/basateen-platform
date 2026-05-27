-- v3.1: بوابة المقرئ (PIN) + سجل القرآن الموحد

ALTER TABLE competitions ADD COLUMN access_pin TEXT NOT NULL DEFAULT '1234';
ALTER TABLE yom_himma_sessions ADD COLUMN access_pin TEXT NOT NULL DEFAULT '1234';

CREATE TABLE IF NOT EXISTS quran_daily_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  mark_date TEXT NOT NULL,
  context_type TEXT NOT NULL CHECK (
    context_type IN ('circle', 'track', 'competition', 'yom_himma')
  ),
  context_id INTEGER NOT NULL,
  logged_by_user_id INTEGER NOT NULL DEFAULT 1,
  has_memorized INTEGER NOT NULL DEFAULT 0,
  has_repeated INTEGER NOT NULL DEFAULT 0,
  has_reviewed INTEGER NOT NULL DEFAULT 0,
  has_linked INTEGER NOT NULL DEFAULT 0,
  memorization_errors INTEGER NOT NULL DEFAULT 0,
  memorization_warnings INTEGER NOT NULL DEFAULT 0,
  review_errors INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (logged_by_user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quran_ledger_upsert
  ON quran_daily_ledger (student_id, mark_date, context_type, context_id);

CREATE INDEX IF NOT EXISTS idx_quran_ledger_context
  ON quran_daily_ledger (context_type, context_id, mark_date);

CREATE INDEX IF NOT EXISTS idx_students_active_lookup
  ON students (complex_id, is_active);

INSERT OR IGNORE INTO quran_daily_ledger (
  student_id, mark_date, context_type, context_id, logged_by_user_id,
  has_memorized, memorization_errors, memorization_warnings, notes,
  recorded_at, updated_at
)
SELECT
  a.student_id, s.session_date, 'yom_himma', a.session_id,
  COALESCE(s.created_by_user_id, 1),
  CASE WHEN a.attendance = 'present' OR a.hizb_done > 0 OR a.juz_done > 0 THEN 1 ELSE 0 END,
  a.errors_count, a.alerts_count,
  json_object('juz_done', a.juz_done, 'hizb_done', a.hizb_done,
    'current_hizb_failed', a.current_hizb_failed, 'attendance', a.attendance),
  COALESCE(a.updated_at, datetime('now')), COALESCE(a.updated_at, datetime('now'))
FROM yom_himma_audit a
JOIN yom_himma_sessions s ON s.id = a.session_id;

INSERT OR IGNORE INTO quran_daily_ledger (
  student_id, mark_date, context_type, context_id, logged_by_user_id,
  has_memorized, notes, recorded_at, updated_at
)
SELECT
  cl.student_id, cl.log_date, 'competition', cl.competition_id,
  COALESCE(cl.recorded_by_user_id, 1), 1, cl.metrics_json,
  COALESCE(cl.recorded_at, datetime('now')), COALESCE(cl.recorded_at, datetime('now'))
FROM competition_logs cl;

DROP TABLE IF EXISTS competition_audit_trail;
DROP TABLE IF EXISTS competition_logs;
DROP TABLE IF EXISTS yom_himma_audit;
