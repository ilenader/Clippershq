"use client";

import { useSession, signOut } from "next-auth/react";
import { useDevAuth } from "@/components/dev-auth-provider";
import { useTheme } from "@/components/theme-provider";
import { hapticLight } from "@/lib/haptics";
import { Sun, Moon, LogOut, ChevronDown, ArrowRightLeft, Bell } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { playNotificationSound } from "@/lib/sounds";

function formatNotifTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return ""; }
}

export function Navbar() {
  const { data: session } = useSession();
  const { isDevMode, devSession, devRole, setDevRole, clearDevAuth } = useDevAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const effectiveUser = isDevMode && devSession ? devSession.user : session?.user;
  const [notifCount, setNotifCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);
  const bellBtnRef = useRef<HTMLButtonElement>(null);
  const [notifPos, setNotifPos] = useState<{ top: number; right: number } | null>(null);

  // Fetch notification list — plays sound only for genuinely new notifications
  // after the page has been open for 3+ seconds
  const fetchNotifList = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      const notifs: any[] = data.notifications ? data.notifications.slice(0, 8) : [];
      setNotifications(notifs);
      const newCount = data.unreadCount || 0;
      setNotifCount(newCount);

      // Play sound if there's a genuinely new notification
      if (notifs.length > 0) {
        try {
          const lastSeen = sessionStorage.getItem("last_seen_notif_id");
          const latestId = notifs[0].id;
          if (lastSeen && latestId !== lastSeen) {
            // New notification detected
            playNotificationSound();
          }
          sessionStorage.setItem("last_seen_notif_id", latestId);
        } catch {}
      }
    } catch {}
  }, []);

  // Notification polling — 15s fallback that runs alongside Ably real-time.
  // Ably (initialized in AppLayout via useAbly) re-dispatches server events as window
  // CustomEvents like `sse:notif_refresh`, `sse:clip_updated`, etc. so existing page
  // listeners work without changes. This interval is the safety net if Ably is down
  // or the tab is backgrounded long enough for the connection to drop.
  const userId = effectiveUser && "id" in effectiveUser ? (effectiveUser as any).id : null;
  useEffect(() => {
    if (!userId) return;
    fetchNotifList();
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/notifications/count");
        if (res.ok) {
          const data = await res.json();
          setNotifCount(data.count || 0);
        }
      } catch {}
    };
    const interval = setInterval(fetchCount, 15000);
    return () => clearInterval(interval);
  }, [userId, fetchNotifList]);

  // Ably-pushed "notif_refresh" event → re-fetch full list (so the dropdown and sound logic
  // see the new item immediately). Dispatched by src/lib/notifications.ts on creation.
  useEffect(() => {
    const handler = () => { fetchNotifList(); };
    window.addEventListener("sse:notif_refresh", handler);
    return () => window.removeEventListener("sse:notif_refresh", handler);
  }, [fetchNotifList]);

  // PWA app badge — shows notification count on the home screen icon
  useEffect(() => {
    if ("setAppBadge" in navigator) {
      if (notifCount > 0) {
        (navigator as any).setAppBadge(notifCount).catch(() => {});
      } else {
        (navigator as any).clearAppBadge().catch(() => {});
      }
    }
  }, [notifCount]);

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markRead" }),
      });
      setNotifCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {}
  };

  // Compute dropdown position when opening
  useEffect(() => {
    if (notifOpen && bellBtnRef.current) {
      const rect = bellBtnRef.current.getBoundingClientRect();
      setNotifPos({ top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) });
    }
  }, [notifOpen]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      // For portal dropdown: check both the bell button area and the dropdown itself
      if (notifOpen) {
        const clickedBell = bellBtnRef.current?.contains(e.target as Node);
        const clickedDropdown = notifRef.current?.contains(e.target as Node);
        if (!clickedBell && !clickedDropdown) setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  // Sync browser timezone once per session
  useEffect(() => {
    if (!effectiveUser) return;
    try {
      if (sessionStorage.getItem("tz_synced")) return;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz) return;
      sessionStorage.setItem("tz_synced", "true");
      fetch("/api/user/timezone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz }),
      }).catch(() => {});
    } catch {}
  }, [effectiveUser]);

  const handleSignOut = async () => {
    if (isDevMode) {
      await clearDevAuth();
      router.push("/dev-login");
    } else {
      signOut({ callbackUrl: "/" });
    }
  };

  const handleSwitchRole = async (role: "CLIPPER" | "ADMIN" | "OWNER") => {
    await setDevRole(role);
    setMenuOpen(false);
    if (role === "ADMIN" || role === "OWNER") {
      router.push("/admin");
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <header className="lg:sticky lg:top-0 z-30 flex items-center justify-between lg:h-14 lg:border-b lg:border-[var(--border-color)] lg:bg-[var(--bg-glass)] lg:px-6 lg:backdrop-blur-xl lg:backdrop-saturate-150 transition-theme">
      <div className="hidden lg:block">
        {isDevMode && devRole && (
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-yellow-500/5 px-2.5 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-[10px] font-semibold text-yellow-400 tracking-wide">DEV &middot; {devRole}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 lg:gap-2">
        {/* Notification bell */}
        <div className="relative">
          <button ref={bellBtnRef} onClick={() => { hapticLight(); setNotifOpen(!notifOpen); if (!notifOpen) fetchNotifList(); }}
            className="relative rounded-xl p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-all cursor-pointer">
            <Bell className="h-4 w-4" />
            {notifCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5">
                <span className="absolute inset-0 rounded-full bg-accent notif-ping" />
                <span className="relative flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(37,150,190,0.5)]">
                  {notifCount > 9 ? "9+" : notifCount}
                </span>
              </span>
            )}
          </button>
          {/* Portal: renders at <body> level to escape stacking contexts */}
          {notifOpen && typeof document !== "undefined" && notifPos && createPortal(
            <div ref={notifRef}
              className="fixed rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-[var(--shadow-elevated)] overflow-hidden"
              style={{ top: notifPos.top, left: 8, right: 8, maxWidth: typeof window !== "undefined" && window.innerWidth >= 1024 ? 384 : 320, marginLeft: "auto", zIndex: 99999 }}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)]">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Notifications</p>
                {notifCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-accent hover:underline cursor-pointer">Mark all read</button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">No notifications yet</p>
                ) : (
                  notifications.map((n: any) => (
                    <div key={n.id} className={`px-4 py-2.5 border-b border-[var(--border-subtle)] last:border-b-0 ${!n.isRead ? "bg-accent/5" : ""}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate min-w-0">{n.title}</p>
                        {n.createdAt && (
                          <span className="text-[11px] text-[var(--text-muted)] tabular-nums flex-shrink-0">{formatNotifTime(n.createdAt)}</span>
                        )}
                      </div>
                      {n.body && <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">{n.body}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>,
            document.body
          )}
        </div>

        {effectiveUser && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
            >
              {effectiveUser.image ? (
                <Image
                  src={effectiveUser.image}
                  alt=""
                  width={26}
                  height={26}
                  className="rounded-full"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                  {effectiveUser.name?.[0]?.toUpperCase() || "?"}
                </div>
              )}
              <span className="text-[13px] font-medium text-[var(--text-primary)] hidden sm:block">
                {effectiveUser.name}
              </span>
              <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] py-1 shadow-[var(--shadow-elevated)]">
                <div className="px-3 py-2.5 border-b border-[var(--border-subtle)]">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">{effectiveUser.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{effectiveUser.email}</p>
                </div>

                {isDevMode && (
                  <div className="border-b border-[var(--border-subtle)] py-1">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                      Switch Role
                    </p>
                    {(["CLIPPER", "ADMIN", "OWNER"] as const).map((role) => (
                      <button
                        key={role}
                        onClick={() => handleSwitchRole(role)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-[13px] transition-colors cursor-pointer ${
                          devRole === role
                            ? "text-accent bg-accent/5"
                            : "text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"
                        }`}
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                        {role}
                        {devRole === role && (
                          <span className="ml-auto text-[10px] text-accent font-medium">active</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-red-400 hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
