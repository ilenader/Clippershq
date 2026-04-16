import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  // Role isolation: personal clip data is clipper-only
  const role = (session.user as any).role;
  if (role !== "CLIPPER") return NextResponse.json([]);

  if (!db) return NextResponse.json([]);

  const { searchParams } = new URL(request.url);
  const campaignIdsParam = searchParams.get("campaignIds");
  const campaignIds = campaignIdsParam ? campaignIdsParam.split(",").filter(Boolean) : [];

  try {
    const where: any = {
      userId: session.user.id,
      isDeleted: false,
      campaign: { isArchived: false },
    };
    if (campaignIds.length > 0) where.campaignId = { in: campaignIds };

    const clips = await db.clip.findMany({
      where,
      include: {
        campaign: { select: { name: true, platform: true } },
        clipAccount: { select: { username: true, platform: true } },
        stats: { orderBy: { checkedAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    return NextResponse.json(clips);
  } catch {
    return NextResponse.json([]);
  }
}
