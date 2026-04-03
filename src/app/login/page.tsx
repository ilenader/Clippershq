"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");

  useEffect(() => {
    if (ref) {
      document.cookie = `referral_code=${ref}; path=/; max-age=86400; samesite=lax`;
    }
  }, [ref]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#09090b] px-4 overflow-hidden">
      {/* Background grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
        backgroundSize: "32px 32px",
      }} />

      {/* Accent glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent/5 blur-[120px] pointer-events-none" />

      {/* Card */}
      <div className="relative w-full max-w-md animate-[fadeUp_0.6s_ease-out]">
        {/* Gradient accent line */}
        <div className="absolute -top-px left-1/2 -translate-x-1/2 w-48 h-[2px] bg-gradient-to-r from-transparent via-accent to-transparent" />

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-8 sm:p-10 shadow-2xl">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-accent/10 border border-accent/20 mb-4">
              <svg viewBox="0 0 100 100" className="h-8 w-8" fill="#2596be">
                <polygon points="50,10 90,85 10,85" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              CLIPPERS <span className="text-accent">HQ</span>
            </h1>
            <p className="mt-2 text-[15px] text-zinc-400 leading-relaxed">
              The all-in-one platform for managing clips, campaigns, and payouts.
            </p>
          </div>

          {/* Referral banner */}
          {ref && (
            <div className="mb-6 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 text-center">
              <p className="text-sm text-accent font-medium">You were invited! Sign up to get a reduced payout fee.</p>
            </div>
          )}

          {/* Discord button */}
          <button
            onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
            className="w-full flex items-center justify-center gap-3 rounded-xl bg-accent px-6 py-4 text-base font-semibold text-white hover:bg-[#1e7ea3] active:scale-[0.98] transition-all duration-150 shadow-lg shadow-accent/20 cursor-pointer"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.175 13.175 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
            </svg>
            Sign in with Discord
          </button>

          <p className="mt-5 text-center text-sm text-zinc-500">
            Join thousands of clippers earning from their content
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          By signing in, you agree to our terms of service.
        </p>
      </div>

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
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
