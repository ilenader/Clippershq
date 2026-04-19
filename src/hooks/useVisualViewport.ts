"use client";

import { useEffect, useState } from "react";

/**
 * Returns the current visual viewport height in pixels, or null while unavailable.
 *
 * Why this exists: `100dvh` tracks the dynamic viewport (accounts for the browser
 * toolbar) but does NOT shrink when the on-screen keyboard opens on iOS Safari.
 * `window.visualViewport.height` does — it reflects the actual visible area.
 *
 * Extras:
 *   • rAF-throttled updates so high-frequency resize/scroll events don't thrash React.
 *   • Re-reads on focusin/focusout. iOS fires focus BEFORE the keyboard finishes
 *     animating; polling visualViewport.height for a short window after focus lets us
 *     catch the resize the instant iOS commits to it.
 */
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    let rafId: number | null = null;
    const schedule = () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setHeight(vv.height);
        rafId = null;
      });
    };
    schedule();

    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);

    // Poll for ~600 ms after focus so we pick up the resize as soon as iOS commits it.
    let pollId: ReturnType<typeof setInterval> | null = null;
    let pollTimeout: ReturnType<typeof setTimeout> | null = null;
    const startPolling = () => {
      if (pollId) clearInterval(pollId);
      if (pollTimeout) clearTimeout(pollTimeout);
      pollId = setInterval(() => setHeight(vv.height), 16);
      pollTimeout = setTimeout(() => {
        if (pollId) { clearInterval(pollId); pollId = null; }
      }, 600);
    };

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) startPolling();
    };
    const onFocusOut = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT")) startPolling();
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      if (rafId != null) cancelAnimationFrame(rafId);
      if (pollId) clearInterval(pollId);
      if (pollTimeout) clearTimeout(pollTimeout);
    };
  }, []);

  return height;
}
