/**
 * Seed مستخدمين تجريبيين على API الإنتاج (مرة واحدة فقط)
 * الاستخدام:
 *   SETUP_KEY=your-secret API_BASE=https://winter-term-cb93.a-samani092.workers.dev node scripts/seed-remote.mjs
 */
const API = process.env.API_BASE ?? "https://winter-term-cb93.a-samani092.workers.dev";
const KEY = process.env.SETUP_KEY;

if (!KEY) {
  console.error("مطلوب: SETUP_KEY=... node scripts/seed-remote.mjs");
  process.exit(1);
}

const url = `${API.replace(/\/$/, "")}/api/setup/seed-users?key=${encodeURIComponent(KEY)}`;
const res = await fetch(url, { method: "POST" });
const body = await res.json().catch(() => ({}));

if (!res.ok && res.status !== 409) {
  console.error("seed-users failed:", res.status, body);
  process.exit(1);
}

console.log(
  body.skipped || res.status === 409
    ? "seed-users: skipped (users already exist)"
    : "seed-users: OK",
);
console.log("\nغيّر كلمات المرور التجريبية Basateen123! قبل الاستخدام الفعلي.");
console.log("لا تشغّل seed-edu-examples أو seed-prog-examples على الإنتاج.");
