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
    <div className="relative flex min-h-screen items-center justify-center bg-[#080c10] px-4" style={{ overflow: "hidden" }}>
      {/* Animated gradient blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full opacity-[0.06] blur-[140px] pointer-events-none animate-[drift1_20s_ease-in-out_infinite]" style={{ background: "#0095f6" }} />
      <div className="absolute bottom-[-15%] right-[-5%] w-[50vw] h-[50vw] rounded-full opacity-[0.05] blur-[120px] pointer-events-none animate-[drift2_25s_ease-in-out_infinite]" style={{ background: "#60c8ff" }} />
      <div className="absolute top-[30%] right-[20%] w-[40vw] h-[40vw] rounded-full opacity-[0.04] blur-[100px] pointer-events-none animate-[drift3_18s_ease-in-out_infinite]" style={{ background: "#0095f6" }} />

      {/* Dot grid */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      {/* Card */}
      <div className="relative w-full max-w-md animate-[fadeUp_0.6s_ease-out]">
        {/* Gradient accent line */}
        <div className="absolute -top-px left-1/2 -translate-x-1/2 w-48 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #0095f6, transparent)" }} />

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-8 sm:p-10 shadow-2xl">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-4" style={{ background: "rgba(0,149,246,0.1)", border: "1px solid rgba(0,149,246,0.2)" }}>
              <svg viewBox="0 0 100 100" className="h-8 w-8" fill="#0095f6">
                <polygon points="50,10 90,85 10,85" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white" style={{ fontFamily: "'Manrope', sans-serif" }}>
              CLIPPERS <span style={{ color: "#0095f6" }}>HQ</span>
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "#7a8a9a" }}>
              The all-in-one platform for managing clips, campaigns, and payouts.
            </p>
            <p className="mt-2 text-xs" style={{ color: "#5a6a7a" }}>
              Track views in real-time &bull; Earn CPM-based payouts &bull; Work with top creators
            </p>
          </div>

          {/* Referral banner */}
          {ref && (
            <div className="mb-6 rounded-xl px-4 py-3 text-center" style={{ border: "1px solid rgba(0,149,246,0.2)", background: "rgba(0,149,246,0.05)" }}>
              <p className="text-sm font-medium" style={{ color: "#0095f6" }}>You were invited! Sign up to get a reduced payout fee.</p>
            </div>
          )}

          {/* Discord button */}
          <button
            onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
            className="w-full flex items-center justify-center gap-3 rounded-xl px-6 py-4 text-base font-semibold text-white cursor-pointer transition-all duration-150 active:scale-[0.98]"
            style={{ background: "#5865F2", boxShadow: "0 0 30px rgba(88,101,242,0.2)" }}
            onMouseOver={(e) => (e.currentTarget.style.boxShadow = "0 0 40px rgba(88,101,242,0.4)")}
            onMouseOut={(e) => (e.currentTarget.style.boxShadow = "0 0 30px rgba(88,101,242,0.2)")}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026 13.83 13.83 0 0 0 1.226-1.963.074.074 0 0 0-.041-.104 13.175 13.175 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z" />
            </svg>
            Sign in with Discord
          </button>

          {/* Google button (coming soon) */}
          <button
            disabled
            className="w-full flex items-center justify-center gap-3 rounded-xl px-6 py-4 text-base font-semibold text-white mt-3"
            style={{ background: "#1a1a2e", opacity: 0.5, cursor: "not-allowed" }}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Sign in with Google
          </button>
          <p className="text-center text-xs mt-1.5" style={{ color: "#5a6a7a" }}>Coming soon</p>

          <p className="mt-5 text-center text-sm" style={{ color: "#7a8a9a" }}>
            Join thousands of clippers earning from their content
          </p>
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: "#3a4a5a" }}>
          By signing in, you agree to our <a href="/terms.html" style={{color:"#5a6a7a",textDecoration:"underline"}}>terms of service</a> and <a href="/privacy.html" style={{color:"#5a6a7a",textDecoration:"underline"}}>privacy policy</a>.
        </p>
      </div>

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes drift1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(40px, -30px); }
        }
        @keyframes drift2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-50px, 30px); }
        }
        @keyframes drift3 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(30px, -40px); }
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
