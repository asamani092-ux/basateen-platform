# إصلاح فشل بناء Pages: npm ci / lock file

## الخطأ

```
Missing: @cloudflare/workers-types@4.20260522.1 from lock file
```

`package.json` كان يحتوي حزمة غير موجودة في `package-lock.json`.

## الحل المطبّق

- حذف `@cloudflare/workers-types` من `apps/web/package.json` (غير مطلوب لواجهة Vite؛ موجود في `apps/api` فقط).

## بعد الرفع

```powershell
cd C:\Users\asama\Projects\basateen-platform
git add apps/web/package.json
git commit -m "Fix Pages build: sync package.json with lock (remove workers-types from web)"
git push
```

## إن استمر الفشل على Pages

في **Cloudflare Pages → Settings → Build**:

| الحقل | القيمة |
|--------|--------|
| Root directory | `apps/web` |
| Build command | `npm install && npm run build` |
| Output | `dist` |

`npm install` أكثر تسامحاً من `npm ci` إذا تعذّر تحديث القفل محلياً.
