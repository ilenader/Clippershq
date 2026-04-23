import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/campaigns/past — public to all authenticated non-CLIENT roles.
 * Returns campaigns with status === "PAST", not archived, sorted by updatedAt
 * desc, limited to 20. Used by the horizontal "Past campaigns" strip on
 * /campaigns. Read-only by design; the detail route blocks non-OWNER access
 * and clip-submission endpoints reject PAST campaigns.
 *
 * Returns a trimmed shape — only fields the strip card needs. Avoids leaking
 * owner-only fields (ownerCpm, agencyFee, aiKnowledge) to clippers.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role === "CLIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!db) return NextResponse.json([]);

  try {
    const campaigns = await db.campaign.findMany({
      where: { status: "PAST", isArchived: false },
      select: {
        id: true,
        name: true,
        platform: true,
        status: true,
        imageUrl: true,
        cardImageUrl: true,
        bannerImageUrl: true,
        clipperCpm: true,
        cpmRate: true,
        minViews: true,
        maxPayoutPerClip: true,
        maxClipsPerUserPerDay: true,
        budget: true,
        manualSpent: true,
        clientName: true,
        targetAudience: true,
        targetCountries: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    return NextResponse.json(campaigns);
  } catch {
    return NextResponse.json([]);
  }
}
