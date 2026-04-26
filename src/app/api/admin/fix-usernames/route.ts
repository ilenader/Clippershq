import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "OWNER") return NextResponse.json({ error: "Owner only" }, { status: 403 });

  const rl = checkRoleAwareRateLimit(`fix-usernames:${session.user.id}`, 10, 60 * 60_000, role, 3);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const accounts = await db.account.findMany({
    where: { provider: "discord" },
    select: { userId: true, providerAccountId: true },
    take: 500,
  });

  let fixed = 0;
  for (const acc of accounts) {
    try {
      const user = await db.user.findUnique({
        where: { id: acc.userId },
        select: { id: true, username: true, name: true, discordId: true },
      });
      if (!user) continue;

      const updates: Record<string, string> = {};
      if (!user.discordId) {
        updates.discordId = acc.providerAccountId;
      }
      if (!user.username || user.username === "user") {
        if (user.name && user.name !== "user") {
          updates.username = user.name;
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.user.update({ where: { id: user.id }, data: updates });
        fixed++;
      }
    } catch {}
  }

  return NextResponse.json({
    total: accounts.length,
    fixed,
    message: "Fixed discordId linkage and placeholder usernames. Users get correct names on next login.",
  });
}
