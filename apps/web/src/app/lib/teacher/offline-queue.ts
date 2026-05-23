import type { DailyMetrics } from "./daily-metrics";

const STORAGE_KEY = "basateen-teacher-offline-v1";

export type OfflineMarkPayload = {
  id: string;
  student_id: number;
  mark_date: string;
  metrics: DailyMetrics;
  plan_id?: number | null;
  createdAt: string;
  retries: number;
};

function readQueue(): OfflineMarkPayload[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineMarkPayload[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineMarkPayload[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function enqueueOfflineMark(
  payload: Omit<OfflineMarkPayload, "id" | "createdAt" | "retries">,
): void {
  const items = readQueue().filter(
    (x) =>
      !(
        x.student_id === payload.student_id && x.mark_date === payload.mark_date
      ),
  );
  items.push({
    ...payload,
    id: `${payload.student_id}-${payload.mark_date}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    retries: 0,
  });
  writeQueue(items);
}

export function listOfflineMarks(): OfflineMarkPayload[] {
  return readQueue();
}

export function removeOfflineMark(id: string): void {
  writeQueue(readQueue().filter((x) => x.id !== id));
}

export function offlinePendingCount(): number {
  return readQueue().length;
}

export type SyncHandler = (
  item: OfflineMarkPayload,
) => Promise<{ ok: boolean }>;

export async function flushOfflineQueue(
  sync: SyncHandler,
): Promise<{ synced: number; failed: number }> {
  let synced = 0;
  let failed = 0;
  const items = readQueue();
  for (const item of items) {
    try {
      const res = await sync(item);
      if (res.ok) {
        removeOfflineMark(item.id);
        synced += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { synced, failed };
}
