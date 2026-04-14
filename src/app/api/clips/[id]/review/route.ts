import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getUserCampaignIds } from "@/lib/campaign-access";
import { logAudit } from "@/lib/audit";
import { recalculateClipEarnings, recalculateClipEarningsBreakdown, calculateOwnerEarnings } from "@/lib/earnings-calc";
import { getCampaignBudgetStatus } from "@/lib/balance";
import { createNotification } from "@/lib/notifications";
import { sendClipApproved, sendClipRejected, sendStreakRejectionWarning, sendConsecutiveRejectionWarning } from "@/lib/email";
import { updateUserLevel } from "@/lib/gamification";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { broadcastToUser } from "@/lib/sse-broadcast";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

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

        // Budget cap + approval save — serializable transaction to prevent race conditions
        try {
          await db.$transaction(async (tx: any) => {
            const campaignBudget = (clipWithData.campaign as any).budget;
            if (campaignBudget && campaignBudget > 0) {
              // Inline budget status using tx
              const earningsAgg = await tx.clip.aggregate({
                where: { campaignId: clip.campaignId, isDeleted: false, status: "APPROVED" },
                _sum: { earnings: true },
              });
              let spent = Math.round((earningsAgg._sum.earnings ?? 0) * 100) / 100;
              if (isCpmSplit) {
                const ownerAgg = await tx.agencyEarning.aggregate({
                  where: { campaignId: clip.campaignId },
                  _sum: { amount: true },
                });
                spent = Math.round((spent + (ownerAgg._sum.amount ?? 0)) * 100) / 100;
              }

              // If re-approval, subtract this clip's current contribution from spent
              let thisClipInSpent = 0;
              if (clip.status === "APPROVED") {
                thisClipInSpent = clipWithData.earnings || 0;
                if (isCpmSplit) {
                  const existingAe = await tx.agencyEarning.findUnique({ where: { clipId: id } });
                  thisClipInSpent += existingAe?.amount || 0;
                }
              }

              const otherSpent = spent - thisClipInSpent;
              const remaining = Math.max(campaignBudget - otherSpent, 0);
              const totalForThisClip = finalClipperEarnings + finalOwnerAmt;

              console.log(`[BUDGET] Clip ${id}: budget=$${campaignBudget}, otherSpent=$${otherSpent.toFixed(2)}, remaining=$${remaining.toFixed(2)}, thisClip=$${totalForThisClip.toFixed(2)}`);

              if (remaining <= 0) {
                finalClipperEarnings = 0;
                finalOwnerAmt = 0;
              } else if (totalForThisClip > remaining) {
                const scaleFactor = remaining / totalForThisClip;
                finalClipperEarnings = Math.floor(finalClipperEarnings * scaleFactor * 100) / 100;
                finalOwnerAmt = Math.floor(finalOwnerAmt * scaleFactor * 100) / 100;
                if (finalClipperEarnings + finalOwnerAmt > remaining) {
                  finalClipperEarnings = Math.floor((remaining - finalOwnerAmt) * 100) / 100;
                }
              }

              // Auto-pause
              const newTotalSpent = otherSpent + finalClipperEarnings + finalOwnerAmt;
              if (newTotalSpent >= campaignBudget - 0.01) {
                await tx.campaign.update({
                  where: { id: clip.campaignId },
                  data: { status: "PAUSED", lastBudgetPauseAt: new Date() },
                });
                console.log(`[BUDGET] Campaign ${clip.campaignId} auto-paused — budget $${campaignBudget} reached`);
              }
            }

            // Save status + earnings atomically
            const isReferred = !!clipWithData.user?.referredById;
            await tx.clip.update({
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
                feePercentAtApproval: isReferred ? 4 : 9,
                streakDayLocked: true,
                streakDayLockedAt: new Date(),
              },
            });

            // Save agency earnings
            if (isCpmSplit) {
              if (finalOwnerAmt > 0) {
                await tx.agencyEarning.upsert({
                  where: { clipId: id },
                  create: { campaignId: clip.campaignId, clipId: id, amount: finalOwnerAmt, views: clipWithData.stats[0].views },
                  update: { amount: finalOwnerAmt, views: clipWithData.stats[0].views },
                });
              } else {
                try { await tx.agencyEarning.delete({ where: { clipId: id } }); } catch {}
              }
            }
          }, { isolationLevel: "Serializable" as any });
        } catch (txErr: any) {
          if (txErr?.code === "P2034") {
            console.log(`[BUDGET] Transaction conflict for clip ${id}, please retry`);
            return NextResponse.json({ error: "Concurrent approval conflict, please retry" }, { status: 409 });
          }
          console.error(`[BUDGET] Transaction error for clip ${id}:`, txErr?.message);
          return NextResponse.json({ error: "Failed to save approval" }, { status: 500 });
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
            ...(action === "APPROVED" ? { streakDayLocked: true, streakDayLockedAt: new Date() } : {}),
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
        const rejCampName = (await db.campaign.findUnique({ where: { id: clip.campaignId }, select: { name: true } }))?.name || "your campaign";
        if (clip.user?.email) {
          await sendClipRejected(clip.user.email, rejCampName, body.rejectionReason);
        }

        // Streak warning: check if this rejection leaves the day with no safe clips
        try {
          const clipUser = await db.user.findUnique({
            where: { id: clip.userId },
            select: { timezone: true, currentStreak: true },
          });
          if (clipUser && clipUser.currentStreak > 0) {
            const tz = clipUser.timezone || "UTC";
            const clipDate = new Date(clip.createdAt);
            const dateStr = clipDate.toLocaleDateString("en-CA", { timeZone: tz });
            const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
            const isToday = dateStr === todayStr;

            if (isToday) {
              // Check other clips for today in user's timezone
              const { dayBoundsForTz } = await import("@/lib/gamification");
              const bounds = dayBoundsForTz(new Date(), tz);
              const otherClips = await db.clip.findMany({
                where: {
                  userId: clip.userId,
                  id: { not: id },
                  createdAt: { gte: bounds.start, lte: bounds.end },
                  isDeleted: false,
                },
                select: { status: true, streakDayLocked: true },
              });
              const hasSafeClip = otherClips.some((c: any) => c.streakDayLocked || c.status === "APPROVED" || c.status === "PENDING");
              if (!hasSafeClip) {
                // Calculate hours left until midnight in user's timezone
                const nowParts = new Intl.DateTimeFormat("en-US", {
                  timeZone: tz, hour: "numeric", minute: "numeric", hour12: false,
                }).formatToParts(new Date());
                const h = parseInt(nowParts.find((p) => p.type === "hour")?.value || "0");
                const m = parseInt(nowParts.find((p) => p.type === "minute")?.value || "0");
                const hoursLeft = (23 - h) + (59 - m) / 60;

                const msg = `Your clip for ${rejCampName} was rejected. You have ${Math.floor(hoursLeft)}h ${Math.round((hoursLeft % 1) * 60)}m left to post today to keep your streak!`;
                createNotification(clip.userId, "STREAK_WARNING", "Post now to save your streak!", msg).catch(() => {});
                if (clip.user?.email) {
                  sendStreakRejectionWarning(clip.user.email, rejCampName, hoursLeft).catch(() => {});
                }
                console.log(`[STREAK] Warning sent to user ${clip.userId}: ${Math.floor(hoursLeft)}h left`);
              }
            }
          }
        } catch (streakErr: any) {
          console.error(`[STREAK] Warning check failed:`, streakErr?.message);
        }

        // Consecutive rejection check: 3+ rejections in a row
        try {
          const recentClips = await db.clip.findMany({
            where: { userId: clip.userId, isDeleted: false },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { status: true },
          });
          let consecutiveRejections = 0;
          for (const c of recentClips) {
            if (c.status === "REJECTED") consecutiveRejections++;
            else break;
          }
          if (consecutiveRejections >= 3) {
            const msg = `${consecutiveRejections} clips in a row have been rejected. Please review campaign requirements before submitting more clips.`;
            createNotification(clip.userId, "CLIP_REJECTED", "Multiple clips rejected", msg).catch(() => {});
            if (clip.user?.email) {
              sendConsecutiveRejectionWarning(clip.user.email, consecutiveRejections).catch(() => {});
            }
            console.log(`[QUALITY] ${consecutiveRejections} consecutive rejections warning sent to user ${clip.userId}`);
          }
        } catch (qualErr: any) {
          console.error(`[QUALITY] Check failed:`, qualErr?.message);
        }

        // Auto-resume: if campaign was budget-paused and rejection freed up budget
        if (clip.earnings > 0) {
          try {
            const rejCampaign = await db.campaign.findUnique({
              where: { id: clip.campaignId },
              select: { status: true, budget: true, pricingModel: true, lastBudgetPauseAt: true },
            });
            if (rejCampaign?.status === "PAUSED" && rejCampaign.lastBudgetPauseAt && rejCampaign.budget && rejCampaign.budget > 0) {
              // Calculate current spend after rejection
              const earningsAgg = await db.clip.aggregate({
                where: { campaignId: clip.campaignId, isDeleted: false, status: "APPROVED" },
                _sum: { earnings: true },
              });
              let currentSpent = Math.round((earningsAgg._sum.earnings ?? 0) * 100) / 100;
              if (rejCampaign.pricingModel === "CPM_SPLIT") {
                const ownerAgg = await db.agencyEarning.aggregate({
                  where: { campaignId: clip.campaignId },
                  _sum: { amount: true },
                });
                currentSpent = Math.round((currentSpent + (ownerAgg._sum.amount ?? 0)) * 100) / 100;
              }
              if (currentSpent < rejCampaign.budget) {
                await db.campaign.update({
                  where: { id: clip.campaignId },
                  data: { status: "ACTIVE", lastBudgetPauseAt: null },
                });
                await db.trackingJob.updateMany({
                  where: { campaignId: clip.campaignId, isActive: false },
                  data: { isActive: true },
                });
                const freed = Math.round((rejCampaign.budget - currentSpent) * 100) / 100;
                console.log(`[BUDGET] Campaign ${clip.campaignId} auto-resumed after rejection freed $${freed} of budget`);
              }
            }
          } catch (resumeErr: any) {
            console.error(`[BUDGET] Auto-resume check after rejection failed:`, resumeErr?.message);
          }
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
