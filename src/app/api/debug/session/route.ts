import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint: shows the current session state + what DB says about the user.
 * OWNER ONLY — regular users cannot access debug info.
 */
export async function GET() {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session.user as any).role;
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = session.user;
  let dbUser = null;

  if (db) {
    try {
      dbUser = await db.user.findUnique({
        where: { id: user.id },
        select: { id: true, username: true, email: true, role: true, status: true, discordId: true, trustScore: true, createdAt: true },
      });
    } catch (err: any) {
      return NextResponse.json({
        authenticated: true,
        session: { id: user.id, name: user.name, role },
        dbError: err.message,
      });
    }
  }

  return NextResponse.json({
    authenticated: true,
    session: {
      id: user.id,
      name: user.name,
      email: user.email,
      role,
      status: (user as any).status,
      discordId: (user as any).discordId,
    },
    dbUser,
    roleMatch: dbUser ? dbUser.role === role : null,
  });
}
