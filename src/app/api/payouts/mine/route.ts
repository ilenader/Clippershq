import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  if (!db) return NextResponse.json([]);

  try {
    const payouts = await db.payoutRequest.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(payouts);
  } catch {
    return NextResponse.json([]);
  }
}
