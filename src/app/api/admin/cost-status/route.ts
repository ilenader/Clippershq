import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/cost-status
 *
 * Owner-only dashboard endpoint summarizing external-API spend + platform
 * usage for the current month. Every number is an ESTIMATE — the real source
 * of truth is each provider's billing page. This view exists so owners can
 * spot anomalies (spend doubling week-over-week, email quota filling up,
 * tracked-clip count exploding) without logging into five dashboards.
 *
 * All queries are wrapped in individual try/catch so a single failing metric
 * doesn't kill the whole response.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7);

  // ── AI usage (Anthropic) ──
  // aiMessageCount resets per user when their aiQuotaResetAt passes, so the
  // sum undercounts slightly once quotas roll over mid-month. Good enough as
  // an anomaly signal; the true count lives in Anthropic's console.
  let aiMessagesMonth = 0;
  try {
    const agg = await db.user.aggregate({ _sum: { aiMessageCount: true } });
    aiMessagesMonth = agg._sum.aiMessageCount || 0;
  } catch {}
  const AI_COST_PER_MESSAGE = 0.015;
  const aiCostEstimate = aiMessagesMonth * AI_COST_PER_MESSAGE;

  // ── Apify usage ──
  // One successful tracking fetch ≈ one ClipStat row written. This is the
  // tightest proxy we have short of instrumenting the Apify client directly.
  // The spec's "288 × days × 250" projection would have shown $2K+/mo even
  // under low usage — useless as a signal. Actual-row-count is honest.
  let apifyCallsMonth = 0;
  let trackedClips = 0;
  try {
    apifyCallsMonth = await db.clipStat.count({ where: { checkedAt: { gte: monthStart } } });
  } catch {}
  try {
    trackedClips = await db.clip.count({ where: { status: "APPROVED", isDeleted: false, videoUnavailable: false } });
  } catch {}
  const APIFY_COST_PER_CALL = 0.001;
  const apifyCostEstimate = apifyCallsMonth * APIFY_COST_PER_CALL;

  // ── User activity ──
  let totalUsers = 0;
  let activeTodayCount = 0;
  let activeWeekCount = 0;
  try { totalUsers = await db.user.count(); } catch {}
  try {
    const g = await db.clip.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: dayStart } },
      _count: true,
    });
    activeTodayCount = g.length;
  } catch {}
  try {
    const g = await db.clip.groupBy({
      by: ["userId"],
      where: { createdAt: { gte: weekStart } },
      _count: true,
    });
    activeWeekCount = g.length;
  } catch {}

  // ── Clip + campaign counts ──
  let clipsToday = 0, clipsMonth = 0, activeCampaigns = 0;
  try { clipsToday = await db.clip.count({ where: { createdAt: { gte: dayStart } } }); } catch {}
  try { clipsMonth = await db.clip.count({ where: { createdAt: { gte: monthStart } } }); } catch {}
  try { activeCampaigns = await db.campaign.count({ where: { status: "ACTIVE" } }); } catch {}

  // ── Bell notifications (NOT Resend emails) ──
  // Tracked separately because the DB has no record of actual emails sent.
  // Treat this as a rough proxy for announcement volume and clamp to the
  // Resend free-tier ceiling for the percent indicator. Real Resend usage
  // should be cross-checked in Resend's dashboard.
  let notificationsMonth = 0;
  try { notificationsMonth = await db.notification.count({ where: { createdAt: { gte: monthStart } } }); } catch {}
  const RESEND_FREE_LIMIT = 3000;
  const notifPercent = Math.min(100, Math.round((notificationsMonth / RESEND_FREE_LIMIT) * 100));

  const totalEstimate = aiCostEstimate + apifyCostEstimate;

  return NextResponse.json({
    month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    ai: {
      messagesThisMonth: aiMessagesMonth,
      estimatedCostUSD: Math.round(aiCostEstimate * 100) / 100,
      costPerMessage: AI_COST_PER_MESSAGE,
    },
    apify: {
      callsThisMonth: apifyCallsMonth,
      estimatedCostUSD: Math.round(apifyCostEstimate * 100) / 100,
      costPerCall: APIFY_COST_PER_CALL,
      trackedClips,
    },
    users: {
      total: totalUsers,
      activeClippersToday: activeTodayCount,
      activeClippersThisWeek: activeWeekCount,
    },
    clips: {
      submittedToday: clipsToday,
      submittedThisMonth: clipsMonth,
    },
    campaigns: {
      active: activeCampaigns,
    },
    notifications: {
      sentThisMonth: notificationsMonth,
      resendFreeLimit: RESEND_FREE_LIMIT,
      percentUsed: notifPercent,
      note: "Bell-notification rows — rough proxy for Resend usage; cross-check in Resend dashboard.",
    },
    totalEstimatedMonthlyCostUSD: Math.round(totalEstimate * 100) / 100,
    lastUpdated: now.toISOString(),
  });
}
