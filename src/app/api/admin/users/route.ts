import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  // Only OWNER can view all users
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        email: true,
        image: true,
        role: true,
        status: true,
        discordId: true,
        createdAt: true,
        level: true,
        totalEarnings: true,
        currentStreak: true,
        longestStreak: true,
        bonusPercentage: true,
        manualBonusOverride: true,
        referralCode: true,
        referredById: true,
      },
    });
    return NextResponse.json(users);
  } catch (err: any) {
    console.error("GET /api/admin/users error:", err?.message);
    return NextResponse.json([]);
  }
}
