import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { isDevBypassEnabled, getDevSession, DEV_AUTH_COOKIE } from "@/lib/dev-auth";
import type { DevRole } from "@/lib/dev-auth";

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
    if (devRole && ["CLIPPER", "ADMIN", "OWNER"].includes(devRole)) {
      const session = getDevSession(devRole as DevRole);
      // Ensure dev user exists in DB for FK constraints
      await ensureDevUserInDb(session);
      return session;
    }
  }

  // Fall through to real auth
  const session = await auth();
  if (!session?.user) return null;
  return session as unknown as SessionResult;
}
