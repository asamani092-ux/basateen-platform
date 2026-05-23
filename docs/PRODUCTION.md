# نشر الإنتاج — منصة بساتين

## معلومات البيئة الحالية

| المكوّن | القيمة |
|---------|--------|
| Worker | `winter-term-cb93` |
| API | `https://winter-term-cb93.a-samani092.workers.dev` |
| D1 | `basateen` (`d7716e75-85ff-4927-9c59-052240793cab`) |

---

## 1) ترحيل D1 السحابية

### من GitHub (موصى به — Windows ARM64)

1. ارفع المستودع إلى GitHub.
2. **Settings → Secrets → Actions**:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
3. **Actions** → اختر أحد workflows:

| Workflow | متى تستخدمه |
|----------|-------------|
| **D1 Production Migrate** | ترحيل فقط (`upgrade` = 006–020) |
| **Production Release (D1 + API)** | ترحيل ثم `deploy:prod` دفعة واحدة |
| **Deploy API (production)** | نشر Worker فقط |

**خيارات الترحيل (`migration_set`):**

| القيمة | المحتوى |
|--------|---------|
| `upgrade` | 006–020 (بدون 018) — **الافتراضي للإنتاج** |
| `all` | 001–020 (قاعدة جديدة) |
| `demo` | 018 فقط — تطوير |
| `skip` | في **Production Release** — نشر API بدون ترحيل |

> عند إعادة التشغيل قد تظهر تحذيرات «already applied» لملفات `ALTER` — هذا طبيعي.

### من جهاز يدعم Wrangler (x64 / macOS / WSL)

**قاعدة جديدة:**

```bash
cd apps/api
npm run db:remote:all
```

**ترقية (بعد 001–005):**

```bash
npm run db:remote:upgrade
```

**أمثلة تجريبية (لا للإنتاج):**

```bash
npm run db:remote:demo
```

---

## 2) أسرار Worker

```bash
cd apps/api
npx wrangler secret put JWT_SECRET --env production
npx wrangler secret put SETUP_KEY --env production
```

تحقق:

```bash
curl https://winter-term-cb93.a-samani092.workers.dev/api/health
```

يجب أن يظهر `"jwt_configured": true` و `"environment": "production"`.

---

## 3) نشر API

```bash
cd apps/api
npm run deploy:prod
```

---

## 4) CORS (بعد نشر Pages)

في `apps/api/wrangler.toml` تحت `[env.production.vars]`:

```toml
CORS_ALLOWED_ORIGINS = "https://YOUR-PROJECT.pages.dev"
```

ثم `npm run deploy:prod` مجدداً.

> `*.pages.dev` مسموح تلقائياً في الكود.

---

## 5) نشر الواجهة (Cloudflare Pages)

| الإعداد | القيمة |
|---------|--------|
| Root | `apps/web` |
| Build | `npm ci && npm run build` |
| Output | `dist` |

**متغيرات Production:**

| Variable | Value |
|----------|--------|
| `VITE_API_URL` | `https://winter-term-cb93.a-samani092.workers.dev` |
| `VITE_UI_DEV` | `false` |

مرجع محلي: `apps/web/.env.production`

---

## 6) Seed المستخدمين (مرة واحدة)

```powershell
$env:SETUP_KEY="your-production-setup-key"
$env:API_BASE="https://winter-term-cb93.a-samani092.workers.dev"
npm run seed:remote
```

أو من الجذر: `npm run seed:remote` بعد ضبط المتغيرات.

**جوالات تجريبية:** `0500000001` … `0500000005` — كلمة المرور الافتراضية `Basateen123!`  
**غيّرها فوراً** قبل الاستخدام الحقيقي.

في الإنتاج (`ENVIRONMENT=production`):

- `seed-users` — مسموح (مفتاح SETUP_KEY)
- `seed-edu-examples` / `seed-prog-examples` — **معطّل**

---

## 7) إعداد ما بعد النشر

1. دخول **مدير عام** (`0500000001`) → إعدادات الفصل (أسابيع + أيام الدراسة).
2. **معلم** → بناء خطط الفصل ثم الرصد اليومي.
3. اختبار الأدوار الخمسة على API حقيقي (`VITE_UI_DEV=false`).

---

## 8) قائمة تحقق سريعة

- [ ] GitHub Secrets: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`
- [ ] **Production Release** أو **D1 Production Migrate** (`upgrade`)
- [ ] `JWT_SECRET` + `SETUP_KEY` (Dashboard أو Wrangler على x64)
- [ ] **Deploy API** / Production Release
- [ ] Pages: `VITE_API_URL` + `VITE_UI_DEV=false`
- [ ] `CORS_ALLOWED_ORIGINS` إن لزم دومين مخصص
- [ ] `seed:remote` مرة واحدة
- [ ] تغيير كلمات المرور التجريبية
- [ ] `/api/health` → `jwt_configured: true`

---

## أوامر الجذر

```bash
npm run db:remote:upgrade   # D1
npm run deploy:api:prod     # Worker
npm run build:web:prod      # تحقق محلي من البناء
```
