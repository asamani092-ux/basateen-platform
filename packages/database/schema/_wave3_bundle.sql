-- Basateen Wave-3 bundle (008 + 009 + 010)
-- Paste into: Cloudflare Dashboard > D1 > basateen > Console

-- ========== 008_yom_himma.sql ==========
-- يوم الهمة القرآني — جلسات متعددة + قوانين + رصد Upsert

CREATE TABLE IF NOT EXISTS yom_himma_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  name_ar TEXT NOT NULL,
  session_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'live', 'closed')),
  tv_launch_key TEXT NOT NULL UNIQUE,
  rules_json TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  stage_id INTEGER,
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE TABLE IF NOT EXISTS yom_himma_targets (
  session_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  target_juz REAL NOT NULL DEFAULT 0,
  target_hizb REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, student_id),
  FOREIGN KEY (session_id) REFERENCES yom_himma_sessions(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE TABLE IF NOT EXISTS yom_himma_audit (
  session_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  attendance TEXT CHECK (attendance IN ('present', 'absent')),
  juz_done REAL NOT NULL DEFAULT 0,
  hizb_done REAL NOT NULL DEFAULT 0,
  alerts_count INTEGER NOT NULL DEFAULT 0,
  errors_count INTEGER NOT NULL DEFAULT 0,
  current_hizb_failed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, student_id),
  FOREIGN KEY (session_id) REFERENCES yom_himma_sessions(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_yom_himma_sessions_date
  ON yom_himma_sessions (session_date);
CREATE INDEX IF NOT EXISTS idx_yom_himma_audit_session
  ON yom_himma_audit (session_id);


-- ========== 009_complex_settings.sql ==========
-- إعدادات المجمع: خريجون، حفاظ، شرائح العرض

CREATE TABLE IF NOT EXISTS complex_settings (
  complex_id INTEGER PRIMARY KEY,
  graduates_count INTEGER NOT NULL DEFAULT 0,
  huffadh_count INTEGER NOT NULL DEFAULT 0,
  display_slides_json TEXT,
  display_mode TEXT NOT NULL DEFAULT 'carousel'
    CHECK (display_mode IN ('static', 'carousel')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

INSERT OR IGNORE INTO complex_settings (complex_id, graduates_count, huffadh_count)
VALUES (1, 0, 0);


-- ========== 010_semester_plans.sql ==========
-- خطط الفصل + رصد يومي (معلم)

CREATE TABLE IF NOT EXISTS semester_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  complex_id INTEGER NOT NULL DEFAULT 1,
  circle_id INTEGER,
  track_id INTEGER,
  stage_id INTEGER,
  title_ar TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  daily_target_json TEXT,
  created_by_user_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

CREATE TABLE IF NOT EXISTS teacher_daily_marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  plan_id INTEGER,
  mark_date TEXT NOT NULL,
  score REAL,
  notes TEXT,
  logged_by_user_id INTEGER NOT NULL,
  attendance_auto INTEGER NOT NULL DEFAULT 1,
  logged_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, mark_date, plan_id),
  FOREIGN KEY (student_id) REFERENCES students(id),
  FOREIGN KEY (plan_id) REFERENCES semester_plans(id)
);


