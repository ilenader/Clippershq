"use client";

import { useSession, signOut } from "next-auth/react";
import { useDevAuth } from "@/components/dev-auth-provider";
import { useRouter, usePathname } from "next/navigation";
import { hapticMedium } from "@/lib/haptics";
import { useEffect, useState, useRef, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { Navbar } from "./navbar";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { Menu, X, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PWAInstallPopup } from "@/components/pwa-install-popup";
import { useIsPWA } from "@/hooks/use-pwa";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const { isDevMode, devSession, devRole, loading: devLoading } = useDevAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isPWA = useIsPWA();

  // Close mobile nav on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Sync PWA status with backend (at most once per hour)
  useEffect(() => {
    const lastSync = localStorage.getItem("pwa_last_sync");
    const oneHour = 60 * 60 * 1000;
    if (isPWA && (!lastSync || Date.now() - parseInt(lastSync) > oneHour)) {
      localStorage.setItem("pwa_last_sync", Date.now().toString());
      localStorage.setItem("pwa_installed", "true");
      fetch("/api/user/pwa-status", { method: "POST" }).catch(() => {});
    }
  }, [isPWA]);

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

  // Progressive swipe-to-open sidebar on mobile
  const sidebarPanelRef = useRef<HTMLDivElement>(null);
  const backdropElRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const SIDEBAR_W = 256; // w-64 = 256px
  const swipeRef = useRef({ startX: 0, startY: 0, lastX: 0, tracking: false, decided: false });

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 1024) return;
      const x = e.touches[0].clientX;
      if (x < 80 || mobileOpen) {
        swipeRef.current = { startX: x, startY: e.touches[0].clientY, lastX: x, tracking: true, decided: false };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const s = swipeRef.current;
      if (!s.tracking) return;
      const x = e.touches[0].clientX;
      const diffX = x - s.startX;
      const diffY = e.touches[0].clientY - s.startY;
      s.lastX = x;

      // Decide direction on first significant move
      if (!s.decided && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
        if (Math.abs(diffY) > Math.abs(diffX)) { s.tracking = false; return; } // vertical scroll
        s.decided = true;
      }
      if (!s.decided) return;

      e.preventDefault(); // override browser back gesture

      const panel = sidebarPanelRef.current;
      const backdrop = backdropElRef.current;
      if (!panel) return;

      if (!mobileOpen) {
        // Opening: follow finger from left
        const offset = Math.max(-SIDEBAR_W, Math.min(0, -SIDEBAR_W + diffX));
        panel.style.transition = "none";
        panel.style.transform = `translateX(${offset}px)`;
        const openProgress = Math.max(0, Math.min(1, diffX / SIDEBAR_W));
        if (backdrop) {
          backdrop.style.transition = "none";
          backdrop.style.opacity = `${openProgress * 0.5}`;
          backdrop.style.pointerEvents = openProgress > 0.05 ? "auto" : "none";
        }
        if (closeBtnRef.current) { closeBtnRef.current.style.opacity = `${openProgress}`; closeBtnRef.current.style.transition = "none"; }
      } else {
        // Closing: follow finger left
        const offset = Math.min(0, Math.max(-SIDEBAR_W, diffX));
        panel.style.transition = "none";
        panel.style.transform = `translateX(${offset}px)`;
        if (backdrop) {
          const p = Math.max(0, 1 + diffX / SIDEBAR_W);
          backdrop.style.transition = "none";
          backdrop.style.opacity = `${p * 0.5}`;
        }
        if (closeBtnRef.current) { const cp = Math.max(0, 1 + diffX / SIDEBAR_W); closeBtnRef.current.style.opacity = `${cp}`; closeBtnRef.current.style.transition = "none"; }
      }
    };

    const onTouchEnd = () => {
      const s = swipeRef.current;
      if (!s.tracking || !s.decided) { s.tracking = false; return; }
      s.tracking = false;
      const diff = s.lastX - s.startX;
      const panel = sidebarPanelRef.current;
      const backdrop = backdropElRef.current;
      if (!panel) return;

      panel.style.transition = "transform 300ms ease-out";
      if (backdrop) backdrop.style.transition = "opacity 300ms ease-out";

      if (!mobileOpen && diff > SIDEBAR_W * 0.35) {
        hapticMedium();
        setMobileOpen(true);
      } else if (mobileOpen && diff < -(SIDEBAR_W * 0.35)) {
        hapticMedium();
        setMobileOpen(false);
      } else {
        // Snap back
        if (mobileOpen) {
          panel.style.transform = "translateX(0)";
          if (backdrop) { backdrop.style.opacity = "0.5"; backdrop.style.pointerEvents = "auto"; }
        } else {
          panel.style.transform = "translateX(-100%)";
          if (backdrop) { backdrop.style.opacity = "0"; backdrop.style.pointerEvents = "none"; }
        }
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [mobileOpen]);

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

      {/* Mobile overlay + sidebar with slide transition */}
      <div className="fixed inset-0 z-50 lg:hidden" style={{ pointerEvents: mobileOpen ? "auto" : "none" }}>
        <div
          ref={backdropElRef}
          className="absolute inset-0 bg-black transition-opacity duration-300"
          style={{ opacity: mobileOpen ? 0.5 : 0, pointerEvents: mobileOpen ? "auto" : "none" }}
          onClick={() => setMobileOpen(false)}
        />
        <div
          ref={sidebarPanelRef}
          className="relative z-10 h-full w-64 transition-transform duration-300 ease-out"
          style={{ transform: mobileOpen ? "translateX(0)" : "translateX(-100%)" }}
        >
          <Sidebar role={effectiveRole} />
          <button
            ref={closeBtnRef}
            onClick={() => setMobileOpen(false)}
            className="absolute top-4 right-[-44px] flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] cursor-pointer transition-opacity duration-300"
            style={{ opacity: mobileOpen ? 1 : 0, pointerEvents: mobileOpen ? "auto" : "none" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

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
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6 animate-[fadeIn_200ms_ease-out]">{children}</main>
      </div>
      <ChatWidget userId={effectiveSession.user.id} role={effectiveRole} />
      {!isPWA && <PWAInstallPopup />}
    </div>
  );
}
