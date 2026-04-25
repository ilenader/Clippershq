import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getGamificationState } from "@/lib/gamification";
import { checkBanStatus } from "@/lib/check-ban";
import { invalidateCache, invalidateCachePrefix } from "@/lib/cache";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/admin/users/[id] — Full user profile for owner */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const user = await db.user.findUnique({
      where: { id },
      include: {
        clipAccounts: { select: { id: true, username: true, platform: true, status: true, deletedByUser: true } },
        clips: {
          where: { isDeleted: false },
          include: {
            campaign: { select: { name: true } },
            clipAccount: { select: { username: true } },
            stats: { orderBy: { checkedAt: "desc" }, take: 1 },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        payoutRequests: { orderBy: { createdAt: "desc" }, take: 20 },
        teamMemberships: { include: { team: { select: { name: true } } } },
        referrals: { select: { id: true, username: true, totalEarnings: true } },
      },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Compute stats
    const approvedClips = user.clips.filter((c: any) => c.status === "APPROVED").length;
    const pendingClips = user.clips.filter((c: any) => c.status === "PENDING").length;
    const rejectedClips = user.clips.filter((c: any) => c.status === "REJECTED").length;
    const paidOut = user.payoutRequests.filter((p: any) => p.status === "PAID").reduce((s: number, p: any) => s + p.amount, 0);
    const pendingPayout = user.payoutRequests.filter((p: any) => ["REQUESTED", "UNDER_REVIEW", "APPROVED"].includes(p.status)).reduce((s: number, p: any) => s + p.amount, 0);

    // Campaign memberships
    const campaignJoins = await db.campaignAccount.findMany({
      where: { clipAccount: { userId: id } },
      include: { campaign: { select: { id: true, name: true, status: true } } },
    });
    const campaigns = [...new Map(campaignJoins.map((j: any) => [j.campaign.id, j.campaign])).values()];

    // Referrer
    let referrer = null;
    if (user.referredById) {
      referrer = await db.user.findUnique({ where: { id: user.referredById }, select: { id: true, username: true } });
    }

    // Gamification state (effective bonus, fee)
    const gamState = await getGamificationState(id);

    return NextResponse.json({
      ...user,
      approvedClips,
      pendingClips,
      rejectedClips,
      paidOut: Math.round(paidOut * 100) / 100,
      pendingPayout: Math.round(pendingPayout * 100) / 100,
      campaigns,
      referrer,
      effectiveBonusPercent: gamState?.bonusPercent ?? 0,
      effectiveFeePercent: gamState?.platformFeePercent ?? 9,
      isReferred: !!user.referredById,
    });
  } catch (err: any) {
    console.error("GET user profile error:", err?.message);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users/[id] — Update user role (OWNER only)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck2 = checkBanStatus(session);
  if (banCheck2) return banCheck2;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can change roles" }, { status: 403 });
  }

  const { id } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const updateData: any = {};

  // Role change
  if (body.role) {
    if (!["CLIPPER", "ADMIN", "OWNER"].includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (id === session.user.id && body.role !== "OWNER") {
      return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
    }
    updateData.role = body.role;
  }

  // Status change (ban/suspend/activate)
  if (body.status) {
    if (!["ACTIVE", "BANNED"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (id === session.user.id) {
      return NextResponse.json({ error: "Cannot change your own status" }, { status: 400 });
    }
    updateData.status = body.status;
  }

  // Gamification overrides
  if (body.manualBonusOverride !== undefined) {
    updateData.manualBonusOverride = body.manualBonusOverride === null ? null : Math.min(parseFloat(body.manualBonusOverride), 20);
  }
  if (body.currentStreak !== undefined) {
    updateData.currentStreak = Math.max(0, parseInt(body.currentStreak) || 0);
  }
  if (body.longestStreak !== undefined) {
    updateData.longestStreak = Math.max(0, parseInt(body.longestStreak) || 0);
  }
  if (body.level !== undefined) {
    updateData.level = Math.max(0, Math.min(5, parseInt(body.level) || 0));
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const updated = await db.user.update({
      where: { id },
      data: updateData,
      select: { id: true, username: true, email: true, role: true, status: true, level: true, currentStreak: true, longestStreak: true, manualBonusOverride: true, bonusPercentage: true, totalEarnings: true, referralCode: true, referredById: true },
    });
    // Invalidate caches that depend on this user's role/membership.
    if (updateData.role !== undefined) {
      invalidateCache(`user.role.${id}`);
      invalidateCachePrefix(`community.campaigns.${id}.`);
    }
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
