import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 5;

/**
 * GET /api/health/db — Better Stack uptime monitoring target.
 *
 * Separate from /api/health (which is Railway's deploy healthcheck and is
 * intentionally lightweight — see that file's comment). This endpoint DOES
 * hit the DB so external monitors can alert on connectivity loss before users
 * see failures. Do NOT point Railway's deploy healthcheck here — a transient
 * DB blip would cause Railway to pull traffic and amplify the incident.
 *
 * Public, no auth. Response carries only ok/error status + a Prisma error
 * code at most — no user data, nothing exploitable.
 *
 * Internal 2-attempt retry with 200ms backoff absorbs single-blip transients
 * so Better Stack doesn't page on every connection hiccup. Only persistent
 * failures (both attempts down) trigger a 503.
 */
async function tryDbCheck(maxAttempts = 2): Promise<{ ok: true } | { ok: false; error: string; code?: string }> {
  let lastError: any = null;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await db.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch (err: any) {
      lastError = err;
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }
  return { ok: false, error: lastError?.message || "unknown", code: lastError?.code };
}

export async function GET() {
  const result = await tryDbCheck(2);
  if (result.ok) {
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      db: "connected",
    }, { status: 200 });
  }
  console.error("[HEALTH-CHECK-DB-FAIL]", result.error);
  return NextResponse.json({
    status: "error",
    db: "unreachable",
    error: result.code || result.error || "unknown",
  }, { status: 503 });
}
