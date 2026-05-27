# Cloudflare من GitHub Codespaces

## لماذا يفشل `wrangler login`؟

Codespaces لا يفتح متصفحاً (`xdg-open` غير متوفر). **لا تستخدم OAuth** — استخدم **API Token**.

## 1) إنشاء Token

1. [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**
2. قالب **Edit Cloudflare Workers** أو صلاحيات يدوية:
   - Account → **Workers Scripts** → Edit
   - Account → **D1** → Edit
   - Account → **Workers Secrets** / Account Settings (حسب القالب)
3. انسخ التوكن مرة واحدة.

## 2) في Codespaces

```bash
export CLOUDFLARE_API_TOKEN="paste-token-here"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"   # من يمين لوحة Cloudflare

cd apps/api
npm install

# أسرار الإنتاج (بدون متصفح)
npx wrangler secret put SETUP_KEY --env production
npx wrangler secret put JWT_SECRET --env production

# نشر
npx wrangler deploy --env production
```

عند `secret put` يُطلب منك **كتابة القيمة** في الطرفية (لن تُعرض أثناء الكتابة).

## 3) بديل بدون Wrangler: لوحة Cloudflare

**Workers & Pages** → `winter-term-cb93` → **Settings** → **Variables and Secrets** → **Encrypt**:

| الاسم | الاستخدام |
|--------|-----------|
| `SETUP_KEY` | `POST /api/setup/seed-users?key=...` |
| `JWT_SECRET` | تسجيل الدخول (32+ حرف) |

## 4) Seed من Codespaces (بدون secret put)

```bash
# بعد ضبط SETUP_KEY على Worker — استبدل السر
curl -sS -X POST "https://winter-term-cb93.a-samani092.workers.dev/api/setup/seed-users?key=YOUR_SETUP_KEY"
```

## 5) ترحيل D1

من Codespaces (مع نفس Token):

```bash
cd apps/api
npm run db:remote:upgrade
```

أو من المتصفح: **Actions** → **D1 Production Migrate** → `upgrade`.
