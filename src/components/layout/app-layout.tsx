"use client";

import { useSession, signOut } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
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
import { useAbly } from "@/hooks/use-ably";
import { DmToast } from "@/components/community/DmToast";
import { toast } from "@/lib/toast";
import { CallBanner } from "@/components/community/CallBanner";
import dynamic from "next/dynamic";

// VoiceRoom pulls in @jitsi/react-sdk (large). Lazy-load so the Jitsi iframe
// only fetches when someone actually opens a call — other pages stay fast.
const VoiceRoom = dynamic(() => import("@/components/community/VoiceRoom"), { ssr: false });

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const { isDevMode, devSession, devRole, loading: devLoading } = useDevAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isPWA = useIsPWA();

  // Voice call state — lives here so the call survives navigation between pages.
  const [activeVoiceCall, setActiveVoiceCall] = useState<any>(null);
  const [showVoiceRoom, setShowVoiceRoom] = useState(false);
  const [voiceMinimized, setVoiceMinimized] = useState(false);

  // Close mobile nav on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Sync PWA status with backend (at most once per hour)
  useEffect(() => {
    const lastSync = localStorage.getItem("pwa_last_sync");
    const oneHour = 60 * 60 * 1000;
    if (isPWA && (!lastSync || Date.now() - parseInt(lastSync) > oneHour)) {
      localStorage.setItem("pwa_last_sync", Date.now().toString());
      localStorage.setItem("pwa_installed", "true");
      fetch("/api/user/pwa-status", {
        method: "POST",
        headers: { "X-PWA-Mode": "standalone" },
      }).catch(() => {});
    }
  }, [isPWA]);

  const isLoading = isDevMode ? devLoading : status === "loading";
  const effectiveSession = isDevMode && devSession ? devSession : session;
  const effectiveRole = isDevMode && devSession
    ? devSession.user.role
    : (session?.user as SessionUser)?.role || "CLIPPER";
  const effectiveStatus = isDevMode && devSession
    ? "ACTIVE"
    : (session?.user as SessionUser)?.status || "ACTIVE";
  const isAuthenticated = isDevMode ? !!devRole : status === "authenticated";

  // Real-time channel — subscribes once per session. No-op if Ably isn't configured
  // or the connection can't establish; pages fall back to useAutoRefresh polling.
  const ablyUserId =
    (isDevMode && devSession ? (devSession as any).user?.id : null) ||
    (session?.user as any)?.id ||
    null;
  useAbly(ablyUserId);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push(isDevMode ? "/dev-login" : "/login");
      return;
    }
    // Route CLIENT users to /client if they hit clipper/admin pages
    if (effectiveRole === "CLIENT" && !pathname.startsWith("/client")) {
      router.replace("/client");
    }
  }, [isLoading, isAuthenticated, isDevMode, router, effectiveRole, pathname]);

  // Expose a global opener/closer so pages and the CallBanner can launch the voice
  // room without re-rendering it. The room lives in app-layout, so it survives any
  // client-side navigation.
  useEffect(() => {
    (window as any).__openVoiceRoom = (call: any) => {
      setActiveVoiceCall(call);
      setShowVoiceRoom(true);
      setVoiceMinimized(false);
    };
    (window as any).__closeVoiceRoom = () => {
      setShowVoiceRoom(false);
      setActiveVoiceCall(null);
      setVoiceMinimized(false);
    };
    return () => {
      try { delete (window as any).__openVoiceRoom; } catch {}
      try { delete (window as any).__closeVoiceRoom; } catch {}
    };
  }, []);

  // Auto-close if the host ends the call server-side.
  useEffect(() => {
    const handler = (e: any) => {
      const { status, callId } = e?.detail || {};
      if (!callId || !activeVoiceCall?.id || activeVoiceCall.id !== callId) return;
      if (status === "ended" || status === "completed" || status === "cancelled") {
        setShowVoiceRoom(false);
        setActiveVoiceCall(null);
        setVoiceMinimized(false);
      }
    };
    window.addEventListener("sse:voice_call_status", handler);
    return () => window.removeEventListener("sse:voice_call_status", handler);
  }, [activeVoiceCall]);

  // "Someone replied to you" toast. Bell badge is handled by the navbar's own
  // `sse:notif_refresh` listener (createNotification on the server pushes that too),
  // so we only own the transient toast here.
  useEffect(() => {
    const onReplied = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const channelName = detail.channelName ? `#${detail.channelName}` : "a channel";
      const replier = detail.replierUsername || "Someone";
      const body = detail.preview
        ? `${replier} replied in ${channelName}: ${detail.preview}`
        : `${replier} replied to you in ${channelName}`;
      toast.info(body, {
        action: detail.campaignId
          ? {
              label: "View",
              onClick: () => {
                try {
                  sessionStorage.setItem(
                    "community_nav_target",
                    JSON.stringify({ campaignId: detail.campaignId }),
                  );
                } catch {}
                router.push("/community");
              },
            }
          : undefined,
      });
    };
    window.addEventListener("sse:replied_to_you", onReplied);
    return () => window.removeEventListener("sse:replied_to_you", onReplied);
  }, [router]);

  // Progressive swipe-to-open sidebar on mobile
  const sidebarPanelRef = useRef<HTMLDivElement>(null);
  const backdropElRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const SIDEBAR_W = 256; // w-64 = 256px
  const swipeRef = useRef({ startX: 0, startY: 0, lastX: 0, tracking: false, decided: false });

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 1024) return;
      // Skip when the touch originates inside a horizontally scrollable container
      // (community ServerStrip, carousels, charts) — those own the horizontal gesture.
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-no-swipe], .overflow-x-auto, .overflow-x-scroll")) return;
      const x = e.touches[0].clientX;
      const zone = window.innerWidth * 0.8; // extend swipe-to-open to left 80% of the screen
      if (x < zone || mobileOpen) {
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
    <div className="flex h-[100dvh] bg-[var(--bg-primary)] transition-theme">
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
        {/* Mobile header: hamburger + logo + bell/theme/avatar all on ONE line.
            Renders on every route including /community. The community overlay
            anchors at max-lg:top-14 (below this 56 px topbar) so they don't
            overlap. Do NOT re-add safe-area-inset-top padding to the community
            overlay — that caused stacked padding and a visible black band in
            an earlier attempt.
            `max-lg:fixed top-0 z-40`: pins the bar to the layout viewport so
            iOS's keyboard-open visual-viewport shift can't push it off-screen
            on /community and /community/tickets. z-40 keeps it below the
            mobile sidebar drawer (z-50) and any app modals. */}
        <div className="lg:hidden flex items-center justify-between h-14 px-3 border-b border-[var(--border-color)] bg-[var(--bg-glass)] backdrop-blur-xl max-lg:fixed max-lg:top-0 max-lg:left-0 max-lg:right-0 max-lg:z-40">
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
        {/* max-lg:pt-14 reserves 56 px under the now-fixed mobile topbar on
            ordinary pages so content doesn't hide behind it. /community is
            skipped because its layout uses position:fixed overlays anchored
            at max-lg:top-14 directly against the layout viewport. */}
        <main className={`flex-1 overflow-x-hidden animate-[fadeIn_200ms_ease-out] ${
          pathname?.startsWith("/community")
            ? "overflow-hidden p-4 lg:p-6"
            : "overflow-y-auto p-4 lg:p-6 max-lg:pt-14"
        }`}>{children}</main>
      </div>
      {/* Hide the support ChatWidget on /community — the community has its own
          chat + ticket UI, so the floating bubble would be redundant there. */}
      {!pathname?.startsWith("/community") && (
        <ChatWidget userId={effectiveSession.user.id} role={effectiveRole} />
      )}
      {!isPWA && effectiveRole !== "CLIENT" && <PWAInstallPopup />}
      {/* Community: DM toast (CLIPPER only) + top-of-page call banner (all non-CLIENT roles) */}
      {effectiveRole !== "CLIENT" && <DmToast viewerId={effectiveSession.user.id} viewerRole={effectiveRole} />}
      {effectiveRole !== "CLIENT" && <CallBanner />}

      {/* Persistent voice room — survives navigation between pages. */}
      {activeVoiceCall && showVoiceRoom && effectiveRole !== "CLIENT" && (
        <div className={voiceMinimized ? "" : "fixed inset-0 z-[65] bg-[var(--bg-primary)]"}>
          <VoiceRoom
            call={activeVoiceCall}
            campaignName={activeVoiceCall.campaignName || "Campaign"}
            isHost={effectiveRole === "OWNER" || effectiveRole === "ADMIN"}
            onLeave={() => {
              setShowVoiceRoom(false);
              setActiveVoiceCall(null);
              setVoiceMinimized(false);
            }}
            onCallStatusChange={(status) => {
              setActiveVoiceCall((prev: any) => (prev ? { ...prev, status } : null));
              if (status === "ended" || status === "completed" || status === "cancelled") {
                setShowVoiceRoom(false);
                setActiveVoiceCall(null);
                setVoiceMinimized(false);
              }
            }}
            isMinimized={voiceMinimized}
            onMinimize={() => setVoiceMinimized(true)}
            onMaximize={() => setVoiceMinimized(false)}
          />
        </div>
      )}
    </div>
  );
}
