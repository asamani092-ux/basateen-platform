# التطوير المحلي الكامل (بدون نشر)

> **الوضع الحالي للفريق:** تطوير الواجهة فقط — راجع **`docs/DEV-UI.md`** و `npm run dev`.

الهدف (لاحقاً): تشغيل **الواجهة + Worker API + D1 محلي** على جهازك، ثم النشر عند الجاهزية.

---

## المتطلبات

| الأداة | الإصدار |
|--------|---------|
| Node.js | 20.x أو 22.x (ليس 25+) |
| npm | يأتي مع Node |

---

## الإعداد لأول مرة (مرة واحدة)

من جذر المستودع `basateen-platform`:

```powershell
cd C:\Users\asama\Projects\basateen-platform

# 1) أسرار API محلية
Copy-Item apps\api\.dev.vars.example apps\api\.dev.vars

# 2) تبعيات
npm install
npm install --prefix apps\web
npm install --prefix apps\api

# 3) قاعدة D1 محلية + بيانات تجريبية
npm run setup:local
```

`setup:local` = تنفيذ SQL من `001` إلى `010` ثم إنشاء 5 مستخدمين عبر `/api/setup/seed-users`.

> أوامر D1 تستخدم **`npx wrangler`** من `apps/api/node_modules` — لا تعتمد على `wrangler` المثبت عالمياً في `%AppData%\Roaming\npm`.

---

## التشغيل اليومي

### الطريقة الأسهل (نافذة واحدة)

```powershell
.\scripts\dev-local.ps1
```

أو:

```powershell
npm run dev
```

| الخدمة | العنوان |
|--------|---------|
| الواجهة | http://localhost:5173 |
| API | http://127.0.0.1:8787 |
| صحة API | http://127.0.0.1:8787/api/health |

الواجهة توجّه `/api/*` تلقائياً إلى Worker المحلي (Vite proxy).

### نافذتان منفصلتان (إن فشل `concurrently`)

**نافذة 1 — API:**

```powershell
cd apps\api
npm run dev
```

**نافذة 2 — Web:**

```powershell
cd apps\web
npm run dev
```

---

## تسجيل الدخول المحلي

| الجوال | الدور |
|--------|-------|
| 0500000001 | مدير عام |
| 0500000002 | مشرف تعليمي |
| 0500000003 | مشرف برامج |
| 0500000004 | مشرف عام |
| 0500000005 | معلم |

- **الواجهة:** جوال فقط (Mock في المتصفح).
- **API:** بعد `seed:local` يُربط الجوال تلقائياً بحساب D1 (`Basateen123!` داخلياً للـ token).

---

## أوامر مفيدة

```powershell
# إعادة بناء قاعدة محلية من الصفر
npm run db:local:reset
npm run setup:local

# migrate فقط (بدون seed)
npm run db:local:all

# ترحيلات Wave-3 فقط (بعد 001–007)
cd apps\api
npm run db:local:008
npm run db:local:009
npm run db:local:010

# seed فقط (يحتاج API شغّال)
npm run seed:local
```

### خطأ: `Cannot find module ...\Roaming\npm\node_modules\wrangler\bin\wrangler.js`

السبب: npm يشغّل **wrangler العالمي** المعطوب بدل النسخة المحلية.

```powershell
cd C:\Users\asama\Projects\basateen-platform\apps\api
npm install
npm run db:local:008
```

إن استمر الخطأ على Windows ARM64، استخدم **الحل B** (Node x64) أو نفّذ `db:remote:008`–`010` على D1 السحابة.

---

## Windows ARM64 (Snapdragon) — خطأ `npm install --prefix apps\api`

### الخطأ الذي ظهر عندك

```
Error: Unsupported platform: win32 arm64 LE
npm error path ...\node_modules\workerd
```

**السبب:** حزمة `workerd` (التي يستخدمها Wrangler) **لا تثبت** على Windows ARM64 مع Node ARM64 الحالي.  
جهازك: `Node.js v24` على `win32 arm64` — هذا متوقع وليس خطأ في المشروع.

قد تظهر أيضاً تحذيرات `EBUSY` / `EPERM` على `esbuild.exe` — أغلق Cursor/Terminal التي تستخدم المجلد، ثم أعد المحاولة.

---

### الحل A — الأسرع الآن: واجهة محلية + API منشور (بدون `apps/api`)

```powershell
.\scripts\install-local.ps1
# عند السؤال: N (تخطي apps/api)

.\scripts\dev-web-remote.ps1
```

- الواجهة: http://localhost:5173  
- `/api` يذهب إلى Worker المنشور على Cloudflare  
- تطوير الشاشات والـ RBAC يعمل؛ قاعدة D1 تكون **على السحابة** (بعد migrate/seed هناك)

---

### الحل B — Node.js إصدار x64 (يعمل على Snapdragon عبر المحاكاة)

1. ثبّت **Node.js 22 LTS — Windows x64** (من nodejs.org، نسخة x64 وليس ARM64).
2. تأكد في PowerShell:

```powershell
node -p "process.arch"
# يجب أن يظهر: x64
```

3. ثم:

```powershell
cd C:\Users\asama\Projects\basateen-platform
Remove-Item -Recurse -Force apps\api\node_modules -ErrorAction SilentlyContinue
npm install --prefix apps\api
npm run setup:local
npm run dev
```

Wrangler سيستخدم `workerd` لـ **win32 x64** وليس arm64.

---

### الحل C — WSL2 (محلي 100%: API + D1)

### الحل الموصى به للـ API+D1 محلي: WSL2

1. ثبّت [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) + Ubuntu.
2. انسخ أو استنسخ المشروع داخل Linux:
   ```bash
   cd ~/basateen-platform
   npm install && npm install --prefix apps/web && npm install --prefix apps/api
   cp apps/api/.dev.vars.example apps/api/.dev.vars
   npm run setup:local
   npm run dev
   ```
3. افتح من Windows: `http://localhost:5173`

### بديل مؤقت: واجهة محلية + API بعيد

إن أردت **UI فقط** محلياً دون Worker محلي:

1. أنشئ `apps/web/.env.development.local`:
   ```
   VITE_API_PROXY_TARGET=https://winter-term-cb93.a-samani092.workers.dev
   ```
2. `npm run dev --prefix apps/web`

> هذا ليس «محلياً بالكامل» لكنه يسمح بتطوير الشاشات قبل حل مشكلة ARM.

### بديل: Mock فقط (بدون API)

- الدخول بالجوال يعمل بدون Worker.
- صفحات الطلاب/Excel تحتاج API — استخدم WSL أو الـ proxy للإنتاج أعلاه.

---

## التحقق السريع

1. [ ] `GET http://127.0.0.1:8787/api/health` → `{ "ok": true }`
2. [ ] فتح http://localhost:5173/login
3. [ ] دخول `0500000001` → `/admin/staff-management`
4. [ ] `/admin/students` تعرض بيانات (بعد seed + token)

راجع أيضاً: `docs/TEST-CHECKLIST.md`

---

## ماذا لا نفعله الآن

- لا `wrangler deploy`
- لا `git push` لنشر Pages (حتى تنتهي مرحلة التطوير المحلي)

عند الجاهزية للنشر: GitHub Actions أو الأوامر في `docs/DEPLOY-RUNBOOK.md` (إن وُجد).
