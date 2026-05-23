/**
 * تحميل أمثلة المشرف التعليمي على API المحلي (بعد seed-users و db:local:all)
 */
const API = process.env.API_BASE ?? "http://127.0.0.1:8787";
const KEY = process.env.SETUP_KEY ?? "basateen-setup-once";

const url = `${API.replace(/\/$/, "")}/api/setup/seed-edu-examples?key=${encodeURIComponent(KEY)}`;

const res = await fetch(url, { method: "POST" });
const body = await res.json().catch(() => ({}));

if (!res.ok && !body.skipped) {
  console.error("seed-edu-examples failed:", res.status, body);
  process.exit(1);
}

console.log("Edu examples:", JSON.stringify(body, null, 2));
console.log("\nPreview links (after UI dev or production):");
console.log("  /live-log/demo-himma-live");
console.log("  /live-log/demo-comp-extended");
console.log("  /live-log/demo-comp-intensive");
console.log("  /edu-supervisor/students/1");
