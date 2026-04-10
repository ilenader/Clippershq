import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { sendCampaignAlertEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/campaigns/[id]/notify — Send email notification to all active clippers
 * OWNER ONLY.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can send campaign notifications" }, { status: 403 });
  }

  const { id } = await params;

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const campaign = await db.campaign.findUnique({
      where: { id },
      select: { id: true, name: true, status: true, requirements: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.status !== "ACTIVE") {
      return NextResponse.json({ error: "Campaign must be ACTIVE to send notifications" }, { status: 400 });
    }

    const clippers = await db.user.findMany({
      where: { role: "CLIPPER", status: "ACTIVE", email: { not: null } },
      select: { email: true },
    });

    const emails = clippers.filter((c: any) => c.email).map((c: any) => c.email as string);

    console.log(`[NOTIFY] Sending campaign alert for: ${campaign.name} to ${emails.length} clippers`);

    let sent = 0;
    for (const email of emails) {
      try {
        await sendCampaignAlertEmail(email, campaign.name, campaign.requirements || "", campaign.id);
        sent++;
      } catch (err: any) {
        console.error(`[NOTIFY] Failed to send to ${email}:`, err?.message);
      }
      // Rate limit delay
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`[NOTIFY] Done: ${sent}/${emails.length} emails sent for campaign ${campaign.name}`);

    return NextResponse.json({ success: true, sent });
  } catch (err: any) {
    console.error("[NOTIFY] Failed:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to send notifications" }, { status: 500 });
  }
}
