"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { Button } from "@/components/ui/button";

function LoginContent() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");

  // Store referral code in cookie so the server-side createUser event can read it
  useEffect(() => {
    if (ref) {
      document.cookie = `referral_code=${ref}; path=/; max-age=86400; samesite=lax`;
    }
  }, [ref]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4 transition-theme">
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <svg viewBox="0 0 100 100" className="h-14 w-14 drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]" fill="currentColor">
            <polygon points="50,10 90,85 10,85" className="text-white" />
          </svg>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            CLIPPERS HQ
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Sign in to access your dashboard
          </p>
        </div>

        {ref && (
          <div className="mb-4 rounded-xl border border-accent/20 bg-accent/5 px-4 py-2.5">
            <p className="text-sm text-accent">You were invited! Sign up to get a reduced payout fee.</p>
          </div>
        )}

        {/* Discord Login */}
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6">
          <Button
            onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
            size="lg"
            className="w-full gap-3"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.175 13.175 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
            </svg>
            Continue with Discord
          </Button>
        </div>

        <p className="mt-6 text-xs text-[var(--text-muted)]">
          By signing in, you agree to our terms of service.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
