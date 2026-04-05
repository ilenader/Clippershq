"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getMyPayouts() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return db.payoutRequest.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function requestPayout(data: {
  amount: number;
  walletAddress: string;
  proofNote?: string;
  proofFileUrl?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  if (data.amount <= 0) throw new Error("Amount must be positive");
  if (!data.walletAddress.trim()) throw new Error("Wallet address required");

  const payout = await db.payoutRequest.create({
    data: {
      userId: session.user.id,
      amount: data.amount,
      walletAddress: data.walletAddress,
      proofNote: data.proofNote || null,
      proofFileUrl: data.proofFileUrl || null,
    },
  });

  revalidatePath("/payouts");
  return payout;
}

export async function getMyEarnings() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const clips = await db.clip.findMany({
    where: { userId: session.user.id },
    select: { earnings: true, status: true },
  });

  const payouts = await db.payoutRequest.findMany({
    where: { userId: session.user.id },
    select: { amount: true, status: true },
  });

  const totalEarned = clips.reduce((sum: number, c: any) => sum + c.earnings, 0);
  const approvedEarnings = clips
    .filter((c: any) => c.status === "APPROVED")
    .reduce((sum: number, c: any) => sum + c.earnings, 0);
  const pendingEarnings = clips
    .filter((c: any) => c.status === "PENDING")
    .reduce((sum: number, c: any) => sum + c.earnings, 0);
  const paidOut = payouts
    .filter((p: any) => p.status === "PAID")
    .reduce((sum: number, p: any) => sum + p.amount, 0);
  const lockedInPayouts = payouts
    .filter((p: any) => ["REQUESTED", "UNDER_REVIEW", "APPROVED"].includes(p.status))
    .reduce((sum: number, p: any) => sum + p.amount, 0);

  return {
    totalEarned,
    approvedEarnings,
    pendingEarnings,
    paidOut,
    lockedInPayouts,
    available: approvedEarnings - paidOut - lockedInPayouts,
  };
}

// Admin actions
export async function getAllPayouts(statusFilter?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") throw new Error("Forbidden");

  const where = statusFilter ? { status: statusFilter as any } : {};
  return db.payoutRequest.findMany({
    where,
    include: { user: { select: { username: true, image: true, discordId: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function reviewPayout(id: string, action: "APPROVED" | "REJECTED" | "PAID" | "UNDER_REVIEW", rejectionReason?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") throw new Error("Forbidden");

  await db.payoutRequest.update({
    where: { id },
    data: {
      status: action,
      rejectionReason: action === "REJECTED" ? rejectionReason : null,
    },
  });

  revalidatePath("/admin/payouts");
  revalidatePath("/payouts");
}
