# تشغيل Vite على Windows ARM64 (Snapdragon)

## الخطأ

```
Failed to load module @rollup/rollup-win32-arm64-msvc
Required DLL was not found
```

## الحل 1 — WASM (موصى به في المشروع)

المشروع يستخدم `overrides` لاستبدال Rollup بـ `@rollup/wasm-node` (أبطأ قليلاً لكن يعمل بدون DLL).

```powershell
cd apps\web
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item package-lock.json -ErrorAction SilentlyContinue
npm install
npm run dev
```

## الحل 2 — Visual C++ Redistributable

ثبّت حزمة ARM64 من Microsoft:

https://aka.ms/vs/17/release/vc_redist.arm64.exe

أعد تشغيل الجهاز ثم `npm run dev`.

## الحل 3 — Node.js 20 LTS

Node 24 قد يسبب مشاكل. ثبّت **20 LTS ARM64** من nodejs.org ثم أعد `npm install`.

## الحل 4 — بدون تشغيل محلي

ارفع المشروع إلى **GitHub** و**Cloudflare Pages** — البناء على خوادم Cloudflare (x64) ولا يحتاج جهازك.

---

بعد `npm run dev` أنشئ `.env`:

```
VITE_API_URL=https://winter-term-cb93.a-samani092.workers.dev
```
