import { pbkdf2Sync, randomBytes } from "node:crypto";

const password = process.argv[2] ?? "Basateen123!";
const salt = process.argv[3]
  ? Buffer.from(process.argv[3], "hex")
  : Buffer.alloc(16, 7);

const hash = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
const b64 = (buf) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

console.log(`pbkdf2:100000:${b64(salt)}:${b64(hash)}`);
