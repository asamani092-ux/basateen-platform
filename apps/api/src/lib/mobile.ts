/** Normalize Saudi mobile — O(n) on digit length */
export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("05")) return digits;
  if (digits.length === 12 && digits.startsWith("9665")) return `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith("5")) return `0${digits}`;
  return null;
}

/** O(n) — صيغة التخزين القياسية 05XXXXXXXX (نفس normalizeMobile) */
export function mobileForStorage(input: string): string | null {
  return normalizeMobile(input.trim());
}

/** D1 may store 05XXXXXXXX or 9665XXXXXXXX — lookup both */
export function mobileLookupKeys(normalized: string): string[] {
  if (normalized.length === 10 && normalized.startsWith("05")) {
    const intl = `966${normalized.slice(1)}`;
    return normalized === intl ? [normalized] : [normalized, intl];
  }
  if (normalized.length === 12 && normalized.startsWith("9665")) {
    const local = normalizeMobile(normalized);
    return local && local !== normalized ? [local, normalized] : [normalized];
  }
  return [normalized];
}

/**
 * O(n) — كل صيغ البحث لرقم جوال (تسجيل قديم بـ +966 أو مسافات).
 * يُستخدم في loadUserByMobile وفحص التكرار.
 */
export function mobileLookupVariants(input: string): string[] {
  const keys = new Set<string>();
  const trimmed = input.trim();
  if (trimmed) keys.add(trimmed);

  const normalized = normalizeMobile(trimmed);
  if (normalized) {
    for (const k of mobileLookupKeys(normalized)) keys.add(k);
    // تسجيل قديم بـ 9 أرقام بدون 0 (501234567)
    if (normalized.length === 10 && normalized.startsWith("05")) {
      keys.add(normalized.slice(1));
    }
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits) {
    keys.add(digits);
    if (digits.length === 12 && digits.startsWith("9665")) {
      keys.add(`+${digits}`);
      keys.add(`0${digits.slice(3)}`);
    }
    if (digits.length === 10 && digits.startsWith("05")) {
      keys.add(`966${digits.slice(1)}`);
      keys.add(`+966${digits.slice(1)}`);
    }
    if (digits.length === 9 && digits.startsWith("5")) {
      keys.add(`0${digits}`);
      keys.add(`966${digits}`);
      keys.add(`+966${digits}`);
    }
  }

  return [...keys];
}
