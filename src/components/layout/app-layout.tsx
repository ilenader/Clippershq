"use client";

import { useSession } from "next-auth/react";
import { useDevAuth } from "@/components/dev-auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Navbar } from "./navbar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const { isDevMode, devSession, devRole, loading: devLoading } = useDevAuth();
  const router = useRouter();

  // Determine effective session
  const isLoading = isDevMode ? devLoading : status === "loading";
  const effectiveSession = isDevMode && devSession ? devSession : session;
  const effectiveRole = isDevMode && devSession
    ? devSession.user.role
    : (session?.user as any)?.role || "CLIPPER";
  const isAuthenticated = isDevMode ? !!devRole : status === "authenticated";

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push(isDevMode ? "/dev-login" : "/login");
    }
  }, [isLoading, isAuthenticated, isDevMode, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  if (!effectiveSession?.user) return null;

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] transition-theme">
      <Sidebar role={effectiveRole} />
      <div className="flex flex-1 flex-col ml-60">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
