import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  if (!db) return NextResponse.json([]);

  try {
    const clips = await db.clip.findMany({
      where: {
        userId: session.user.id,
        campaign: { isArchived: false },
      },
      include: {
        campaign: { select: { name: true, platform: true } },
        clipAccount: { select: { username: true, platform: true } },
        stats: { orderBy: { checkedAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(clips);
  } catch {
    return NextResponse.json([]);
  }
}
