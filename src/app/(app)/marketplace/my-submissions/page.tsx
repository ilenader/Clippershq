import { getSession } from "@/lib/get-session";
import { isMarketplaceVisibleForUser } from "@/lib/marketplace-flag";
import { notFound } from "next/navigation";
import { MySubmissionsClient } from "./my-submissions-client";

export const dynamic = "force-dynamic";

// OWNER-only during the hidden phase. Mirrors /marketplace/admin and
// /marketplace/browse: notFound() for any non-OWNER (404, not 403) so the
// route's existence never leaks. Phase 11 will widen this.
export default async function MyMarketplaceSubmissionsPage() {
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string | null } | undefined;

  // Phase 10 — feature flag replaces OWNER hard-gate, mirrors API fix C1.
  // The API endpoint scopes all rows by creatorId === session.user.id, so
  // gate the page on the feature flag only.
  if (!isMarketplaceVisibleForUser(user as any)) notFound();

  return <MySubmissionsClient />;
}
