/**
 * Shared DB retry helpers — used by get-session.ts and any read path that
 * needs to survive transient Supabase blips.
 *
 * Production incidents that motivated this:
 *  - 2026-04-24: Supabase pooler hit MaxClientsInSession; auth() crashed.
 *  - 2026-04-25: Generic PrismaClientKnownRequestError on session.findUnique
 *    surfaced through the same code path.
 *  - 2026-04-25 (later): scheduledVoiceCall.findMany returned P1008 SocketTimeout
 *    and took down the community calls page. Proved that retrying only at the
 *    auth boundary leaves every other read unprotected.
 *
 * NEVER wrap mutations (create/update/delete/upsert/transaction) — retry on a
 * write could double-charge, duplicate records, or corrupt budget state.
 */

/**
 * Detects transient DB errors that are safe to retry.
 * Conservative — only known transient patterns. False positives waste a retry;
 * false negatives bubble error to user.
 */
export function isTransientDbError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || "").toLowerCase();
  const code: string = err?.code || "";
  const name: string = err?.name || "";

  // Connection-level errors (server unreachable / dropped / pool exhausted)
  if (msg.includes("maxclientsinsession")) return true;
  if (msg.includes("max clients")) return true;
  if (msg.includes("too many clients")) return true;
  if (msg.includes("timed out fetching")) return true;
  if (msg.includes("connection pool")) return true;
  if (msg.includes("connection terminated")) return true;
  if (msg.includes("connection refused")) return true;
  if (msg.includes("server has closed the connection")) return true;
  if (msg.includes("can't reach database")) return true;
  if (msg.includes("socket")) return true;
  if (msg.includes("econnreset")) return true;
  if (msg.includes("etimedout")) return true;

  // Postgres / Prisma codes for transient connection failures
  if (code === "XX000") return true;
  if (code === "P2024") return true; // pool timeout
  if (code === "P1001") return true; // can't reach db
  if (code === "P1002") return true; // connection timeout
  if (code === "P1008") return true; // operation timeout (SocketTimeout)
  if (code === "P1017") return true; // server closed the connection

  // Prisma error class names — only retry READ operations. Detecting by
  // operation name in the message keeps us from re-issuing mutations.
  if (name === "PrismaClientKnownRequestError") {
    if (
      msg.includes("findunique") ||
      msg.includes("findmany") ||
      msg.includes("findfirst") ||
      msg.includes("count") ||
      msg.includes("aggregate") ||
      msg.includes("groupby") ||
      msg.includes("session") // NextAuth session reads
    ) {
      return true;
    }
  }
  if (name === "PrismaClientInitializationError") return true;
  if (name === "PrismaClientRustPanicError") return true;
  if (name === "PrismaClientUnknownRequestError") return true;

  return false;
}

/**
 * Wraps a DB operation with retry logic for transient errors.
 * Use ONLY for read operations (findUnique, findMany, count, aggregate, etc).
 * NEVER use for create/update/delete/upsert — would risk duplicates.
 *
 * 3 attempts, exponential backoff (100ms, 300ms, 800ms).
 * Total worst-case wait: 1.2s before the user sees the error.
 *
 * @param fn   The operation to attempt.
 * @param label Short tag for logs ("auth", "earnings.clips", etc).
 */
export async function withDbRetry<T>(fn: () => Promise<T>, label = "db"): Promise<T> {
  const MAX_ATTEMPTS = 3;
  const BACKOFF_MS = [100, 300, 800];
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const transient = isTransientDbError(err);
      if (!transient || attempt === MAX_ATTEMPTS) {
        throw err;
      }
      const delay = BACKOFF_MS[attempt - 1];
      console.warn(
        `[DB-RETRY:${label}] transient failure on attempt ${attempt}/${MAX_ATTEMPTS}, retrying in ${delay}ms — name=${err?.name || "?"} code=${err?.code || "?"} msg=${err?.message || "unknown"}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
