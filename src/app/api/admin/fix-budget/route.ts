import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getCampaignBudgetStatus } from "@/lib/balance";
import { calculateOwnerEarnings } from "@/lib/earnings-calc";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/fix-budget
 * One-time cleanup: fixes all campaigns where total clip earnings exceed the budget.
 * Walks clips in createdAt ASC order, caps at budget, zeros out subsequent clips.
 * OWNER only.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  console.log("[FIX-BUDGET] Starting budget cleanup...");

  // Get all campaigns with a budget set
  const campaigns = await db.campaign.findMany({
    where: { budget: { not: null, gt: 0 } },
    select: { id: true, name: true, budget: true, pricingModel: true, clipperCpm: true, cpmRate: true, ownerCpm: true },
  });

  const report: {
    campaignId: string;
    campaignName: string;
    budget: number;
    spentBefore: number;
    spentAfter: number;
    clipsZeroed: number;
    clipsCapped: number;
    usersUpdated: string[];
  }[] = [];

  for (const campaign of campaigns) {
    const budgetStatus = await getCampaignBudgetStatus(campaign.id);
    if (!budgetStatus || budgetStatus.spent <= budgetStatus.budget) continue;

    console.log(`[FIX-BUDGET] Campaign ${campaign.name} (${campaign.id}): spent $${budgetStatus.spent.toFixed(2)} > budget $${budgetStatus.budget}`);

    // Get all APPROVED clips ordered by creation date (earliest first get priority)
    const clips = await db.clip.findMany({
      where: { campaignId: campaign.id, status: "APPROVED", isDeleted: false, videoUnavailable: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, earnings: true, baseEarnings: true, bonusAmount: true, userId: true },
    });

    const isCpmSplit = campaign.pricingModel === "CPM_SPLIT" && campaign.ownerCpm;

    // Get all agency earnings for this campaign
    let ownerEarningsMap: Record<string, number> = {};
    if (isCpmSplit) {
      const aeRecords = await db.agencyEarning.findMany({
        where: { campaignId: campaign.id },
        select: { clipId: true, amount: true },
      });
      for (const ae of aeRecords) {
        ownerEarningsMap[ae.clipId] = ae.amount || 0;
      }
    }

    let runningTotal = 0;
    let clipsZeroed = 0;
    let clipsCapped = 0;
    const affectedUsers = new Set<string>();

    for (const clip of clips) {
      const clipperEarnings = clip.earnings || 0;
      const ownerEarnings = ownerEarningsMap[clip.id] || 0;
      const totalForClip = clipperEarnings + ownerEarnings;
      const remaining = Math.max(campaign.budget! - runningTotal, 0);

      if (remaining <= 0) {
        // Budget fully used — zero this clip
        if (clipperEarnings > 0) {
          await db.clip.update({ where: { id: clip.id }, data: { earnings: 0, baseEarnings: 0, bonusAmount: 0 } });
          affectedUsers.add(clip.userId);
          clipsZeroed++;
        }
        if (isCpmSplit && ownerEarnings > 0) {
          await db.agencyEarning.update({ where: { clipId: clip.id }, data: { amount: 0 } }).catch(() => {});
        }
      } else if (totalForClip > remaining) {
        // This clip crosses the budget line — ratio-based cap
        const clipperCpmVal = campaign.clipperCpm || campaign.cpmRate || 1;
        const ownerCpmVal = campaign.ownerCpm || 0;
        const totalCpm = clipperCpmVal + ownerCpmVal;
        const clipperRatio = clipperCpmVal / totalCpm;
        const ownerRatio = ownerCpmVal / totalCpm;

        let newClipper = Math.round(remaining * clipperRatio * 100) / 100;
        let newOwner = Math.round(remaining * ownerRatio * 100) / 100;
        if (newClipper + newOwner > remaining) {
          newClipper = Math.round((remaining - newOwner) * 100) / 100;
        }
        newClipper = Math.max(newClipper, 0);
        newOwner = Math.max(newOwner, 0);

        if (newClipper !== clipperEarnings) {
          const ratio = clipperEarnings > 0 ? newClipper / clipperEarnings : 0;
          const newBase = Math.round((clip.baseEarnings || 0) * ratio * 100) / 100;
          const newBonus = Math.round((clip.bonusAmount || 0) * ratio * 100) / 100;
          await db.clip.update({
            where: { id: clip.id },
            data: {
              earnings: newClipper,
              baseEarnings: newBase,
              bonusAmount: newBonus,
            },
          });
          affectedUsers.add(clip.userId);
          clipsCapped++;
        }
        if (isCpmSplit && newOwner !== ownerEarnings) {
          await db.agencyEarning.update({ where: { clipId: clip.id }, data: { amount: newOwner } }).catch(() => {});
        }

        runningTotal += newClipper + newOwner;
      } else {
        // Fits within budget — no change
        runningTotal += totalForClip;
      }
    }

    // Update totalEarnings for all affected users
    const usersUpdated: string[] = [];
    for (const userId of affectedUsers) {
      const earningsAgg = await db.clip.aggregate({
        where: { userId, status: "APPROVED", isDeleted: false, videoUnavailable: false },
        _sum: { earnings: true },
      });
      const newTotal = Math.round((earningsAgg._sum.earnings ?? 0) * 100) / 100;
      await db.user.update({ where: { id: userId }, data: { totalEarnings: newTotal } });
      usersUpdated.push(userId);
    }

    report.push({
      campaignId: campaign.id,
      campaignName: campaign.name,
      budget: campaign.budget!,
      spentBefore: budgetStatus.spent,
      spentAfter: runningTotal,
      clipsZeroed,
      clipsCapped,
      usersUpdated,
    });

    console.log(`[FIX-BUDGET] Fixed ${campaign.name}: $${budgetStatus.spent.toFixed(2)} → $${runningTotal.toFixed(2)}, ${clipsZeroed} zeroed, ${clipsCapped} capped`);
  }

  // Second pass: unpause campaigns where cleanup freed budget
  let campaignsResumed = 0;
  for (const entry of report) {
    if (entry.spentAfter < entry.budget) {
      try {
        const cam = await db.campaign.findUnique({
          where: { id: entry.campaignId },
          select: { status: true, lastBudgetPauseAt: true },
        });
        if (cam?.status === "PAUSED" && cam.lastBudgetPauseAt) {
          await db.campaign.update({
            where: { id: entry.campaignId },
            data: { status: "ACTIVE", lastBudgetPauseAt: null },
          });
          await db.trackingJob.updateMany({
            where: { campaignId: entry.campaignId, isActive: false },
            data: { isActive: true },
          });
          campaignsResumed++;
          console.log(`[FIX-BUDGET] Campaign ${entry.campaignName} auto-resumed — $${(entry.budget - entry.spentAfter).toFixed(2)} of $${entry.budget} budget available`);
        }
      } catch {}
    }
  }

  // Third pass: check ALL paused campaigns with budget (not just over-budget ones)
  try {
    const pausedCampaigns = await db.campaign.findMany({
      where: { status: "PAUSED", lastBudgetPauseAt: { not: null }, budget: { gt: 0 } },
      select: { id: true, name: true, budget: true, pricingModel: true },
    });
    for (const pc of pausedCampaigns) {
      // Skip if already resumed in the second pass
      if (report.some((r: any) => r.campaignId === pc.id)) continue;
      const eAgg = await db.clip.aggregate({
        where: { campaignId: pc.id, isDeleted: false, status: "APPROVED", videoUnavailable: false },
        _sum: { earnings: true },
      });
      let spent = Math.round((eAgg._sum.earnings ?? 0) * 100) / 100;
      if (pc.pricingModel === "CPM_SPLIT") {
        const oAgg = await db.agencyEarning.aggregate({ where: { campaignId: pc.id }, _sum: { amount: true } });
        spent = Math.round((spent + (oAgg._sum.amount ?? 0)) * 100) / 100;
      }
      if (spent < pc.budget!) {
        await db.campaign.update({ where: { id: pc.id }, data: { status: "ACTIVE", lastBudgetPauseAt: null } });
        await db.trackingJob.updateMany({ where: { campaignId: pc.id, isActive: false }, data: { isActive: true } });
        campaignsResumed++;
        console.log(`[FIX-BUDGET] Campaign ${pc.name} resumed — $${(pc.budget! - spent).toFixed(2)} available of $${pc.budget} budget`);
      }
    }
  } catch (err: any) {
    console.error("[FIX-BUDGET] Third pass error:", err?.message);
  }

  return NextResponse.json({
    success: true,
    campaignsChecked: campaigns.length,
    campaignsFixed: report.length,
    campaignsResumed,
    report,
  });
}
