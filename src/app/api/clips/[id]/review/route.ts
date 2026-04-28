import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getUserCampaignIds } from "@/lib/campaign-access";
import { logAudit } from "@/lib/audit";
import { recalculateClipEarnings, recalculateClipEarningsBreakdown, calculateOwnerEarnings, calculateMarketplaceEarnings, getStreakBonusPercent } from "@/lib/earnings-calc";
import { getCampaignBudgetStatus } from "@/lib/balance";
import { createNotification } from "@/lib/notifications";
import { sendClipApproved, sendClipRejected, sendStreakRejectionWarning, sendConsecutiveRejectionWarning } from "@/lib/email";
import { updateUserLevel, loadConfig, updateStreak } from "@/lib/gamification";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { publishToUser } from "@/lib/ably";
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
      select: {
        id: true, campaignId: true, status: true, userId: true, isOwnerOverride: true,
        user: { select: { email: true, role: true } },
        campaign: { select: { status: true, isArchived: true } },
      },
    });

    if (!clip) return NextResponse.json({ error: "Clip not found" }, { status: 404 });

    // ADMIN: verify they have access to this clip's campaign
    if (role === "ADMIN") {
      const allowedIds = await getUserCampaignIds(session.user.id, role);
      if (Array.isArray(allowedIds) && !allowedIds.includes(clip.campaignId)) {
        return NextResponse.json({ error: "You don't have access to this campaign" }, { status: 403 });
      }
    }

    // Campaign state guard — approvals only legal on ACTIVE or PAUSED, not DRAFT/COMPLETED/archived.
    // REJECTED / PENDING / FLAGGED transitions are still allowed (e.g., to fix mistakes on archived campaigns).
    if (action === "APPROVED") {
      if ((clip as any).campaign?.isArchived) {
        return NextResponse.json({ error: "Cannot approve clips on an archived campaign" }, { status: 400 });
      }
      const campaignStatus = (clip as any).campaign?.status;
      if (campaignStatus && campaignStatus !== "ACTIVE" && campaignStatus !== "PAUSED") {
        return NextResponse.json(
          { error: `Cannot approve clips while campaign is ${campaignStatus}` },
          { status: 400 },
        );
      }
    }

    // ── Calculate and update earnings based on new status ──
    if (action === "APPROVED") {
      // Force-refresh the clipper's streak BEFORE snapshotting so we never
      // lock a stale/cached value. Any transient "day 4 → day 3" window in
      // updateStreak that might exist around midnight or during concurrent
      // writes is resolved here by an explicit rebuild-from-clip-history pass.
      // Errors are swallowed — we fall back to whatever's on the user row.
      try {
        await updateStreak(clip.userId);
      } catch (usErr: any) {
        console.error(`[REVIEW] updateStreak pre-lock failed for user ${clip.userId}:`, usErr?.message);
      }

      // Fetch clip stats + campaign data AFTER the streak refresh so user.currentStreak
      // reflects the rebuild. This ensures the budget check sees accurate "spent"
      // (this clip is still PENDING/etc). include (without a top-level select) returns
      // all Clip scalars by default — that includes the existing
      // streakBonusPercentAtApproval snapshot, which the re-approval branch reads
      // below to avoid re-snapshotting.
      const clipWithData = await db.clip.findUnique({
        where: { id },
        include: {
          stats: { orderBy: { checkedAt: "desc" }, take: 1 },
          campaign: { select: { minViews: true, cpmRate: true, maxPayoutPerClip: true, clipperCpm: true, pricingModel: true, ownerCpm: true, budget: true } },
          user: { select: { level: true, currentStreak: true, referredById: true, isPWAUser: true } },
          // Marketplace (Phase 6c) — pre-fetch creator profile + existing earning rows
          // so the marketplace fork can compute the 60/30/10 split atomically.
          marketplaceCreatorEarning: { select: { amount: true, streakBonusPercentAtApproval: true } },
          marketplaceOriginPost: {
            select: {
              submission: {
                select: {
                  creatorId: true,
                  creator: { select: { level: true, currentStreak: true, referredById: true, isPWAUser: true } },
                },
              },
            },
          },
        },
      });

      let finalClipperEarnings = 0;
      let finalOwnerAmt = 0;
      let finalCreatorAmt = 0;
      let finalPlatformAmt = 0;
      const isMarketplaceClip = !!(clipWithData as any)?.isMarketplaceClip;
      const mktSubmission = (clipWithData as any)?.marketplaceOriginPost?.submission || null;
      const creatorId: string | null = mktSubmission?.creatorId ?? null;
      const creatorProfile: any = mktSubmission?.creator || null;

      if (clipWithData?.campaign && clipWithData.stats.length > 0) {
        // Snapshot the streak bonus % at approval. On re-approval of an already-
        // locked clip, preserve the prior snapshot — we only freeze on first
        // approval so re-approvals don't move the streak portion.
        const priorLocked = (clipWithData as any).streakBonusPercentAtApproval;
        let lockedStreakPct: number;
        if (priorLocked != null) {
          lockedStreakPct = priorLocked;
        } else {
          const cfg = await loadConfig();
          lockedStreakPct = getStreakBonusPercent(
            clipWithData.user?.currentStreak ?? 0,
            cfg.streakBonuses,
          );
        }

        // Marketplace creator's streak snapshot — preserve prior if it exists.
        let creatorStreakLocked: number | null = null;
        if (isMarketplaceClip) {
          if (!creatorId || !creatorProfile) {
            console.error(`[REVIEW-MKT] Clip ${id}: marketplace flag set but submission/creator missing`);
            return NextResponse.json({ error: "Marketplace metadata missing on clip" }, { status: 500 });
          }
          const priorCreatorLocked = (clipWithData as any).marketplaceCreatorEarning?.streakBonusPercentAtApproval;
          if (priorCreatorLocked != null) {
            creatorStreakLocked = priorCreatorLocked;
          } else {
            const cfg2 = await loadConfig();
            creatorStreakLocked = getStreakBonusPercent(
              creatorProfile.currentStreak ?? 0,
              cfg2.streakBonuses,
            );
          }
        }

        let breakdown: any = null;
        let mktBreakdown: any = null;

        if (isMarketplaceClip) {
          const cpmForCalc = (clipWithData.campaign as any).clipperCpm ?? (clipWithData.campaign as any).cpmRate ?? null;
          mktBreakdown = calculateMarketplaceEarnings({
            views: clipWithData.stats[0].views,
            campaignCpm: cpmForCalc,
            campaignMinViews: (clipWithData.campaign as any).minViews ?? null,
            campaignMaxPayoutPerClip: (clipWithData.campaign as any).maxPayoutPerClip ?? null,
            creator: {
              level: creatorProfile.level ?? 0,
              streak: creatorProfile.currentStreak ?? 0,
              isPWAUser: !!creatorProfile.isPWAUser,
              isReferred: !!creatorProfile.referredById,
              streakBonusPercentAtApproval: creatorStreakLocked,
            },
            poster: {
              level: clipWithData.user?.level ?? 0,
              streak: clipWithData.user?.currentStreak ?? 0,
              isPWAUser: !!clipWithData.user?.isPWAUser,
              isReferred: !!clipWithData.user?.referredById,
              streakBonusPercentAtApproval: lockedStreakPct,
            },
          });
          finalClipperEarnings = mktBreakdown.poster.total;
          finalCreatorAmt = mktBreakdown.creator.total;
          finalPlatformAmt = mktBreakdown.platform.amount;
        } else {
          breakdown = recalculateClipEarningsBreakdown({
            stats: clipWithData.stats,
            campaign: clipWithData.campaign,
            user: clipWithData.user || undefined,
            streakBonusPercentAtApproval: lockedStreakPct,
          });
          finalClipperEarnings = breakdown.clipperEarnings;
        }

        const pm = (clipWithData.campaign as any).pricingModel;
        const oCpm = (clipWithData.campaign as any).ownerCpm;
        const isCpmSplit = !isMarketplaceClip && pm === "CPM_SPLIT" && oCpm;

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
                where: { campaignId: clip.campaignId, isDeleted: false, status: "APPROVED", videoUnavailable: false },
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
              // Marketplace earnings always contribute to the campaign budget — include them
              // unconditionally so non-marketplace clips also see them in the spent total.
              const creatorAgg = await tx.marketplaceCreatorEarning.aggregate({
                where: { campaignId: clip.campaignId, clip: { isDeleted: false, status: "APPROVED", videoUnavailable: false } },
                _sum: { amount: true },
              });
              const platformAgg = await tx.marketplacePlatformEarning.aggregate({
                where: { campaignId: clip.campaignId, clip: { isDeleted: false, status: "APPROVED", videoUnavailable: false } },
                _sum: { amount: true },
              });
              spent = Math.round((spent + (creatorAgg._sum.amount ?? 0) + (platformAgg._sum.amount ?? 0)) * 100) / 100;

              // If re-approval, subtract this clip's current contribution from spent
              let thisClipInSpent = 0;
              if (clip.status === "APPROVED") {
                thisClipInSpent = clipWithData.earnings || 0;
                if (isCpmSplit) {
                  const existingAe = await tx.agencyEarning.findUnique({ where: { clipId: id } });
                  thisClipInSpent += existingAe?.amount || 0;
                }
                if (isMarketplaceClip) {
                  const existingCreatorRow = await tx.marketplaceCreatorEarning.findUnique({ where: { clipId: id }, select: { amount: true } });
                  thisClipInSpent += existingCreatorRow?.amount || 0;
                  const existingPlatformRow = await tx.marketplacePlatformEarning.findUnique({ where: { clipId: id }, select: { amount: true } });
                  thisClipInSpent += existingPlatformRow?.amount || 0;
                }
              }

              const otherSpent = spent - thisClipInSpent;
              const remaining = Math.max(campaignBudget - otherSpent, 0);
              const totalForThisClip = isMarketplaceClip
                ? (finalClipperEarnings + finalCreatorAmt + finalPlatformAmt)
                : (finalClipperEarnings + finalOwnerAmt);

              console.log(`[BUDGET] Clip ${id}: budget=$${campaignBudget}, otherSpent=$${otherSpent.toFixed(2)}, remaining=$${remaining.toFixed(2)}, thisClip=$${totalForThisClip.toFixed(2)}`);

              if (remaining <= 0) {
                finalClipperEarnings = 0;
                finalOwnerAmt = 0;
                finalCreatorAmt = 0;
                finalPlatformAmt = 0;
              } else if (totalForThisClip > remaining) {
                const scaleFactor = remaining / totalForThisClip;
                if (isMarketplaceClip) {
                  finalClipperEarnings = Math.floor(finalClipperEarnings * scaleFactor * 100) / 100;
                  finalCreatorAmt = Math.floor(finalCreatorAmt * scaleFactor * 100) / 100;
                  finalPlatformAmt = Math.floor(finalPlatformAmt * scaleFactor * 100) / 100;
                  if (finalClipperEarnings + finalCreatorAmt + finalPlatformAmt > remaining) {
                    finalPlatformAmt = Math.floor((remaining - finalClipperEarnings - finalCreatorAmt) * 100) / 100;
                    if (finalPlatformAmt < 0) finalPlatformAmt = 0;
                  }
                } else {
                  finalClipperEarnings = Math.floor(finalClipperEarnings * scaleFactor * 100) / 100;
                  finalOwnerAmt = Math.floor(finalOwnerAmt * scaleFactor * 100) / 100;
                  if (finalClipperEarnings + finalOwnerAmt > remaining) {
                    finalClipperEarnings = Math.floor((remaining - finalOwnerAmt) * 100) / 100;
                  }
                }
              }

              // Auto-pause
              const newTotalSpent = isMarketplaceClip
                ? (otherSpent + finalClipperEarnings + finalCreatorAmt + finalPlatformAmt)
                : (otherSpent + finalClipperEarnings + finalOwnerAmt);
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
            if (isMarketplaceClip) {
              await tx.clip.update({
                where: { id },
                data: {
                  status: action,
                  rejectionReason: null,
                  reviewedById: session.user.id,
                  reviewedAt: new Date(),
                  earnings: finalClipperEarnings,
                  baseEarnings: mktBreakdown.poster.base,
                  bonusPercent: mktBreakdown.poster.bonusPercent,
                  bonusAmount: mktBreakdown.poster.bonusAmount,
                  feePercentAtApproval: isReferred ? 4 : 9,
                  streakBonusPercentAtApproval: lockedStreakPct,
                  streakDayLocked: true,
                  streakDayLockedAt: new Date(),
                },
              });
              // Creator earning — upsert with creator's streak snapshot.
              if (finalCreatorAmt > 0) {
                await tx.marketplaceCreatorEarning.upsert({
                  where: { clipId: id },
                  create: {
                    clipId: id,
                    creatorId: creatorId!,
                    campaignId: clip.campaignId,
                    amount: finalCreatorAmt,
                    baseAmount: mktBreakdown.creator.base,
                    bonusPercent: mktBreakdown.creator.bonusPercent,
                    bonusAmount: mktBreakdown.creator.bonusAmount,
                    streakBonusPercentAtApproval: creatorStreakLocked,
                    views: clipWithData.stats[0].views,
                  },
                  update: {
                    amount: finalCreatorAmt,
                    baseAmount: mktBreakdown.creator.base,
                    bonusPercent: mktBreakdown.creator.bonusPercent,
                    bonusAmount: mktBreakdown.creator.bonusAmount,
                    views: clipWithData.stats[0].views,
                  },
                });
              } else {
                // Zero amount — still create/preserve the row so the creator's streak
                // snapshot survives until first non-zero tick (Phase 6 Q7 decision).
                await tx.marketplaceCreatorEarning.upsert({
                  where: { clipId: id },
                  create: {
                    clipId: id,
                    creatorId: creatorId!,
                    campaignId: clip.campaignId,
                    amount: 0,
                    baseAmount: 0,
                    bonusPercent: 0,
                    bonusAmount: 0,
                    streakBonusPercentAtApproval: creatorStreakLocked,
                    views: clipWithData.stats[0].views,
                  },
                  update: {
                    amount: 0,
                    baseAmount: 0,
                    bonusPercent: 0,
                    bonusAmount: 0,
                    views: clipWithData.stats[0].views,
                  },
                });
              }
              if (finalPlatformAmt > 0) {
                await tx.marketplacePlatformEarning.upsert({
                  where: { clipId: id },
                  create: {
                    clipId: id,
                    campaignId: clip.campaignId,
                    amount: finalPlatformAmt,
                    views: clipWithData.stats[0].views,
                  },
                  update: {
                    amount: finalPlatformAmt,
                    views: clipWithData.stats[0].views,
                  },
                });
              } else {
                // Same zero-row preservation rationale as creator above.
                await tx.marketplacePlatformEarning.upsert({
                  where: { clipId: id },
                  create: {
                    clipId: id,
                    campaignId: clip.campaignId,
                    amount: 0,
                    views: clipWithData.stats[0].views,
                  },
                  update: { amount: 0, views: clipWithData.stats[0].views },
                });
              }
            } else {
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
                  streakBonusPercentAtApproval: lockedStreakPct,
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
        // No stats — set status, and still snapshot the streak bonus % so that
        // once tracking starts producing views, the first earnings calc uses the
        // approval-time streak rather than whatever the user's streak is then.
        let lockedStreakPctNoStats: number | null = null;
        let creatorStreakLockedNoStats: number | null = null;
        if (action === "APPROVED") {
          const priorLocked = (clipWithData as any)?.streakBonusPercentAtApproval;
          if (priorLocked != null) {
            lockedStreakPctNoStats = priorLocked;
          } else {
            const cfg = await loadConfig();
            lockedStreakPctNoStats = getStreakBonusPercent(
              clipWithData?.user?.currentStreak ?? 0,
              cfg.streakBonuses,
            );
          }
          // Marketplace: snapshot creator's streak too so the first non-zero
          // cron tick uses the approval-time creator streak (Phase 6 Q7).
          if (isMarketplaceClip && creatorProfile) {
            const priorCreatorLocked = (clipWithData as any).marketplaceCreatorEarning?.streakBonusPercentAtApproval;
            if (priorCreatorLocked != null) {
              creatorStreakLockedNoStats = priorCreatorLocked;
            } else {
              const cfg3 = await loadConfig();
              creatorStreakLockedNoStats = getStreakBonusPercent(
                creatorProfile.currentStreak ?? 0,
                cfg3.streakBonuses,
              );
            }
          }
        }
        await db.clip.update({
          where: { id },
          data: {
            status: action,
            rejectionReason: null,
            reviewedById: session.user.id,
            reviewedAt: new Date(),
            ...(action === "APPROVED"
              ? {
                  streakDayLocked: true,
                  streakDayLockedAt: new Date(),
                  streakBonusPercentAtApproval: lockedStreakPctNoStats,
                }
              : {}),
          },
        });
        // Marketplace zero-row creation for streak snapshot persistence.
        if (action === "APPROVED" && isMarketplaceClip && creatorId && creatorProfile) {
          try {
            await db.marketplaceCreatorEarning.upsert({
              where: { clipId: id },
              create: {
                clipId: id,
                creatorId: creatorId,
                campaignId: clip.campaignId,
                amount: 0,
                baseAmount: 0,
                bonusPercent: 0,
                bonusAmount: 0,
                streakBonusPercentAtApproval: creatorStreakLockedNoStats,
                views: 0,
              },
              update: {
                // Don't overwrite the snapshot on re-approval if it already exists.
                ...(((clipWithData as any).marketplaceCreatorEarning?.streakBonusPercentAtApproval == null)
                  ? { streakBonusPercentAtApproval: creatorStreakLockedNoStats }
                  : {}),
              },
            });
            await db.marketplacePlatformEarning.upsert({
              where: { clipId: id },
              create: {
                clipId: id,
                campaignId: clip.campaignId,
                amount: 0,
                views: 0,
              },
              update: {},
            });
          } catch (mktErr: any) {
            console.error(`[REVIEW-MKT] Zero-row upsert failed for clip ${id}:`, mktErr?.message);
          }
        }
      }

      // Broadcast IMMEDIATELY after save — before slow operations (email, stats sync)
      try {
        publishToUser(clip.userId, "clip_updated", { clipId: id, status: action, earnings: finalClipperEarnings }).catch(() => {});
        publishToUser(clip.userId, "earnings_updated", { reason: action.toLowerCase() }).catch(() => {});
      } catch {}

      // Ensure tracking job exists for approved clip
      try {
        const existingJob = await db.trackingJob.findFirst({ where: { clipId: id } });
        if (!existingJob) {
          const nh = new Date(); nh.setMinutes(0,0,0); nh.setHours(nh.getHours()+1);
          await db.trackingJob.create({
            data: {
              clipId: id,
              campaignId: clip.campaignId,
              nextCheckAt: nh,
              checkIntervalMin: 60,
              isActive: true,
            },
          });
          console.log("[TRACKING] Created missing tracking job for clip:", id);
        } else if (!existingJob.isActive) {
          const nh2 = new Date(); nh2.setMinutes(0,0,0); nh2.setHours(nh2.getHours()+1);
          await db.trackingJob.update({
            where: { id: existingJob.id },
            data: { isActive: true, nextCheckAt: nh2 },
          });
          console.log("[TRACKING] Reactivated tracking job for clip:", id);
        }
      } catch (tjErr: any) {
        console.error("[TRACKING] Failed to ensure tracking job for clip:", id, tjErr?.message);
      }

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
      // Delete agency earnings for this clip (CPM_SPLIT campaigns)
      try { await db.agencyEarning.delete({ where: { clipId: id } }); } catch {}
      // Delete marketplace earnings — rejection/un-approval zeroes all 3 shares.
      // Cron's next tick will recreate them only if the clip is re-approved.
      try { await db.marketplaceCreatorEarning.delete({ where: { clipId: id } }); } catch {}
      try { await db.marketplacePlatformEarning.delete({ where: { clipId: id } }); } catch {}
      // Broadcast immediately
      try {
        publishToUser(clip.userId, "clip_updated", { clipId: id, status: action, earnings: 0 }).catch(() => {});
        publishToUser(clip.userId, "earnings_updated", { reason: action.toLowerCase() }).catch(() => {});
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

      }

      // Auto-resume: if campaign was budget-paused and undo/rejection freed up budget
      // (runs for both REJECTED and PENDING/undo, regardless of clip earnings)
      try {
        const undoCampaign = await db.campaign.findUnique({
          where: { id: clip.campaignId },
          select: { status: true, budget: true, pricingModel: true, lastBudgetPauseAt: true },
        });
        if (undoCampaign?.status === "PAUSED" && undoCampaign.lastBudgetPauseAt && undoCampaign.budget && undoCampaign.budget > 0) {
          const eAgg = await db.clip.aggregate({
            where: { campaignId: clip.campaignId, isDeleted: false, status: "APPROVED", videoUnavailable: false },
            _sum: { earnings: true },
          });
          let spent = Math.round((eAgg._sum.earnings ?? 0) * 100) / 100;
          if (undoCampaign.pricingModel === "CPM_SPLIT") {
            const oAgg = await db.agencyEarning.aggregate({ where: { campaignId: clip.campaignId }, _sum: { amount: true } });
            spent = Math.round((spent + (oAgg._sum.amount ?? 0)) * 100) / 100;
          }
          // Marketplace earnings always count toward campaign budget — include them
          // unconditionally (Phase 6c) so auto-resume reflects true remaining budget.
          const cAgg = await db.marketplaceCreatorEarning.aggregate({
            where: { campaignId: clip.campaignId, clip: { isDeleted: false, status: "APPROVED", videoUnavailable: false } },
            _sum: { amount: true },
          });
          const pAgg = await db.marketplacePlatformEarning.aggregate({
            where: { campaignId: clip.campaignId, clip: { isDeleted: false, status: "APPROVED", videoUnavailable: false } },
            _sum: { amount: true },
          });
          spent = Math.round((spent + (cAgg._sum.amount ?? 0) + (pAgg._sum.amount ?? 0)) * 100) / 100;
          if (spent < undoCampaign.budget) {
            await db.campaign.update({ where: { id: clip.campaignId }, data: { status: "ACTIVE", lastBudgetPauseAt: null } });
            await db.trackingJob.updateMany({ where: { campaignId: clip.campaignId, isActive: false }, data: { isActive: true } });
            console.log(`[BUDGET] Campaign ${clip.campaignId} auto-resumed after ${action.toLowerCase()} freed budget`);
          }
        }
      } catch (resumeErr: any) {
        console.error(`[BUDGET] Auto-resume check failed:`, resumeErr?.message);
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
      // Deliberately NOT pushing a clip_updated SSE to the clipper here —
      // their /api/clips/mine response now maps FLAGGED → PENDING, and a
      // live SSE with raw status: "FLAGGED" would either be ignored by the
      // client (if it also maps) or trigger the panic UX we're hiding.
      // OWNER/ADMIN dashboards re-query flags via their own endpoints.
    }

    // ── Sync user totalEarnings, totalViews, and level ──
    // Skip entirely for OWNER/ADMIN users and owner override clips
    const userRole_ = (clip.user as any)?.role;
    if (userRole_ !== "OWNER" && userRole_ !== "ADMIN" && !clip.isOwnerOverride) {
      try {
        const earningsAgg = await db.clip.aggregate({
          where: { userId: clip.userId, status: "APPROVED", isOwnerOverride: false, videoUnavailable: false },
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
      try { await updateStreak(clip.userId); } catch {}
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
