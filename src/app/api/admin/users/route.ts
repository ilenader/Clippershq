import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  // Only OWNER can view all users
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const roleFilter = req.nextUrl.searchParams.get("role");
  const where: any = {};
  if (roleFilter) {
    const roles = roleFilter.split(",").map((r) => r.trim()).filter(Boolean);
    if (roles.length > 0) where.role = { in: roles };
  }

  try {
    const select = roleFilter
      ? { id: true, username: true, name: true, role: true, image: true }
      : {
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
        };
    const users = await db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      select,
    });
    return NextResponse.json(users);
  } catch (err: any) {
    console.error("GET /api/admin/users error:", err?.message);
    return NextResponse.json([]);
  }
}
