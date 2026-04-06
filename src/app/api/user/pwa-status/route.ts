import { getSession } from "@/lib/get-session";
import { checkBanStatus } from "@/lib/check-ban";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isPWAUser: true },
  });

  return NextResponse.json({ isPWAUser: user?.isPWAUser ?? false });
}

export async function POST() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  await db.user.update({
    where: { id: session.user.id },
    data: { isPWAUser: true },
  });

  return NextResponse.json({ ok: true, isPWAUser: true });
}
