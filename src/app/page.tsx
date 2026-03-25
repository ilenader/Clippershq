import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isDevBypassEnabled, DEV_AUTH_COOKIE } from "@/lib/dev-auth";
import { cookies } from "next/headers";

export default async function LandingPage() {
  // Check dev bypass first
  if (isDevBypassEnabled()) {
    const cookieStore = await cookies();
    const devRole = cookieStore.get(DEV_AUTH_COOKIE)?.value;
    if (devRole) {
      if (devRole === "ADMIN" || devRole === "OWNER") {
        redirect("/admin");
      }
      redirect("/dashboard");
    }
    // Dev mode but not logged in — go to dev login
    redirect("/dev-login");
  }

  // Normal auth flow
  const session = await auth();
  if (session?.user) {
    const role = (session.user as any).role;
    if (role === "ADMIN" || role === "OWNER") {
      redirect("/admin");
    }
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-primary)] transition-theme">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 100 100" className="h-7 w-7" fill="currentColor">
            <polygon points="50,10 90,85 10,85" className="text-white" />
          </svg>
          <span className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
            CLIPPERS HQ
          </span>
        </div>
        <Link
          href="/login"
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center">
          <svg viewBox="0 0 100 100" className="h-16 w-16 drop-shadow-[0_0_40px_rgba(255,255,255,0.15)]" fill="currentColor">
            <polygon points="50,10 90,85 10,85" className="text-white" />
          </svg>
        </div>
        <h1 className="mb-4 text-5xl font-bold tracking-tight text-[var(--text-primary)] sm:text-6xl">
          CLIPPERS HQ
        </h1>
        <p className="mb-8 max-w-md text-lg text-[var(--text-secondary)]">
          The all-in-one platform for managing clips, campaigns, and payouts. Simple, fast, powerful.
        </p>
        <Link
          href="/login"
          className="rounded-xl bg-accent px-8 py-3 text-base font-semibold text-white shadow-lg shadow-accent/20 hover:bg-accent-hover transition-all hover:shadow-xl hover:shadow-accent/30"
        >
          Get Started
        </Link>
        <p className="mt-6 text-sm text-[var(--text-muted)]">
          Sign in with Discord to start clipping.
        </p>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-[var(--text-muted)]">
        CLIPPERS HQ &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
