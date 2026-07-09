/** تاريخ محلي YYYY-MM-DD — يتجنب انزياح UTC في toISOString */
export function formatLocalIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultDateRange(days = 7): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));
  return { start: formatLocalIso(start), end: formatLocalIso(end) };
}
