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
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      db: "connected"
    }, { status: 200 });
  } catch (err: any) {
    console.error("[HEALTH-CHECK-DB-FAIL]", err?.message);
    return NextResponse.json({
      status: "error",
      db: "unreachable",
      error: err?.code || "unknown"
    }, { status: 503 });
  }
}
