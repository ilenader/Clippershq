import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const role = (session.user as any).role;
  // Only OWNER can view all users
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const users = await db.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        email: true,
        image: true,
        role: true,
        status: true,
        discordId: true,
        createdAt: true,
      },
    });
    return NextResponse.json(users);
  } catch {
    return NextResponse.json([]);
  }
}
