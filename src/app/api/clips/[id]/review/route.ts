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

    // Update clip status
    await db.clip.update({
      where: { id },
      data: {
        status: action,
        rejectionReason: action === "REJECTED" ? rejectionReason : null,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
    });

    // ── Calculate and update earnings based on new status ──
    if (action === "APPROVED") {
      // Fetch clip stats + campaign data to calculate earnings (dual monetization aware)
      const clipWithData = await db.clip.findUnique({
        where: { id },
        include: {
          stats: { orderBy: { checkedAt: "desc" }, take: 1 },
          campaign: { select: { minViews: true, cpmRate: true, maxPayoutPerClip: true, clipperCpm: true, pricingModel: true, ownerCpm: true } },
          user: { select: { level: true, currentStreak: true, referredById: true, isPWAUser: true } },
        },
      });
      if (clipWithData?.campaign && clipWithData.stats.length > 0) {
        const breakdown = recalculateClipEarningsBreakdown({
          stats: clipWithData.stats,
          campaign: clipWithData.campaign,
          user: clipWithData.user || undefined,
        });

        let finalClipperEarnings = breakdown.clipperEarnings;
        let finalOwnerAmt = 0;

        const pm = (clipWithData.campaign as any).pricingModel;
        const oCpm = (clipWithData.campaign as any).ownerCpm;
        const isCpmSplit = pm === "CPM_SPLIT" && oCpm;

        if (isCpmSplit) {
          const views = clipWithData.stats[0].views;
          const cCpm = (clipWithData.campaign as any).clipperCpm ?? (clipWithData.campaign as any).cpmRate;
          finalOwnerAmt = calculateOwnerEarnings(views, oCpm, breakdown.grossClipperEarnings, cCpm);
        }

        // ── Budget cap: check remaining budget BEFORE saving earnings ──
        try {
          const budgetStatus = await getCampaignBudgetStatus(clip.campaignId);
          if (budgetStatus && budgetStatus.budget > 0) {
            // Remaining budget excluding THIS clip's current contribution (it's being recalculated)
            const thisClipCurrentSpend = (clipWithData.earnings || 0);
            // getCampaignBudgetStatus.spent already includes this clip's existing earnings + any existing agency earning
            let thisClipCurrentOwner = 0;
            if (isCpmSplit) {
              try {
                const existingAe = await db.agencyEarning.findUnique({ where: { clipId: id } });
                thisClipCurrentOwner = existingAe?.amount || 0;
              } catch {}
            }
            const otherSpent = budgetStatus.spent - thisClipCurrentSpend - thisClipCurrentOwner;
            const remaining = Math.max(budgetStatus.budget - otherSpent, 0);

            const totalForThisClip = finalClipperEarnings + finalOwnerAmt;

            if (remaining <= 0) {
              // No budget left — zero out earnings and pause
              finalClipperEarnings = 0;
              finalOwnerAmt = 0;
              console.log(`[BUDGET] Clip ${id}: no budget remaining ($${budgetStatus.budget} fully spent), earnings set to $0`);
            } else if (totalForThisClip > remaining) {
              // Scale both down proportionally to fit within remaining budget
              const scaleFactor = remaining / totalForThisClip;
              finalClipperEarnings = Math.round(finalClipperEarnings * scaleFactor * 100) / 100;
              finalOwnerAmt = Math.round(finalOwnerAmt * scaleFactor * 100) / 100;
              // Ensure we don't exceed remaining due to rounding
              if (finalClipperEarnings + finalOwnerAmt > remaining) {
                finalClipperEarnings = Math.round((remaining - finalOwnerAmt) * 100) / 100;
              }
              console.log(`[BUDGET] Clip ${id}: capped to fit budget. remaining=$${remaining}, clipper=$${finalClipperEarnings}, owner=$${finalOwnerAmt}`);
            }

            // Auto-pause if budget is now fully spent
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

        // Save clipper earnings
        await db.clip.update({
          where: { id },
          data: {
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
            // Zero owner earnings — delete any existing record
            try { await db.agencyEarning.delete({ where: { clipId: id } }); } catch {}
          }
        }
      }
      // Notify clipper (in-app + email)
      createNotification(clip.userId, "CLIP_APPROVED", "Clip approved!", "Your clip has been approved and earnings have been calculated.").catch(() => {});
      if (clip.user?.email) {
        const earnAmt = clipWithData?.stats?.[0]?.views ? recalculateClipEarnings({ stats: clipWithData.stats, campaign: clipWithData.campaign, user: clipWithData.user || undefined }) : 0;
        const campName = clipWithData?.campaign ? (await db.campaign.findUnique({ where: { id: clip.campaignId }, select: { name: true } }))?.name || "your campaign" : "your campaign";
        await sendClipApproved(clip.user.email, campName, earnAmt);
      } else {
        console.log(`[EMAIL] No email for user ${clip.userId} — skipping clip approved email`);
      }
    } else if (action === "REJECTED" || action === "PENDING") {
      // REJECTED / PENDING → earnings = 0
      await db.clip.update({ where: { id }, data: { earnings: 0 } });
      // Deactivate tracking for rejected clips
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
    }
    // FLAGGED → keep existing earnings, just change status for manual review
    // (earnings are NOT zeroed, trust score is NOT decreased for FLAGGED)

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
