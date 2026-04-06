"use client";

import { useSession, signOut } from "next-auth/react";
import { useDevAuth } from "@/components/dev-auth-provider";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { Navbar } from "./navbar";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { Menu, X, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const { isDevMode, devSession, devRole, loading: devLoading } = useDevAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile nav on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const isLoading = isDevMode ? devLoading : status === "loading";
  const effectiveSession = isDevMode && devSession ? devSession : session;
  const effectiveRole = isDevMode && devSession
    ? devSession.user.role
    : (session?.user as any)?.role || "CLIPPER";
  const effectiveStatus = isDevMode && devSession
    ? "ACTIVE"
    : (session?.user as any)?.status || "ACTIVE";
  const isAuthenticated = isDevMode ? !!devRole : status === "authenticated";

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push(isDevMode ? "/dev-login" : "/login");
    }
  }, [isLoading, isAuthenticated, isDevMode, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  if (!effectiveSession?.user) return null;

  // ── Ban enforcement at UI level ──
  if (effectiveStatus === "BANNED") {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)] px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 mx-auto">
            <ShieldOff className="h-8 w-8 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Account Banned</h1>
            <p className="mt-2 text-[15px] text-[var(--text-secondary)]">
              Your account has been permanently banned for violating our terms.
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Contact support on Discord if you believe this is an error.
            </p>
          </div>
          <Button
            variant="danger"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] transition-theme">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar role={effectiveRole} />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 h-full w-64">
            <Sidebar role={effectiveRole} />
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-[-44px] flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col lg:ml-60 min-w-0 overflow-x-hidden">
        {/* Mobile header: hamburger + logo + bell/theme/avatar all on ONE line */}
        <div className="lg:hidden flex items-center justify-between h-14 px-3 border-b border-[var(--border-color)] bg-[var(--bg-glass)] backdrop-blur-xl">
          <div className="flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
            <button onClick={() => setMobileOpen(true)} className="rounded-lg p-1.5 text-[var(--text-primary)] hover:bg-[var(--bg-input)] cursor-pointer">
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-bold tracking-tight text-[var(--text-primary)]">CLIPPERS HQ</span>
          </div>
          <div className="flex items-center flex-shrink-0">
            <Navbar />
          </div>
        </div>
        <div className="hidden lg:block">
          <Navbar />
        </div>
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6">{children}</main>
      </div>
      <ChatWidget userId={effectiveSession.user.id} role={effectiveRole} />
    </div>
  );
}
