# تطوير الواجهة فقط (الوضع الحالي)

## تشغيل سريع

```powershell
cd C:\Users\asama\Projects\basateen-platform
npm run install:ui
npm run dev
```

| | |
|--|--|
| الواجهة | http://localhost:5173 |
| API | Worker المنشور (عبر proxy `/api`) |

لا حاجة لتثبيت `apps/api` على Windows ARM64.

---

## تسجيل الدخول (Mock في المتصفح)

| الجوال | الدور | الصفحة بعد الدخول |
|--------|-------|-------------------|
| 0500000001 | مدير عام | `/admin/staff` (3 تبويبات: موظفين، حلقات، إحصائيات) |
| 0500000002 | مشرف تعليمي | `/edu-supervisor/dashboard` |
| 0500000003 | مشرف برامج | `/prog-supervisor/quizzes` |
| 0500000004 | مشرف عام | `/general-supervisor/dashboard` |
| 0500000005 | معلم | `/teacher` |

---

## صفحات تحتاج API (بيانات حقيقية)

عند فتح **إدارة الطلاب** أو **نقل الطلاب** يجب أن يكون Worker المنشور محدّثاً وبيانات seed على D1 السحابية.

إن ظهر خطأ API:

1. تحقق: https://winter-term-cb93.a-samani092.workers.dev/api/health  
2. نفّذ migrate/seed على **D1 remote** — راجع **`docs/PRODUCTION.md`**

المعلم (`0500000005`) يعمل على الواجهة حتى بدون token API.

---

## الهوية البصرية

- مكوّنات من `basateen-design-guide` فقط  
- `theme.css` + `design-system.ts`  
- راجع `docs/DESIGN-CONSISTENCY.md` و `docs/MASTER-SPEC.md`

---

## لاحقاً (عند الحاجة لـ API محلي)

- Node **x64** أو **WSL2** → `docs/LOCAL-DEV.md`  
- `npm run dev:full` + `apps/web/.env.development.local` مع `http://127.0.0.1:8787`
