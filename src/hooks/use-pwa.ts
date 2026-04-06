"use client";

import { useState, useEffect } from "react";

export function useIsPWA(): boolean {
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    setIsPWA(
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true
    );
  }, []);

  return isPWA;
}

export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already in standalone (installed)
    if (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      console.log("[PWA] beforeinstallprompt fired");
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      localStorage.setItem("pwa_installed", "true");
    };
    window.addEventListener("appinstalled", installedHandler);

    // Check localStorage flag
    if (localStorage.getItem("pwa_installed") === "true") {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const triggerInstall = async () => {
    if (!installPrompt) return false;
    installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") {
      setIsInstalled(true);
      localStorage.setItem("pwa_installed", "true");
      return true;
    }
    return false;
  };

  return { installPrompt, isInstalled, triggerInstall };
}
