import { createHash, randomUUID } from "node:crypto";

const password = process.argv[2] ?? "Basateen@123";
const salt = process.argv[3] ?? "basateen-seed";
const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
console.log(`${salt}$${hash}`);
