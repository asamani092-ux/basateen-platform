# إصلاح فشل wrangler / GitHub Actions

## wrangler-action يفشل بدون رسالة واضحة

تم استبدال `cloudflare/wrangler-action@v3` بـ **`npx wrangler` مباشرة** في:
- `deploy-web.yml` — `wrangler pages deploy dist ...`
- `deploy-api.yml` — `wrangler deploy`
- `d1-migrate-remote.yml` — `wrangler d1 execute ...`

بعد `git push` أعد تشغيل الـ workflow واقرأ السجل في الخطوة الأخيرة (ستظهر رسالة wrangler الحقيقية).

---

## الأسباب الأشهر

### 1) أسرار GitHub غير مضافة أو التوكن غير صالح (الأكثر شيوعاً)

في: https://github.com/asamani092-ux/basateen-platform/settings/secrets/actions

| Secret | القيمة |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | توكن API جديد (انظر أدناه) |
| `CLOUDFLARE_ACCOUNT_ID` | `01f5b1526aa792441a4b9ca33a156327` |

**صلاحيات التوكن (كلها مطلوبة):**

| المورد | الصلاحية | مطلوب لـ |
|--------|----------|----------|
| Account → **Workers Scripts** | **Edit** | `wrangler deploy` ← **سبب `Authentication error [10000]` على `/workers/services/...`** |
| Account → **Cloudflare Pages** | **Edit** | `pages deploy` |
| Account → **D1** | **Edit** | `d1 execute --remote` |
| Account → Account Settings | **Read** | `wrangler whoami` |

**قراءة أخطاء wrangler:**

| الخطأ | المعنى |
|-------|--------|
| `Invalid access token [9109]` | التوken **غير صالح** — لصق خاطئ، منتهي، أو ملغى |
| `Authentication error [10000]` على `/workers/services/...` | التوken صالح لـ whoami لكن **يفتقر Workers Scripts → Edit** |

> إذا ظهر `whoami` بنجاح لكن `deploy` يفشل بـ `[10000]` — التوكن يفتقر **Workers Scripts → Edit** أو مربوط بحساب آخر.

> **مهم:** تحديث Secret في GitHub **لا يعيد تشغيل** الـ workflow تلقائياً. بعد التحديث: Actions → **Deploy API (production)** → **Run workflow**.

### إنشاء توكن جديد (موصى به)

1. https://dash.cloudflare.com/profile/api-tokens → **Create Token**
2. **Edit Cloudflare Workers** (قالب جاهز) → **Continue to summary**
3. **Add more permissions** → Account → **Cloudflare Pages** → **Edit**
4. Account Resources: **Include** → حسابك
5. Create Token → انسخ القيمة
6. GitHub → `basateen-platform` → Settings → Secrets → Actions:
   - حدّث `CLOUDFLARE_API_TOKEN` بالتوكن الجديد
7. Actions → **Deploy Web (Pages)** → Re-run

`whoami` ينجح حتى بدون Pages Edit — لذلك يبدو التوكن «صحيحاً» لكن `pages deploy` يفشل.

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
