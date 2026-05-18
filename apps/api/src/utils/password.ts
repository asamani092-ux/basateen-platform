const encoder = new TextEncoder();

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID();
  const hash = await digest(`${salt}:${password}`);
  return `${salt}$${hash}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, expected] = stored.split("$");
  if (!salt || !expected) return false;
  const hash = await digest(`${salt}:${password}`);
  return hash === expected;
}
