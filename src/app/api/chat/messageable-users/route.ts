import { getSession } from "@/lib/get-session";
import { getMessageableUsers } from "@/lib/chat-access";
import { checkBanStatus } from "@/lib/check-ban";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/messageable-users
 * Returns users the current user is allowed to start a conversation with.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const userId = session.user.id;
  const role = (session.user as any).role;

  try {
    const users = await getMessageableUsers(userId, role);
    return NextResponse.json(users);
  } catch (err: any) {
    console.error("GET /api/chat/messageable-users error:", err?.message);
    return NextResponse.json([]);
  }
}
