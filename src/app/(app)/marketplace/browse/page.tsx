import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { isMarketplaceVisibleForUser } from "@/lib/marketplace-flag";
import { notFound } from "next/navigation";
import { BrowseClient } from "./browse-client";

export const dynamic = "force-dynamic";

// OWNER-only by design during hidden phase. Even when the marketplace flag
// flips to public, this stays gated until Phase 11 explicitly opens browse to
// authenticated users (the helper alone is too permissive once env flag flips).
// notFound() (404) instead of 403 to avoid leaking that the route exists.
export default async function MarketplaceBrowsePage() {
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string | null } | undefined;

  if (!isMarketplaceVisibleForUser(user)) notFound();
  if (user?.role !== "OWNER") notFound();

  // Active campaigns for the filter dropdown. Listings are NOT prefetched
  // server-side — the client owns filter state and refetches on change.
  let campaigns: { id: string; name: string }[] = [];
  if (db) {
    campaigns = await withDbRetry(
      () => db!.campaign.findMany({
        where: { status: "ACTIVE", isArchived: false },
        orderBy: { name: "asc" },
        take: 200,
        select: { id: true, name: true },
      }),
      "marketplace.browse.page.campaigns",
    );
  }

  return <BrowseClient campaigns={campaigns} currentUserId={user?.id ?? ""} />;
}
