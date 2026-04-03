import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
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

  if (!["APPROVED", "REJECTED", "PAID", "UNDER_REVIEW"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    // Fetch current payout for audit
    const existing = await db.payoutRequest.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Payout not found" }, { status: 404 });

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
      action: `${action}_PAYOUT`,
      targetType: "payout",
      targetId: id,
      details: {
        previousStatus: existing.status,
        newStatus: action,
        amount: existing.amount,
        userId: existing.userId,
        campaignId: existing.campaignId,
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
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to review payout" }, { status: 500 });
  }
}
