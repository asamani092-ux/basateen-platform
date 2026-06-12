# BUG: منافسات المعلم على D1 (teacher-competitions)

**التاريخ:** 2026-06-11  
**الأولوية:** عالية — يمنع المعلم من فتح تبويب «منافسات الحلقة»  
**النطاق:** Backend / D1

---

## الخطأ الظاهر للمستخدم

```
D1_ERROR: no such column: created_by_user_id at offset 134: SQLITE_ERROR
```

```
503 migration_required
```

يظهر عند `GET /api/edu-dept/teacher-competitions` من `/teacher?tab=competitions`.

---

## الأسباب الجذرية

### 1) عمود `created_by_user_id` مفقود (الخطأ المباشر)

- `useUnifiedTeacherCompetitions()` يُفعّل المسار الموحّد عند وجود `category` + `competition_targets.current_memorization` (048).
- GET/DELETE في `edu-dept-mega.ts` كانا يستخدمان `WHERE created_by_user_id = ?` **دون** التحقق من وجود العمود.
- جدول `competitions` في v25 (`023`) لا يحتوي العمود؛ `048_competition_engine.sql` لا يضيفه.
- **تناقض:** `createTeacherCircleCompetition()` تتحقق من العمود قبل INSERT؛ GET/DELETE لا.

### 2) تعارض اسم `competition_tasks`

- `027`: `competition_tasks` لصندوق المعلم (`title_ar`, FK → `teacher_competitions`).
- `048`: جدول منصة بنفس الاسم (`name_ar`, `type`).
- بدون إعادة تسمية → `teacher_competition_tasks`، يفشل 048 أو يُعطّل مسار المعلم.

### 3) ترحيل 045–056 خارج `upgrade` الافتراضي

- GitHub Actions `upgrade` يصل إلى `032` فقط؛ محرك المنافسات يحتاج `045`–`056`.

### 4) `competition_targets` قديم (016)

- إن وُجد بدون `current_memorization`، `CREATE TABLE IF NOT EXISTS` في 048 لا يستبدله.

---

## الإصلاح المُطبَّق

| خطوة | الملف |
|------|--------|
| استيراد `resolveMemorizationFields` | `admin-student-report.ts`, `edu-dept-extended.ts` |
| طباعة جدول «الأوائل» | `CompetitionDetailPage.tsx`, `index.css` |
| preflight 048: rename tasks + archive targets + `ADD created_by_user_id` | `migrate-048-remote.mjs` |
| استعلامات مرنة عند غياب العمود | `edu-dept-mega.ts`, `teacher-competition-unified.ts` |
| خيار Actions **`competition-stack`** (045→056) | `d1-remote-migrate.sh`, workflows |

---

## التشغيل على الإنتاج

1. **Actions** → **D1 Production Migrate** → **`competition-stack`**
2. **Actions** → **Production Release** → `competition-stack` أو `skip` إن رُحّل D1
3. الدفع إلى `main` ينشر API + Web تلقائياً

```sql
-- يُنفَّذ تلقائياً ضمن migrate-048-remote.mjs إن لزم:
ALTER TABLE competitions ADD COLUMN created_by_user_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_competitions_created_by ON competitions(created_by_user_id);
```

---

## التحقق

1. `GET /api/edu-dept/teacher-competitions` → 200 + `{ items: [...] }`
2. `POST` إنشاء منافسة → مهام → حفظ درجات → 200
3. `GET /api/edu-dept/reports/educational-profile?person_id=…` → بدون `resolveMemorizationFields is not defined`

## Big O

- PRAGMA فحص المخطط: O(1) لكل جدول.
- rename/archive: O(1) metadata؛ O(n) فقط إن نُقلت بيانات targets.
