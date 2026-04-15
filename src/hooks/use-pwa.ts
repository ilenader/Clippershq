"use client";

import { useState, useEffect, useCallback } from "react";

export function useIsPWA(): boolean {
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsPWA(standalone);

    // Detect uninstall: user was PWA but no longer in standalone mode
    if (!standalone && localStorage.getItem("pwa_installed") === "true") {
      localStorage.removeItem("pwa_installed");
      fetch("/api/user/pwa-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installed: false }),
      }).catch(() => {});
    }

    // Listen for display-mode changes (e.g. user removes from home screen)
    const mq = window.matchMedia("(display-mode: standalone)");
    const onChange = (e: MediaQueryListEvent) => {
      setIsPWA(e.matches);
      if (!e.matches && localStorage.getItem("pwa_installed") === "true") {
        localStorage.removeItem("pwa_installed");
        fetch("/api/user/pwa-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ installed: false }),
        }).catch(() => {});
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isPWA;
}

export type MobilePlatform =
  | "ios-safari" | "ios-chrome" | "ios-firefox"
  | "android-chrome" | "android-firefox" | "android-samsung" | "android-other"
  | "desktop" | "unknown";

export function detectPlatform(): MobilePlatform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  if (isIOS) {
    if (/CriOS/.test(ua)) return "ios-chrome";
    if (/FxiOS/.test(ua)) return "ios-firefox";
    return "ios-safari"; // Safari or any other iOS browser using WebKit
  }
  const isAndroid = /Android/.test(ua);
  if (isAndroid) {
    if (/SamsungBrowser/.test(ua)) return "android-samsung";
    if (/Firefox/.test(ua)) return "android-firefox";
    if (/Chrome/.test(ua) && !/Edge/.test(ua)) return "android-chrome";
    return "android-other";
  }
  if (/Mobi/.test(ua)) return "unknown";
  return "desktop";
}

export function useInstallPrompt() {
  const [nativePrompt, setNativePrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<MobilePlatform>("unknown");

  useEffect(() => {
    setPlatform(detectPlatform());

    // Check if already in standalone (installed)
    if (window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      console.log("[PWA] beforeinstallprompt fired");
      e.preventDefault();
      setNativePrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      console.log("[PWA] appinstalled fired");
      setIsInstalled(true);
      setNativePrompt(null);
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

  const triggerNativeInstall = useCallback(async (): Promise<boolean> => {
    if (!nativePrompt) return false;
    nativePrompt.prompt();
    const result = await nativePrompt.userChoice;
    if (result.outcome === "accepted") {
      setIsInstalled(true);
      localStorage.setItem("pwa_installed", "true");
      return true;
    }
    return false;
  }, [nativePrompt]);

  return {
    nativePrompt,
    hasNativePrompt: !!nativePrompt,
    isInstalled,
    platform,
    triggerNativeInstall,
  };
}
