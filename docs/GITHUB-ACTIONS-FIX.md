# إصلاح فشل wrangler / GitHub Actions

## wrangler-action يفشل بدون رسالة واضحة

تم استبدال `cloudflare/wrangler-action@v3` بـ **`npx wrangler` مباشرة** في:
- `deploy-web.yml` — `wrangler pages deploy dist ...`
- `deploy-api.yml` — `wrangler deploy`
- `d1-migrate-remote.yml` — `wrangler d1 execute ...`

بعد `git push` أعد تشغيل الـ workflow واقرأ السجل في الخطوة الأخيرة (ستظهر رسالة wrangler الحقيقية).

---

## الأسباب الأشهر

### 1) أسرار GitHub غير مضافة (الأكثر شيوعاً)

في: https://github.com/asamani092-ux/basateen-platform/settings/secrets/actions

| Secret | من أين |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → Profile → **API Tokens** → Create Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard → يمين الصفحة (Account ID) |

**صلاحيات التوكن:**
- Account → Cloudflare Workers Scripts → **Edit**
- Account → **Cloudflare Pages** → **Edit** (لنشر `deploy-web`)
- Account → Account Settings → **Read**
- Account → D1 → **Edit** (لأن Worker مربوط بـ D1)

### 2) اسم مشروع Pages خاطئ

الموقع الحالي: `basateen-platform.pages.dev`  
يجب أن يكون: `--project-name=basateen-platform` (تم تصحيحه في workflow)

### 3) Pages مربوط مرتين

إن فعّلت **Connect to Git** في Cloudflare Pages **و** workflow `deploy-web.yml` — قد يتعارضان.  
**اختر واحداً:**
- **Dashboard Git** فقط (موصى به) — عطّل أو احذف `deploy-web.yml`
- **أو** GitHub Action فقط — أوقف البناء التلقائي من Dashboard

---

## بعد إضافة الأسرار

```powershell
cd C:\Users\asama\Projects\basateen-platform
git add .
git commit -m "Fix GitHub Actions: wrangler secrets check and Pages project name"
git push
```

أو من GitHub: **Actions** → **Deploy API** → **Run workflow**

---

## اختبار التوكن محلياً (اختياري)

```powershell
cd apps\api
$env:CLOUDFLARE_API_TOKEN="your-token"
npx wrangler whoami
npx wrangler deploy
```
