-- Basateen v2.5
-- Full base cleanup and reconstruction for UI-over-Database flat architecture.
-- Safe for empty/fresh environments. Intended as the new baseline migration.

PRAGMA foreign_keys = OFF;

-- Drop legacy structural clutter safely
DROP TABLE IF EXISTS user_sections;
DROP TABLE IF EXISTS teacher_assignments;
DROP TABLE IF EXISTS supervisor_scopes;
DROP TABLE IF EXISTS track_circles;
DROP TABLE IF EXISTS track_stages;
DROP TABLE IF EXISTS task_assignments;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS teacher_daily_marks;
DROP TABLE IF EXISTS daily_logs;
DROP TABLE IF EXISTS student_attendance_log;
DROP TABLE IF EXISTS competition_targets;
DROP TABLE IF EXISTS competition_periods;
DROP TABLE IF EXISTS competition_student_plans;
DROP TABLE IF EXISTS competition_audit_trail;
DROP TABLE IF EXISTS himma_logs;
DROP TABLE IF EXISTS himma_sessions;
DROP TABLE IF EXISTS yom_himma_targets;
DROP TABLE IF EXISTS yom_himma_audit;

-- Rebuild target v2.5 tables to guarantee clean final shape.
DROP TABLE IF EXISTS quiz_attempts;
DROP TABLE IF EXISTS quiz_questions;
DROP TABLE IF EXISTS quizzes;
DROP TABLE IF EXISTS knowledge_vault_items;
DROP TABLE IF EXISTS student_circle_history;
DROP TABLE IF EXISTS yom_himma_sessions;
DROP TABLE IF EXISTS competitions;
DROP TABLE IF EXISTS student_attendance;
DROP TABLE IF EXISTS quran_daily_ledger;
DROP TABLE IF EXISTS student_semester_plans;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS tracks;
DROP TABLE IF EXISTS circles;
DROP TABLE IF EXISTS complex_settings;
DROP TABLE IF EXISTS staff_attendance;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS complexes;

-- [TABLE 1]: MASTER SINGLE-ORIGIN COMPLEXES
CREATE TABLE IF NOT EXISTS complexes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_ar TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- [TABLE 2]: FLAT PERMISSIONS USERS MATRIX
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id INTEGER NOT NULL DEFAULT 1,
    email TEXT NOT NULL UNIQUE,
    mobile TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name_ar TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    is_educational INTEGER DEFAULT 0,
    is_programs INTEGER DEFAULT 0,
    is_teacher INTEGER DEFAULT 0,
    is_track_supervisor INTEGER DEFAULT 0,
    stage_scope TEXT DEFAULT 'global',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

-- [TABLE 3]: SECURE SESSION COOKIES / TOKENS
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- [TABLE 4]: STAFF ATTENDANCE LEDGER (ADMIN VIEW)
CREATE TABLE IF NOT EXISTS staff_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id INTEGER NOT NULL DEFAULT 1,
    user_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused', 'late', 'leave')),
    notes TEXT,
    recorded_by_user_id INTEGER REFERENCES users(id),
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, attendance_date),
    FOREIGN KEY (complex_id) REFERENCES complexes(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- [TABLE 5]: THE GLOBAL GOVERNING COMPLEX SETTINGS
CREATE TABLE IF NOT EXISTS complex_settings (
    complex_id INTEGER PRIMARY KEY,
    semester_weeks INTEGER NOT NULL DEFAULT 16,
    school_days_json TEXT NOT NULL DEFAULT '["0","1","2","3","4"]',
    graduates_count INTEGER NOT NULL DEFAULT 0,
    huffadh_count INTEGER NOT NULL DEFAULT 0,
    display_slides_json TEXT DEFAULT '[]',
    display_mode TEXT NOT NULL DEFAULT 'carousel' CHECK (display_mode IN ('static', 'carousel')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

-- [TABLE 6]: CIRCLES MAPPING (1 Teacher : 1 Circle)
CREATE TABLE IF NOT EXISTS circles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id INTEGER NOT NULL DEFAULT 1,
    name_ar TEXT NOT NULL,
    teacher_id INTEGER NOT NULL REFERENCES users(id),
    stage TEXT NOT NULL CHECK (stage IN ('tlaqeen', 'primary', 'middle', 'secondary')),
    capacity INTEGER NOT NULL DEFAULT 20,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

-- [TABLE 7]: TRACKS MAPPING (1 Supervisor : 1 Track)
CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id INTEGER NOT NULL DEFAULT 1,
    name_ar TEXT NOT NULL,
    supervisor_id INTEGER NOT NULL REFERENCES users(id),
    default_capacity INTEGER NOT NULL DEFAULT 20,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

-- [TABLE 8]: SOVEREIGN DECOUPLED STUDENTS SCHEMA
CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id INTEGER NOT NULL DEFAULT 1,
    full_name_ar TEXT NOT NULL,
    national_id TEXT UNIQUE NOT NULL,
    phone TEXT,
    nationality TEXT,
    school_name TEXT,
    school_grade TEXT,
    stage_id INTEGER CHECK (stage_id BETWEEN 1 AND 4),
    age INTEGER,
    guardian_phone TEXT NOT NULL,
    guardian_national_id TEXT,
    guardian_work TEXT,
    health_notes TEXT,
    current_circle_id INTEGER REFERENCES circles(id) ON DELETE SET NULL,
    current_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'archived')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

-- [TABLE 9]: INDIVIDUAL SEMESTER PRESETS WIZARD
CREATE TABLE IF NOT EXISTS student_semester_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id INTEGER NOT NULL DEFAULT 1,
    student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    plan_kind TEXT NOT NULL DEFAULT 'combined' CHECK (plan_kind IN ('hifz_new', 'muraja', 'tilawa', 'combined')),
    daily_hifz_pages REAL NOT NULL DEFAULT 0,
    daily_muraja_pages REAL NOT NULL DEFAULT 0,
    daily_rabt_faces INTEGER NOT NULL DEFAULT 0,
    repeat_target INTEGER NOT NULL DEFAULT 1,
    wizard_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

-- [TABLE 10]: THE UNIFIED COMPACT TRANSACTION PROGRESS LEDGER
CREATE TABLE IF NOT EXISTS quran_daily_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    mark_date TEXT NOT NULL,
    context_type TEXT NOT NULL CHECK (context_type IN ('circle', 'track', 'competition', 'yom_himma')),
    context_id INTEGER NOT NULL,
    logged_by_user_id INTEGER NOT NULL REFERENCES users(id),
    has_memorized INTEGER DEFAULT 0,
    has_repeated INTEGER DEFAULT 0,
    has_reviewed INTEGER DEFAULT 0,
    has_linked INTEGER DEFAULT 0,
    memorization_errors INTEGER DEFAULT 0,
    memorization_warnings INTEGER DEFAULT 0,
    review_errors INTEGER DEFAULT 0,
    notes TEXT,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- [TABLE 11]: THE UNIFIED STUDENT ATTENDANCE RECORDS
CREATE TABLE IF NOT EXISTS student_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id INTEGER NOT NULL DEFAULT 1,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    attendance_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'excused')),
    source TEXT NOT NULL DEFAULT 'teacher_auto' CHECK (source IN ('edu_supervisor', 'teacher_auto', 'general_supervisor')),
    recorded_by_user_id INTEGER REFERENCES users(id),
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    notes TEXT,
    UNIQUE (student_id, attendance_date),
    FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

-- [TABLE 12]: COMPACT TRACK TIME-BOUND COMPETITIONS
CREATE TABLE IF NOT EXISTS competitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id INTEGER NOT NULL DEFAULT 1,
    name_ar TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
    rules_json TEXT NOT NULL DEFAULT '{}',
    live_log_token TEXT UNIQUE,
    tv_launch_key TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

-- [TABLE 13]: YOM HIMMA SCHEDULING DISPATCHERS
CREATE TABLE IF NOT EXISTS yom_himma_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id INTEGER NOT NULL DEFAULT 1,
    name_ar TEXT NOT NULL,
    session_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'closed')),
    tv_launch_key TEXT NOT NULL UNIQUE,
    live_log_token TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

-- [TABLE 14]: STUDENT TRANSFER ARCHIVE LOGS
CREATE TABLE IF NOT EXISTS student_circle_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    old_circle_id INTEGER REFERENCES circles(id),
    new_circle_id INTEGER REFERENCES circles(id),
    old_track_id INTEGER REFERENCES tracks(id),
    new_track_id INTEGER REFERENCES tracks(id),
    moved_by_user_id INTEGER REFERENCES users(id),
    moved_at TEXT NOT NULL DEFAULT (datetime('now')),
    reason TEXT
);

-- [TABLE 15]: UNBOUND FLEXIBLE KNOWLEDGE VAULT ITEMS
CREATE TABLE IF NOT EXISTS knowledge_vault_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id INTEGER NOT NULL DEFAULT 1,
    title_ar TEXT NOT NULL,
    description_ar TEXT,
    external_url TEXT NOT NULL,
    file_kind TEXT NOT NULL DEFAULT 'link' CHECK (file_kind IN ('link', 'drive', 'youtube', 'pdf', 'image')),
    tags_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

-- [TABLE 16]: COMPACT FLEXIBLE QUIZZES ENGINE
CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    complex_id INTEGER NOT NULL DEFAULT 1,
    title_ar TEXT NOT NULL,
    access_code TEXT NOT NULL,
    total_points INTEGER NOT NULL DEFAULT 100,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
    stage_id INTEGER CHECK (stage_id BETWEEN 1 AND 4),
    created_by_user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

-- [TABLE 17]: MCQS & TRUE/FALSE STRUCTURAL QUESTIONS
CREATE TABLE IF NOT EXISTS quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    prompt_ar TEXT NOT NULL,
    question_type TEXT NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'true_false')),
    options_json TEXT,
    correct_answer TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 10,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- [TABLE 18]: STUDENT ATTEMPTS RECORDS
CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    attempt_token TEXT NOT NULL UNIQUE,
    score_percent REAL NOT NULL DEFAULT 0,
    answers_json TEXT NOT NULL DEFAULT '{}',
    submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- High performance indexes for concurrency & UPSERTs
CREATE UNIQUE INDEX IF NOT EXISTS idx_quran_ledger_upsert
ON quran_daily_ledger(student_id, mark_date, context_type, context_id);

CREATE INDEX IF NOT EXISTS idx_student_lookup_grid
ON students(current_circle_id, current_track_id, account_status);

CREATE INDEX IF NOT EXISTS idx_ledger_analytics
ON quran_daily_ledger(mark_date, context_type);

PRAGMA foreign_keys = ON;
