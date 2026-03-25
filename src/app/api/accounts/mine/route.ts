import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const status = req.nextUrl.searchParams.get("status") || undefined;

  if (!db) return NextResponse.json([]);

  try {
    const where: any = { userId: session.user.id };
    if (status) where.status = status;
    const accounts = await db.clipAccount.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(accounts);
  } catch {
    return NextResponse.json([]);
  }
}
