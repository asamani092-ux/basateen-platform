# أمثلة مشرف البرامج

## تفعيل

```powershell
cd apps/api
npm run db:local:019
npm run dev
# نافذة ثانية:
npm run seed:local
```

أو معاينة UI: `VITE_UI_DEV=true` في `apps/web/.env.development.local`

## الدخول

| الجوال | الدور |
|--------|------|
| 0500000003 | مشرف برامج |

## مسارات

| المسار | الغرض |
|--------|--------|
| `/prog-supervisor/quizzes` | قائمة + إنشاء |
| `/prog-supervisor/quizzes/1` | محرر (معاينة: id=1) |
| `/prog-supervisor/analytics` | لوحة إحصائيات |
| `/prog-supervisor/vault` | بنك المعرفة |
| `/quiz/1` | بوابة طالب (رمز: `Ramadan2026`) |
| `/quiz/1?token=preview-quiz-student-1` | دخول مباشر بدون بوابة |

## عزل البيانات

درجات الاختبارات في `quiz_attempts` فقط — لا تُكتب في الرصد القرآني اليومي.
