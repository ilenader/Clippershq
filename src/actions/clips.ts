"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getMyClips() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return db.clip.findMany({
    where: { userId: session.user.id },
    include: {
      campaign: { select: { name: true, platform: true } },
      clipAccount: { select: { username: true, platform: true } },
      stats: { orderBy: { checkedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function submitClip(data: {
  campaignId: string;
  clipAccountId: string;
  clipUrl: string;
  note?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // Validate account is approved and belongs to user
  const account = await db.clipAccount.findFirst({
    where: { id: data.clipAccountId, userId: session.user.id, status: "APPROVED" },
  });
  if (!account) throw new Error("Account not approved or not found");

  // Check URL is valid
  try {
    new URL(data.clipUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  // Check duplicate URL for same campaign
  const existing = await db.clip.findFirst({
    where: { clipUrl: data.clipUrl, campaignId: data.campaignId },
  });
  if (existing) throw new Error("This clip URL has already been submitted for this campaign");

  // Check if clip URL is used in another campaign by this user
  const existingOther = await db.clip.findFirst({
    where: { clipUrl: data.clipUrl, userId: session.user.id },
  });
  if (existingOther) throw new Error("This clip URL has already been submitted to another campaign");

  const clip = await db.clip.create({
    data: {
      userId: session.user.id,
      campaignId: data.campaignId,
      clipAccountId: data.clipAccountId,
      clipUrl: data.clipUrl,
      note: data.note || null,
    },
  });

  // Create initial mock stats
  await db.clipStat.create({
    data: {
      clipId: clip.id,
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    },
  });

  revalidatePath("/clips");
  return clip;
}

// Admin actions
export async function getAllClips(statusFilter?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") throw new Error("Forbidden");

  const where = statusFilter ? { status: statusFilter as any } : {};
  return db.clip.findMany({
    where,
    include: {
      user: { select: { username: true, image: true, discordId: true } },
      campaign: { select: { name: true, platform: true } },
      clipAccount: { select: { username: true, platform: true } },
      stats: { orderBy: { checkedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function reviewClip(id: string, action: "APPROVED" | "REJECTED" | "FLAGGED", rejectionReason?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") throw new Error("Forbidden");

  await db.clip.update({
    where: { id },
    data: {
      status: action,
      rejectionReason: action === "REJECTED" ? rejectionReason : null,
    },
  });

  revalidatePath("/admin/clips");
  revalidatePath("/clips");
}
