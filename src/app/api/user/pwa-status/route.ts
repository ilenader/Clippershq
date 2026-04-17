import { getSession } from "@/lib/get-session";
import { checkBanStatus } from "@/lib/check-ban";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isPWAUser: true },
  });

  return NextResponse.json({ isPWAUser: user?.isPWAUser ?? false });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  // Basic PWA-context signal: the app sets X-PWA-Mode: standalone from installed contexts.
  // Not cryptographically bulletproof (headers can be forged with curl), but blocks casual
  // abuse from someone just hitting the endpoint from a normal browser tab.
  const pwaHeader = req.headers.get("x-pwa-mode");
  if (pwaHeader !== "standalone") {
    return NextResponse.json({ error: "Invalid request context" }, { status: 400 });
  }

  // Parse body — default to { installed: true } for backward compatibility
  let installed = true;
  try {
    const body = await req.json();
    if (body && typeof body.installed === "boolean") {
      installed = body.installed;
    }
  } catch {
    // No body or invalid JSON — default to install
  }

  const current = await db.user.findUnique({ where: { id: session.user.id }, select: { isPWAUser: true } });

  if (installed && !current?.isPWAUser) {
    await db.user.update({
      where: { id: session.user.id },
      data: { isPWAUser: true, lastPWAOpenAt: new Date() },
    });
    // PWA bonus changed — recalculate earnings
    try {
      const { recalculateUnpaidEarnings } = await import("@/lib/gamification");
      await recalculateUnpaidEarnings(session.user.id);
    } catch (err: any) {
      console.error("[PWA] Earnings recalculation failed:", err?.message);
    }
  } else if (installed && current?.isPWAUser) {
    // Already a PWA user — just refresh lastPWAOpenAt
    await db.user.update({
      where: { id: session.user.id },
      data: { lastPWAOpenAt: new Date() },
    });
  } else if (!installed && current?.isPWAUser) {
    await db.user.update({
      where: { id: session.user.id },
      data: { isPWAUser: false },
    });
    // PWA bonus removed — recalculate earnings
    try {
      const { recalculateUnpaidEarnings } = await import("@/lib/gamification");
      await recalculateUnpaidEarnings(session.user.id);
    } catch (err: any) {
      console.error("[PWA] Earnings recalculation failed:", err?.message);
    }
  }

  return NextResponse.json({ ok: true, isPWAUser: installed });
}
