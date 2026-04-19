"use client";

import { useEffect, useState } from "react";

/**
 * Returns the current visual viewport height in pixels, or null while unavailable.
 *
 * Why this exists: `100dvh` tracks the dynamic viewport (accounts for the browser
 * toolbar) but does NOT shrink when the on-screen keyboard opens on iOS Safari.
 * `window.visualViewport.height` does — it reflects the actual visible area.
 *
 * Use the returned number as an explicit pixel height on any container whose child
 * input should remain flush above the keyboard. Falls back to CSS `dvh` on desktop
 * or older browsers by returning `null` until the first visualViewport event fires.
 */
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => setHeight(vv.height);
    update();

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return height;
}
