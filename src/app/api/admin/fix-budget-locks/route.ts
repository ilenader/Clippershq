import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getCampaignBudgetStatus } from "@/lib/balance";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/fix-budget-locks
 * One-time backfill: sets lastBudgetPauseAt on campaigns that have spend but no lock timestamp.
 * This ensures old clips don't eat new budget on campaigns that were paused before the feature deployed.
 * OWNER only.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const rl = checkRoleAwareRateLimit(`fix-budget-locks:${session.user.id}`, 10, 60 * 60_000, role, 3);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  console.log("[FIX-BUDGET-LOCKS] Starting backfill...");

  // Find all campaigns with a budget set and no lastBudgetPauseAt
  const campaigns = await db.campaign.findMany({
    where: {
      budget: { not: null, gt: 0 },
      lastBudgetPauseAt: null,
    },
    select: { id: true, name: true, budget: true, status: true, updatedAt: true },
  });

  const report: { id: string; name: string; status: string; budget: number; spent: number; lockSetTo: string }[] = [];

  for (const campaign of campaigns) {
    const budgetStatus = await getCampaignBudgetStatus(campaign.id);
    if (!budgetStatus || budgetStatus.spent <= 0) continue;

    // Set lastBudgetPauseAt to updatedAt (best approximation of when budget was last changed)
    const lockTimestamp = campaign.updatedAt || new Date();

    await db.campaign.update({
      where: { id: campaign.id },
      data: { lastBudgetPauseAt: lockTimestamp },
    });

    report.push({
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      budget: campaign.budget!,
      spent: budgetStatus.spent,
      lockSetTo: lockTimestamp.toISOString(),
    });

    console.log(`[FIX-BUDGET-LOCKS] ${campaign.name}: set lastBudgetPauseAt to ${lockTimestamp.toISOString()} (spent: $${budgetStatus.spent.toFixed(2)} of $${campaign.budget})`);
  }

  console.log(`[FIX-BUDGET-LOCKS] Done. Updated ${report.length} of ${campaigns.length} campaigns.`);

  return NextResponse.json({
    success: true,
    campaignsChecked: campaigns.length,
    campaignsUpdated: report.length,
    report,
  });
}
