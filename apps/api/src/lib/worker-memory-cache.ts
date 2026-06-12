/** Short-lived in-memory cache scoped to a single Worker isolate. */
export const WORKER_CACHE_TTL_MS = 120_000;

type CacheEntry = { value: unknown; expiresAt: number };

const store = new Map<string, CacheEntry>();

export async function getOrLoadCached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = WORKER_CACHE_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && now <= hit.expiresAt) {
    return hit.value as T;
  }
  const value = await loader();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}
