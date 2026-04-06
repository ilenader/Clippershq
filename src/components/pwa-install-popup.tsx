"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useInstallPrompt, useIsPWA } from "@/hooks/use-pwa";

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
  // Show on day 0 (first visit), day 2-3, day 4+
  if (daysSinceFirst === 0 && dismissCount === 0) return true;
  if (daysSinceFirst >= 2 && daysSinceFirst < 4 && dismissCount < 2) return true;
  if (daysSinceFirst >= 4 && dismissCount < 5) return true;
  return false;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

export function PWAInstallPopup() {
  const isPWA = useIsPWA();
  const { installPrompt, isInstalled, triggerInstall } = useInstallPrompt();
  const [show, setShow] = useState(false);
  const [daysSince, setDaysSince] = useState(0);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // Never show in PWA mode or if already installed
    if (isPWA || isInstalled) {
      // If in PWA, mark as installed
      if (isPWA) localStorage.setItem("pwa_installed", "true");
      return;
    }

    const days = getDaysSinceFirstSeen();
    setDaysSince(days);
    const dismissCount = getDismissCount();

    if (shouldShowPopup(days, dismissCount)) {
      // Delay popup slightly so it doesn't flash on load
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [isPWA, isInstalled]);

  const handleDismiss = () => {
    setShow(false);
    const count = getDismissCount();
    localStorage.setItem("pwa_popup_dismissed_count", (count + 1).toString());
  };

  const handleInstall = async () => {
    if (isIOS()) {
      setShowIOSInstructions(true);
      return;
    }
    const success = await triggerInstall();
    if (success) {
      setShow(false);
      // Report to backend
      fetch("/api/user/pwa-status", { method: "POST" }).catch(() => {});
    }
  };

  if (!show) return null;

  const isBonusPhase = daysSince >= 4;

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

        {/* iOS instructions */}
        {showIOSInstructions ? (
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4 mb-4">
            <p className="text-sm text-[var(--text-secondary)] text-center">
              Tap the <strong className="text-[var(--text-primary)]">Share</strong> button in Safari, then tap <strong className="text-[var(--text-primary)]">&quot;Add to Home Screen&quot;</strong>
            </p>
          </div>
        ) : (
          <>
            {/* Install button */}
            <button
              onClick={handleInstall}
              className="w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-white hover:bg-accent-hover transition-colors cursor-pointer mb-3"
            >
              {isBonusPhase ? "Install App — Claim 2% Bonus" : "Install App"}
            </button>
          </>
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
