import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { checkBanStatus } from "@/lib/check-ban";
import { invalidateCache, invalidateCachePrefix } from "@/lib/cache";
import { NextRequest, NextResponse } from "next/server";

/** POST - add member to team or assign campaign */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: teamId } = await params;
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    // Add member by email
    if (body.action === "addMember" && body.email) {
      const user = await db.user.findUnique({ where: { email: body.email } });
      if (!user) return NextResponse.json({ error: "User not found. They must log in first." }, { status: 404 });

      await db.teamMember.upsert({
        where: { teamId_userId: { teamId, userId: user.id } },
        create: { teamId, userId: user.id, role: body.memberRole || "MEMBER" },
        update: { role: body.memberRole || "MEMBER" },
      });

      // Promote to ADMIN only if explicitly requested via promoteToAdmin flag
      if (body.promoteToAdmin && user.role === "CLIPPER") {
        await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
        // Drop the user's role + visible-campaigns caches so ADMIN-level access
        // takes effect on their next request, not after the 120s TTL window.
        invalidateCache(`user.role.${user.id}`);
        invalidateCachePrefix(`community.campaigns.${user.id}.`);
      }

      await logAudit({
        userId: session.user.id,
        action: "ADD_TEAM_MEMBER",
        targetType: "team",
        targetId: teamId,
        details: { memberEmail: body.email, memberId: user.id },
      });

      return NextResponse.json({ success: true });
    }

    // Assign campaign to team
    if (body.action === "assignCampaign" && body.campaignId) {
      await db.teamCampaign.upsert({
        where: { teamId_campaignId: { teamId, campaignId: body.campaignId } },
        create: { teamId, campaignId: body.campaignId },
        update: {},
      });

      // Also add all team members as CampaignAdmins
      const members = await db.teamMember.findMany({ where: { teamId }, select: { userId: true } });
      for (const member of members) {
        await db.campaignAdmin.upsert({
          where: { userId_campaignId: { userId: member.userId, campaignId: body.campaignId } },
          create: { userId: member.userId, campaignId: body.campaignId },
          update: {},
        }).catch(() => {}); // Ignore if already exists
      }

      return NextResponse.json({ success: true });
    }

    // Remove member
    if (body.action === "removeMember" && body.userId) {
      await db.teamMember.delete({
        where: { teamId_userId: { teamId, userId: body.userId } },
      }).catch(() => {});

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("Team operation failed:", err?.message);
    return NextResponse.json({ error: "Operation failed" }, { status: 500 });
  }
}

/** DELETE - delete team */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck2 = checkBanStatus(session);
  if (banCheck2) return banCheck2;

  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    await db.team.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
