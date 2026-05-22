# إصلاح: wrangler على Windows

## Windows ARM64 (Snapdragon) — الأهم

```
Error: Unsupported platform: win32 arm64 LE
```

**لا تستخدم `npm install` في `apps/api` على جهازك.** استخدم GitHub Actions:

→ `docs/D1-MIGRATE-GITHUB.md` — workflow **D1 Migrate (remote)**

---

## Cannot find module wrangler.js

## السبب

`npx wrangler` يحاول تشغيل نسخة **عالمية** مكسورة:

`C:\Users\asama\AppData\Roaming\npm\node_modules\wrangler\bin\wrangler.js`

المشروع يضم `wrangler` داخل `apps/api` لكن يجب تثبيت الحزم أولاً.

## الحل (من مجلد API)

```powershell
cd C:\Users\asama\Projects\basateen-platform\apps\api
npm install
```

ثم استخدم **npm run** (يستخدم wrangler المحلي تلقائياً):

```powershell
npm run db:remote:001
npm run db:remote:002
npm run db:remote:003
npm run db:remote:004
npm run db:remote:005
```

أو دفعة واحدة:

```powershell
npm run db:remote:all
```

نشر Worker:

```powershell
npm run deploy
```

## بديل (بدون إصلاح النسخة العالمية)

```powershell
.\node_modules\.bin\wrangler.cmd d1 execute basateen --remote --file=..\..\packages\database\schema\001_core.sql
```

## تنظيف اختياري للنسخة العالمية التالفة

```powershell
npm uninstall -g wrangler
```

لا حاجة لإعادة التثبيت العالمي — `npm run` داخل `apps/api` كافٍ.

## بديل من لوحة Cloudflare

D1 → `basateen` → Console → الصق محتوى كل ملف `001` … `005` يدوياً.
