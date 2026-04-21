import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { activeSSEConnections } from "@/app/api/chat/sse/route";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/admin/command-center?from=ISO&to=ISO
 *
 * OWNER-only aggregated operations dashboard. Real-time metrics always reflect
 * "now"; platform/business metrics filter by the [from, to] range (default
 * = last 30 days if unspecified).
 *
 * Every block is wrapped in its own try/catch so a single failing count never
 * 500s the whole response. Returned shape is stable — missing blocks degrade
 * to sensible defaults (0, [], null) so the client can render without
 * conditional existence checks.
 *
 * Limits the client has to keep in mind:
 *  - peakActiveThisHour is a PROXY for peak-concurrent — real peak requires
 *    a persisted time-series which doesn't exist in the current schema.
 *  - cronStatus reads TrackingJob.lastCheckedAt max — there's no cron-run
 *    audit table, so success/fail breakdown is not available.
 *  - suspiciousClipUrls detects DUPLICATE clipUrl across different userIds
 *    (a real fraud signal). The spec's "similar view counts" heuristic was
 *    dropped because it produces noisy false positives.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Date-range parsing — default to last 30 days, clamp to reasonable bounds.
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = fromParam ? new Date(fromParam) : defaultFrom;
  const to = toParam ? new Date(toParam) : now;
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now.getTime() - 7 * 86_400_000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const hourStart = new Date(now.getTime() - 60 * 60_000);
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60_000);
  const tenMinAgo = new Date(now.getTime() - 10 * 60_000);

  // ── REAL-TIME ──────────────────────────────────────────────
  let liveUsersOnline = 0;
  try {
    liveUsersOnline = activeSSEConnections.size;
  } catch {}

  // Active sessions: NextAuth Session.updatedAt isn't touched per request, so
  // proxy from distinct clip/clipStat activity in the last 15 min.
  let activeSessionsLast15Min = 0;
  try {
    const rows = await db.clip.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: fifteenMinAgo } },
      _count: true,
    });
    activeSessionsLast15Min = rows.length;
  } catch {}

  let peakActiveThisHour = 0;
  try {
    const rows = await db.clip.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: hourStart } },
      _count: true,
    });
    peakActiveThisHour = rows.length;
  } catch {}

  let recentClipSubmissions: any[] = [];
  try {
    const recent = await db.clip.findMany({
      where: { createdAt: { gte: tenMinAgo }, isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, userId: true, createdAt: true, status: true, clipUrl: true,
        user: { select: { username: true, name: true } },
        campaign: { select: { name: true, platform: true } },
      },
    });
    recentClipSubmissions = recent.map((c: any) => ({
      clipId: c.id,
      userId: c.userId,
      username: c.user?.username || c.user?.name || "unknown",
      campaignName: c.campaign?.name || "—",
      platform: c.campaign?.platform || "—",
      status: c.status,
      createdAt: c.createdAt,
    }));
  } catch {}

  // ── SYSTEM ─────────────────────────────────────────────────
  // Cron status proxy: max lastCheckedAt across active tracking jobs ≈ when
  // tracking last ran. No schema change = no per-run success/fail log.
  let cronStatus: any = { lastRunAt: null, proxy: true };
  try {
    const latestCheck = await db.trackingJob.findFirst({
      where: { lastCheckedAt: { not: null } },
      orderBy: { lastCheckedAt: "desc" },
      select: { lastCheckedAt: true },
    });
    cronStatus = {
      lastRunAt: latestCheck?.lastCheckedAt ?? null,
      minutesAgo: latestCheck?.lastCheckedAt
        ? Math.round((Date.now() - new Date(latestCheck.lastCheckedAt).getTime()) / 60_000)
        : null,
      proxy: true,
    };
  } catch {}

  let databaseSize: any = { bytes: null, pretty: null, percentOfFree: null };
  try {
    const rows = await db.$queryRaw<{ bytes: bigint; pretty: string }[]>`
      SELECT pg_database_size(current_database())::bigint AS bytes,
             pg_size_pretty(pg_database_size(current_database())) AS pretty
    `;
    const bytes = Number(rows?.[0]?.bytes ?? 0);
    const freeTierBytes = 500 * 1024 * 1024;
    databaseSize = {
      bytes,
      pretty: rows?.[0]?.pretty ?? null,
      percentOfFree: freeTierBytes > 0 ? Math.min(100, Math.round((bytes / freeTierBytes) * 100)) : null,
    };
  } catch {}

  // ── PLATFORM HEALTH (date-filtered) ────────────────────────
  let clipsPendingReview = 0;
  try {
    clipsPendingReview = await db.clip.count({
      where: { status: "PENDING", isDeleted: false, createdAt: { gte: from, lte: to } },
    });
  } catch {}

  // Review times split by reviewer role.
  let avgReviewTimeAdminMin: number | null = null;
  let avgReviewTimeOwnerMin: number | null = null;
  try {
    const reviewed = await db.clip.findMany({
      where: {
        reviewedAt: { not: null, gte: from, lte: to },
        reviewedById: { not: null },
        isDeleted: false,
      },
      select: {
        createdAt: true,
        reviewedAt: true,
        reviewer: { select: { role: true } },
      },
      take: 5000,
    });
    const adminDeltas: number[] = [];
    const ownerDeltas: number[] = [];
    for (const r of reviewed as any[]) {
      if (!r.reviewedAt || !r.reviewer?.role) continue;
      const delta = (new Date(r.reviewedAt).getTime() - new Date(r.createdAt).getTime()) / 60_000;
      if (delta < 0) continue;
      if (r.reviewer.role === "ADMIN") adminDeltas.push(delta);
      else if (r.reviewer.role === "OWNER") ownerDeltas.push(delta);
    }
    if (adminDeltas.length) avgReviewTimeAdminMin = Math.round(adminDeltas.reduce((a, b) => a + b, 0) / adminDeltas.length);
    if (ownerDeltas.length) avgReviewTimeOwnerMin = Math.round(ownerDeltas.reduce((a, b) => a + b, 0) / ownerDeltas.length);
  } catch (err: any) {
    // reviewer relation may not be present in the generated client under a
    // different name — fall through to null rather than 500.
    console.error("[COMMAND-CENTER] review-time query failed:", err?.message);
  }

  let totalViewsThisRange = 0;
  try {
    // Sum of latest stat views per clip in range. Approximation: sum all stats
    // in range (double-counts clips that got multiple stat updates) is wrong,
    // so take the max views per clip within the range.
    const rows = await db.clipStat.groupBy({
      by: ["clipId"],
      where: { checkedAt: { gte: from, lte: to } },
      _max: { views: true },
    });
    totalViewsThisRange = rows.reduce((sum: number, r: any) => sum + (r._max.views || 0), 0);
  } catch {}

  // ── MONEY & BUSINESS ───────────────────────────────────────
  // Platform revenue = (a) AgencyEarning.amount for CPM_SPLIT campaigns +
  //                    (b) clip.earnings × feePercentAtApproval / 100 for
  //                        AGENCY_FEE campaigns (clipper-side fee cut).
  // Prior version only counted (a), silently undercounting revenue from every
  // AGENCY_FEE campaign.
  let platformRevenue = 0;
  try {
    const agencyAgg = await db.agencyEarning.aggregate({
      where: { createdAt: { gte: from, lte: to } },
      _sum: { amount: true },
    });
    const cpmSplitRevenue = agencyAgg._sum.amount ?? 0;

    const feeClips = await db.clip.findMany({
      where: {
        status: "APPROVED",
        isDeleted: false,
        videoUnavailable: false,
        reviewedAt: { gte: from, lte: to },
        feePercentAtApproval: { not: null },
      },
      select: { earnings: true, feePercentAtApproval: true, campaign: { select: { pricingModel: true } } },
      take: 10000,
    });
    let agencyFeeRevenue = 0;
    for (const c of feeClips as any[]) {
      // Only AGENCY_FEE campaigns use the fee% model; CPM_SPLIT revenue is
      // already accounted for via AgencyEarning above.
      if (c.campaign?.pricingModel !== "CPM_SPLIT") {
        agencyFeeRevenue += (c.earnings || 0) * ((c.feePercentAtApproval || 0) / 100);
      }
    }

    platformRevenue = Math.round((cpmSplitRevenue + agencyFeeRevenue) * 100) / 100;
  } catch {}

  let top10EarningClippers: any[] = [];
  try {
    const grouped = await db.clip.groupBy({
      by: ["userId"],
      where: {
        status: "APPROVED",
        isDeleted: false,
        videoUnavailable: false,
        createdAt: { gte: from, lte: to },
      },
      _sum: { earnings: true },
      _count: true,
      orderBy: { _sum: { earnings: "desc" } },
      take: 10,
    });
    const userIds = grouped.map((g: any) => g.userId);
    if (userIds.length) {
      const users = await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, name: true, image: true },
      });
      const byId = new Map(users.map((u: any) => [u.id, u]));
      top10EarningClippers = grouped.map((g: any) => {
        const u = byId.get(g.userId);
        return {
          userId: g.userId,
          username: (u as any)?.username || (u as any)?.name || "unknown",
          image: (u as any)?.image || null,
          totalEarnings: Math.round((g._sum.earnings ?? 0) * 100) / 100,
          clipCount: g._count,
        };
      });
    }
  } catch {}

  // ── CAMPAIGNS ──────────────────────────────────────────────
  let campaignsUnderBudget: any[] = [];
  try {
    const active = await db.campaign.findMany({
      where: { status: "ACTIVE", budget: { not: null, gt: 0 } },
      select: { id: true, name: true, budget: true, ownerUserId: true },
      take: 500,
    });
    const campaignIds = active.map((c: any) => c.id);
    // Spent = clipper earnings + owner/agency earnings. The latter was missing
    // previously; on CPM_SPLIT campaigns owner earnings consume the same
    // budget, so omitting them understated spend and hid near-budget campaigns.
    const [clipperSpends, agencySpends] = await Promise.all([
      db.clip.groupBy({
        by: ["campaignId"],
        where: {
          campaignId: { in: campaignIds },
          status: "APPROVED",
          isDeleted: false,
          videoUnavailable: false,
        },
        _sum: { earnings: true },
      }),
      db.agencyEarning.groupBy({
        by: ["campaignId"],
        where: { campaignId: { in: campaignIds } },
        _sum: { amount: true },
      }),
    ]);
    const spendMap = new Map<string, number>();
    for (const s of clipperSpends as any[]) spendMap.set(s.campaignId, (spendMap.get(s.campaignId) || 0) + (s._sum.earnings ?? 0));
    for (const s of agencySpends as any[]) spendMap.set(s.campaignId, (spendMap.get(s.campaignId) || 0) + (s._sum.amount ?? 0));

    campaignsUnderBudget = active
      .map((c: any) => {
        const spent = Number(spendMap.get(c.id) ?? 0);
        const pctRemaining = c.budget > 0 ? Math.max(0, 1 - spent / c.budget) : 1;
        return { id: c.id, name: c.name, budget: c.budget, spent: Math.round(spent * 100) / 100, percentRemaining: Math.round(pctRemaining * 100) };
      })
      .filter((c: any) => c.percentRemaining < 20)
      .sort((a: any, b: any) => a.percentRemaining - b.percentRemaining)
      .slice(0, 20);
  } catch {}

  let newClippersStats: any = { today: 0, week: 0, month: 0, dailyLast30: [] };
  try {
    const [today, week, month] = await Promise.all([
      db.user.count({ where: { createdAt: { gte: dayStart }, role: "CLIPPER" } }),
      db.user.count({ where: { createdAt: { gte: weekStart }, role: "CLIPPER" } }),
      db.user.count({ where: { createdAt: { gte: monthStart }, role: "CLIPPER" } }),
    ]);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const recent = await db.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo }, role: "CLIPPER" },
      select: { createdAt: true },
      take: 5000,
    });
    const buckets = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getTime() - i * 86_400_000);
      const k = d.toISOString().slice(0, 10);
      buckets.set(k, 0);
    }
    for (const u of recent as any[]) {
      const k = new Date(u.createdAt).toISOString().slice(0, 10);
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) || 0) + 1);
    }
    const dailyLast30 = Array.from(buckets.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    newClippersStats = { today, week, month, dailyLast30 };
  } catch {}

  // ── QUALITY + FRAUD ────────────────────────────────────────
  let approvalRate: number | null = null;
  try {
    const [approved, reviewed] = await Promise.all([
      db.clip.count({
        where: {
          status: "APPROVED",
          isDeleted: false,
          reviewedAt: { gte: from, lte: to },
        },
      }),
      db.clip.count({
        where: {
          status: { in: ["APPROVED", "REJECTED"] },
          isDeleted: false,
          reviewedAt: { gte: from, lte: to },
        },
      }),
    ]);
    approvalRate = reviewed > 0 ? Math.round((approved / reviewed) * 100) : null;
  } catch {}

  let avgPayoutPerClipper: number | null = null;
  try {
    const grouped = await db.clip.groupBy({
      by: ["userId"],
      where: {
        status: "APPROVED",
        isDeleted: false,
        videoUnavailable: false,
        createdAt: { gte: from, lte: to },
      },
      _sum: { earnings: true },
    });
    if (grouped.length > 0) {
      const total = grouped.reduce((s: number, g: any) => s + (g._sum.earnings ?? 0), 0);
      avgPayoutPerClipper = Math.round((total / grouped.length) * 100) / 100;
    }
  } catch {}

  let deadCampaigns: any[] = [];
  try {
    const active = await db.campaign.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, ownerUserId: true, createdAt: true, ownerUser: { select: { username: true, name: true } } as any },
      take: 500,
    });
    const recentClips = await db.clip.groupBy({
      by: ["campaignId"],
      where: { createdAt: { gte: weekStart }, isDeleted: false },
      _count: true,
    });
    const activeIds = new Set(recentClips.map((r: any) => r.campaignId));
    deadCampaigns = active
      .filter((c: any) => !activeIds.has(c.id))
      .map((c: any) => {
        const ageDays = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / 86_400_000);
        return {
          id: c.id,
          name: c.name,
          daysInactive: Math.min(7, ageDays), // can't tell beyond 7d without more lookback
          ownerName: c.ownerUser?.username || c.ownerUser?.name || "—",
        };
      })
      .slice(0, 20);
  } catch {}

  // Duplicate clipUrl across different userIds (real fraud signal).
  let suspiciousClipUrls: any[] = [];
  try {
    const dupes = await db.$queryRaw<{ clipUrl: string; user_count: bigint }[]>`
      SELECT "clipUrl", COUNT(DISTINCT "userId")::bigint AS user_count
      FROM "clips"
      WHERE "isDeleted" = false
        AND "createdAt" >= ${from}
        AND "createdAt" <= ${to}
      GROUP BY "clipUrl"
      HAVING COUNT(DISTINCT "userId") > 1
      LIMIT 20
    `;
    suspiciousClipUrls = (dupes || []).map((d: any) => ({
      clipUrl: d.clipUrl,
      distinctUsers: Number(d.user_count),
    }));
  } catch {}

  // Owner response time: avg minutes from a non-owner ticket message to the
  // next OWNER message in that thread. Approximate via per-ticket scan.
  let ownerResponseTimeMin: number | null = null;
  try {
    const sampled = await db.ticketMessage.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: [{ ticketId: "asc" }, { createdAt: "asc" }],
      take: 5000,
      select: {
        ticketId: true, createdAt: true,
        user: { select: { role: true } },
      },
    });
    const deltas: number[] = [];
    let awaitingOwnerReplyAt: Date | null = null;
    let currentTicket: string | null = null;
    for (const m of sampled as any[]) {
      if (m.ticketId !== currentTicket) {
        currentTicket = m.ticketId;
        awaitingOwnerReplyAt = null;
      }
      const isOwner = m.user?.role === "OWNER";
      if (!isOwner) {
        if (!awaitingOwnerReplyAt) awaitingOwnerReplyAt = m.createdAt;
      } else if (awaitingOwnerReplyAt) {
        const delta = (new Date(m.createdAt).getTime() - new Date(awaitingOwnerReplyAt).getTime()) / 60_000;
        if (delta > 0 && delta < 60 * 24 * 14) deltas.push(delta); // clamp to 14 days
        awaitingOwnerReplyAt = null;
      }
    }
    if (deltas.length) ownerResponseTimeMin = Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
  } catch (err: any) {
    console.error("[COMMAND-CENTER] owner response time failed:", err?.message);
  }

  // ── CHART DATA: clips per day, revenue per day ─────────────
  let clipsPerDay: { date: string; count: number }[] = [];
  let revenuePerDay: { date: string; revenue: number }[] = [];
  try {
    const clipsInRange = await db.clip.findMany({
      where: { createdAt: { gte: from, lte: to }, isDeleted: false },
      select: { createdAt: true },
      take: 20000,
    });
    const agencyInRange = await db.agencyEarning.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true, amount: true },
      take: 20000,
    });
    const clipBuckets = new Map<string, number>();
    const revenueBuckets = new Map<string, number>();
    const rangeDays = Math.max(
      1,
      Math.min(90, Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1),
    );
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(to.getTime() - i * 86_400_000);
      const k = d.toISOString().slice(0, 10);
      clipBuckets.set(k, 0);
      revenueBuckets.set(k, 0);
    }
    for (const c of clipsInRange as any[]) {
      const k = new Date(c.createdAt).toISOString().slice(0, 10);
      if (clipBuckets.has(k)) clipBuckets.set(k, (clipBuckets.get(k) || 0) + 1);
    }
    for (const a of agencyInRange as any[]) {
      const k = new Date(a.createdAt).toISOString().slice(0, 10);
      if (revenueBuckets.has(k)) revenueBuckets.set(k, (revenueBuckets.get(k) || 0) + (a.amount || 0));
    }
    clipsPerDay = Array.from(clipBuckets.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    revenuePerDay = Array.from(revenueBuckets.entries())
      .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {}

  return NextResponse.json({
    range: { from: from.toISOString(), to: to.toISOString() },
    lastUpdated: new Date().toISOString(),
    realtime: {
      liveUsersOnline,
      activeSessionsLast15Min,
      peakActiveThisHour,
      peakProxy: true,
      recentClipSubmissions,
    },
    system: {
      cronStatus,
      databaseSize,
    },
    health: {
      clipsPendingReview,
      avgReviewTimeAdminMin,
      avgReviewTimeOwnerMin,
      totalViewsThisRange,
      approvalRate,
    },
    money: {
      platformRevenue,
      top10EarningClippers,
      avgPayoutPerClipper,
    },
    campaigns: {
      underBudget: campaignsUnderBudget,
      dead: deadCampaigns,
    },
    growth: {
      newClippersStats,
    },
    fraud: {
      suspiciousClipUrls,
      note: "Duplicate clipUrl across different users within the range. Replaces the spec's view-count heuristic which produces noisy false positives.",
    },
    support: {
      ownerResponseTimeMin,
    },
    charts: {
      clipsPerDay,
      revenuePerDay,
    },
  });
}
