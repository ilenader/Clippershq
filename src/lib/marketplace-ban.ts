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
    // Cron will re-enforce on the next tick.
    return { banned: false, until: null };
  }
}
