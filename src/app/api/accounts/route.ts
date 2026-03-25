import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

function generateVerificationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const role = (session.user as any).role;
  // Only OWNER can view all accounts. Admin blocked from global accounts view.
  if (role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") || undefined;

  if (!db) return NextResponse.json([]);

  try {
    const where = status ? { status: status as any } : {};
    const accounts = await db.clipAccount.findMany({
      where,
      include: { user: { select: { username: true, image: true, discordId: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(accounts);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let data: any;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!data.platform || !data.username || !data.profileLink) {
    return NextResponse.json({ error: "Platform, username, and profile link are required" }, { status: 400 });
  }

  const verificationCode = generateVerificationCode();

  const accountData: Record<string, any> = {
    userId: session.user.id,
    platform: data.platform,
    username: data.username,
    profileLink: data.profileLink,
    verificationCode,
    status: "PENDING",
  };
  if (data.followerCount) accountData.followerCount = parseInt(data.followerCount);
  if (data.contentNiche) accountData.contentNiche = data.contentNiche;
  if (data.country) accountData.country = data.country;

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  try {
    const account = await db.clipAccount.create({
      data: accountData,
    });
    return NextResponse.json({ ...account, verificationCode }, { status: 201 });
  } catch (err: any) {
    console.error("DB account create failed:", err?.message);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}
