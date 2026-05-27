# تشغيل الإنتاج من الملفات فقط (بدون Wrangler محلي)

كل الإعداد موجود **داخل المستودع**. ما تحتاجه مرة واحدة في GitHub فقط: **Secrets** (لا تُكتب داخل الكود).

## ما هو «من الملفات»؟

| المكوّن | الملف |
|---------|--------|
| مخططات D1 | `packages/database/schema/*.sql` |
| سكربت الترحيل | `scripts/d1-remote-migrate.sh` |
| ربط Worker + D1 | `apps/api/wrangler.toml` |
| Seed المستخدمين | `scripts/seed-remote.mjs` + `apps/api/src/routes/setup.ts` |
| تشغيل تلقائي | `.github/workflows/production-bootstrap.yml` |

## Secrets (مرة واحدة في GitHub)

**Settings → Secrets and variables → Actions**

| Secret | مطلوب |
|--------|--------|
| `CLOUDFLARE_API_TOKEN` | نعم |
| `CLOUDFLARE_ACCOUNT_ID` | نعم |
| `SETUP_KEY` | للـ seed التلقائي (نفس سر Worker) |

## طريقة واحدة من المتصفح

1. ادمج آخر `wrangler.toml` (يحتوي `[[env.production.d1_databases]]` و `d7716e75-...`).
2. **Actions** → **Production Bootstrap (D1 + API + Seed)** → **Run workflow**
3. اختر:
   - `migration_set`: **upgrade** (قاعدة موجودة) أو **all** (جديدة)
   - `run_seed`: **true**
4. انتظر ✅

## من Codespaces (بعد إضافة Secrets في GitHub)

لا يمكن تشغيل الترحيل البعيد **بدون** Token — لكن يمكنك تشغيل **نفس السكربتات** الموجودة في الملفات:

```bash
export CLOUDFLARE_API_TOKEN="من GitHub Secrets — انسخه يدوياً"
export CLOUDFLARE_ACCOUNT_ID="..."

cd /workspaces/basateen-platform
npm run db:remote:upgrade      # يقرأ packages/database/schema
npm run deploy:api:prod          # يقرأ apps/api/wrangler.toml

export SETUP_KEY="نفس السر على Worker"
npm run seed:remote              # يقرأ scripts/seed-remote.mjs
```

## محلي بالكامل (بدون Cloudflare)

```bash
npm run setup:local   # db:local:all + seed:local
npm run dev:api       # طرفية 1
npm run dev           # طرفية 2
```

## ما لا يمكن وضعه في GitHub (أمان)

- `CLOUDFLARE_API_TOKEN`
- `SETUP_KEY` / `JWT_SECRET`

هذه **أسرار** — تبقى في GitHub Secrets أو Cloudflare، وليس في `.ts` أو `.sql`.

## تحقق

```bash
curl -sS https://winter-term-cb93.a-samani092.workers.dev/api/health
```

المطلوب: `"db": { "ok": true, ... }`
