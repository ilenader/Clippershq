import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { sendPayoutApproved, sendPayoutRejected } from "@/lib/email";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { formatCurrency } from "@/lib/utils";
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
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can review payouts" }, { status: 403 });
  }

  // Rate limit: 30 payout reviews per minute
  const rl = checkRateLimit(`payout-review:${session.user.id}`, 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id } = await params;
  const { action, rejectionReason } = body;

  if (!["APPROVED", "REJECTED", "PAID", "UNDER_REVIEW", "VOIDED"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    // Fetch current payout for audit
    const existing = await db.payoutRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Payout not found" }, { status: 404 });

    // State machine: REJECTED is terminal. PAID is terminal EXCEPT for OWNER
    // force-void (used to clear test data pre-launch — voiding removes the
    // record only, it does NOT refund money, so the UI must warn the owner.)
    // This route is already gated to role === "OWNER" above, so ADMIN and
    // CLIPPER never reach this check. Keeping the OWNER gate inline anyway
    // as defense in depth if the outer guard is ever changed.
    const validTransitions: Record<string, string[]> = {
      REQUESTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
      UNDER_REVIEW: ["APPROVED", "REJECTED"],
      APPROVED: ["PAID", "REJECTED"],
      PAID: role === "OWNER" ? ["VOIDED"] : [],
    };
    const isForceVoidOfPaid = existing.status === "PAID" && action === "VOIDED";
    if (!validTransitions[existing.status]?.includes(action)) {
      return NextResponse.json(
        { error: `Cannot change payout from ${existing.status} to ${action}` },
        { status: 400 },
      );
    }

    // Validate campaign balance on promise-money transitions (APPROVED and PAID).
    // Balance can drop between REQUESTED and APPROVED (other payouts, video unavailability, recalc),
    // so checking only at PAID would let us tell a user "approved!" when the money isn't there.
    if ((action === "APPROVED" || action === "PAID") && existing.campaignId) {
      const campaignClips = await db.clip.findMany({
        where: {
          userId: existing.userId,
          campaignId: existing.campaignId,
          status: "APPROVED",
          isDeleted: false,
          videoUnavailable: false,
        },
        select: { earnings: true },
      });
      const campaignEarned = campaignClips.reduce((s: number, c: any) => s + (c.earnings || 0), 0);

      const campaignPayouts = await db.payoutRequest.findMany({
        where: {
          userId: existing.userId,
          campaignId: existing.campaignId,
          id: { not: id }, // Exclude the current payout being approved
          status: { in: ["PAID", "REQUESTED", "UNDER_REVIEW", "APPROVED"] },
        },
        select: { amount: true },
      });
      const campaignPaidAndLocked = campaignPayouts.reduce((s: number, p: any) => s + (p.amount || 0), 0);

      const campaignAvailable = Math.round(Math.max(campaignEarned - campaignPaidAndLocked, 0) * 100) / 100;

      // Integer-cent compare — avoid float-precision false positives/negatives at the boundary
      if (Math.round(existing.amount * 100) > Math.round(campaignAvailable * 100)) {
        return NextResponse.json({
          error: `Cannot ${action.toLowerCase()} — campaign earnings (${formatCurrency(campaignEarned)}) are less than total payouts (${formatCurrency(campaignPaidAndLocked + existing.amount)}). Earnings may have changed since this payout was requested.`,
        }, { status: 400 });
      }
    }

    await db.payoutRequest.update({
      where: { id },
      data: {
        status: action,
        rejectionReason: action === "REJECTED" ? rejectionReason : null,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
    });

    await logAudit({
      userId: session.user.id,
      // Force-voiding a PAID payout is distinct from a normal void of a
      // REJECTED/APPROVED row — the money already left the building. Tag the
      // action so an audit review can grep for FORCE_VOID_PAID_PAYOUT alone.
      action: isForceVoidOfPaid ? "FORCE_VOID_PAID_PAYOUT" : `${action}_PAYOUT`,
      targetType: "payout",
      targetId: id,
      details: {
        previousStatus: existing.status,
        newStatus: action,
        amount: existing.amount,
        userId: existing.userId,
        campaignId: existing.campaignId,
        ...(isForceVoidOfPaid ? { note: "OWNER force-voided PAID payout — record cleared, money NOT refunded" } : {}),
      },
    });

    // Send notification to the payout requester
    const formattedAmount = `$${Number(existing.amount).toFixed(2)}`;
    if (action === "APPROVED") {
      await createNotification(
        existing.userId,
        "PAYOUT_APPROVED",
        "Payout approved",
        `Your payout of ${formattedAmount} has been approved and is being processed.`,
        { payoutId: id, amount: existing.amount },
      );
    } else if (action === "REJECTED") {
      await createNotification(
        existing.userId,
        "PAYOUT_REJECTED",
        "Payout rejected",
        `Your payout of ${formattedAmount} was rejected${rejectionReason ? `: ${rejectionReason}` : "."}`,
        { payoutId: id, amount: existing.amount, reason: rejectionReason },
      );
    } else if (action === "PAID") {
      await createNotification(
        existing.userId,
        "PAYOUT_PAID",
        "Payout processed",
        `Your payout of ${formattedAmount} has been sent. Please allow a few business days for it to arrive.`,
        { payoutId: id, amount: existing.amount },
      );
      // Send email for PAID payouts
      try {
        const payoutUser = await db.user.findUnique({ where: { id: existing.userId }, select: { email: true, role: true } });
        if (payoutUser?.email && payoutUser.role === "CLIPPER") {
          await sendPayoutApproved(payoutUser.email, existing.finalAmount ?? existing.amount);
        }
      } catch {}
    } else if (action === "REJECTED") {
      // Send email for REJECTED payouts (handled after notification above, but email goes here for REJECTED)
    }

    // Send rejection email (only for clippers)
    if (action === "REJECTED") {
      try {
        const payoutUser = await db.user.findUnique({ where: { id: existing.userId }, select: { email: true, role: true } });
        if (payoutUser?.email && payoutUser.role === "CLIPPER") {
          await sendPayoutRejected(payoutUser.email, existing.amount, rejectionReason);
        }
      } catch {}
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to review payout" }, { status: 500 });
  }
}
