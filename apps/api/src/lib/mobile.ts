/** Normalize Saudi mobile — O(n) on digit length */
export function normalizeMobile(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("05")) return digits;
  if (digits.length === 12 && digits.startsWith("9665")) return `0${digits.slice(3)}`;
  return null;
}
