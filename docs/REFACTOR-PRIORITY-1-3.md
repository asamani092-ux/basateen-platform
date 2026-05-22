# إصلاح الأولويات 1–3 (واجهة الويب)

## 1) تسجيل الدخول — جوال فقط (Mock)

- حذف البريد/كلمة المرور من `LoginPage`
- زر **دخول** يُفعَّل عند رقم جوال صالح (`05xxxxxxxx`)
- `AuthContext` + `auth-store` — جلسة محلية بالجوال

| الجوال | الدور | التوجيه |
|--------|--------|---------|
| 0500000001 | مدير عام | `/dashboard` |
| 0500000002 | مشرف | `/dashboard` |
| 0500000003 | معلم | `/teacher` |

## 2) React Router — مسارات منفصلة

| المسار | الوصف |
|--------|--------|
| `/login` | دخول |
| `/tv-live` | شاشة تلفاز — **بدون** قوائم إدارة |
| `/dashboard` | لوحة الإدارة |
| `/teacher` | واجهة المعلم (جوال أولاً) |
| `/programs` | بوابة البرامج |
| `/admin/*` `/education/*` | أقسام الإدارة |

## 3) شاشة التلفاز المعزولة

- `/tv-live` — ملء الشاشة، خلفية Imperial Dark Blue، تحديث KPI كل 30 ثانية
- من لوحة التحكم: **تشغيل شاشة التلفاز** (نافذة جديدة)

## النشر

```powershell
cd C:\Users\asama\Projects\basateen-platform
git add .
git commit -m "Refactor: mobile mock auth, routing, isolated TV /tv-live"
git push
```

## لاحقاً (أولوية 4–5)

- تحسين responsive إضافي
- مراجعة dark mode لكل الصفحات
- ربط الدخول بالجوال مع API حقيقي (بدل Mock)
