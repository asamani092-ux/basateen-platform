# ترحيل D1 عبر GitHub (Windows ARM64)

على جهاز Snapdragon، `npm install` في `apps/api` يفشل بسبب `workerd`. نفّذ SQL من **GitHub Actions** على Linux.

## المتطلبات

في المستودع: **Settings → Secrets → Actions**

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### صلاحيات التوكن (مهم — سبب شائع للفشل)

في [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) عدّل التوكن المستخدم في GitHub وأضف:

| الصلاحية | القيمة |
|----------|--------|
| Account → **D1** | **Edit** |
| Account → **Workers Scripts** | **Edit** |
| Account → **Workers KV** | Edit (اختياري) |

بدون **D1 Edit** يفشل `d1 execute` برمز 1 **بدون رسالة واضحة** في `wrangler-action`.

بعد التعديل: أعد تشغيل workflow **D1 Migrate (remote)**.

## الخطوات

1. ارفع هذا الملف مع المشروع:

```powershell
cd C:\Users\asama\Projects\basateen-platform
git add .
git commit -m "Add D1 migrate workflow for ARM64"
git push
```

2. افتح: `https://github.com/asamani092-ux/basateen-platform/actions`

3. اختر **D1 Migrate (remote)** → **Run workflow** → Branch: `main` → Migration: **all** → Run

4. افتح خطوة **Run D1 SQL (remote)** في السجل — ستظهر رسالة wrangler الحقيقية (وليس فقط `Action failed`).

5. انتظر ✅. إذا فشل ملف لأن الجدول موجود مسبقاً، شغّل workflow مرة أخرى واختر فقط الرقم التالي (مثلاً `002`).

### إذا ظهر `Action failed` بدون تفاصيل (الإصدار القديم)

كان السبب غالباً `wrangler-action` يخفي خطأ D1. الحل: رفع آخر commit (workflow يستخدم `npx wrangler` + `--yes`) + **D1 Edit** على التوكن.

## بعد الترحيل

1. **Deploy API** — إن لم يُنشر تلقائياً، شغّل workflow **Deploy API (Worker)** أو ادفع تغييراً على `apps/api`.

2. **حسابات تجريبية** (مرة واحدة، من PowerShell):

```powershell
Invoke-WebRequest -Method POST -Uri "https://winter-term-cb93.a-samani092.workers.dev/api/setup/seed-users?key=basateen-setup-once"
```

3. جرّب الدخول على Pages: `/login` — `admin@basateen.local` / `Basateen123!`

## بديل: لوحة Cloudflare

D1 → قاعدة `basateen` → **Console** → الصق محتوى كل ملف من `packages/database/schema/`.
