import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/payouts/unpaid/notify
 * Send a payout reminder to a clipper via email, notification, or DM.
 * OWNER ONLY.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can send payout reminders" }, { status: 403 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userId, campaignName, unpaidAmount, action } = body;
  if (!userId || !action) {
    return NextResponse.json({ error: "userId and action are required" }, { status: 400 });
  }

  const amount = typeof unpaidAmount === "number" ? `$${unpaidAmount.toFixed(2)}` : "$0";
  const campaign = campaignName || "your campaigns";

  try {
    // ── EMAIL ──
    if (action === "email") {
      const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, username: true } });
      if (!user?.email) {
        return NextResponse.json({ error: "User has no email address" }, { status: 400 });
      }

      const { sendPayoutReminder } = await import("@/lib/email");
      await sendPayoutReminder(user.email, campaign, amount);
      console.log(`[NOTIFY-PAYOUT] Email sent to ${user.email} for ${amount} from ${campaign}`);
      return NextResponse.json({ success: true, method: "email" });
    }

    // ── NOTIFICATION ──
    if (action === "notification") {
      const { createNotification } = await import("@/lib/notifications");
      await createNotification(
        userId,
        "PAYOUT_APPROVED",
        "Payout reminder",
        `You have ${amount} unpaid from ${campaign}. Request your payout to get paid.`,
        { campaignName, unpaidAmount },
      );
      console.log(`[NOTIFY-PAYOUT] Notification sent to user ${userId} for ${amount}`);
      return NextResponse.json({ success: true, method: "notification" });
    }

    // ── DM ──
    if (action === "dm") {
      const ownerId = session.user.id;

      // Find or create conversation
      const existing = await db.conversation.findFirst({
        where: {
          AND: [
            { participants: { some: { userId: ownerId } } },
            { participants: { some: { userId } } },
          ],
        },
        select: { id: true },
      });

      let conversationId: string;
      if (existing) {
        conversationId = existing.id;
      } else {
        const epoch = new Date(0);
        const convo = await db.conversation.create({
          data: {
            participants: {
              create: [
                { userId: ownerId },
                { userId, lastReadAt: epoch },
              ],
            },
          },
          select: { id: true },
        });
        conversationId = convo.id;
      }

      // Send message
      const content = `Hey! You have ${amount} unpaid from ${campaign}. Please head to your Payouts page and request your payout so we can process it for you. Thanks!`;
      await db.message.create({
        data: { conversationId, senderId: ownerId, content },
      });
      await db.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });

      console.log(`[NOTIFY-PAYOUT] DM sent to user ${userId} in conversation ${conversationId}`);
      return NextResponse.json({ success: true, method: "dm", conversationId });
    }

    return NextResponse.json({ error: "Invalid action. Use email, notification, or dm." }, { status: 400 });
  } catch (err: any) {
    console.error("[NOTIFY-PAYOUT] Error:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to send reminder" }, { status: 500 });
  }
}
