/**
 * Tiny in-memory TTL cache for slow-changing reference data.
 *
 * NEVER cache money data (earnings / clips / payouts / balance) or live
 * notifications — those must always reflect the latest DB state. Cache is
 * appropriate for reference data that changes only on admin action:
 * campaign metadata, user role, etc. A 60s staleness window after a role
 * change or campaign edit is acceptable; admins can pre-warm a refresh by
 * calling invalidateCache() on the relevant key in their mutation handler.
 *
 * Per-process: each Railway instance has its own cache. If we scale to N
 * instances, two users hitting different instances could see different
 * cached values for up to TTL seconds. Acceptable trade-off for the load
 * reduction (target: ~70% fewer reads on the campaign-list endpoint).
 */
type CacheEntry<T> = { value: T; expiresAt: number };
const cache = new Map<string, CacheEntry<any>>();
const MAX_ENTRIES = 1000;
const EVICT_BATCH = 100;

/**
 * Read-through cache. If a fresh entry exists, returns it. Otherwise calls
 * fetcher, stores the result for ttlMs, and returns it.
 *
 * Skips caching null/undefined results so a transient fetch failure doesn't
 * lock in an empty value for the next TTL window.
 *
 * Memory safety: if the cache exceeds MAX_ENTRIES, evicts the oldest 100
 * entries (Map iteration order = insertion order in JS).
 */
export async function cachedRead<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }
  const value = await fetcher();
  if (value !== null && value !== undefined) {
    if (cache.size >= MAX_ENTRIES) {
      const keys = Array.from(cache.keys()).slice(0, EVICT_BATCH);
      for (const k of keys) cache.delete(k);
    }
    cache.set(key, { value, expiresAt: now + ttlMs });
  }
  return value;
}

/** Drop a single key. Call after a mutation invalidates the cached value. */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/** Drop every key that starts with the given prefix. Useful for "user.role.*". */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
