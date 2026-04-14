import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { getGamificationState } from "@/lib/gamification";
import { calculatePayoutBreakdown } from "@/lib/payout-calc";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!db) return NextResponse.json([]);

  try {
    const payouts = await db.payoutRequest.findMany({
      include: {
        user: { select: { username: true, image: true, discordId: true } },
        campaign: { select: { name: true, platform: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(payouts);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  // Only clippers can request payouts
  const role = (session.user as any).role;
  if (role !== "CLIPPER") {
    return NextResponse.json({ error: "You don't have permission to request payouts." }, { status: 403 });
  }

  // Rate limit: 3 payout requests per hour per user
  const rl = checkRateLimit(`payout-req:${session.user.id}`, 3, 3_600_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  let data: any;
  try { data = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const amount = parseFloat(data.amount);
  if (!amount || !isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Please enter a valid amount." }, { status: 400 });
  }
  if (amount < 10) {
    return NextResponse.json({ error: "You need at least $10 to request a payout." }, { status: 400 });
  }
  if (!data.walletAddress?.trim()) {
    return NextResponse.json({ error: "Please enter your wallet address." }, { status: 400 });
  }
  if (!data.discordUsername?.trim()) {
    return NextResponse.json({ error: "Please enter your Discord username." }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const userId = session.user.id;
  const campaignId = data.campaignId?.trim() || null;
  if (!campaignId) {
    return NextResponse.json({ error: "Please select a campaign for your payout request" }, { status: 400 });
  }
  const roundedAmount = Math.round(amount * 100) / 100;

  // Get the user's current fee and bonus from gamification state
  const gamState = await getGamificationState(userId);
  const feePercent = gamState?.platformFeePercent ?? 9;
  const bonusPercent = gamState?.bonusPercent ?? 0;

  // Compute the payout breakdown
  const breakdown = calculatePayoutBreakdown(roundedAmount, feePercent, bonusPercent);

  try {
    const result = await db.$transaction(async (tx: any) => {
      // Duplicate check: reject if a REQUESTED payout exists for this user+campaign in the last 10 seconds
      const tenSecondsAgo = new Date(Date.now() - 10_000);
      const recentDuplicate = await tx.payoutRequest.findFirst({
        where: {
          userId,
          campaignId,
          status: "REQUESTED",
          createdAt: { gte: tenSecondsAgo },
        },
        select: { id: true },
      });
      if (recentDuplicate) {
        console.log(`[PAYOUT] Duplicate request blocked for user ${userId}`);
        throw new Error("DUPLICATE_PAYOUT");
      }

      // Fetch all approved clips and all payouts for this user
      const clips = await tx.clip.findMany({
        where: { userId, isDeleted: false, status: "APPROVED" },
        select: { earnings: true, campaignId: true },
      });

      const payouts = await tx.payoutRequest.findMany({
        where: { userId },
        select: { amount: true, status: true, campaignId: true },
      });

      // Compute campaign-scoped available balance
      const earned = clips
        .filter((c: any) => c.campaignId === campaignId)
        .reduce((s: number, c: any) => s + (c.earnings || 0), 0);
      const paidOut = payouts
        .filter((p: any) => p.campaignId === campaignId && p.status === "PAID")
        .reduce((s: number, p: any) => s + (p.amount || 0), 0);
      const locked = payouts
        .filter((p: any) => p.campaignId === campaignId && ["REQUESTED", "UNDER_REVIEW", "APPROVED"].includes(p.status))
        .reduce((s: number, p: any) => s + (p.amount || 0), 0);
      const available = Math.round(Math.max(earned - paidOut - locked, 0) * 100) / 100;

      if (roundedAmount > available) {
        throw new Error(`Insufficient balance. Available: $${available.toFixed(2)}`);
      }

      // Create payout with full breakdown stored
      return tx.payoutRequest.create({
        data: {
          userId,
          campaignId,
          amount: roundedAmount,
          feePercent: breakdown.feePercent,
          bonusPercent: breakdown.bonusPercent,
          feeAmount: breakdown.feeAmount,
          bonusAmount: breakdown.bonusAmount,
          finalAmount: breakdown.finalAmount,
          walletAddress: data.walletAddress.trim(),
          walletAsset: data.walletAsset?.trim() || null,
          walletChain: data.walletChain?.trim() || null,
          discordUsername: data.discordUsername?.trim() || null,
          proofNote: data.proofNote || null,
          proofFileUrl: data.proofFileUrl || null,
        },
      });
    }, {
      timeout: 15000,
      isolationLevel: "Serializable" as any,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    if (err.message === "DUPLICATE_PAYOUT") {
      return NextResponse.json({ error: "A payout request was just submitted. Please wait before trying again." }, { status: 409 });
    }
    if (err.message?.includes("Insufficient balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err.code === "P2034" || err.message?.includes("deadlock") || err.message?.includes("could not serialize")) {
      return NextResponse.json({ error: "Another request was being processed. Please try again." }, { status: 409 });
    }
    console.error("Payout creation failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
