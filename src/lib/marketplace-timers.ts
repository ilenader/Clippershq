/**
 * Marketplace timer pass — runs INSIDE the existing tracking cron at the
 * end of runDueTrackingJobs. Same lock, same Railway service, no new cron.
 *
 * Sub-steps (in order):
 *   A) EXPIRE PENDING SUBMISSIONS where expiresAt < now
 *   B) AUTO-POST-EXPIRE APPROVED submissions where postDeadline < now and
 *      not posted, issuing a strike to the listing owner
 *   C) BAN CHECK per poster touched in B (3 strikes / 30d → 48h ban,
 *      ACTIVE listings → BANNED)
 *   D) BAN-LIFT (every tick): restore listings if user's ban expired
 *   E) REMINDER PLACEHOLDERS at 12h / 6h / 1h before postDeadline
 *      (Phase 9 wires email delivery — these rows are inert until then)
 *
 * Wall-clock budget: optional deadlineMs param mirrors the tracking pass's
 * trackingDeadlineAt module variable. Steps return early if exceeded.
 *
 * Idempotency: every step's filters exclude already-processed rows
 * (status guards, existence checks). Safe to re-run on the next tick.
 */
import { db } from "@/lib/db";
import { withDbRetry } from "@/lib/db-retry";
import { createNotification } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { isUserMarketplaceBanned } from "@/lib/marketplace-ban";

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;
const HOURS_48_MS = 48 * 60 * 60 * 1000;
const HOURS_12_MS = 12 * 60 * 60 * 1000;
const HOURS_6_MS = 6 * 60 * 60 * 1000;
const HOURS_1_MS = 1 * 60 * 60 * 1000;
const REMINDER_WINDOW_MS = 5 * 60 * 1000; // ±5 min around threshold
const TAKE_LIMIT = 500;
const STRIKE_THRESHOLD = 3;

export async function processMarketplaceTimers(deadlineMs?: number): Promise<{
  processed: number;
  errors: number;
  details: string[];
}> {
  const details: string[] = [];
  let processed = 0;
  let errors = 0;

  if (!db) return { processed, errors, details: ["DB unavailable"] };

  const overDeadline = () => deadlineMs !== undefined && deadlineMs > 0 && Date.now() >= deadlineMs;

  // ───────────── A) EXPIRE PENDING SUBMISSIONS ─────────────
  if (!overDeadline()) {
    try {
      const expired: any[] = await withDbRetry(
        () => db!.marketplaceSubmission.findMany({
          where: { status: "PENDING", expiresAt: { lt: new Date() } },
          select: { id: true, creatorId: true, listingId: true },
          take: TAKE_LIMIT,
        }),
        "marketplace.timers.findExpiredPending",
      );
      for (const sub of expired) {
        if (overDeadline()) break;
        try {
          await withDbRetry(
            () => db!.marketplaceSubmission.update({
              where: { id: sub.id },
              data: { status: "EXPIRED" },
            }),
            "marketplace.timers.expirePending",
          );
          await logAudit({
            userId: sub.creatorId,
            action: "MARKETPLACE_SUBMISSION_AUTO_EXPIRED",
            targetType: "marketplace_submission",
            targetId: sub.id,
            details: { previousStatus: "PENDING", newStatus: "EXPIRED" },
          });
          await createNotification(
            sub.creatorId,
            "MKT_SUBMISSION_REVIEW_EXPIRED" as any,
            "Submission expired",
            "Your marketplace submission expired before review and is no longer eligible.",
            { submissionId: sub.id },
          );
          processed++;
          details.push(`[MKT] Submission ${sub.id}: PENDING → EXPIRED`);
        } catch (err: any) {
          errors++;
          details.push(`[MKT] Submission ${sub.id}: expire failed (${err?.message})`);
        }
      }
    } catch (err: any) {
      errors++;
      details.push(`[MKT] Step A error: ${err?.message}`);
    }
  }

  // ───────────── B) AUTO-POST-EXPIRE APPROVED-NOT-POSTED ─────────────
  const postersTouched = new Set<string>();
  if (!overDeadline()) {
    try {
      const overdue: any[] = await withDbRetry(
        () => db!.marketplaceSubmission.findMany({
          where: {
            status: "APPROVED",
            postedAt: null,
            postDeadline: { lt: new Date() },
          },
          select: {
            id: true,
            creatorId: true,
            listingId: true,
            listing: { select: { id: true, userId: true } },
          },
          take: TAKE_LIMIT,
        }),
        "marketplace.timers.findOverduePosts",
      );
      for (const sub of overdue) {
        if (overDeadline()) break;
        const posterId: string | undefined = sub.listing?.userId;
        if (!posterId) continue;
        try {
          // Atomic: status flip + strike issuance must succeed together.
          // Without this, a partial write would leave APPROVED+postExpired
          // mismatched OR a strike with no submission state change.
          await db!.$transaction(async (tx: any) => {
            await tx.marketplaceSubmission.update({
              where: { id: sub.id },
              data: { status: "POST_EXPIRED" },
            });
            await tx.marketplaceStrike.create({
              data: {
                userId: posterId,
                reason: "MISSED_POST_DEADLINE",
                submissionId: sub.id,
              },
            });
          });
          postersTouched.add(posterId);
          await logAudit({
            userId: posterId,
            action: "MARKETPLACE_SUBMISSION_AUTO_POST_EXPIRED",
            targetType: "marketplace_submission",
            targetId: sub.id,
            details: { previousStatus: "APPROVED", newStatus: "POST_EXPIRED" },
          });
          await logAudit({
            userId: posterId,
            action: "MARKETPLACE_STRIKE_ISSUED",
            targetType: "marketplace_strike",
            targetId: sub.id,
            details: { reason: "MISSED_POST_DEADLINE", submissionId: sub.id },
          });
          await createNotification(
            posterId,
            "MKT_POST_DEADLINE_MISSED" as any,
            "Post deadline missed",
            "You missed a marketplace post deadline. A strike has been issued. 3 strikes within 30 days triggers a 48h marketplace ban.",
            { submissionId: sub.id },
          );
          await createNotification(
            sub.creatorId,
            "MKT_SUBMISSION_POST_EXPIRED" as any,
            "Clip not posted in time",
            "Your approved marketplace clip wasn't posted before the deadline and is now expired.",
            { submissionId: sub.id },
          );
          processed++;
          details.push(`[MKT] Submission ${sub.id}: APPROVED → POST_EXPIRED, strike → ${posterId.slice(0, 8)}`);
        } catch (err: any) {
          errors++;
          details.push(`[MKT] Submission ${sub.id}: post-expire failed (${err?.message})`);
        }
      }
    } catch (err: any) {
      errors++;
      details.push(`[MKT] Step B error: ${err?.message}`);
    }
  }

  // ───────────── C) BAN CHECK PER POSTER TOUCHED IN B ─────────────
  if (!overDeadline() && postersTouched.size > 0) {
    const cutoff = new Date(Date.now() - DAYS_30_MS);
    for (const posterId of postersTouched) {
      if (overDeadline()) break;
      try {
        // Defensive: skip if user already has an active ban. Avoids
        // double-issuing if a previous tick already banned them.
        const existingBan = await withDbRetry(
          () => db!.marketplaceStrike.findFirst({
            where: { userId: posterId, bannedUntil: { gt: new Date() } },
            select: { id: true },
          }),
          "marketplace.timers.findExistingBan",
        );
        if (existingBan) continue;

        const strikeCount: number = await withDbRetry(
          () => db!.marketplaceStrike.count({
            where: { userId: posterId, createdAt: { gt: cutoff } },
          }),
          "marketplace.timers.countStrikes",
        ) as number;
        if (strikeCount < STRIKE_THRESHOLD) continue;

        const newBannedUntil = new Date(Date.now() + HOURS_48_MS);

        // Attach bannedUntil to the most recent strike (the one we just
        // wrote in step B). Distinguishes "this is the ban-trigger row"
        // from older accumulating strikes on the same user.
        const latestStrike: any = await withDbRetry(
          () => db!.marketplaceStrike.findFirst({
            where: { userId: posterId },
            orderBy: { createdAt: "desc" },
            select: { id: true },
          }),
          "marketplace.timers.findLatestStrike",
        );
        if (!latestStrike) continue;

        await withDbRetry(
          () => db!.marketplaceStrike.update({
            where: { id: latestStrike.id },
            data: { bannedUntil: newBannedUntil },
          }),
          "marketplace.timers.setBannedUntil",
        );

        // Auto-ban all currently-ACTIVE listings owned by this user.
        // PAUSED (manual) and PENDING_APPROVAL stay untouched; the BANNED
        // status distinguishes auto-ban from manual pause for restoration.
        const listingsToBan: any[] = await withDbRetry(
          () => db!.marketplacePosterListing.findMany({
            where: { userId: posterId, status: "ACTIVE" },
            select: { id: true },
            take: TAKE_LIMIT,
          }),
          "marketplace.timers.findListingsToBan",
        );
        for (const l of listingsToBan) {
          await withDbRetry(
            () => db!.marketplacePosterListing.update({
              where: { id: l.id },
              data: { status: "BANNED" },
            }),
            "marketplace.timers.banListing",
          );
          await logAudit({
            userId: posterId,
            action: "MARKETPLACE_LISTING_AUTO_BANNED",
            targetType: "marketplace_listing",
            targetId: l.id,
            details: {
              previousStatus: "ACTIVE",
              newStatus: "BANNED",
              reason: "POSTER_BANNED_3_STRIKES",
            },
          });
        }

        await logAudit({
          userId: posterId,
          action: "MARKETPLACE_USER_BANNED",
          targetType: "user",
          targetId: posterId,
          details: {
            strikeCount,
            bannedUntil: newBannedUntil.toISOString(),
            listingsAutoBanned: listingsToBan.length,
          },
        });

        await createNotification(
          posterId,
          "MKT_POSTER_BANNED" as any,
          "Marketplace ban issued",
          `You've received ${STRIKE_THRESHOLD} strikes within 30 days. You're banned from the marketplace until ${newBannedUntil.toISOString()}. Your active listings have been paused for the duration.`,
          { bannedUntil: newBannedUntil.toISOString(), strikeCount },
        );

        processed++;
        details.push(`[MKT] Poster ${posterId.slice(0, 8)}: BANNED until ${newBannedUntil.toISOString()}, ${listingsToBan.length} listings auto-banned`);
      } catch (err: any) {
        errors++;
        details.push(`[MKT] Poster ${posterId.slice(0, 8)}: ban-check failed (${err?.message})`);
      }
    }
  }

  // ───────────── D) BAN-LIFT (every tick) ─────────────
  if (!overDeadline()) {
    try {
      const bannedListings: any[] = await withDbRetry(
        () => db!.marketplacePosterListing.findMany({
          where: { status: "BANNED" },
          select: { id: true, userId: true },
          take: TAKE_LIMIT,
        }),
        "marketplace.timers.findBannedListings",
      );
      const userIds = new Set<string>(bannedListings.map((l) => l.userId));
      for (const userId of userIds) {
        if (overDeadline()) break;
        try {
          const banStatus = await isUserMarketplaceBanned(userId);
          if (banStatus.banned) continue; // still banned

          const restored = bannedListings.filter((l) => l.userId === userId);
          for (const l of restored) {
            await withDbRetry(
              () => db!.marketplacePosterListing.update({
                where: { id: l.id },
                data: { status: "ACTIVE" },
              }),
              "marketplace.timers.unbanListing",
            );
            await logAudit({
              userId,
              action: "MARKETPLACE_LISTING_AUTO_RESTORED",
              targetType: "marketplace_listing",
              targetId: l.id,
              details: { previousStatus: "BANNED", newStatus: "ACTIVE" },
            });
          }
          await logAudit({
            userId,
            action: "MARKETPLACE_USER_BAN_LIFTED",
            targetType: "user",
            targetId: userId,
            details: { listingsRestored: restored.length },
          });
          await createNotification(
            userId,
            "MKT_POSTER_UNBANNED" as any,
            "Marketplace ban lifted",
            "Your marketplace ban has expired. Your listings are active again.",
            { listingsRestored: restored.length },
          );
          processed++;
          details.push(`[MKT] Poster ${userId.slice(0, 8)}: ban lifted, ${restored.length} listings restored`);
        } catch (err: any) {
          errors++;
          details.push(`[MKT] Poster ${userId.slice(0, 8)}: unban failed (${err?.message})`);
        }
      }
    } catch (err: any) {
      errors++;
      details.push(`[MKT] Step D error: ${err?.message}`);
    }
  }

  // ───────────── E) REMINDER PLACEHOLDERS (Phase 9 delivers) ─────────────
  if (!overDeadline()) {
    try {
      const now = Date.now();
      const upcoming: any[] = await withDbRetry(
        () => db!.marketplaceSubmission.findMany({
          where: {
            status: "APPROVED",
            postedAt: null,
            postDeadline: { gt: new Date() },
          },
          select: {
            id: true,
            postDeadline: true,
            listing: { select: { userId: true } },
          },
          take: TAKE_LIMIT,
        }),
        "marketplace.timers.findUpcomingDeadlines",
      );

      // One bulk fetch of existing reminder rows. Keys are
      // `${type}:${submissionId}`. Phase 9 reads these same rows.
      const existing: any[] = await withDbRetry(
        () => db!.notification.findMany({
          where: {
            type: { in: ["MKT_POST_DEADLINE_12H", "MKT_POST_DEADLINE_6H", "MKT_POST_DEADLINE_1H"] },
          },
          select: { type: true, metadata: true },
          take: 5000,
        }),
        "marketplace.timers.findExistingReminders",
      );
      const existingKeys = new Set<string>();
      for (const n of existing) {
        try {
          const meta = n.metadata ? JSON.parse(n.metadata) : null;
          if (meta?.submissionId) existingKeys.add(`${n.type}:${meta.submissionId}`);
        } catch {
          // skip malformed metadata
        }
      }

      const thresholds: { offset: number; type: string; label: string }[] = [
        { offset: HOURS_12_MS, type: "MKT_POST_DEADLINE_12H", label: "12 hours" },
        { offset: HOURS_6_MS, type: "MKT_POST_DEADLINE_6H", label: "6 hours" },
        { offset: HOURS_1_MS, type: "MKT_POST_DEADLINE_1H", label: "1 hour" },
      ];

      for (const sub of upcoming) {
        if (overDeadline()) break;
        const posterId: string | undefined = sub.listing?.userId;
        if (!posterId || !sub.postDeadline) continue;
        const deadlineTs = new Date(sub.postDeadline).getTime();
        for (const t of thresholds) {
          const thresholdMs = deadlineTs - t.offset;
          // ±5 min window around the threshold. Dedup via existingKeys
          // makes overlapping ticks safe.
          if (Math.abs(now - thresholdMs) > REMINDER_WINDOW_MS) continue;
          const key = `${t.type}:${sub.id}`;
          if (existingKeys.has(key)) continue;
          try {
            // Raw db.notification.create — NOT createNotification — so
            // this insert does NOT publish an Ably refresh. The row is a
            // dormant placeholder until Phase 9's email sender picks it up.
            await db!.notification.create({
              data: {
                userId: posterId,
                type: t.type,
                title: "Post deadline reminder",
                body: `You have a marketplace clip with about ${t.label} left until its post deadline. Make sure to post it on time.`,
                metadata: JSON.stringify({
                  scheduledFor: new Date(thresholdMs).toISOString(),
                  submissionId: sub.id,
                  deadline: new Date(deadlineTs).toISOString(),
                  reminderType: t.type.replace("MKT_POST_DEADLINE_", ""),
                }),
                isRead: false,
              },
            });
            existingKeys.add(key);
            processed++;
            details.push(`[MKT] Reminder ${t.type} queued for sub ${sub.id}`);
          } catch (err: any) {
            errors++;
            details.push(`[MKT] Reminder ${t.type} for ${sub.id} failed (${err?.message})`);
          }
        }
      }
    } catch (err: any) {
      errors++;
      details.push(`[MKT] Step E error: ${err?.message}`);
    }
  }

  return { processed, errors, details };
}
