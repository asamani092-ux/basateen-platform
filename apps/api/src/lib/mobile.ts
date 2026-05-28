/** Normalize Saudi mobile — O(n) on digit length */
export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("05")) return digits;
  if (digits.length === 12 && digits.startsWith("9665")) return `0${digits.slice(3)}`;
  return null;
}

/** DB may store 05XXXXXXXX or 9665XXXXXXXX — both keys for lookup */
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
