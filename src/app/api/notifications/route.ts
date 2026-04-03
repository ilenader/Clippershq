import { getSession } from "@/lib/get-session";
import { getNotifications, getUnreadCount, markRead } from "@/lib/notifications";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ notifications: [], unreadCount: 0 }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const [notifications, unreadCount] = await Promise.all([
    getNotifications(session.user.id),
    getUnreadCount(session.user.id),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck2 = checkBanStatus(session);
  if (banCheck2) return banCheck2;

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (body.action === "markRead") {
    await markRead(session.user.id, body.ids || undefined);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
