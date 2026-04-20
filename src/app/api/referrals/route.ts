import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { ensureReferralCode, getReferralStats } from "@/lib/referrals";
import { checkBanStatus } from "@/lib/check-ban";
import { DEFAULT_REFERRAL_PERCENT } from "@/lib/earnings-calc";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;

  // Admin/Owner full platform view
  if (req.nextUrl.searchParams.get("admin") === "true") {
    if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!db) return NextResponse.json({ allReferrers: [], platformTotals: { totalReferrals: 0, totalReferralEarnings: 0, totalReferrers: 0 } });

    try {
      const pct = DEFAULT_REFERRAL_PERCENT / 100;
      // Get all referred users with their referrer info
      const referredUsers = await db.user.findMany({
        where: { referredById: { not: null } },
        select: { id: true, username: true, name: true, referredById: true, totalEarnings: true, totalViews: true, createdAt: true },
        take: 1000,
      });

      // Count clips per referred user
      const referredIds = referredUsers.map((u: any) => u.id);
      const clipCounts = referredIds.length > 0
        ? await db.clip.groupBy({ by: ["userId"], where: { userId: { in: referredIds }, isDeleted: false }, _count: true })
        : [];
      const clipCountMap: Record<string, number> = {};
      for (const cc of clipCounts) clipCountMap[cc.userId] = cc._count;

      // Group by referrer
      const referrerMap = new Map<string, any[]>();
      for (const u of referredUsers) {
        if (!u.referredById) continue;
        const list = referrerMap.get(u.referredById) || [];
        list.push({
          id: u.id,
          username: u.username || u.name || "User",
          createdAt: u.createdAt,
          totalEarnings: u.totalEarnings || 0,
          totalViews: u.totalViews || 0,
          clipCount: clipCountMap[u.id] || 0,
        });
        referrerMap.set(u.referredById, list);
      }

      // Get referrer details
      const referrerIds = Array.from(referrerMap.keys());
      const referrers = referrerIds.length > 0
        ? await db.user.findMany({
            where: { id: { in: referrerIds } },
            select: { id: true, username: true, image: true, referralCode: true },
          })
        : [];
      const referrerInfo = Object.fromEntries(referrers.map((r: any) => [r.id, r]));

      const allReferrers = referrerIds.map((id) => {
        const refs = referrerMap.get(id) || [];
        const info = referrerInfo[id] || {};
        const referralEarnings = Math.round(refs.reduce((s: number, r: any) => s + (r.totalEarnings || 0) * pct, 0) * 100) / 100;
        return {
          id,
          username: info.username || "User",
          image: info.image || null,
          referralCode: info.referralCode || null,
          referralCount: refs.length,
          referralEarnings,
          referrals: refs,
        };
      }).sort((a, b) => b.referralEarnings - a.referralEarnings);

      const platformTotals = {
        totalReferrals: referredUsers.length,
        totalReferralEarnings: Math.round(allReferrers.reduce((s, r) => s + r.referralEarnings, 0) * 100) / 100,
        totalReferrers: allReferrers.length,
      };

      return NextResponse.json({ allReferrers, platformTotals });
    } catch (err: any) {
      console.error("GET /api/referrals?admin error:", err?.message);
      return NextResponse.json({ allReferrers: [], platformTotals: { totalReferrals: 0, totalReferralEarnings: 0, totalReferrers: 0 } });
    }
  }

  // Leaderboard mode: top 10 referrers
  if (req.nextUrl.searchParams.get("leaderboard") === "true") {
    if (!db) return NextResponse.json([]);
    try {
      const referred = await db.user.findMany({
        where: { referredById: { not: null } },
        select: { referredById: true, totalEarnings: true },
        take: 1000,
      });
      const inviterMap = new Map<string, { count: number; earnings: number }>();
      const pct = DEFAULT_REFERRAL_PERCENT / 100;
      for (const r of referred) {
        if (!r.referredById) continue;
        const existing = inviterMap.get(r.referredById) || { count: 0, earnings: 0 };
        existing.count++;
        existing.earnings += (r.totalEarnings || 0) * pct;
        inviterMap.set(r.referredById, existing);
      }
      const inviterIds = Array.from(inviterMap.keys());
      if (inviterIds.length === 0) return NextResponse.json([]);
      // Only CLIPPERs appear in the referral leaderboard — CLIENT/ADMIN/OWNER may refer internally
      // but shouldn't show up on a clipper-facing leaderboard.
      const inviters = await db.user.findMany({
        where: { id: { in: inviterIds }, role: "CLIPPER" },
        select: { id: true, username: true },
      });
      const nameMap = Object.fromEntries(inviters.map((u: any) => [u.id, u.username]));
      const leaderboard = Array.from(inviterMap.entries())
        .filter(([id]) => nameMap[id] != null) // drop non-CLIPPER inviters
        .map(([id, data]) => ({
          userId: id,
          username: nameMap[id] || "User",
          referralCount: data.count,
          referralEarnings: Math.round(data.earnings * 100) / 100,
        }))
        .sort((a, b) => b.referralEarnings - a.referralEarnings)
        .slice(0, 10);
      return NextResponse.json(leaderboard);
    } catch {
      return NextResponse.json([]);
    }
  }

  // CLIENTs have no personal referral program
  if (role === "CLIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Default: personal referral data
  const [code, stats] = await Promise.all([
    ensureReferralCode(session.user.id),
    getReferralStats(session.user.id),
  ]);

  return NextResponse.json({
    referralCode: code,
    referralCount: stats.referralCount,
    referralEarnings: stats.referralEarnings,
    referrals: stats.referrals.map((r: any) => ({
      id: r.id,
      username: r.username || r.name || "User",
      createdAt: r.createdAt,
      totalEarnings: r.totalEarnings || 0,
    })),
  });
}
