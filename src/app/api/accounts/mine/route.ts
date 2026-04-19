import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  // Role isolation: personal accounts are clipper-only
  const role = (session.user as any).role;
  if (role !== "CLIPPER") return NextResponse.json([]);

  const status = req.nextUrl.searchParams.get("status") || undefined;

  if (!db) return NextResponse.json([]);

  try {
    const where: any = { userId: session.user.id, deletedByUser: false };
    if (status) where.status = status;
    const accounts = await db.clipAccount.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    console.log(`[ACCOUNTS] Returning ${accounts.length} accounts. profileImageUrls:`, accounts.map((a: any) => ({ id: a.id, pic: a.profileImageUrl || "none" })));
    return NextResponse.json(accounts);
  } catch {
    return NextResponse.json([]);
  }
}
