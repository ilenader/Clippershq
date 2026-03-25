"use client";

import { useSession, signOut } from "next-auth/react";
import { useDevAuth } from "@/components/dev-auth-provider";
import { useTheme } from "@/components/theme-provider";
import { Sun, Moon, LogOut, ChevronDown, ArrowRightLeft } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export function Navbar() {
  const { data: session } = useSession();
  const { isDevMode, devSession, devRole, setDevRole, clearDevAuth } = useDevAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const effectiveUser = isDevMode && devSession ? devSession.user : session?.user;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSignOut = async () => {
    if (isDevMode) {
      await clearDevAuth();
      router.push("/dev-login");
    } else {
      signOut({ callbackUrl: "/" });
    }
  };

  const handleSwitchRole = async (role: "CLIPPER" | "ADMIN" | "OWNER") => {
    await setDevRole(role);
    setMenuOpen(false);
    if (role === "ADMIN" || role === "OWNER") {
      router.push("/admin");
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-glass)] px-6 backdrop-blur-xl backdrop-saturate-150 transition-theme">
      <div>
        {isDevMode && devRole && (
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/20 bg-yellow-500/5 px-2.5 py-1">
            <div className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-[10px] font-semibold text-yellow-400 tracking-wide">DEV &middot; {devRole}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="rounded-xl p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)] transition-all cursor-pointer"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {effectiveUser && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--bg-input)] transition-all cursor-pointer"
            >
              {effectiveUser.image ? (
                <Image
                  src={effectiveUser.image}
                  alt=""
                  width={26}
                  height={26}
                  className="rounded-full"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                  {effectiveUser.name?.[0]?.toUpperCase() || "?"}
                </div>
              )}
              <span className="text-[13px] font-medium text-[var(--text-primary)] hidden sm:block">
                {effectiveUser.name}
              </span>
              <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] py-1 shadow-[var(--shadow-elevated)]">
                <div className="px-3 py-2.5 border-b border-[var(--border-subtle)]">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">{effectiveUser.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{effectiveUser.email}</p>
                </div>

                {isDevMode && (
                  <div className="border-b border-[var(--border-subtle)] py-1">
                    <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                      Switch Role
                    </p>
                    {(["CLIPPER", "ADMIN", "OWNER"] as const).map((role) => (
                      <button
                        key={role}
                        onClick={() => handleSwitchRole(role)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-[13px] transition-colors cursor-pointer ${
                          devRole === role
                            ? "text-accent bg-accent/5"
                            : "text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"
                        }`}
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                        {role}
                        {devRole === role && (
                          <span className="ml-auto text-[10px] text-accent font-medium">active</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-red-400 hover:bg-[var(--bg-input)] transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
