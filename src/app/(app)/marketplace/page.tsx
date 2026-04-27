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
  // Same shape as GET /api/marketplace/listings, scoped to session user.
  let listings: any[] = [];
  if (db && user?.id) {
    listings = await withDbRetry(
      () => db!.marketplacePosterListing.findMany({
        where: { userId: user.id! },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          clipAccount: { select: { id: true, username: true, platform: true } },
          campaign: { select: { id: true, name: true, status: true } },
        },
      }),
      "marketplace.page.listMine",
    );
  }

  const flagOn = process.env.MARKETPLACE_ENABLED === "true";
  const isOwner = user?.role === "OWNER";

  return (
    <MarketplaceClient
      listings={listings}
      currentUser={{ id: user?.id ?? "", role: user?.role ?? "" }}
      hiddenMode={isOwner && !flagOn}
    />
  );
}
