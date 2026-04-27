import { getSession } from "@/lib/get-session";
import { isMarketplaceVisibleForUser } from "@/lib/marketplace-flag";
import { notFound } from "next/navigation";
import { MarketplaceAdminClient } from "./marketplace-admin-client";

export const dynamic = "force-dynamic";

// OWNER-only by design. Even when the marketplace launches publicly (Phase 11),
// the admin queue stays locked to OWNER. notFound() (404) instead of 403 to
// avoid leaking that the route exists.
export default async function MarketplaceAdminPage() {
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string | null } | undefined;

  if (!isMarketplaceVisibleForUser(user)) notFound();
  if (user?.role !== "OWNER") notFound();

  return <MarketplaceAdminClient />;
}
