import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/community/campaigns
 *
 * Returns the campaigns the current user can see in the community sidebar, each
 * enriched with `totalUnread` (sum across all non-deleted messages authored by other
 * users in channels the user hasn't read through).
 *
 * Role rules:
 *   CLIPPER — only campaigns they've joined (via CampaignAccount).
 *   ADMIN   — campaigns they belong to a team on, plus any CampaignAdmin direct assignments.
 *   OWNER   — every non-archived campaign.
 *   CLIENT  — 403.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role === "CLIENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!db) return NextResponse.json({ campaigns: [] });

  try {
    // Resolve visible campaign IDs based on role.
    let campaignIds: string[] = [];
    if (role === "OWNER") {
      const rows = await db.campaign.findMany({
        where: { isArchived: false },
        select: { id: true },
      });
      campaignIds = rows.map((r: any) => r.id);
    } else if (role === "ADMIN") {
      const [teamCampaigns, directAdmins] = await Promise.all([
        db.teamCampaign.findMany({
          where: { team: { members: { some: { userId: session.user.id } } } },
          select: { campaignId: true },
        }),
        db.campaignAdmin.findMany({
          where: { userId: session.user.id },
          select: { campaignId: true },
        }),
      ]);
      campaignIds = Array.from(new Set<string>([
        ...teamCampaigns.map((t: any) => t.campaignId as string),
        ...directAdmins.map((a: any) => a.campaignId as string),
      ]));
    } else {
      // CLIPPER
      const memberships = await db.campaignAccount.findMany({
        where: { clipAccount: { userId: session.user.id } },
        select: { campaignId: true },
      });
      campaignIds = Array.from(new Set<string>(memberships.map((m: any) => m.campaignId as string)));
    }

    if (campaignIds.length === 0) return NextResponse.json({ campaigns: [] });

    // Campaign metadata (archived excluded for non-owners).
    const campaigns = await db.campaign.findMany({
      where: {
        id: { in: campaignIds },
        ...(role === "OWNER" ? {} : { isArchived: false }),
      },
      select: { id: true, name: true, imageUrl: true, platform: true, status: true },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });

    // Unread counts — one round-trip per campaign. Acceptable up to ~50 campaigns per user.
    // For each: find channels, find last-read per channel, sum messages created after lastRead.
    // ALSO: add unread ticket messages so DM activity contributes to the sidebar badge.
    const enriched = await Promise.all(
      campaigns.map(async (c: any) => {
        let totalUnread = 0;

        // Channel unread — sum across all of the campaign's channels.
        const channels = await db.channel.findMany({
          where: { campaignId: c.id },
          select: { id: true },
        });
        if (channels.length > 0) {
          const channelIds: string[] = channels.map((ch: any) => ch.id as string);
          const reads = await db.channelReadStatus.findMany({
            where: { userId: session.user.id, channelId: { in: channelIds } },
            select: { channelId: true, lastReadAt: true },
          });
          const readByChannel: Record<string, Date> = {};
          for (const r of reads) readByChannel[r.channelId] = new Date(r.lastReadAt);

          await Promise.all(
            channelIds.map(async (chId) => {
              const lastRead = readByChannel[chId] || new Date(0);
              const count = await db.channelMessage.count({
                where: {
                  channelId: chId,
                  isDeleted: false,
                  userId: { not: session.user.id },
                  createdAt: { gt: lastRead },
                },
              });
              totalUnread += count;
            }),
          );
        }

        // Ticket unread — best-effort. Clippers count DMs addressed to them (their
        // own ticket). Owners/admins count every unread clipper message across all
        // of the campaign's tickets.
        try {
          if (role === "CLIPPER") {
            const ticket = await db.campaignTicket.findFirst({
              where: { campaignId: c.id, userId: session.user.id },
              select: { id: true },
            });
            if (ticket) {
              totalUnread += await db.ticketMessage.count({
                where: {
                  ticketId: ticket.id,
                  userId: { not: session.user.id },
                  isRead: false,
                },
              });
            }
          } else if (role === "OWNER" || role === "ADMIN") {
            totalUnread += await db.ticketMessage.count({
              where: {
                ticket: { campaignId: c.id },
                userId: { not: session.user.id },
                isRead: false,
              },
            });
          }
        } catch {}

        return { ...c, totalUnread };
      }),
    );

    return NextResponse.json({ campaigns: enriched });
  } catch (err: any) {
    console.error("[COMMUNITY] campaigns GET error:", err?.message);
    return NextResponse.json({ campaigns: [] });
  }
}
