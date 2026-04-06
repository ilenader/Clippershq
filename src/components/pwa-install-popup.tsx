"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useInstallPrompt, useIsPWA } from "@/hooks/use-pwa";

// ─── Browser detection ─────────────────────────────────────

type BrowserKind = "chrome" | "safari" | "firefox" | "samsung" | "other";

function detectBrowser(): { browser: BrowserKind; isIOS: boolean } {
  if (typeof navigator === "undefined") return { browser: "other", isIOS: false };
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  const isSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
  if (isSafari) return { browser: "safari", isIOS: true };
  if (/SamsungBrowser/.test(ua)) return { browser: "samsung", isIOS: false };
  if (/Firefox|FxiOS/.test(ua)) return { browser: "firefox", isIOS };
  if (/Chrome|CriOS/.test(ua) && !/Edge/.test(ua)) return { browser: "chrome", isIOS };
  return { browser: "other", isIOS };
}

// ─── Schedule helpers ──────────────────────────────────────

function getDaysSinceFirstSeen(): number {
  const firstSeen = localStorage.getItem("pwa_first_seen");
  if (!firstSeen) {
    localStorage.setItem("pwa_first_seen", Date.now().toString());
    return 0;
  }
  return Math.floor((Date.now() - parseInt(firstSeen, 10)) / (1000 * 60 * 60 * 24));
}

function getDismissCount(): number {
  return parseInt(localStorage.getItem("pwa_popup_dismissed_count") || "0", 10);
}

function shouldShowPopup(daysSinceFirst: number, dismissCount: number): boolean {
  if (daysSinceFirst === 0 && dismissCount === 0) return true;
  if (daysSinceFirst >= 2 && daysSinceFirst < 4 && dismissCount < 2) return true;
  if (daysSinceFirst >= 4 && dismissCount < 5) return true;
  return false;
}

// ─── SVG Icons ─────────────────────────────────────────────

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function MenuDotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

function PlusBoxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

// ─── Instruction panels ────────────────────────────────────

function SafariInstructions() {
  return (
    <div className="space-y-4">
      {/* Step 1 */}
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-bold flex-shrink-0">1</div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Tap the <strong>Share</strong> button
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">At the bottom of your Safari browser</p>
        </div>
        <div className="flex-shrink-0 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] p-2">
          <ShareIcon className="h-5 w-5 text-accent" />
        </div>
      </div>
      {/* Step 2 */}
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-bold flex-shrink-0">2</div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Tap <strong>&quot;Add to Home Screen&quot;</strong>
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Scroll down in the share menu if needed</p>
        </div>
        <div className="flex-shrink-0 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] p-2">
          <PlusBoxIcon className="h-5 w-5 text-accent" />
        </div>
      </div>
      {/* Animated arrow pointing down */}
      <div className="flex justify-center pt-2">
        <div className="animate-bounce">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-accent">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function FirefoxInstructions() {
  return (
    <div className="space-y-4">
      {/* Step 1 */}
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-bold flex-shrink-0">1</div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Tap the <strong>menu</strong> button
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Three dots at the top or bottom of Firefox</p>
        </div>
        <div className="flex-shrink-0 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] p-2">
          <MenuDotsIcon className="h-5 w-5 text-accent" />
        </div>
      </div>
      {/* Step 2 */}
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-bold flex-shrink-0">2</div>
        <div className="flex-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            Tap <strong>&quot;Install&quot;</strong> or <strong>&quot;Add to Home Screen&quot;</strong>
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Look for the install option in the menu</p>
        </div>
        <div className="flex-shrink-0 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] p-2">
          <PlusBoxIcon className="h-5 w-5 text-accent" />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export function PWAInstallPopup() {
  const isPWA = useIsPWA();
  const { installPrompt, isInstalled, triggerInstall } = useInstallPrompt();
  const [show, setShow] = useState(false);
  const [daysSince, setDaysSince] = useState(0);
  const [browserInfo, setBrowserInfo] = useState<{ browser: BrowserKind; isIOS: boolean }>({ browser: "other", isIOS: false });

  useEffect(() => {
    if (isPWA || isInstalled) {
      if (isPWA) localStorage.setItem("pwa_installed", "true");
      return;
    }

    setBrowserInfo(detectBrowser());
    const days = getDaysSinceFirstSeen();
    setDaysSince(days);
    const dismissCount = getDismissCount();

    if (shouldShowPopup(days, dismissCount)) {
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [isPWA, isInstalled]);

  const handleDismiss = () => {
    setShow(false);
    const count = getDismissCount();
    localStorage.setItem("pwa_popup_dismissed_count", (count + 1).toString());
  };

  const handleNativeInstall = async () => {
    const success = await triggerInstall();
    if (success) {
      setShow(false);
      fetch("/api/user/pwa-status", { method: "POST" }).catch(() => {});
    }
  };

  if (!show) return null;

  const isBonusPhase = daysSince >= 4;
  const hasNativePrompt = !!installPrompt;
  const isSafari = browserInfo.browser === "safari";
  const isFirefox = browserInfo.browser === "firefox" && !hasNativePrompt;

  // If native prompt is available (Chrome, Samsung, Edge, etc.) — show one-click
  // If Safari on iOS — bottom-sheet style with share instructions
  // If Firefox without native prompt — menu instructions
  // Fallback — generic instructions

  // Safari iOS gets a bottom-sheet style popup
  if (isSafari) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={handleDismiss}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-md rounded-t-2xl border border-b-0 border-[var(--border-color)] bg-[var(--bg-card)] px-5 pt-5 pb-10 shadow-[var(--shadow-elevated)] animate-in slide-in-from-bottom duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle bar */}
          <div className="flex justify-center mb-4">
            <div className="h-1 w-10 rounded-full bg-[var(--text-muted)] opacity-40" />
          </div>

          {/* Close */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
              <svg viewBox="0 0 100 100" className="h-6 w-6">
                <polygon points="50,10 90,85 10,85" fill="currentColor" className="text-[var(--text-primary)]" />
              </svg>
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-[var(--text-primary)]">Install Clippers HQ</h3>
              <p className="text-xs text-[var(--text-muted)]">
                {isBonusPhase ? "Get a 2% earnings bonus!" : "Add to your home screen"}
              </p>
            </div>
          </div>

          {/* Safari instructions */}
          <SafariInstructions />

          {/* Maybe later */}
          <button
            onClick={handleDismiss}
            className="w-full text-center text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer pt-5 pb-1"
          >
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  // Standard centered modal for all other browsers
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={handleDismiss}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[380px] rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-elevated)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Logo */}
        <div className="flex justify-center mb-4">
          <svg viewBox="0 0 100 100" className="h-12 w-12">
            <polygon points="50,10 90,85 10,85" fill="currentColor" className="text-[var(--text-primary)]" />
          </svg>
        </div>

        {/* Heading */}
        <h3 className="text-lg font-bold text-[var(--text-primary)] text-center mb-2">
          Get the Clippers HQ App
        </h3>

        {/* Subtext */}
        <p className="text-sm text-[var(--text-muted)] text-center mb-5">
          {isBonusPhase
            ? "Install now and claim a 2% earnings bonus!"
            : "Add to your home screen for the best experience"}
        </p>

        {/* Content: native install OR browser-specific instructions */}
        {hasNativePrompt ? (
          <button
            onClick={handleNativeInstall}
            className="w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer mb-3"
          >
            {isBonusPhase ? "Install App — Claim 2% Bonus" : "Install App"}
          </button>
        ) : isFirefox ? (
          <div className="mb-4">
            <FirefoxInstructions />
          </div>
        ) : (
          /* Generic fallback for unknown browsers without native prompt */
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 mb-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-bold flex-shrink-0">1</div>
              <p className="text-sm text-[var(--text-secondary)]">
                Open your browser&apos;s <strong className="text-[var(--text-primary)]">menu</strong>
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-bold flex-shrink-0">2</div>
              <p className="text-sm text-[var(--text-secondary)]">
                Tap <strong className="text-[var(--text-primary)]">&quot;Install App&quot;</strong> or <strong className="text-[var(--text-primary)]">&quot;Add to Home Screen&quot;</strong>
              </p>
            </div>
          </div>
        )}

        {/* Maybe later */}
        <button
          onClick={handleDismiss}
          className="w-full text-center text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer py-1"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
