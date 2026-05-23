# ترحيل Wave-3 على Windows ARM64 (بدون `npm install` في apps/api)

## ماذا يعني الخطأ؟

```
Error: Unsupported platform: win32 arm64 LE
npm error path ...\node_modules\workerd
```

حزمة **workerd** (جزء من Wrangler) **لا تُثبَّت** على `win32` + `arm64`.  
جهازك: Node على معمارية ARM — هذا متوقع وليس عيباً في المشروع.

قد يظهر قبل ذلك:

```
EBUSY: resource busy or locked ... node_modules\esbuild
```

أغلق كل نوافذ `npm run dev` و Vite/Wrangler، ثم أعد المحاولة أو احذف `apps\api\node_modules` يدوياً.

---

## المسار الموصى به الآن (واجهة + API سحابي)

### 1) ثبّت الواجهة فقط

```powershell
cd C:\Users\asama\Projects\basateen-platform
.\scripts\install-local.ps1
# عند السؤال: N (تخطي apps/api)
```

أو:

```powershell
npm install --prefix apps\web
.\scripts\dev-web-remote.ps1
```

### 2) نفّذ SQL على D1 السحابة (بدون Wrangler محلي)

```powershell
.\scripts\bundle-wave3-sql.ps1
```

ثم:

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **D1** → قاعدة **basateen**
2. تبويب **Console**
3. انسخ محتوى `packages/database/schema/_wave3_bundle.sql` والصقه → **Run**

بديل: نفّذ الملفات الثلاثة يدوياً بالترتيب: `008` → `009` → `010`.

### 3) تحقق

- افتح الواجهة: http://localhost:5173
- سجّل دخول API (إن كان الـ Worker منشوراً ومُزروعاً)
- جرّب `/edu-supervisor/yom-himma`

---

## إن أردت Wrangler محلياً لاحقاً

| خيار | ماذا تفعل |
|------|-----------|
| **B — Node x64** | ثبّت Node 22 LTS **Windows x64** (ليس ARM). `node -p "process.arch"` يجب أن يعيد `x64`. ثم `npm install --prefix apps\api` و `npm run db:local:008`… |
| **C — WSL2** | Ubuntu داخل WSL، clone المشروع، `npm install` و `npm run setup:local` |

---

## Node.js v24

المشروع يدعم `>=20 <25`. v24 يعمل للواجهة؛ لمشاكل workerd الحاسمة هي **ARM64** وليس رقم الإصدار فقط. للإنتاج المحلي مع API يُفضَّل **Node 22 LTS x64**.
