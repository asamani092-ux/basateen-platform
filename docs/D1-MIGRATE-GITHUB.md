# ترحيل D1 عبر GitHub (Windows ARM64)

على جهاز Snapdragon، `npm install` في `apps/api` يفشل بسبب `workerd`. نفّذ SQL من **GitHub Actions** على Linux.

## المتطلبات

في المستودع: **Settings → Secrets → Actions**

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

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

4. انتظر ✅ لكل خطوة (001 … 005).

إذا فشل ملف لأن الجدول موجود مسبقاً، شغّل workflow مرة أخرى واختر فقط الرقم التالي (مثلاً `002`).

## بعد الترحيل

1. **Deploy API** — إن لم يُنشر تلقائياً، شغّل workflow **Deploy API (Worker)** أو ادفع تغييراً على `apps/api`.

2. **حسابات تجريبية** (مرة واحدة، من PowerShell):

```powershell
Invoke-WebRequest -Method POST -Uri "https://winter-term-cb93.a-samani092.workers.dev/api/setup/seed-users?key=basateen-setup-once"
```

3. جرّب الدخول على Pages: `/login` — `admin@basateen.local` / `Basateen123!`

## بديل: لوحة Cloudflare

D1 → قاعدة `basateen` → **Console** → الصق محتوى كل ملف من `packages/database/schema/`.
