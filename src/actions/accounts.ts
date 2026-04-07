"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { validateAccountLink } from "@/lib/account-validation";

export async function getMyAccounts() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return db.clipAccount.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function getApprovedAccounts() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  return db.clipAccount.findMany({
    where: { userId: session.user.id, status: "APPROVED" },
    orderBy: { createdAt: "desc" },
  });
}

export async function submitAccount(data: {
  platform: string;
  username: string;
  profileLink: string;
  followerCount?: number;
  contentNiche?: string;
  country?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  // Validate platform matches URL
  const validation = validateAccountLink(data.platform, data.profileLink);
  if (!validation.valid) {
    throw new Error(validation.error || "Profile link doesn't match the selected platform.");
  }

  const account = await db.clipAccount.create({
    data: {
      userId: session.user.id,
      platform: data.platform,
      username: data.username,
      profileLink: data.profileLink,
      followerCount: data.followerCount || null,
      contentNiche: data.contentNiche || null,
      country: data.country || null,
    },
  });

  revalidatePath("/accounts");
  return account;
}

// Admin actions
export async function getPendingAccounts() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") throw new Error("Forbidden");

  return db.clipAccount.findMany({
    where: { status: "PENDING" },
    include: { user: { select: { username: true, image: true, discordId: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAllAccounts(statusFilter?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") throw new Error("Forbidden");

  const where = statusFilter ? { status: statusFilter as any } : {};
  return db.clipAccount.findMany({
    where,
    include: { user: { select: { username: true, image: true, discordId: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function reviewAccount(id: string, action: "APPROVED" | "REJECTED", rejectionReason?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") throw new Error("Forbidden");

  await db.clipAccount.update({
    where: { id },
    data: {
      status: action,
      rejectionReason: action === "REJECTED" ? rejectionReason : null,
    },
  });

  revalidatePath("/admin/accounts");
  revalidatePath("/accounts");
}
