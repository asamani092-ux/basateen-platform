const API = process.env.API_BASE ?? "http://127.0.0.1:8787";
const KEY = process.env.SETUP_KEY ?? "basateen-setup-once";

const url = `${API.replace(/\/$/, "")}/api/setup/seed-prog-examples?key=${encodeURIComponent(KEY)}`;

const res = await fetch(url, { method: "POST" });
const body = await res.json().catch(() => ({}));

if (!res.ok && !body.skipped) {
  console.error("seed-prog-examples failed:", res.status, body);
  process.exit(1);
}

console.log("Prog examples:", JSON.stringify(body, null, 2));
console.log("\nTry: /quiz/" + (body.quiz_id ?? "1") + " code Ramadan2026");
console.log("Login: 0500000003 (prog supervisor)");
