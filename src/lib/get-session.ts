import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cookies } from "next/headers";
import { isDevBypassEnabled, getDevSession, DEV_AUTH_COOKIE } from "@/lib/dev-auth";
import type { DevRole } from "@/lib/dev-auth";

/**
 * Retry wrapper for auth() calls that hit the DB session store.
 *
 * Production incidents:
 *  - 2026-04-24: Supabase pooler hit MaxClientsInSession; the original v1 narrow
 *    pool-exhaustion match caught this case.
 *  - 2026-04-25: A second blip surfaced as a generic PrismaClientKnownRequestError
 *    on prisma.session.findUnique() — same root cause (transient connection
 *    issue) but the narrow string/code match missed it. Broadened the detection
 *    to cover every transient-connection pattern Prisma can emit, plus the
 *    PrismaClient* error names. Non-transient errors (validation, etc.) still
 *    rethrow immediately.
 *
 * Up to 3 attempts total with exponential backoff (100ms, 300ms, 800ms). If all
 * attempts fail, the original error propagates.
 */
function isTransientDbError(err: any): boolean {
  if (!err) return false;
  const msg: string = err?.message || "";
  const lower = msg.toLowerCase();
  const code: string = err?.code || "";
  const name: string = err?.name || "";

  // Connection / pool / network failure signals
  if (lower.includes("maxclientsinsession")) return true;
  if (lower.includes("max clients")) return true;
  if (lower.includes("too many clients")) return true;
  if (lower.includes("timed out fetching")) return true;
  if (lower.includes("connection pool")) return true;
  if (lower.includes("connection terminated")) return true;
  if (lower.includes("connection refused")) return true;
  if (lower.includes("server has closed the connection")) return true;
  if (lower.includes("can't reach database")) return true;
  if (msg.includes("ECONNRESET")) return true;
  if (msg.includes("ETIMEDOUT")) return true;

  // Prisma + Postgres error codes for transient connection failures
  if (code === "XX000") return true;
  if (code === "P2024") return true;
  if (code === "P1001") return true;
  if (code === "P1002") return true;
  if (code === "P1008") return true;
  if (code === "P1017") return true;

  // PrismaClientKnownRequestError on session-load paths — almost always
  // transient; safe to retry the auth() lookup. Narrow to session/findUnique/
  // findMany so we don't re-issue mutations.
  if (
    name === "PrismaClientKnownRequestError" &&
    (lower.includes("session") || lower.includes("findunique") || lower.includes("findmany"))
  ) {
    return true;
  }
  if (name === "PrismaClientInitializationError") return true;
  if (name === "PrismaClientRustPanicError") return true;
  if (name === "PrismaClientUnknownRequestError") return true;

  return false;
}

async function authWithRetry(): Promise<any> {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [100, 300, 800];
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await auth();
    } catch (err: any) {
      lastErr = err;
      const transient = isTransientDbError(err);
      if (!transient || attempt === MAX_ATTEMPTS) {
        throw err;
      }
      const delay = BACKOFF_MS[attempt - 1];
      console.warn(
        `[DB-RETRY] auth() transient failure on attempt ${attempt}/${MAX_ATTEMPTS}, retrying in ${delay}ms — name=${err?.name || "?"} code=${err?.code || "?"} msg=${err?.message || "unknown"}`,
      );
      await new Promise((r) => setTimeout(r, delay));
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
