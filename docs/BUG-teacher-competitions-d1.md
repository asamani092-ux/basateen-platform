# تقرير عطل — منافسات الحلقة (معلم)

**التاريخ:** 2026-06-11  
**الأولوية:** عالية — يمنع المعلم من فتح تبويب «منافسات الحلقة»  
**النطاق:** Backend / D1 — لا يُحل من الواجهة

---

## الخطأ الظاهر للمستخدم

```
D1_ERROR: no such column: created_by_user_id at offset 134: SQLITE_ERROR
```

يظهر عند استدعاء:

```
GET /api/edu-dept/teacher-competitions
```

من تبويب **منافسات الحلقة** في بوابة المعلم (`/teacher?tab=competitions`).

---

## السبب الجذري

1. الدالة `useUnifiedTeacherCompetitions()` في `apps/api/src/lib/teacher-competition-unified.ts` تُفعِّل المسار الموحّد عندما توجد أعمدة/جداول محرك المنافسات (`category` + `competition_targets` من migration **048**).

2. عند تفعيل المسار الموحّد، الاستعلام في `apps/api/src/routes/edu-dept-mega.ts` (سطر ~164) يستخدم **دائماً**:

   ```sql
   SELECT ... FROM competitions
   WHERE complex_id = ? AND created_by_user_id = ?
   ```

3. جدول `competitions` في baseline **v25** (`023_rebuild_v25.sql`) **لا يحتوي** عمود `created_by_user_id`.

4. migration **048** يضيف `category` و`target_scope` فقط — **لا يضيف** `created_by_user_id`.

5. النتيجة: بيئة D1 نفّذت 048 (أو ما بعده) دون أن يكون عمود `created_by_user_id` موجوداً → SQLite error.

6. **تناقض داخلي:** `createTeacherCircleCompetition()` تتحقق من `tableHasColumn(..., "created_by_user_id")` قبل INSERT، لكن **GET/DELETE** لا يتحققان من وجود العمود.

---

## الملفات المتأثرة

| الملف | المشكلة |
|-------|---------|
| `apps/api/src/routes/edu-dept-mega.ts` | GET/DELETE يفترضان وجود `created_by_user_id` |
| `apps/api/src/lib/teacher-competition-unified.ts` | `assertTeacherOwnsUnifiedCompetition()` نفس الافتراض |
| `packages/database/schema/023_rebuild_v25.sql` | competitions بدون `created_by_user_id` |
| `packages/database/schema/048_competition_engine.sql` | لا يضيف العمود الناقص |

---

## الحلول المقترحة (للمبرمج)

### الحل A — ترحيل D1 (موصى به)

```sql
ALTER TABLE competitions ADD COLUMN created_by_user_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_competitions_created_by
  ON competitions(created_by_user_id);
```

تضمينه في migration جديد (مثلاً `057_competitions_created_by.sql`) وتشغيله على **D1 remote**.

### الحل B — دفاع برمجي (فوري + آمن)

في `edu-dept-mega.ts` و`teacher-competition-unified.ts`:

- قبل استخدام `created_by_user_id` في SELECT/WHERE/DELETE، استدعِ `tableHasColumn(env, "competitions", "created_by_user_id")`.
- إذا العمود غائب: إما fallback إلى جدول `teacher_competitions`، أو فلترة بـ `rules_json` + `complex_id` فقط (مع تقييد ملكية المعلم عبر `rules_json.ownership = "teacher_circle"`).

### الحل C — تشديد شرط المسار الموحّد

```ts
export async function useUnifiedTeacherCompetitions(env: Env): Promise<boolean> {
  return (
    (await hasCompetitionCategory(env)) &&
    (await hasEngineTargets(env)) &&
    (await tableHasColumn(env, "competitions", "created_by_user_id"))
  );
}
```

يُعيد المعلم تلقائياً لجدول `teacher_competitions` حتى يُطبَّق الحل A.

---

## التحقق بعد الإصلاح

1. `GET /api/edu-dept/teacher-competitions` — 200 + `{ items: [...] }`
2. `POST /api/edu-dept/teacher-competitions` — إنشاء منافسة حلقة
3. تسجيل دخول معلم مربوط بحلقة → تبويب المنافسات يعمل بدون D1_ERROR

---

## ملاحظة للواجهة

الواجهة تعرض رسالة ودية عند هذا الخطأ حتى يُصلح الـ Backend؛ لا يمكن تجاوز العطل من Frontend فقط.

---

## حالة الإصلاح في المستودع

| الحل | الحالة | الملف |
|------|--------|-------|
| A | ✅ `057_competitions_created_by.sql` + `migrate-057-remote.mjs`؛ يُشغَّل أيضاً ضمن `migrate-048-remote.mjs` preflight | `packages/database/schema/057_…` |
| B | ✅ `tableHasColumn` قبل SELECT/WHERE/DELETE | `edu-dept-mega.ts`, `teacher-competition-unified.ts` |
| C | ✅ شرط ثالث في `useUnifiedTeacherCompetitions()` | `teacher-competition-unified.ts` |

**تشغيل على الإنتاج:** GitHub Actions → **D1 Production Migrate** → `057` أو `competition-stack` (045→057).
