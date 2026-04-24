import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { isDevBypassEnabled, getDevSession, DEV_AUTH_COOKIE } from "@/lib/dev-auth";
import type { DevRole } from "@/lib/dev-auth";

/**
 * Retry wrapper for auth() calls that hit the DB session store.
 *
 * Production outage 2026-04-24: Supabase pooler reached MaxClientsInSession
 * and auth() began throwing before any downstream code could recover. A single
 * retry after a brief backoff absorbs transient pool-exhaustion spikes without
 * masking real failures. Non-pool errors rethrow immediately.
 *
 * Up to 2 attempts total (1 initial + 1 retry) with 200ms backoff. If both
 * attempts fail, the original error propagates.
 */
async function authWithRetry(): Promise<any> {
  const MAX_ATTEMPTS = 2;
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await auth();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || "").toLowerCase();
      const code = err?.code || "";
      const isPoolExhaustion =
        code === "P2024" ||
        code === "XX000" || // Postgres FATAL — may surface on pool exhaustion without the MaxClientsInSession string
        msg.includes("maxclientsinsession") ||
        msg.includes("max clients") ||
        msg.includes("timed out fetching") ||
        msg.includes("connection pool") ||
        msg.includes("too many clients");
      if (!isPoolExhaustion || attempt === MAX_ATTEMPTS) {
        throw err;
      }
      console.warn(
        `[DB-POOL-RETRY] auth() pool exhaustion on attempt ${attempt}/${MAX_ATTEMPTS}, retrying in 200ms — code=${code || "?"} msg=${err?.message || "unknown"}`,
      );
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw lastErr;
}

interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: string;
  status: string;
  discordId: string;
}

interface SessionResult {
  user: SessionUser;
}

/**
 * Ensure dev-bypass user exists in the real database so FK constraints work.
 * This only runs in dev mode and is idempotent (upsert).
 */
async function ensureDevUserInDb(devSession: SessionResult): Promise<void> {
  if (!db) return;
  try {
    const user = devSession.user;
    await db.user.upsert({
      where: { id: user.id },
      update: {}, // no-op if exists
      create: {
        id: user.id,
        name: user.name || "Dev User",
        username: user.name || "dev_user",
        email: user.email,
        role: user.role as any,
        status: "ACTIVE",
        discordId: user.discordId,
      },
    });
  } catch {
    // Non-critical — if upsert fails, dev mode continues without DB user
  }
}

/**
 * Get the current session — works for both real auth and dev bypass.
 */
export async function getSession(): Promise<SessionResult | null> {
  // Dev bypass takes priority in development
  if (isDevBypassEnabled()) {
    const cookieStore = await cookies();
    const devRole = cookieStore.get(DEV_AUTH_COOKIE)?.value;
    if (devRole && ["CLIPPER", "ADMIN", "OWNER", "CLIENT"].includes(devRole)) {
      const session = getDevSession(devRole as DevRole);
      // Ensure dev user exists in DB for FK constraints
      await ensureDevUserInDb(session);
      return session;
    }
  }

  // Fall through to real auth — wrapped in retry for DB pool resilience.
  const session = await authWithRetry();
  if (!session?.user) return null;
  return session as unknown as SessionResult;
}
