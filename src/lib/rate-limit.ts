/**
 * In-memory rate limiter for API abuse protection.
 *
 * LIMITATION: This rate limiter uses an in-memory Map, which means:
 * - Counters reset on every server restart / redeploy
 * - Each serverless function instance has its own separate counter
 * - On Vercel, this provides per-instance protection but NOT global rate limiting
 * - For true global rate limiting, switch to Redis (e.g. Upstash) in the future
 *
 * For a single-instance deployment, this works correctly.
 * For serverless, it still provides meaningful per-instance burst protection.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean expired entries every 60 seconds
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 60_000);
}

/**
 * Check if a request is within rate limits.
 * @param key - Unique identifier (e.g., `clip-submit:${userId}`)
 * @param limit - Max requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns { allowed, retryAfterMs }
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    // New window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= limit) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Role-aware wrapper around checkRateLimit.
 *  - OWNER: bypasses entirely (returns allowed without touching the store).
 *  - ADMIN: gets baseLimit × adminMultiplier (default 5×) for the same window.
 *  - Everyone else (CLIPPER, CLIENT, undefined): gets baseLimit.
 *
 * Pass undefined for `role` to default to base limit. Use this when bulk
 * admin operations would otherwise be throttled by per-CLIPPER limits.
 */
export function checkRoleAwareRateLimit(
  key: string,
  baseLimit: number,
  windowMs: number,
  role: string | undefined,
  adminMultiplier = 5,
): { allowed: boolean; retryAfterMs: number } {
  if (role === "OWNER") return { allowed: true, retryAfterMs: 0 };
  const limit = role === "ADMIN" ? baseLimit * adminMultiplier : baseLimit;
  return checkRateLimit(key, limit, windowMs);
}

/**
 * Create a user-friendly 429 response with Retry-After header.
 */
export function rateLimitResponse(retryAfterMs: number): Response {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({
      error: `You're doing that too fast. Please wait ${retryAfterSec} second${retryAfterSec !== 1 ? "s" : ""} and try again.`,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}
