import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { calculatePayoutBreakdown } from "@/lib/payout-calc";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { formatCurrency } from "@/lib/utils";
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
      take: 200,
    });

    // Enrich each payout with campaignAvailable for owner review
    const enriched = await Promise.all(
      payouts.map(async (payout: any) => {
        if (!payout.campaignId) return { ...payout, campaignAvailable: null };

        const [clipAgg, payoutAgg] = await Promise.all([
          db!.clip.aggregate({
            where: {
              userId: payout.userId,
              campaignId: payout.campaignId,
              status: "APPROVED",
              isDeleted: false,
              videoUnavailable: false,
            },
            _sum: { earnings: true },
          }),
          db!.payoutRequest.findMany({
            where: {
              userId: payout.userId,
              campaignId: payout.campaignId,
              id: { not: payout.id },
              status: { in: ["PAID", "REQUESTED", "UNDER_REVIEW", "APPROVED"] },
            },
            select: { amount: true },
            take: 500,
          }),
        ]);

        const earned = clipAgg._sum.earnings ?? 0;
        const paidAndLocked = payoutAgg.reduce((s: number, p: any) => s + (p.amount || 0), 0);
        const campaignAvailable = Math.round(Math.max(earned - paidAndLocked, 0) * 100) / 100;

        return { ...payout, campaignAvailable };
      })
    );

    return NextResponse.json(enriched);
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
  if (amount > 100_000) {
    return NextResponse.json({ error: "Amount is too large (max $100,000)." }, { status: 400 });
  }
  if (!data.walletAddress?.trim()) {
    return NextResponse.json({ error: "Please enter your wallet address." }, { status: 400 });
  }
  if (data.walletAddress.length > 200) {
    return NextResponse.json({ error: "Wallet address is too long (max 200 chars)." }, { status: 400 });
  }
  if (typeof data.walletAsset === "string" && data.walletAsset.length > 50) {
    return NextResponse.json({ error: "Wallet asset is too long (max 50 chars)." }, { status: 400 });
  }
  if (typeof data.walletChain === "string" && data.walletChain.length > 50) {
    return NextResponse.json({ error: "Wallet chain is too long (max 50 chars)." }, { status: 400 });
  }
  if (!data.discordUsername?.trim()) {
    return NextResponse.json({ error: "Please enter your Discord username." }, { status: 400 });
  }
  if (data.discordUsername.length > 100) {
    return NextResponse.json({ error: "Discord username is too long (max 100 chars)." }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const userId = session.user.id;
  const campaignId = data.campaignId?.trim() || null;
  if (!campaignId) {
    return NextResponse.json({ error: "Please select a campaign for your payout request" }, { status: 400 });
  }
  const roundedAmount = Math.round(amount * 100) / 100;

  // Get fee directly — avoid heavy getGamificationState which triggers streak/earnings recalculation
  const payoutUser = await db.user.findUnique({ where: { id: userId }, select: { referredById: true, bonusPercentage: true } });
  const feePercent = payoutUser?.referredById ? 4 : 9;
  const bonusPercent = payoutUser?.bonusPercentage ?? 0;

  // Compute the payout breakdown
  const breakdown = calculatePayoutBreakdown(roundedAmount, feePercent, bonusPercent);

  try {
    const result = await db.$transaction(async (tx: any) => {
      // Duplicate check: reject if ANY pending payout (REQUESTED / UNDER_REVIEW / APPROVED) exists
      // for this user+campaign. Only one in-flight payout per user per campaign.
      const pendingDuplicate = await tx.payoutRequest.findFirst({
        where: {
          userId,
          campaignId,
          status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED"] },
        },
        select: { id: true },
      });
      if (pendingDuplicate) {
        console.log(`[PAYOUT] Pending payout already exists for user ${userId} on campaign ${campaignId}`);
        throw new Error("DUPLICATE_PAYOUT");
      }

      // Fetch all approved clips and all payouts for this user
      const clips = await tx.clip.findMany({
        where: { userId, isDeleted: false, status: "APPROVED", videoUnavailable: false },
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
        throw new Error(`Amount exceeds available balance for this campaign (${formatCurrency(available)} available)`);
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
      return NextResponse.json({ error: "You already have a pending payout for this campaign. Wait for it to be reviewed before requesting another." }, { status: 409 });
    }
    if (err.message?.includes("Amount exceeds available balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    if (err.code === "P2034" || err.message?.includes("deadlock") || err.message?.includes("could not serialize")) {
      return NextResponse.json({ error: "Another request was being processed. Please try again." }, { status: 409 });
    }
    console.error("Payout creation failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
