import { getSession } from "@/lib/get-session";
import { isMarketplaceVisibleForUser } from "@/lib/marketplace-flag";
import { notFound } from "next/navigation";
import { IncomingSubmissionsClient } from "./incoming-client";

export const dynamic = "force-dynamic";

// Phase: poster-review page. OWNER-only during the hidden phase to mirror
// the rest of the marketplace gates. Phase 11 will widen the role check
// once the marketplace flag flips public — at that point posters of any
// role will be able to review submissions to their own listings (the
// /api/marketplace/submissions/incoming endpoint already scopes by
// listing.userId === session.user.id, so widening here is the only change
// needed). notFound() rather than 403 so the route doesn't leak when
// hidden.
export default async function IncomingSubmissionsPage() {
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string | null } | undefined;

  // Phase 10 — feature flag replaces OWNER hard-gate, mirrors API fix C1.
  // Per-resource scoping (where.listing.userId === session.user.id) stays
  // enforced server-side in /api/marketplace/submissions/incoming.
  if (!isMarketplaceVisibleForUser(user as any)) notFound();

  return <IncomingSubmissionsClient />;
}
