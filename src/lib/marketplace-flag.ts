/**
 * Marketplace visibility logic.
 * Phase 2 — feature flag plumbing.
 *
 * Returns true if the marketplace UI should be visible to this user.
 * Logic:
 *   - If MARKETPLACE_ENABLED env var is "true" → visible to everyone
 *   - Else → visible only to OWNER role
 *
 * This keeps the marketplace OWNER-only during build (you can see it,
 * develop it, test it, but no clipper or admin sees it). Flip the env var
 * to "true" when ready to launch publicly.
 *
 * Note: MARKETPLACE_ENABLED is server-only (no NEXT_PUBLIC_ prefix), so
 * this helper is useful in server components, server actions, and API
 * routes. Client components that need to gate UI (e.g. the sidebar) must
 * fall back to a role-only check until the flag flips, since the env var
 * is unreadable in the browser. That is the intended behavior for the
 * hidden phase — non-OWNERs simply do not see the link.
 */

export type MinimalUser = {
  role?: string | null;
} | null | undefined;

export function isMarketplaceVisibleForUser(user: MinimalUser): boolean {
  if (process.env.MARKETPLACE_ENABLED === "true") return true;
  return user?.role === "OWNER";
}

/**
 * Server-side guard: throws 404 (not 403) if marketplace not visible.
 * Used in server components and API routes.
 * Throwing 404 (not 403) prevents leaking that the feature exists.
 */
export function assertMarketplaceVisible(user: MinimalUser): void {
  if (!isMarketplaceVisibleForUser(user)) {
    const err: any = new Error("Not Found");
    err.statusCode = 404;
    throw err;
  }
}
