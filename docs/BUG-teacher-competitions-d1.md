# BUG: منافسات المعلم على D1 (teacher-competitions)

## الأعراض

- صفحة **منافسات المعلم** (`/teacher` → تبويب المنافسات) تعيد `503 migration_required` أو `500 api_internal_crash`.
- عند حفظ الدرجات: `migration_required` أو فشل FK عند الإدراج في `competition_tasks`.
- بعد تطبيق ترحيل جزئي: قائمة المهام فارغة رغم وجود منافسة، أو `teacherTasksTable()` يعيد `null`.

## السبب الجذري

1. **تعارض اسم الجدول `competition_tasks`**
   - ترحيل `027` أنشأ `competition_tasks` لصندوق المعلم (أعمدة `title_ar`, `weight_points`) مرتبطاً بـ `teacher_competitions`.
   - ترحيل `048` ينشئ جدول منصة جديد بنفس الاسم (أعمدة `name_ar`, `type`, `weight`).
   - بدون **إعادة تسمية** الجدول القديم إلى `teacher_competition_tasks` أولاً، يفشل 048 أو يُعطّل مسار المعلم.

2. **ترحيل 048–056 غير مضمن في `upgrade` الافتراضي**
   - GitHub Actions `D1 Production Migrate` كان يصل إلى `032` فقط + خيارات منفصلة `051`–`056`.
   - الإنتاج يفتقر أعمدة `competitions.category`, `competition_targets.current_memorization`, و`competitions.created_by_user_id` المطلوبة لمحرك المنافسات الموحّد.

3. **جدول `competition_targets` القديم (016)**
   - إن وُجد بدون عمود `current_memorization`، `hasEngineTargets()` يعيد `false` ويُعطّل المحرك الموحّد.
   - `CREATE TABLE IF NOT EXISTS` في 048 لا يستبدل الجدول القديم.

4. **عمود `created_by_user_id` على `competitions` (Schema v25 / 023)**
   - جدول `competitions` بعد 023 لا يحتوي العمود؛ مسار المعلم الموحّد يعتمد عليه للملكية.

## الإصلاح (كود + ترحيل)

| خطوة | الملف / الأمر |
|------|----------------|
| إعادة تسمية مهام المعلم | `migrate-048-remote.mjs` → `competition_tasks` → `teacher_competition_tasks` |
| أرشفة targets قديم | نفس السكربت → `competition_targets` → `competition_targets_legacy_v16` إن نقص `current_memorization` |
| ملكية المعلم | `ALTER TABLE competitions ADD COLUMN created_by_user_id` |
| تطبيق 048 | `048_competition_engine.sql` |
| باقي المحرك | `045`–`056` عبر خيار **`competition-stack`** في Actions |
| API | `teacher-competition-unified.ts` + `edu-dept-mega.ts` — استعلامات مرنة عند غياب العمود |

## التشغيل على الإنتاج

1. **Actions** → **D1 Production Migrate** → `competition-stack` (أو `048` ثم `051`–`056` على دفعات).
2. **Actions** → **Production Release (D1 + API)** → `competition-stack` أو `skip` إن رُحّل D1 مسبقاً.
3. الدفع إلى `main` ينشر API + Web تلقائياً.

## التحقق

```bash
curl https://winter-term-cb93.a-samani092.workers.dev/api/health
```

- تسجيل دخول معلم → `/api/edu-dept/teacher-competitions` → `200` مع `items`.
- إنشاء منافسة → مهام افتراضية → حفظ درجات → `200`.

## Big O

- فحص المخطط (PRAGMA): O(1) لكل جدول.
- ترحيل البيانات: O(n) على صفوف `competition_targets` عند إعادة التسمية فقط.
