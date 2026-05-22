# المرحلة 4 — نقل الطلاب (تراكمي)

## Big O

| العملية | زمني | مكاني |
|---------|------|--------|
| نقل طالب واحد | O(1) | O(1) |
| قائمة الحلقات | O(n) حلقات | O(n) |
| سجل التاريخ | O(k) k≤20 | O(k) |

## API

| Method | Path | الصلاحية |
|--------|------|----------|
| GET | `/api/circles` | مدير، مشرف |
| GET | `/api/students/:id` | مدير، مشرف |
| POST | `/api/students/:id/transfer` | مدير، مشرف |

Body للنقل:
```json
{ "circle_id": 2, "note": "سبب اختياري" }
```

## المنطق التراكمي

1. تجميد السجل المفتوح: `to_at` + `frozen_at`
2. إدراج سجل جديد بـ `from_at = now`
3. لا حذف ولا تعديل على السجلات المجمدة

## الواجهة

`/admin/transfers` — بحث → اختيار طالب → حلقة جديدة → تأكيد

## ربط الجوال بـ API

عند الدخول بالجوال يُستدعى تلقائياً `/api/auth/login` (حسابات seed) ويُخزَّن JWT في `basateen_api_token`.

## النشر

```powershell
git add .
git commit -m "Phase 4: cumulative student transfers API and UI"
git push
```

نشر Worker (تغييرات `apps/api`) + Pages (`apps/web`).
