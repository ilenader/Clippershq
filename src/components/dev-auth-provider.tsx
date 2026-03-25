"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getDevSession, type DevRole, type DevSession } from "@/lib/dev-auth";

interface DevAuthContextType {
  isDevMode: boolean;
  devSession: DevSession | null;
  devRole: DevRole | null;
  setDevRole: (role: DevRole) => Promise<void>;
  clearDevAuth: () => Promise<void>;
  loading: boolean;
}

const DevAuthContext = createContext<DevAuthContextType>({
  isDevMode: false,
  devSession: null,
  devRole: null,
  setDevRole: async () => {},
  clearDevAuth: async () => {},
  loading: true,
});

export function useDevAuth() {
  return useContext(DevAuthContext);
}

export function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const [devRole, setDevRoleState] = useState<DevRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDevMode, setIsDevMode] = useState(false);

  // Determine dev mode on client only to avoid hydration mismatch
  useEffect(() => {
    const enabled = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";
    setIsDevMode(enabled);

    if (!enabled) {
      setLoading(false);
      return;
    }

    fetch("/api/dev-auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.role) setDevRoleState(data.role);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setDevRole = useCallback(async (role: DevRole) => {
    await fetch("/api/dev-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setDevRoleState(role);
  }, []);

  const clearDevAuth = useCallback(async () => {
    await fetch("/api/dev-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logout: true }),
    });
    setDevRoleState(null);
  }, []);

  const devSession = devRole ? getDevSession(devRole) : null;

  return (
    <DevAuthContext.Provider value={{ isDevMode, devSession, devRole, setDevRole, clearDevAuth, loading }}>
      {children}
    </DevAuthContext.Provider>
  );
}
