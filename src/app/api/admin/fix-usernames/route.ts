import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as any).role !== "OWNER") return NextResponse.json({ error: "Owner only" }, { status: 403 });
  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const users = await db.user.findMany({
    where: { discordId: { not: null } },
    select: { id: true, username: true, name: true },
    take: 500,
  });

  let fixed = 0;
  for (const u of users) {
    if (!u.username || u.username === "user") {
      if (u.name && u.name !== "user") {
        await db.user.update({
          where: { id: u.id },
          data: { username: u.name },
        }).catch(() => {});
        fixed++;
      }
    }
  }

  return NextResponse.json({ total: users.length, fixed });
}
