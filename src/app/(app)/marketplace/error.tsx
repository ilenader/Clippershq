// Phase 10 — shared marketplace error boundary. Catches uncaught render
// errors on any /marketplace/* route and renders a friendly fallback so
// users never see the bare Next.js "Application error" white screen.
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MarketplaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to Sentry / logs but never to the user. Digest helps correlate
    // with server-side traces.
    console.error("[marketplace.error]", error?.message, error?.digest);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-lg items-center justify-center px-4 py-12">
      <div className="w-full rounded-2xl border border-accent/20 bg-[var(--bg-card)] p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10">
          <AlertCircle className="h-6 w-6 text-accent" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Marketplace hit a snag
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Try refreshing, or head back to your dashboard.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => reset()}>Retry</Button>
          <Link href="/dashboard">
            <Button variant="secondary">Back to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
