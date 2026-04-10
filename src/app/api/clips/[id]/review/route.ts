import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getUserCampaignIds } from "@/lib/campaign-access";
import { logAudit } from "@/lib/audit";
import { recalculateClipEarnings, recalculateClipEarningsBreakdown, calculateOwnerEarnings } from "@/lib/earnings-calc";
import { getCampaignBudgetStatus } from "@/lib/balance";
import { createNotification } from "@/lib/notifications";
import { sendClipApproved, sendClipRejected } from "@/lib/email";
import { updateUserLevel } from "@/lib/gamification";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { broadcastToUser } from "@/lib/sse-broadcast";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: 60 reviews per minute per user
  const rl = checkRateLimit(`clip-review:${session.user.id}`, 60, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id } = await params;
  const { action, rejectionReason } = body;

  if (!["APPROVED", "REJECTED", "FLAGGED", "PENDING"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    // Fetch clip with campaign info for access check
    const clip = await db.clip.findUnique({
      where: { id },
      select: { id: true, campaignId: true, status: true, userId: true, isOwnerOverride: true, user: { select: { email: true, role: true } } },
    });

    if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

    // ADMIN: verify they have access to this clip's campaign
    if (role === "ADMIN") {
      const allowedIds = await getUserCampaignIds(session.user.id, role);
      if (Array.isArray(allowedIds) && !allowedIds.includes(clip.campaignId)) {
        return NextResponse.json({ error: "You don't have access to this campaign" }, { status: 403 });
      }
    }

    // ── Calculate and update earnings based on new status ──
    if (action === "APPROVED") {
      // Fetch clip stats + campaign data BEFORE changing status
      // This ensures the budget check sees accurate "spent" (this clip is still PENDING/etc)
      const clipWithData = await db.clip.findUnique({
        where: { id },
        include: {
          stats: { orderBy: { checkedAt: "desc" }, take: 1 },
          campaign: { select: { minViews: true, cpmRate: true, maxPayoutPerClip: true, clipperCpm: true, pricingModel: true, ownerCpm: true, budget: true } },
          user: { select: { level: true, currentStreak: true, referredById: true, isPWAUser: true } },
        },
      });

      let finalClipperEarnings = 0;
      let finalOwnerAmt = 0;

      if (clipWithData?.campaign && clipWithData.stats.length > 0) {
        const breakdown = recalculateClipEarningsBreakdown({
          stats: clipWithData.stats,
          campaign: clipWithData.campaign,
          user: clipWithData.user || undefined,
        });

        finalClipperEarnings = breakdown.clipperEarnings;

        const pm = (clipWithData.campaign as any).pricingModel;
        const oCpm = (clipWithData.campaign as any).ownerCpm;
        const isCpmSplit = pm === "CPM_SPLIT" && oCpm;

        if (isCpmSplit) {
          const views = clipWithData.stats[0].views;
          const cCpm = (clipWithData.campaign as any).clipperCpm ?? (clipWithData.campaign as any).cpmRate;
          finalOwnerAmt = calculateOwnerEarnings(views, oCpm, breakdown.baseEarnings, cCpm);
        }

        // ── Budget cap: check BEFORE saving status or earnings ──
        // Since clip is still in old status (PENDING/FLAGGED), getCampaignBudgetStatus
        // only counts OTHER approved clips. No need to subtract this clip's contribution.
        const campaignBudget = (clipWithData.campaign as any).budget;
        if (campaignBudget && campaignBudget > 0) {
          try {
            const budgetStatus = await getCampaignBudgetStatus(clip.campaignId);
            if (budgetStatus) {
              // If clip was previously APPROVED (e.g. re-approval), subtract its current contribution
              let thisClipInSpent = 0;
              if (clip.status === "APPROVED") {
                thisClipInSpent = clipWithData.earnings || 0;
                if (isCpmSplit) {
                  try {
                    const existingAe = await db.agencyEarning.findUnique({ where: { clipId: id } });
                    thisClipInSpent += existingAe?.amount || 0;
                  } catch {}
                }
              }
              const otherSpent = budgetStatus.spent - thisClipInSpent;
              const remaining = Math.max(budgetStatus.budget - otherSpent, 0);
              const totalForThisClip = finalClipperEarnings + finalOwnerAmt;

              console.log(`[BUDGET] Clip ${id}: budget=$${budgetStatus.budget}, otherSpent=$${otherSpent.toFixed(2)}, remaining=$${remaining.toFixed(2)}, thisClip=$${totalForThisClip.toFixed(2)}`);

              if (remaining <= 0) {
                finalClipperEarnings = 0;
                finalOwnerAmt = 0;
                console.log(`[BUDGET] Clip ${id}: no budget remaining, earnings set to $0`);
              } else if (totalForThisClip > remaining) {
                const scaleFactor = remaining / totalForThisClip;
                finalClipperEarnings = Math.floor(finalClipperEarnings * scaleFactor * 100) / 100;
                finalOwnerAmt = Math.floor(finalOwnerAmt * scaleFactor * 100) / 100;
                // Ensure combined doesn't exceed remaining after rounding
                if (finalClipperEarnings + finalOwnerAmt > remaining) {
                  finalClipperEarnings = Math.floor((remaining - finalOwnerAmt) * 100) / 100;
                }
                console.log(`[BUDGET] Clip ${id}: capped. clipper=$${finalClipperEarnings}, owner=$${finalOwnerAmt}`);
              }

              // Auto-pause if budget fully spent after this clip
              const newTotalSpent = otherSpent + finalClipperEarnings + finalOwnerAmt;
              if (newTotalSpent >= budgetStatus.budget) {
                await db.campaign.update({
                  where: { id: clip.campaignId },
                  data: { status: "PAUSED" },
                });
                console.log(`[BUDGET] Campaign ${clip.campaignId} auto-paused — budget $${budgetStatus.budget} fully spent`);
              }
            }
          } catch (budgetErr: any) {
            console.error(`[BUDGET] Budget check failed for clip ${id}:`, budgetErr?.message);
          }
        }

        // NOW save status + earnings in one update (atomic — prevents race where status
        // is APPROVED but earnings haven't been written yet)
        await db.clip.update({
          where: { id },
          data: {
            status: action,
            rejectionReason: null,
            reviewedById: session.user.id,
            reviewedAt: new Date(),
            earnings: finalClipperEarnings,
            baseEarnings: breakdown.baseEarnings,
            bonusPercent: breakdown.bonusPercent,
            bonusAmount: breakdown.bonusAmount,
          },
        });

        // Save agency earnings for CPM_SPLIT campaigns
        if (isCpmSplit) {
          console.log(`[AGENCY] Clip ${id}: clipper=$${finalClipperEarnings}, owner=$${finalOwnerAmt}`);
          if (finalOwnerAmt > 0) {
            try {
              await db.agencyEarning.upsert({
                where: { clipId: id },
                create: { campaignId: clip.campaignId, clipId: id, amount: finalOwnerAmt, views: clipWithData.stats[0].views },
                update: { amount: finalOwnerAmt, views: clipWithData.stats[0].views },
              });
            } catch (aeErr: any) {
              console.error(`[AGENCY] Failed to save AgencyEarning for clip ${id}:`, aeErr?.message);
            }
          } else {
            try { await db.agencyEarning.delete({ where: { clipId: id } }); } catch {}
          }
        }
      } else {
        // No stats — just set status
        await db.clip.update({
          where: { id },
          data: {
            status: action,
            rejectionReason: null,
            reviewedById: session.user.id,
            reviewedAt: new Date(),
          },
        });
      }

      // Broadcast IMMEDIATELY after save — before slow operations (email, stats sync)
      try {
        broadcastToUser(clip.userId, "clip_updated", { clipId: id, status: action, earnings: finalClipperEarnings });
        broadcastToUser(clip.userId, "earnings_updated", { reason: action.toLowerCase() });
      } catch {}

      // Notify clipper (in-app + email)
      createNotification(clip.userId, "CLIP_APPROVED", "Clip approved!", "Your clip has been approved and earnings have been calculated.").catch(() => {});
      if (clip.user?.email) {
        const campName = clipWithData?.campaign ? (await db.campaign.findUnique({ where: { id: clip.campaignId }, select: { name: true } }))?.name || "your campaign" : "your campaign";
        await sendClipApproved(clip.user.email, campName, finalClipperEarnings);
      } else {
        console.log(`[EMAIL] No email for user ${clip.userId} — skipping clip approved email`);
      }
    } else if (action === "REJECTED" || action === "PENDING") {
      // REJECTED / PENDING → status + earnings = 0 in one update
      await db.clip.update({
        where: { id },
        data: {
          status: action,
          rejectionReason: action === "REJECTED" ? rejectionReason : null,
          reviewedById: session.user.id,
          reviewedAt: new Date(),
          earnings: 0,
        },
      });
      // Broadcast immediately
      try {
        broadcastToUser(clip.userId, "clip_updated", { clipId: id, status: action, earnings: 0 });
        broadcastToUser(clip.userId, "earnings_updated", { reason: action.toLowerCase() });
      } catch {}
      if (action === "REJECTED") {
        try {
          await db.trackingJob.updateMany({
            where: { clipId: id },
            data: { isActive: false },
          });
        } catch {}
        createNotification(clip.userId, "CLIP_REJECTED", "Clip rejected", body.rejectionReason ? `Reason: ${body.rejectionReason}` : "Your clip was rejected. Check the reason and try again.").catch(() => {});
        if (clip.user?.email) {
          const rejCampName = (await db.campaign.findUnique({ where: { id: clip.campaignId }, select: { name: true } }))?.name || "your campaign";
          await sendClipRejected(clip.user.email, rejCampName, body.rejectionReason);
        } else {
          console.log(`[EMAIL] No email for user ${clip.userId} — skipping clip rejected email`);
        }
      }
    } else if (action === "FLAGGED") {
      // FLAGGED → keep existing earnings, just change status for manual review
      await db.clip.update({
        where: { id },
        data: {
          status: action,
          rejectionReason: null,
          reviewedById: session.user.id,
          reviewedAt: new Date(),
        },
      });
      try { broadcastToUser(clip.userId, "clip_updated", { clipId: id, status: action }); } catch {}
    }

    // ── Sync user totalEarnings, totalViews, and level ──
    // Skip entirely for OWNER/ADMIN users and owner override clips
    const userRole_ = (clip.user as any)?.role;
    if (userRole_ !== "OWNER" && userRole_ !== "ADMIN" && !clip.isOwnerOverride) {
      try {
        const earningsAgg = await db.clip.aggregate({
          where: { userId: clip.userId, status: "APPROVED", isOwnerOverride: false },
          _sum: { earnings: true },
        });
        const newTotalEarnings = earningsAgg._sum.earnings ?? 0;

        const userClipsWithStats = await db.clip.findMany({
          where: { userId: clip.userId, isOwnerOverride: false, stats: { some: {} } },
          select: {
            stats: { orderBy: { checkedAt: "desc" }, take: 1, select: { views: true } },
          },
        });
        const newTotalViews = userClipsWithStats.reduce(
          (sum: number, c: any) => sum + (c.stats[0]?.views ?? 0),
          0
        );

        await db.user.update({
          where: { id: clip.userId },
          data: { totalEarnings: newTotalEarnings, totalViews: newTotalViews },
        });

        await updateUserLevel(clip.userId);
      } catch (syncErr: any) {
        console.error("User sync after clip review failed:", syncErr?.message);
      }
    }

    // Update user trust score based on action (clamped to 0-100)
    // Skip for OWNER/ADMIN users
    if (userRole_ !== "OWNER" && userRole_ !== "ADMIN") {
      try {
        const user = await db.user.findUnique({ where: { id: clip.userId }, select: { trustScore: true } });
        if (user) {
          let delta = 0;
          if (action === "APPROVED") delta = 5;
          else if (action === "REJECTED") delta = -10;
          if (delta !== 0) {
            const newScore = Math.max(0, Math.min(100, user.trustScore + delta));
            await db.user.update({ where: { id: clip.userId }, data: { trustScore: newScore } });
          }
        }
      } catch {}
    }

    // Re-evaluate streak on approval/rejection (48h grace system)
    // Skip for OWNER users and owner override clips
    if ((action === "APPROVED" || action === "REJECTED") && userRole_ !== "OWNER" && userRole_ !== "ADMIN" && !clip.isOwnerOverride) {
      try {
        const { updateStreak } = await import("@/lib/gamification");
        await updateStreak(clip.userId);
      } catch {}
    }

    // Audit log
    await logAudit({
      userId: session.user.id,
      action: `${action}_CLIP`,
      targetType: "clip",
      targetId: id,
      details: { previousStatus: clip.status, newStatus: action, rejectionReason },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Clip review failed:", e?.message);
    return NextResponse.json({ error: "Failed to update clip" }, { status: 500 });
  }
}
