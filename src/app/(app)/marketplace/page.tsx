import { getSession } from "@/lib/get-session";
import { isMarketplaceVisibleForUser } from "@/lib/marketplace-flag";
import { notFound } from "next/navigation";
import { ShoppingBag } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const session = await getSession();
  const user = session?.user as { role?: string | null } | undefined;

  if (!isMarketplaceVisibleForUser(user)) {
    notFound();
  }

  const isOwner = user?.role === "OWNER";
  const flagOn = process.env.MARKETPLACE_ENABLED === "true";
  const showOwnerPreview = isOwner && !flagOn;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
          <ShoppingBag className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {showOwnerPreview ? "Marketplace (Owner Preview)" : "Marketplace"}
          </h1>
          {showOwnerPreview ? (
            <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
              Hidden from clippers — visible only to OWNER until launch.
            </p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center">
        <ShoppingBag className="mx-auto mb-4 h-10 w-10 text-accent" />
        <h2 className="mb-2 text-lg font-bold text-[var(--text-primary)]">
          Marketplace — coming soon
        </h2>
        <p className="text-sm text-[var(--text-secondary)]">
          The clip marketplace is under construction. Posters and creators will
          connect here.
        </p>
      </div>
    </div>
  );
}
