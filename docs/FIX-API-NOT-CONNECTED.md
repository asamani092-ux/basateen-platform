# إصلاح «API غير متصل» / Failed to fetch

## الحل الموصى به (مُطبَّق في المشروع)

الواجهة تطلب **`/api/health`** على **نفس النطاق** (بدون CORS):

- **محلياً:** بروكسي Vite في `vite.config.ts`
- **Pages:** `apps/web/functions/api/[[path]].ts` يوجّه إلى Worker

اترك `VITE_API_URL` **فارغاً** في `.env` وفي Cloudflare Pages.

### على Cloudflare Pages

1. **Settings** → **Environment variables** → **احذف** `VITE_API_URL` إن وُجد
2. **Deployments** → **Retry deployment**
3. افتح: `https://basateen-platform.pages.dev/api/health` — يجب JSON

### محلياً

```powershell
cd apps\web
# .env يحتوي VITE_API_URL=  (فارغ)
npm run dev
```

---

## بديل قديم (CORS على Worker)

### 1) CORS على Worker
المتصفح يمنع الطلب عبر دومينين مختلفين بدون CORS.

**الحل:** `wrangler deploy` من `apps/api`

### 2) VITE_API_URL مباشر (غير موصى به مع Pages)
| Name | Value |
|------|--------|
| `VITE_API_URL` | `https://winter-term-cb93.a-samani092.workers.dev` |

---

## الخطوة أ — تحديث Worker (CORS)

```powershell
cd C:\Users\asama\Projects\basateen-platform\apps\api
npm install
npx wrangler login
npx wrangler deploy
```

هذا يحدّث **نفس** Worker `winter-term-cb93` بكود يدعم `.pages.dev`.

---

## الخطوة ب — إعادة بناء Pages

1. Cloudflare Dashboard → **basateen-platform** (Pages)
2. **Settings** → **Environment variables** → Production:
   - `VITE_API_URL` = `https://winter-term-cb93.a-samani092.workers.dev`
3. **Deployments** → آخر نشر → **⋯** → **Retry deployment**

---

## اختبار CORS من المتصفح

افتح **F12** → **Console** على https://basateen-platform.pages.dev

إن رأيت `CORS` أو `blocked` → الخطوة أ لم تُنفَّذ بعد.

---

## اختبار API مباشرة (بدون CORS)

https://winter-term-cb93.a-samani092.workers.dev/api/health

يجب JSON — هذا لا يعني أن Pages متصل تلقائياً.
