import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — Railway healthcheck target. Deliberately lightweight:
 * no DB hit, no external calls. Railway polls this during deploys to decide
 * when the new container is live before routing traffic; anything heavier
 * here would flap under load.
 */
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
