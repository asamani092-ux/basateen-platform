# تقرير فحص المشروع — basateen-platform

تاريخ الفحص: 2026-05-18

## ملخص سريع

| الحالة | العدد |
|--------|-------|
| سليم | الهيكل، API، SQL، UI (48 ملف)، سكربت النسخ |
| تحذير | شعارات، تبعيات (تم إصلاح package.json)، auth غير مفعّل |
| يدوي | GitHub، Pages، D1 migrations |

---

## apps/api — سليم

- `index.ts`, `router.ts`, `middleware/cors.ts`
- Routes: `/api/health`, `/api/tv/summary`, `/api/auth/*` (placeholder)
- `wrangler.toml`: D1 `basateen` + ID `d7716e75-85ff-4927-9c59-052240793cab`

## apps/web — سليم مع ملاحظات

- Routing: 11 صفحة + login
- `theme.css`: ألوان البساتين `#1e3a8a`
- `components/ui`: 48 ملف (منسوخ من basateen-design-guide)
- `package.json`: محدّث بكل تبعيات Radix/shadcn

## packages/database — سليم

- `001_core.sql` … `004_programs.sql` (ليس 001.sql — الاسم في README صحيح)

## public — تحقق يدوياً

يجب وجود:
- `logo-light.png`
- `logo-dark.png`

## الخطوات التالية

1. `cd apps/web && npm install && npm run build`
2. رفع GitHub + Cloudflare Pages
3. `wrangler d1 execute` للمخططات 001–004
