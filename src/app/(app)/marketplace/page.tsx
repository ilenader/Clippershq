import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { isMarketplaceVisibleForUser } from "@/lib/marketplace-flag";
import { notFound } from "next/navigation";
import { MarketplaceClient } from "./marketplace-client";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string | null } | undefined;

  if (!isMarketplaceVisibleForUser(user)) {
    notFound();
  }

  // Server-side direct fetch (not /api roundtrip) — already authenticated above.
  let listings: any[] = [];
  let campaigns: any[] = [];
  let clipAccounts: any[] = [];
  let accountCampaignAccess: Record<string, string[]> = {};

  if (db && user?.id) {
    const userId = user.id;

    listings = await withDbRetry(
      () => db!.marketplacePosterListing.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          clipAccount: { select: { id: true, username: true, platform: true } },
          campaign: { select: { id: true, name: true, status: true } },
        },
      }),
      "marketplace.page.listMine",
    );

    // ACTIVE non-archived campaigns for the create-listing dropdown.
    campaigns = await withDbRetry(
      () => db!.campaign.findMany({
        where: { status: "ACTIVE", isArchived: false },
        orderBy: { name: "asc" },
        take: 200,
        select: { id: true, name: true },
      }),
      "marketplace.page.campaigns",
    );

    // APPROVED non-deleted ClipAccounts owned by the user.
    clipAccounts = await withDbRetry(
      () => db!.clipAccount.findMany({
        where: { userId, status: "APPROVED", deletedByUser: false },
        orderBy: { username: "asc" },
        take: 200,
        select: { id: true, username: true, platform: true, profileLink: true },
      }),
      "marketplace.page.clipAccounts",
    );

    // Map of clipAccountId -> campaignIds the account is approved for.
    if (clipAccounts.length > 0) {
      const accountIds = clipAccounts.map((a) => a.id);
      const accessRows: any[] = await withDbRetry(
        () => db!.campaignAccount.findMany({
          where: { clipAccountId: { in: accountIds } },
          select: { clipAccountId: true, campaignId: true },
        }),
        "marketplace.page.campaignAccess",
      );
      for (const row of accessRows) {
        if (!accountCampaignAccess[row.clipAccountId]) {
          accountCampaignAccess[row.clipAccountId] = [];
        }
        accountCampaignAccess[row.clipAccountId].push(row.campaignId);
      }
    }
  }

  const flagOn = process.env.MARKETPLACE_ENABLED === "true";
  const isOwner = user?.role === "OWNER";

  return (
    <MarketplaceClient
      listings={listings}
      currentUser={{ id: user?.id ?? "", role: user?.role ?? "" }}
      hiddenMode={isOwner && !flagOn}
      campaigns={campaigns}
      clipAccounts={clipAccounts}
      accountCampaignAccess={accountCampaignAccess}
    />
  );
}
