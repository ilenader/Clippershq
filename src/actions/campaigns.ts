"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function getCampaigns(statusFilter?: string) {
  const where = statusFilter ? { status: statusFilter as any } : {};
  return db.campaign.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
}

export async function getCampaign(id: string) {
  return db.campaign.findUnique({ where: { id } });
}

export async function createCampaign(data: {
  name: string;
  clientName?: string;
  platform: string;
  budget?: number;
  cpmRate?: number;
  payoutRule?: string;
  minViews?: number;
  maxPayoutPerClip?: number;
  description?: string;
  requirements?: string;
  examples?: string;
  soundLink?: string;
  assetLink?: string;
  bannedContent?: string;
  captionRules?: string;
  hashtagRules?: string;
  videoLengthMin?: number;
  videoLengthMax?: number;
  reviewTiming?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") throw new Error("Forbidden");

  const campaign = await db.campaign.create({
    data: {
      name: data.name,
      clientName: data.clientName || null,
      platform: data.platform,
      budget: data.budget || null,
      cpmRate: data.cpmRate || null,
      payoutRule: data.payoutRule || null,
      minViews: data.minViews || null,
      maxPayoutPerClip: data.maxPayoutPerClip || null,
      description: data.description || null,
      requirements: data.requirements || null,
      examples: data.examples || null,
      soundLink: data.soundLink || null,
      assetLink: data.assetLink || null,
      bannedContent: data.bannedContent || null,
      captionRules: data.captionRules || null,
      hashtagRules: data.hashtagRules || null,
      videoLengthMin: data.videoLengthMin || null,
      videoLengthMax: data.videoLengthMax || null,
      reviewTiming: data.reviewTiming || null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      status: (data.status as any) || "DRAFT",
    },
  });

  revalidatePath("/admin/campaigns");
  revalidatePath("/campaigns");
  return campaign;
}

export async function updateCampaign(id: string, data: Record<string, any>) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") throw new Error("Forbidden");

  // Clean up date fields
  if (data.startDate) data.startDate = new Date(data.startDate);
  if (data.endDate) data.endDate = new Date(data.endDate);

  const campaign = await db.campaign.update({ where: { id }, data });
  revalidatePath("/admin/campaigns");
  revalidatePath("/campaigns");
  return campaign;
}

export async function deleteCampaign(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "OWNER") throw new Error("Forbidden");

  await db.campaign.delete({ where: { id } });
  revalidatePath("/admin/campaigns");
  revalidatePath("/campaigns");
}
