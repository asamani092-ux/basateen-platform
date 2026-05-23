/**
 * Seed مستخدمين + أمثلة Edu على API المحلي
 */
const API = process.env.API_BASE ?? "http://127.0.0.1:8787";
const KEY = process.env.SETUP_KEY ?? "basateen-setup-once";

async function post(path) {
  const url = `${API.replace(/\/$/, "")}${path}?key=${encodeURIComponent(KEY)}`;
  const res = await fetch(url, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

const users = await post("/api/setup/seed-users");
if (!users.res.ok && users.res.status !== 409) {
  console.error("seed-users failed:", users.res.status, users.body);
  process.exit(1);
}
console.log("seed-users:", users.body.skipped ? "skipped (exists)" : "OK");

const edu = await post("/api/setup/seed-edu-examples");
if (!edu.res.ok && !edu.body.skipped) {
  console.error("seed-edu-examples failed:", edu.res.status, edu.body);
  process.exit(1);
}
console.log("seed-edu-examples:", edu.body.skipped ? "skipped (exists)" : "OK");

const prog = await post("/api/setup/seed-prog-examples");
if (!prog.res.ok && !prog.body.skipped) {
  console.error("seed-prog-examples failed:", prog.res.status, prog.body);
  process.exit(1);
}
console.log("seed-prog-examples:", prog.body.skipped ? "skipped (exists)" : "OK");

console.log("\nMock mobiles: 0500000001..0500000005");
console.log("API password (all): Basateen123!");
console.log("Docs: docs/DEV-EXAMPLES.md + docs/DEV-EXAMPLES-PROG.md");
