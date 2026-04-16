"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function ClientLoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#080c10] px-4" style={{ overflow: "hidden" }}>
      <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full opacity-[0.06] blur-[140px] pointer-events-none" style={{ background: "#2596be" }} />
      <div className="absolute bottom-[-15%] right-[-5%] w-[50vw] h-[50vw] rounded-full opacity-[0.05] blur-[120px] pointer-events-none" style={{ background: "#60c8ff" }} />

      <div className="relative w-full max-w-md">
        <div className="absolute -top-px left-1/2 -translate-x-1/2 w-48 h-[2px]" style={{ background: "linear-gradient(90deg, transparent, #2596be, transparent)" }} />

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-8 sm:p-10 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-4" style={{ background: "rgba(37,150,190,0.1)", border: "1px solid rgba(37,150,190,0.2)" }}>
              <svg viewBox="0 0 100 100" className="h-8 w-8" fill="#2596be">
                <polygon points="50,10 90,85 10,85" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              CLIPPERS <span style={{ color: "#2596be" }}>HQ</span>
            </h1>
            <p className="mt-2 text-[15px]" style={{ color: "#7a8a9a" }}>
              Brand Client Portal
            </p>
          </div>

          {sent ? (
            <div className="text-center space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full mx-auto" style={{ background: "rgba(37,150,190,0.1)" }}>
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="#2596be" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-base font-medium text-white">Check your email</p>
              <p className="text-sm" style={{ color: "#7a8a9a" }}>
                If an account exists for <strong className="text-white">{email}</strong>, we sent a login link. It expires in 24 hours.
              </p>
              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="text-sm hover:underline cursor-pointer" style={{ color: "#2596be" }}
              >
                Try a different email
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Google sign in — primary */}
              <button
                onClick={() => signIn("google", { callbackUrl: "/client" })}
                className="w-full flex items-center justify-center gap-3 rounded-xl px-6 py-4 text-base font-semibold text-white cursor-pointer transition-all duration-150 active:scale-[0.98]"
                style={{ background: "#2596be", boxShadow: "0 0 30px rgba(37,150,190,0.2)" }}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/></svg>
                Sign in with Google
              </button>

              {/* Magic link — secondary */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/[0.06]" /></div>
                <div className="relative flex justify-center text-xs"><span className="px-3" style={{ background: "#080c10", color: "#5a6a7a" }}>or use a magic link</span></div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#2596be]/50 transition-colors"
                />
                {error && <p className="text-sm text-red-400">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl px-6 py-3 text-sm font-medium text-white cursor-pointer transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {loading ? "Sending..." : "Send login link"}
                </button>
              </form>
            </div>
          )}

          <div className="mt-6 text-center">
            <a href="/login" className="text-sm hover:underline" style={{ color: "#5a6a7a" }}>
              Clipper? Sign in with Discord
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
