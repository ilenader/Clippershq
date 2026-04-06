"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useInstallPrompt, useIsPWA, type MobilePlatform } from "@/hooks/use-pwa";

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

// ─── Step component ────────────────────────────────────────

function Step({ num, title, subtitle, icon }: { num: number; title: string; subtitle: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-bold flex-shrink-0">{num}</div>
      <div className="flex-1">
        <p className="text-sm font-medium text-[var(--text-primary)]" dangerouslySetInnerHTML={{ __html: title }} />
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>
      </div>
      <div className="flex-shrink-0 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] p-2">
        {icon}
      </div>
    </div>
  );
}

// ─── Platform instructions ─────────────────────────────────

function InstructionsForPlatform({ platform }: { platform: MobilePlatform }) {
  if (platform === "ios") {
    return (
      <div className="space-y-4">
        <Step num={1} title="Tap the <strong>Share</strong> button" subtitle="At the bottom of your browser" icon={<ShareIcon className="h-5 w-5 text-accent" />} />
        <Step num={2} title='Tap <strong>"Add to Home Screen"</strong>' subtitle="Scroll down in the share menu if needed" icon={<PlusBoxIcon className="h-5 w-5 text-accent" />} />
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

  if (platform === "android-chrome") {
    return (
      <div className="space-y-4">
        <Step num={1} title='Tap <strong>&#8942;</strong> (three dots) at the top right' subtitle="Chrome menu button" icon={<MenuDotsIcon className="h-5 w-5 text-accent" />} />
        <Step num={2} title='Tap <strong>"Install App"</strong> or <strong>"Add to Home Screen"</strong>' subtitle="It may say either depending on your Chrome version" icon={<PlusBoxIcon className="h-5 w-5 text-accent" />} />
      </div>
    );
  }

  if (platform === "android-firefox") {
    return (
      <div className="space-y-4">
        <Step num={1} title='Tap <strong>&#8942;</strong> (three dots menu)' subtitle="At the top or bottom of Firefox" icon={<MenuDotsIcon className="h-5 w-5 text-accent" />} />
        <Step num={2} title='Tap <strong>"Install"</strong>' subtitle='Look for the install option in the menu' icon={<PlusBoxIcon className="h-5 w-5 text-accent" />} />
      </div>
    );
  }

  if (platform === "android-samsung") {
    return (
      <div className="space-y-4">
        <Step num={1} title='Tap the <strong>menu</strong> button' subtitle="Bottom right or hamburger menu" icon={<MenuDotsIcon className="h-5 w-5 text-accent" />} />
        <Step num={2} title='Tap <strong>"Add page to"</strong> &rarr; <strong>"Home screen"</strong>' subtitle="This adds the app to your home screen" icon={<PlusBoxIcon className="h-5 w-5 text-accent" />} />
      </div>
    );
  }

  // Generic fallback
  return (
    <div className="space-y-4">
      <Step num={1} title="Open your browser's <strong>menu</strong>" subtitle="Usually three dots or lines" icon={<MenuDotsIcon className="h-5 w-5 text-accent" />} />
      <Step num={2} title='Tap <strong>"Install App"</strong> or <strong>"Add to Home Screen"</strong>' subtitle="The exact wording depends on your browser" icon={<PlusBoxIcon className="h-5 w-5 text-accent" />} />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────

export function PWAInstallPopup() {
  const isPWA = useIsPWA();
  const { hasNativePrompt, isInstalled, platform, triggerNativeInstall } = useInstallPrompt();
  const [show, setShow] = useState(false);
  const [daysSince, setDaysSince] = useState(0);
  const [showInstructions, setShowInstructions] = useState(false);
  const instructionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPWA || isInstalled) {
      if (isPWA) localStorage.setItem("pwa_installed", "true");
      return;
    }

    const days = getDaysSinceFirstSeen();
    setDaysSince(days);
    const dismissCount = getDismissCount();

    if (shouldShowPopup(days, dismissCount)) {
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [isPWA, isInstalled]);

  // On iOS/Firefox, show instructions right away since native prompt never works
  useEffect(() => {
    if (show && (platform === "ios" || platform === "android-firefox")) {
      setShowInstructions(true);
    }
  }, [show, platform]);

  const handleDismiss = () => {
    setShow(false);
    setShowInstructions(false);
    const count = getDismissCount();
    localStorage.setItem("pwa_popup_dismissed_count", (count + 1).toString());
  };

  const handleInstallClick = async () => {
    // Try native prompt first
    if (hasNativePrompt) {
      const success = await triggerNativeInstall();
      if (success) {
        setShow(false);
        fetch("/api/user/pwa-status", { method: "POST" }).catch(() => {});
        return;
      }
    }
    // Native prompt unavailable or user declined — show manual instructions
    setShowInstructions(true);
    setTimeout(() => instructionsRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  if (!show) return null;

  const isBonusPhase = daysSince >= 4;
  const isBottomSheet = platform === "ios";

  // iOS: bottom-sheet style
  if (isBottomSheet) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={handleDismiss}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative w-full max-w-md rounded-t-2xl border border-b-0 border-[var(--border-color)] bg-[var(--bg-card)] px-5 pt-5 pb-10 shadow-[var(--shadow-elevated)]"
          onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-center mb-4"><div className="h-1 w-10 rounded-full bg-[var(--text-muted)] opacity-40" /></div>
          <button onClick={handleDismiss} className="absolute top-3 right-3 rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-3 mb-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10">
              <svg viewBox="0 0 100 100" className="h-6 w-6"><polygon points="50,10 90,85 10,85" fill="currentColor" className="text-[var(--text-primary)]" /></svg>
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-[var(--text-primary)]">Install Clippers HQ</h3>
              <p className="text-xs text-[var(--text-muted)]">{isBonusPhase ? "Get a 2% earnings bonus!" : "Add to your home screen"}</p>
            </div>
          </div>
          <InstructionsForPlatform platform={platform} />
          <p className="text-[11px] text-[var(--text-muted)] text-center mt-4">Having trouble? Open clipershq.com in Chrome and tap &#8942; &rarr; Install App</p>
          <button onClick={handleDismiss} className="w-full text-center text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer pt-4 pb-1">
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  // All other platforms: centered modal
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={handleDismiss}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-[380px] rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-elevated)] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>
        <button onClick={handleDismiss} className="absolute top-3 right-3 rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer">
          <X className="h-4 w-4" />
        </button>
        <div className="flex justify-center mb-4">
          <svg viewBox="0 0 100 100" className="h-12 w-12"><polygon points="50,10 90,85 10,85" fill="currentColor" className="text-[var(--text-primary)]" /></svg>
        </div>
        <h3 className="text-lg font-bold text-[var(--text-primary)] text-center mb-2">Get the Clippers HQ App</h3>
        <p className="text-sm text-[var(--text-muted)] text-center mb-5">
          {isBonusPhase ? "Install now and claim a 2% earnings bonus!" : "Add to your home screen for the best experience"}
        </p>

        {/* Install button — always clickable */}
        {!showInstructions && (
          <button onClick={handleInstallClick}
            className="w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer mb-3">
            {isBonusPhase ? "Install App — Claim 2% Bonus" : "Install App"}
          </button>
        )}

        {/* Manual instructions — shown after click if native prompt unavailable */}
        {showInstructions && (
          <div ref={instructionsRef} className="mb-4 space-y-4">
            <InstructionsForPlatform platform={platform} />
            <p className="text-[11px] text-[var(--text-muted)] text-center pt-1">
              Having trouble? Open clipershq.com in Chrome and tap &#8942; &rarr; Install App
            </p>
          </div>
        )}

        <button onClick={handleDismiss} className="w-full text-center text-sm text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors cursor-pointer py-1">
          Maybe later
        </button>
      </div>
    </div>
  );
}

// ─── Sidebar Install Modal (for use from sidebar button) ───

export function PWAInstallInstructions({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { platform, hasNativePrompt, triggerNativeInstall } = useInstallPrompt();

  if (!open) return null;

  const handleInstall = async () => {
    if (hasNativePrompt) {
      const success = await triggerNativeInstall();
      if (success) {
        onClose();
        fetch("/api/user/pwa-status", { method: "POST" }).catch(() => {});
        return;
      }
    }
    // If native didn't work, instructions are already showing
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-[360px] rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-elevated)]"
        onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-colors cursor-pointer">
          <X className="h-4 w-4" />
        </button>
        <h3 className="text-base font-bold text-[var(--text-primary)] mb-4">Install Clippers HQ</h3>

        {hasNativePrompt ? (
          <button onClick={handleInstall}
            className="w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer mb-3">
            Install App
          </button>
        ) : (
          <InstructionsForPlatform platform={platform} />
        )}

        <p className="text-[11px] text-[var(--text-muted)] text-center mt-3">
          Having trouble? Open clipershq.com in Chrome and tap &#8942; &rarr; Install App
        </p>
      </div>
    </div>
  );
}
