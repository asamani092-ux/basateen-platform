# منصة مجمع البساتين (Basateen Platform)

منصة سحابية: React (Pages) + Cloudflare Worker + D1.

## تطوير الواجهة الآن (Windows ARM64)

```powershell
npm run install:ui
npm run dev
```

افتح http://localhost:5173 — التفاصيل في **`docs/DEV-UI.md`**.

## الهيكل

```
apps/api/          → Cloudflare Worker (REST API)
apps/web/          → React + Vite (واجهة RTL / Tajawal)
packages/database/ → مخططات SQL لـ D1
```

## المتطلبات

- حساب [Cloudflare](https://dash.cloudflare.com)
- [GitHub](https://github.com) (موصى به — البناء على السحاب)
- Node.js 20+ (اختياري محلياً؛ البناء عبر GitHub Actions)

## إعداد Cloudflare

### 1) D1

قاعدة موجودة: `basateen`  
Database ID: `ab9ce5ad-7c2a-4f58-8e18-c0db7a30dfad`

**ترحيل كامل (001–020، بدون أمثلة Edu 018):**

```bash
cd apps/api
npm run db:remote:all
```

**ترقية من مخطط قديم (بعد 005):**

```bash
npm run db:remote:upgrade
```

دليل النشر الكامل: **[docs/PRODUCTION.md](docs/PRODUCTION.md)**  
**Windows ARM64:** استخدم GitHub Actions → **D1 Production Migrate** / **Production Release** (لا Wrangler محلي).

### 2) Worker (API)

```bash
cd apps/api
npx wrangler login
npx wrangler secret put JWT_SECRET --env production
npx wrangler secret put SETUP_KEY --env production
npm run deploy:prod
```

ربط دومين مخصص: Worker → **Domains** → `api.yourdomain.com`

### 3) Pages (الواجهة)

**من Git (موصى به — مناسب لجهاز Snapdragon):**

1. ارفع هذا المستودع إلى GitHub.
2. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. الإعدادات:
   - Root directory: `apps/web`
   - Build command: `npm ci && npm run build`
   - Build output: `dist`
   - `VITE_API_URL` = `https://winter-term-cb93.a-samani092.workers.dev`
   - `VITE_UI_DEV` = `false`

### 4) أسرار GitHub (للنشر التلقائي)

في GitHub → Settings → Secrets → Actions:

| Secret | الوصف |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | Token مع صلاحية Workers + Pages |
| `CLOUDFLARE_ACCOUNT_ID` | من Cloudflare Dashboard |

## التطوير المحلي (اختياري)

```bash
# API
cd apps/api && npm install && npx wrangler dev

# Web
cd apps/web && npm install && npm run dev
```

## API

| Method | Path | الوصف |
|--------|------|--------|
| GET | `/api/health` | صحة الخدمة |
| GET | `/api/tv/summary` | ملخص مؤشرات (قراءة) |
| POST | `/api/auth/login` | تسجيل دخول (مرحلة لاحقة) |
| GET | `/api/auth/me` | المستخدم الحالي |

## الهوية البصرية

المكونات من دليل الهوية: `Tajawal`, RTL, `#1e3a8a`, مكونات `components/ui`.

ضع الشعار في `apps/web/public/logo-light.png` و `logo-dark.png`.

## Worker الحالي

يمكنك الاستمرار على `winter-term-cb93` أو نشر هذا المشروع كـ `basateen-api` وتحديث `wrangler.toml` → `name`.

---

## نسخ مكونات UI الكاملة من دليل الهوية

شغّل مرة واحدة على جهازك (PowerShell):

```powershell
cd C:\Users\asama\Projects\basateen-platform
powershell -ExecutionPolicy Bypass -File scripts\copy-design-ui.ps1
```

---

## رفع المشروع إلى GitHub

```powershell
cd C:\Users\asama\Projects\basateen-platform
git init
git add .
git commit -m "Initial Basateen platform: API, web, D1 schema"
git branch -M main
git remote add origin https://github.com/YOUR_USER/basateen-platform.git
git push -u origin main
```

## ربط Cloudflare (بعد GitHub)

### Pages (الواجهة)
1. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Repository: `basateen-platform`
3. **Root directory:** `apps/web`
4. **Build command:** `npm install && npm run build`
5. **Output:** `dist`
6. **Environment variable:** `VITE_API_URL` = `https://winter-term-cb93.a-samani092.workers.dev` (أو دومين API)

### Worker (API) — عبر GitHub Actions
أضف Secrets في GitHub → Settings → Secrets → Actions:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

أضف Variable (اختياري للويب):
- `VITE_API_URL` في GitHub → Settings → Variables

### الدومين
- Worker → **Domains** → `api.yourdomain.com`
- Pages → **Custom domains** → `app.yourdomain.com`

## الشعار
ضع الملفات في `apps/web/public/logo-light.png` و `logo-dark.png`
