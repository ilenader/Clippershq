"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Auto-refresh hook — calls a callback on an interval, pausing when tab is hidden.
 * @param callback - Function to call on each interval tick
 * @param intervalMs - Interval in milliseconds (default 10000 = 10s)
 */
export function useAutoRefresh(callback: () => void, intervalMs = 10000) {
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") {
          callbackRef.current();
          setLastRefreshed(new Date());
        }
      }, intervalMs);
    };

    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        // Refresh immediately when tab becomes visible, then restart interval
        callbackRef.current();
        setLastRefreshed(new Date());
        stop();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [intervalMs]);

  return { lastRefreshed };
}
