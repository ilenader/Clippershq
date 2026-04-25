import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { withDbRetry } from "@/lib/db-retry";
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

    const clips: any[] = await withDbRetry(
      () => db.clip.findMany({
        where,
        include: {
          campaign: { select: { name: true, platform: true } },
          clipAccount: { select: { username: true, platform: true } },
          stats: { orderBy: { checkedAt: "desc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      }),
      "clips.mine",
    );

    // Clipper-facing fraud hiding. When OWNER/ADMIN flags a clip (manually or
    // automatically via tracking.ts fraud scoring), the row stays FLAGGED in
    // the DB so owners can triage it. Clippers however should see the clip
    // as PENDING — "FLAGGED" caused panic and support tickets even though
    // it's just a manual-review queue, not a rejection. Fraud fields are
    // stripped from the payload so they can't leak to the clipper's network
    // tab either. Owners/admins still see the full row via /api/clips.
    const sanitized = clips.map((c: any) => {
      const { fraudScore, fraudReasons, fraudCheckedAt, ...rest } = c;
      return {
        ...rest,
        status: c.status === "FLAGGED" ? "PENDING" : c.status,
      };
    });
    return NextResponse.json(sanitized);
  } catch {
    return NextResponse.json([]);
  }
}
