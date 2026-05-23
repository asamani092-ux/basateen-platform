# Basateen Platform — MASTER-SPEC (Verified)

**الاسم الرسمي:** منصة بساتين

## 1. Authentication

- Login via **mobile number only** (mock + API).
- UI: logo, «منصة بساتين», Tajawal, RTL, `#1e3a8a`.

## 2. RBAC

| Role | Code | Home |
|------|------|------|
| معلم | `teacher` | `/teacher` |
| مشرف تعليمي | `edu_supervisor` | `/edu-supervisor/dashboard` |
| مشرف برامج | `prog_supervisor` | `/prog-supervisor/quizzes` |
| مشرف عام | `general_supervisor` | `/general-supervisor/student-attendance` |
| مدير عام | `general_manager` | `/admin/staff` |

**Supervisor scope:** `global` or stage IDs `1–4` (تلقين، ابتدائي، متوسط، ثانوي).

## 3. General Supervisor — unified sidebar

Single `RoleShellLayout` nav (no nested sidebar):

| Path | Purpose |
|------|---------|
| `/general-supervisor/student-attendance` | تحضير الطلاب عند **غياب المعلم** — حضور يومي فقط، **لا إنجاز قرآني** |
| `/general-supervisor/staff` | تحضير المنسوبين (حاضر/غائب/معتذر + اعتماد) |
| `/general-supervisor/admissions` | قبول وتسجيل → `pending_placement` |
| `/general-supervisor/violations` | تعهدات وانضباط |
| `/general-supervisor/dashboard` | مؤشرات + بث TV |

**Filters (UI):** search by name + filter by circle (students) or role (staff).

**API:** `/api/general-supervisor/student-attendance/*`, `staff-attendance/*`.

**Migrations:** `013`, `014`, `015` (source `general_supervisor`).

## 4. Educational Supervisor

**Mandate:** quality of Quranic journey, plan oversight, placement, Yom Himma, competitions — **not** GS admissions, staff attendance, or disciplinary pledges.

**Stage boundary:** talqeen supervisor sees talqeen students only, etc.

**Sidebar paths:**

| Path | Screen |
|------|--------|
| `/edu-supervisor/dashboard` | لوحة متابعة KPIs |
| `/edu-supervisor/placement` | انتظار التسكين + تسكين مباشر |
| `/edu-supervisor/students` | طلاب + Excel + رابط الملف |
| `/edu-supervisor/students/:id` | ملف الطالب + خطة مشرف + رصد معلم + منافسات |
| `/edu-supervisor/transfers` | نقل تراكمي |
| `/edu-supervisor/circles` | حلقات |
| `/edu-supervisor/competitions` | منافسات + `/competitions/:id` تفاصيل |
| `/edu-supervisor/yom-himma` | يوم الهمة + live-log + شهادات |

## 5. Dynamic Competitions Engine

**Route:** `/edu-supervisor/competitions`  
**API:** `/api/edu-supervisor/competitions`

### Setup

- Name, start/end dates.
- Targets: students, circles, or tracks.
- **Type A — Extended recitation:** total juz + daily volume → auto calendar distribution (`competition_student_plans.distributed_json`).
- **Type B — Intensive routine:** circle-like logging in compressed window.

### Data isolation (D1)

- `competition_logs` keyed by `competition_id` — **never** mutates `teacher_daily_marks`.
- Historical block in student profile: **«نسبة الإنجاز في المنافسات»** (Phase 2 UI).

**Migration:** `016_competitions.sql`

## 6. Collaborative live logging

**Public route:** `/live-log/:token` (no password).

**Token sources:** `yom_himma_sessions.live_log_token` or `competitions.live_log_token`.

**API:** `GET/POST /api/live-log/:token` — Upsert audit; TV refreshes via `?key=` on `/tv-live`.

**Edu UI:** «توليد وتفعيل رابط الرصد التشاركي» on Yom Himma setup + Competitions list.

## 7. Yom Himma

- Edu supervisor only (not general supervisor).
- Tables: `008_yom_himma.sql` + `live_log_token` column (`016`).

## 8. TV

- `/tv-live` — optional `?key=` for Himma/competition session stats.

## 9. Mock mobiles

| Mobile | Role |
|--------|------|
| 0500000001 | general_manager |
| 0500000002 | edu_supervisor → `/edu-supervisor/dashboard` |
| 0500000003 | prog_supervisor |
| 0500000004 | general_supervisor |
| 0500000005 | teacher |

## 10. Local dev

- `VITE_UI_DEV=true` — UI preview without Worker.
- `npm run db:local:016` + `017` + `018` (أمثلة Edu) after `014`/`015` when using real D1.
- `npm run seed:local` then `npm run seed:edu-examples` — أو `docs/DEV-EXAMPLES.md`.

**Edu nav:** unified in `RoleShellLayout` (no nested sidebar). Scope banner on all edu pages.

## 11. Programs Supervisor (Section D)

**Mandate:** planning, quizzes, extracurricular analytics, knowledge vault — **strictly isolated** from `teacher_daily_marks`, Yom Himma, and Edu competitions.

**Scope:** `supervisor_scope` global or stage IDs (same model as edu).

**Sidebar paths:**

| Path | Screen |
|------|--------|
| `/prog-supervisor/quizzes` | Quiz list + quick create (name + optional access code) |
| `/prog-supervisor/quizzes/:id` | Question builder + publish/print/WhatsApp |
| `/prog-supervisor/quizzes/:id/print` | Browser print canvas |
| `/prog-supervisor/analytics` | KPIs, circle/student leaderboards |
| `/prog-supervisor/vault` | External URL archive + fuzzy search |

**Public quiz:** `/quiz/:quizId` — hybrid access (name/mobile + access code, or `?token=` bypass).

**API:** `/api/prog-supervisor/*`, `/api/quiz/:id/public|gate|take|submit`

**Migration:** `019_prog_supervisor.sql` + `seed-prog-examples`

**Mock mobile:** `0500000003`

## 12. Teacher (معلم)

**Home:** `/teacher` — tabs: الرصد اليومي | خطتي وإحصائياتي

### Plan Setup Wizard

- Per-student semester plan (`student_semester_plans`).
- Plan kind: `hifz_new` | `muraja` | `tilawa` | `combined`.
- Daily targets: hifz pages, muraja pages, rabt faces, repeat target.
- Live estimate card from GM calendar (`semester_weeks` × `school_days_json` in `complex_settings`).

### Daily scorecard

- Date picker (calendar UI), upsert by date with `updated_at`.
- Scope: students in `teacher_assignments` circles only.
- Sections: hifz (heard, repeated, errors, alerts), muraja (read, errors, alerts), rabt (read only — faces auto from plan).
- Auto attendance: `student_daily_attendance` + `teacher_daily_marks.attendance_auto`.

### Offline

- LocalStorage queue `basateen-teacher-offline-v1`; sync on `online` or manual.

**API:** `/api/teacher/calendar`, `/api/teacher/plans`, `/api/teacher/plans/:studentId`, `/api/teacher/plans/estimate`, `/api/teacher/daily-marks`

**Migration:** `020_teacher_full.sql`

**Mock mobile:** `0500000005`
