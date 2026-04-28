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

    // Phase 6d — marketplace platform's 10% cut counts toward platform
    // revenue. Date-scope by underlying clip.reviewedAt to match feeClips
    // semantics (revenue recognized when the clip was approved, not when
    // the cron tick wrote the latest amount). MarketplacePlatformEarning is
    // never exposed to clippers — owner/admin aggregates only.
    const marketplacePlatformAgg = await db.marketplacePlatformEarning.aggregate({
      where: {
        clip: {
          status: "APPROVED",
          isDeleted: false,
          videoUnavailable: false,
          reviewedAt: { gte: from, lte: to },
        },
      },
      _sum: { amount: true },
    });
    const marketplacePlatformRevenue = marketplacePlatformAgg._sum.amount ?? 0;

    platformRevenue = Math.round((cpmSplitRevenue + agencyFeeRevenue + marketplacePlatformRevenue) * 100) / 100;
  } catch {}

  // Total GMV — money brands put into campaigns CREATED in the date range.
  // Null budgets (open-ended campaigns) excluded.
  let totalCampaignValue = 0;
  try {
    const agg = await db.campaign.aggregate({
      where: { createdAt: { gte: from, lte: to }, budget: { not: null, gt: 0 } },
      _sum: { budget: true },
    });
    totalCampaignValue = Math.round((agg._sum.budget ?? 0) * 100) / 100;
  } catch {}

  // Paid to clippers — total clipper gross earnings on clips approved in range.
  let totalPaidToClippers = 0;
  try {
    const agg = await db.clip.aggregate({
      where: {
        status: "APPROVED",
        isDeleted: false,
        videoUnavailable: false,
        reviewedAt: { gte: from, lte: to },
      },
      _sum: { earnings: true },
    });
    // Phase 6d — for marketplace clips, Clip.earnings only holds the poster's
    // 30%. Creator's 60% lives in MarketplaceCreatorEarning. Without this
    // aggregate, "Paid to clippers" would silently undercount marketplace
    // payouts by ~67% per affected clip.
    const creatorEarningsAgg = await db.marketplaceCreatorEarning.aggregate({
      where: {
        clip: {
          status: "APPROVED",
          isDeleted: false,
          videoUnavailable: false,
          reviewedAt: { gte: from, lte: to },
        },
      },
      _sum: { amount: true },
    });
    totalPaidToClippers = Math.round(
      ((agg._sum.earnings ?? 0) + (creatorEarningsAgg._sum.amount ?? 0)) * 100
    ) / 100;
  } catch {}

  // Unspent campaign budget — POINT-IN-TIME snapshot across all ACTIVE campaigns.
  // Not filtered by date range: this is "money still available to be earned
  // right now" and extrapolating it over a past window would be meaningless.
  let totalUnspentBudget = 0;
  try {
    const activeAll = await db.campaign.findMany({
      where: { status: "ACTIVE", budget: { not: null, gt: 0 } },
      select: { id: true, budget: true },
      take: 1000,
    });
    const ids = activeAll.map((c: any) => c.id);
    if (ids.length > 0) {
      const [clipperSp, agencySp] = await Promise.all([
        db.clip.groupBy({
          by: ["campaignId"],
          where: {
            campaignId: { in: ids },
            status: "APPROVED",
            isDeleted: false,
            videoUnavailable: false,
          },
          _sum: { earnings: true },
        }),
        db.agencyEarning.groupBy({
          by: ["campaignId"],
          where: { campaignId: { in: ids } },
          _sum: { amount: true },
        }),
      ]);
      const spent = new Map<string, number>();
      for (const s of clipperSp as any[]) spent.set(s.campaignId, (spent.get(s.campaignId) || 0) + (s._sum.earnings ?? 0));
      for (const s of agencySp as any[]) spent.set(s.campaignId, (spent.get(s.campaignId) || 0) + (s._sum.amount ?? 0));
      let remaining = 0;
      for (const c of activeAll as any[]) {
        remaining += Math.max(0, (c.budget || 0) - (spent.get(c.id) || 0));
      }
      totalUnspentBudget = Math.round(remaining * 100) / 100;
    }
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

  // ── PHASE 8: MARKETPLACE ANALYTICS ─────────────────────────
  // Phase 8 — uncached aggregates. Live compute every poll.
  //   Phase 12 hardening candidate: if any marketplace table > 100k rows,
  //   wrap this block in a 60s server-side cache keyed by (from, to).
  // Top-level try/catch mirrors the money block pattern: a single failing
  // sub-query never 500s the whole route — it leaves marketplace = null
  // and the client renders an empty-state for the section.
  let marketplace: any = null;
  try {
    const SUBMISSION_STATUSES = ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "POSTED", "POST_EXPIRED"];
    const ACTIVITY_WHITELIST = [
      "MARKETPLACE_LISTING_APPROVE",
      "MARKETPLACE_LISTING_REJECT",
      "MARKETPLACE_SUBMISSION_APPROVE",
      "MARKETPLACE_SUBMISSION_REJECT",
      "MARKETPLACE_SUBMISSION_POSTED",
      "MARKETPLACE_USER_BANNED",
      "MARKETPLACE_USER_BAN_LIFTED",
      "MARKETPLACE_STRIKE_ISSUED",
      "MARKETPLACE_RATING_CREATED",
      "MARKETPLACE_LISTING_DELETE_REQUEST",
      "MARKETPLACE_LISTING_DELETE_REQUEST_CANCEL",
      "MARKETPLACE_LISTING_OVERRIDE",
    ];

    // ─── Lifetime / point-in-time counts ────────────────────────
    // Phase 8 — point-in-time card values labeled "As of now" in UI.
    // These ignore the date picker since they describe current state.
    const [
      activeListings,
      pausedListings,
      pendingApproval,
      deletionRequested,
      bannedListings,
      ratingsAvgRow,
      globalRatingCount,
    ] = await Promise.all([
      db.marketplacePosterListing.count({ where: { status: "ACTIVE" } }),
      db.marketplacePosterListing.count({ where: { status: "PAUSED" } }),
      db.marketplacePosterListing.count({ where: { status: "PENDING_APPROVAL" } }),
      db.marketplacePosterListing.count({ where: { status: "DELETION_REQUESTED" } }),
      db.marketplacePosterListing.count({ where: { status: "BANNED" } }),
      db.marketplaceRating.aggregate({ _avg: { score: true } }),
      db.marketplaceRating.count(),
    ]);
    const globalAvgRating = (ratingsAvgRow as any)?._avg?.score ?? null;

    // ─── Range counts + status breakdown ────────────────────────
    const submissionsTotal = await db.marketplaceSubmission.count({
      where: { createdAt: { gte: from, lte: to } },
    });
    const subStatusGrouped: any[] = await db.marketplaceSubmission.groupBy({
      by: ["status"],
      where: { createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const submissionsByStatus = SUBMISSION_STATUSES.map((s) => {
      const row = subStatusGrouped.find((r: any) => r.status === s);
      return { status: s, count: row?._count?._all ?? 0 };
    });
    const postedRange = await db.marketplaceSubmission.count({
      where: { postedAt: { not: null, gte: from, lte: to } },
    });

    // ─── Earnings split (60/30/10) — clip.reviewedAt-scoped ─────
    // Phase 6d already wires creator/platform aggregates into the global
    // money block. Repeated here scoped to date range so the marketplace
    // section can show its own GMV breakdown without depending on the
    // global block's mixed semantics.
    const earningsClipFilter = {
      clip: {
        status: "APPROVED",
        isDeleted: false,
        videoUnavailable: false,
        reviewedAt: { gte: from, lte: to },
      },
    } as any;
    const [creatorAgg, platformAgg]: any[] = await Promise.all([
      db.marketplaceCreatorEarning.aggregate({ where: earningsClipFilter, _sum: { amount: true } }),
      db.marketplacePlatformEarning.aggregate({ where: earningsClipFilter, _sum: { amount: true } }),
    ]);
    const creatorPaid = Math.round(((creatorAgg?._sum?.amount ?? 0)) * 100) / 100;
    const platformRevenueMkt = Math.round(((platformAgg?._sum?.amount ?? 0)) * 100) / 100;

    // Poster's 30% lives on Clip.earnings — restrict to clips that have a
    // matching MarketplaceClipPost (the Phase 6 marker for marketplace
    // clips). Schema relation: Clip.marketplaceOriginPost (singular,
    // optional). isNot:null is the canonical Prisma filter for "exists".
    const posterAgg: any = await db.clip.aggregate({
      where: {
        status: "APPROVED",
        isDeleted: false,
        videoUnavailable: false,
        reviewedAt: { gte: from, lte: to },
        marketplaceOriginPost: { isNot: null },
      } as any,
      _sum: { earnings: true },
    });
    const posterPaid = Math.round(((posterAgg?._sum?.earnings ?? 0)) * 100) / 100;
    const marketplaceGmv = Math.round((creatorPaid + platformRevenueMkt + posterPaid) * 100) / 100;

    // ─── Daily series — submissions + revenue ───────────────────
    const subsInRange: any[] = await db.marketplaceSubmission.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
      take: 20000,
    });
    const platformInRange: any[] = await db.marketplacePlatformEarning.findMany({
      where: earningsClipFilter,
      select: {
        amount: true,
        clip: { select: { reviewedAt: true } },
      },
      take: 20000,
    });
    const subBuckets = new Map<string, number>();
    const revBuckets = new Map<string, number>();
    const rangeDays = Math.max(
      1,
      Math.min(120, Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 1),
    );
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(to.getTime() - i * 86_400_000);
      const k = d.toISOString().slice(0, 10);
      subBuckets.set(k, 0);
      revBuckets.set(k, 0);
    }
    for (const s of subsInRange) {
      const k = new Date(s.createdAt).toISOString().slice(0, 10);
      if (subBuckets.has(k)) subBuckets.set(k, (subBuckets.get(k) || 0) + 1);
    }
    for (const p of platformInRange) {
      const dt = (p as any).clip?.reviewedAt;
      if (!dt) continue;
      const k = new Date(dt).toISOString().slice(0, 10);
      if (revBuckets.has(k)) revBuckets.set(k, (revBuckets.get(k) || 0) + (p.amount || 0));
    }
    const dailySubmissions = Array.from(subBuckets.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const dailyRevenue = Array.from(revBuckets.entries())
      .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ─── Top posters ─ poster's 30% from Clip.earnings ──────────
    const posterGroup: any[] = await db.clip.groupBy({
      by: ["userId"],
      where: {
        status: "APPROVED",
        isDeleted: false,
        videoUnavailable: false,
        reviewedAt: { gte: from, lte: to },
        marketplaceOriginPost: { isNot: null },
      } as any,
      _sum: { earnings: true },
      orderBy: { _sum: { earnings: "desc" } },
      take: 10,
    });
    const posterUserIds: string[] = posterGroup.map((g: any) => g.userId);
    const posterUserMap = new Map<string, any>();
    const posterListingCounts = new Map<string, number>();
    if (posterUserIds.length) {
      const [pUsers, pListingCounts]: any[] = await Promise.all([
        db.user.findMany({
          where: { id: { in: posterUserIds } },
          select: {
            id: true, username: true, name: true, image: true,
            // Phase 7a — reuse cached avg rating; never recompute on hot path
            marketplaceAvgAsPoster: true,
          } as any,
        }),
        db.marketplacePosterListing.groupBy({
          by: ["userId"],
          where: { userId: { in: posterUserIds } },
          _count: { _all: true },
        }),
      ]);
      for (const u of pUsers) posterUserMap.set(u.id, u);
      for (const lc of pListingCounts) posterListingCounts.set(lc.userId, lc._count?._all ?? 0);
    }
    const topPosters = posterGroup.map((g: any) => {
      const u = posterUserMap.get(g.userId) || {};
      return {
        userId: g.userId,
        username: u.username || u.name || "unknown",
        image: u.image || null,
        earnings: Math.round((g._sum?.earnings ?? 0) * 100) / 100,
        listingCount: posterListingCounts.get(g.userId) ?? 0,
        ratingAvg: u.marketplaceAvgAsPoster ?? null,
      };
    });

    // ─── Top creators ─ 60% from MarketplaceCreatorEarning ──────
    const creatorGroup: any[] = await db.marketplaceCreatorEarning.groupBy({
      by: ["creatorId"],
      where: earningsClipFilter,
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 10,
    });
    const creatorUserIds: string[] = creatorGroup.map((g: any) => g.creatorId);
    const creatorUserMap = new Map<string, any>();
    const creatorSubCounts = new Map<string, number>();
    if (creatorUserIds.length) {
      const [cUsers, cSubCounts]: any[] = await Promise.all([
        db.user.findMany({
          where: { id: { in: creatorUserIds } },
          select: {
            id: true, username: true, name: true, image: true,
            // Phase 7a — cached avg rating, never recomputed live
            marketplaceAvgAsCreator: true,
          } as any,
        }),
        db.marketplaceSubmission.groupBy({
          by: ["creatorId"],
          where: { creatorId: { in: creatorUserIds }, createdAt: { gte: from, lte: to } },
          _count: { _all: true },
        }),
      ]);
      for (const u of cUsers) creatorUserMap.set(u.id, u);
      for (const c of cSubCounts) creatorSubCounts.set(c.creatorId, c._count?._all ?? 0);
    }
    const topCreators = creatorGroup.map((g: any) => {
      const u = creatorUserMap.get(g.creatorId) || {};
      return {
        userId: g.creatorId,
        username: u.username || u.name || "unknown",
        image: u.image || null,
        earnings: Math.round((g._sum?.amount ?? 0) * 100) / 100,
        submissionsCount: creatorSubCounts.get(g.creatorId) ?? 0,
        ratingAvg: u.marketplaceAvgAsCreator ?? null,
      };
    });

    // ─── Strike tiers (last 30d window) + currently banned ──────
    // Strike "tier" = strikes accumulated by a user within the trailing
    // 30-day window. 3+ is the trigger for a 48h ban (Phase 5).
    const cutoff30d = new Date(Date.now() - 30 * 86_400_000);
    const strikesByUser: any[] = await db.marketplaceStrike.groupBy({
      by: ["userId"],
      where: { createdAt: { gt: cutoff30d } },
      _count: { _all: true },
    });
    let oneStrike = 0;
    let twoStrike = 0;
    let threeOrMore = 0;
    for (const r of strikesByUser) {
      const c = r._count?._all ?? 0;
      if (c === 1) oneStrike++;
      else if (c === 2) twoStrike++;
      else if (c >= 3) threeOrMore++;
    }
    // Currently banned = distinct userIds with at least one strike row whose
    // bannedUntil is still in the future. groupBy avoids loading every row.
    const bannedNow: any[] = await db.marketplaceStrike.groupBy({
      by: ["userId"],
      where: { bannedUntil: { gt: new Date() } },
    });
    const currentlyBanned = bannedNow.length;

    // ─── Recent activity feed (12 high-signal action types) ─────
    const recentRows: any[] = await db.auditLog.findMany({
      where: { action: { in: ACTIVITY_WHITELIST } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        userId: true,
        createdAt: true,
        user: { select: { username: true, name: true } },
      },
    });
    function actionSummary(action: string): string {
      switch (action) {
        case "MARKETPLACE_LISTING_APPROVE": return "Listing approved";
        case "MARKETPLACE_LISTING_REJECT": return "Listing rejected";
        case "MARKETPLACE_SUBMISSION_APPROVE": return "Submission approved";
        case "MARKETPLACE_SUBMISSION_REJECT": return "Submission rejected";
        case "MARKETPLACE_SUBMISSION_POSTED": return "Submission posted";
        case "MARKETPLACE_USER_BANNED": return "User banned (3 strikes)";
        case "MARKETPLACE_USER_BAN_LIFTED": return "Marketplace ban lifted";
        case "MARKETPLACE_STRIKE_ISSUED": return "Strike issued";
        case "MARKETPLACE_RATING_CREATED": return "Rating submitted";
        case "MARKETPLACE_LISTING_DELETE_REQUEST": return "Listing deletion requested";
        case "MARKETPLACE_LISTING_DELETE_REQUEST_CANCEL": return "Deletion request canceled";
        case "MARKETPLACE_LISTING_OVERRIDE": return "Listing overridden by admin";
        default: return action;
      }
    }
    const recentActivity = recentRows.map((r: any) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      userId: r.userId,
      username: r.user?.username || r.user?.name || "system",
      createdAt: r.createdAt,
      summary: actionSummary(r.action),
    }));

    marketplace = {
      range: { from: from.toISOString(), to: to.toISOString() },
      lifetime: {
        activeListings,
        pausedListings,
        pendingApproval,
        deletionRequested,
        bannedListings,
        globalAvgRating,
        globalRatingCount,
      },
      range_metrics: {
        submissionsTotal,
        submissionsByStatus,
        posted: postedRange,
        marketplaceGmv,
        platformRevenue: platformRevenueMkt,
        creatorPaid,
        posterPaid,
        dailySubmissions,
        dailyRevenue,
      },
      topPosters,
      topCreators,
      strikes: { oneStrike, twoStrike, threeOrMore, currentlyBanned },
      recentActivity,
    };
  } catch (err: any) {
    // Phase 8 — single failing sub-query must never 500 the whole route.
    // Log to console (Sentry will pick this up via existing error handler)
    // and let the client render the marketplace section's empty state.
    console.error("[COMMAND-CENTER] marketplace block failed:", err?.message);
  }

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
      totalCampaignValue,
      totalPaidToClippers,
      totalUnspentBudget,
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
    // Phase 8 — marketplace analytics block. Null when computation failed
    // (parent try/catch above). Client renders an empty-state when null.
    marketplace,
  });
}
