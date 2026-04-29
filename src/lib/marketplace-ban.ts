/**
 * Marketplace-specific ban helper.
 *
 * NOT the same as account-level ban (UserStatus=BANNED, enforced by
 * src/lib/check-ban.ts). A marketplace ban only blocks marketplace
 * actions (create listing, submit clip, approve/reject) — the user
 * keeps full account access elsewhere.
 *
 * Ban window is per-strike: the latest strike row whose `bannedUntil`
 * is in the future means the user is currently marketplace-banned.
 * Phase 5 cron flips ACTIVE listings to BANNED when this fires and
 * restores them when the window expires.
 *
 * Usage:
 *   const { banned, until } = await isUserMarketplaceBanned(userId);
 *   if (banned) return 403 with `until.toISOString()`.
 */
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";

export async function isUserMarketplaceBanned(userId: string): Promise<{
  banned: boolean;
  until: Date | null;
}> {
  if (!db) return { banned: false, until: null };
  try {
    const strike: any = await withDbRetry(
      () => db!.marketplaceStrike.findFirst({
        where: { userId, bannedUntil: { gt: new Date() } },
        orderBy: { bannedUntil: "desc" },
        select: { bannedUntil: true },
      }),
      "marketplace.ban.check",
    );
    if (!strike?.bannedUntil) return { banned: false, until: null };
    return { banned: true, until: new Date(strike.bannedUntil) };
  } catch {
    // Fail open: a transient DB blip should not lock everyone out.
    // Cron will re-enforce on the next tick. Used for READ-only paths
    // (sidebar visibility, page renders, browse). Mutation paths must
    // use the strict variant below.
    return { banned: false, until: null };
  }
}

// Phase: launch-fix H2 — fail-closed variant for mutation paths.
// Same successful-path return shape as isUserMarketplaceBanned, but
// throws on DB error instead of silently falling open. Mutation
// endpoints MUST catch this and return 503; better to refuse a
// legitimate request during a DB blip than to let a banned user
// slip through.
export async function assertNotMarketplaceBannedStrict(userId: string): Promise<{
  banned: boolean;
  until: Date | null;
}> {
  if (!db) throw new Error("Database unavailable for marketplace ban check");
  const strike: any = await withDbRetry(
    () => db!.marketplaceStrike.findFirst({
      where: { userId, bannedUntil: { gt: new Date() } },
      orderBy: { bannedUntil: "desc" },
      select: { bannedUntil: true },
    }),
    "marketplace.ban.checkStrict",
  );
  if (!strike?.bannedUntil) return { banned: false, until: null };
  return { banned: true, until: new Date(strike.bannedUntil) };
}
