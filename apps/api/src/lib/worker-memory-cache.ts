/** Short-lived in-memory cache scoped to a single Worker isolate. */
export const WORKER_CACHE_TTL_MS = 120_000;

/** Schema introspection — longer TTL; column map preloaded on cold start. */
export const SCHEMA_CACHE_TTL_MS = 600_000;

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

/** Prime cache without a D1 round-trip — used after batched schema preload. */
export function primeCached<T>(
  key: string,
  value: T,
  ttlMs: number = WORKER_CACHE_TTL_MS,
): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function isCached(key: string): boolean {
  const hit = store.get(key);
  return Boolean(hit && Date.now() <= hit.expiresAt);
}
