"use client";

import { useRouter } from "next/navigation";
import { useDevAuth } from "@/components/dev-auth-provider";
import { useEffect } from "react";
import { Shield, User, Crown } from "lucide-react";

export default function DevLoginPage() {
  const { isDevMode, devRole, setDevRole, loading } = useDevAuth();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && devRole) {
      if (devRole === "ADMIN" || devRole === "OWNER") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    }
  }, [devRole, loading, router]);

  // If dev mode is not enabled, show error
  if (!isDevMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center">
          <p className="text-lg font-semibold text-red-400">Dev bypass is not enabled.</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Set DEV_AUTH_BYPASS=true in .env and restart.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  const handleSelect = async (role: "CLIPPER" | "ADMIN" | "OWNER") => {
    await setDevRole(role);
    if (role === "ADMIN" || role === "OWNER") {
      router.push("/admin");
    } else {
      router.push("/dashboard");
    }
  };

  const roles = [
    {
      role: "CLIPPER" as const,
      label: "Continue as Clipper",
      description: "View campaigns, submit clips, track earnings",
      icon: <User className="h-6 w-6" />,
      color: "text-accent",
      borderColor: "hover:border-accent/50",
    },
    {
      role: "ADMIN" as const,
      label: "Continue as Admin",
      description: "Review clips, manage campaigns, approve payouts",
      icon: <Shield className="h-6 w-6" />,
      color: "text-emerald-400",
      borderColor: "hover:border-emerald-400/50",
    },
    {
      role: "OWNER" as const,
      label: "Continue as Owner",
      description: "Full access: dashboard, analytics, settings",
      icon: <Crown className="h-6 w-6" />,
      color: "text-yellow-400",
      borderColor: "hover:border-yellow-400/50",
    },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] px-4 transition-theme">
      <div className="w-full max-w-md text-center">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <svg viewBox="0 0 100 100" className="h-14 w-14 drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]" fill="currentColor">
            <polygon points="50,10 90,85 10,85" className="text-white" />
          </svg>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            CLIPPERS HQ
          </h1>
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/5 px-3 py-1">
            <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-xs font-medium text-yellow-400">DEV MODE</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Choose a role to preview the app
          </p>
        </div>

        {/* Role Cards */}
        <div className="space-y-3">
          {roles.map(({ role, label, description, icon, color, borderColor }) => (
            <button
              key={role}
              onClick={() => handleSelect(role)}
              className={`w-full rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 text-left transition-all duration-150 hover:bg-[var(--bg-card-hover)] ${borderColor} cursor-pointer group`}
            >
              <div className="flex items-center gap-4">
                <div className={`${color} transition-transform group-hover:scale-110`}>
                  {icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
                  <p className="text-xs text-[var(--text-muted)]">{description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <p className="mt-8 text-xs text-[var(--text-muted)]">
          This page only works in local development.
          <br />
          Discord OAuth is still available at{" "}
          <a href="/login" className="text-accent hover:underline">/login</a>
        </p>
      </div>
    </div>
  );
}
