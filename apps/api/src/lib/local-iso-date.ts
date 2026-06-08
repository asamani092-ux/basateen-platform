/** تاريخ محلي YYYY-MM-DD — يتجنب انزياح UTC في toISOString */
export function formatLocalIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayLocalIso(): string {
  return formatLocalIso(new Date());
}
