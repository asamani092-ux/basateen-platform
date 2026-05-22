# المراحل 1–3 — تعليمات التشغيل

## 0) Windows ARM64 (Snapdragon)

إذا فشل `npm install` في `apps/api` بـ `Unsupported platform: win32 arm64` — **لا تثبّت wrangler محلياً**. راجع `docs/D1-MIGRATE-GITHUB.md`.

## 1) تنفيذ SQL على D1 (مرة واحدة)

**من GitHub (موصى به على ARM64):** Actions → **D1 Migrate (remote)** → Run workflow → `all`

**أو محلياً (جهاز x64 فقط):**

```powershell
cd C:\Users\asama\Projects\basateen-platform\apps\api
npm install
npm run db:remote:all
```

## 2) إنشاء حسابات تجريبية (مرة واحدة)

```powershell
npm run deploy
Invoke-WebRequest -Method POST -Uri "https://winter-term-cb93.a-samani092.workers.dev/api/setup/seed-users?key=basateen-setup-once"
```

أو من المتصفح بعد النشر:
`POST /api/setup/seed-users?key=basateen-setup-once`

### الحسابات الافتراضية

| البريد | كلمة المرور | الدور |
|--------|-------------|--------|
| admin@basateen.local | Basateen123! | مدير عام |
| supervisor@basateen.local | Basateen123! | مشرف |
| teacher@basateen.local | Basateen123! | معلم |

## 3) JWT (إنتاج)

```powershell
npm exec wrangler -- secret put JWT_SECRET
```

## 4) رفع الواجهة والـ API

```powershell
cd C:\Users\asama\Projects\basateen-platform
git add .
git commit -m "Phase 1-3: auth, students, seed data"
git push
```

## 5) تجربة محلياً

```powershell
cd apps\api && npm install && npm run dev
cd apps\web && npm run dev
```

سجّل الدخول ثم: **إدارة الطلاب** من القائمة.
