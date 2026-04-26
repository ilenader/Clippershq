import { NextResponse } from "next/server";
import Ably from "ably";
import { getSession } from "@/lib/get-session";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/ably-token
 *
 * Returns a short-lived Ably tokenRequest signed with ABLY_API_KEY.
 * The browser never sees the API key. The capability pins each client to
 * subscribe-only on their own "user:{userId}" channel — they cannot publish
 * anything and cannot read other users' channels.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // No ADMIN multiplier — this is per-user reconnect behavior, not bulk admin
  // work. Owners still bypass so dashboards with many subscriptions don't trip.
  const role = (session.user as any).role;
  const rl = checkRoleAwareRateLimit(`ably-token:${session.user.id}`, 30, 60_000, role, 1);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!process.env.ABLY_API_KEY) {
    return NextResponse.json({ error: "Ably not configured" }, { status: 503 });
  }

  try {
    const ably = new Ably.Rest({ key: process.env.ABLY_API_KEY });
    const token = await ably.auth.createTokenRequest({
      clientId: session.user.id,
      capability: { [`user:${session.user.id}`]: ["subscribe"] },
    });
    return NextResponse.json(token);
  } catch (err) {
    console.error("[ABLY] Token creation failed:", (err as any)?.message);
    return NextResponse.json({ error: "Token creation failed" }, { status: 500 });
  }
}
