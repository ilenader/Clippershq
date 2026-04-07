import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { validateAccountLink } from "@/lib/account-validation";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

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

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  // Rate limit: 5 account creations per hour per user
  const rl = checkRateLimit(`account-add:${session.user.id}`, 5, 3_600_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  let data: any;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!data.platform || !data.username || !data.profileLink) {
    return NextResponse.json({ error: "Platform, username, and profile link are required" }, { status: 400 });
  }

  // Validate platform matches the profile link
  const validation = validateAccountLink(data.platform, data.profileLink);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  // Check for a soft-deleted account with the same profileLink — reactivate it
  try {
    const existing = await db.clipAccount.findFirst({
      where: { userId: session.user.id, profileLink: data.profileLink, deletedByUser: true },
    });
    if (existing) {
      const reactivated = await db.clipAccount.update({
        where: { id: existing.id },
        data: {
          deletedByUser: false,
          deletedAt: null,
          username: data.username,
          platform: data.platform,
          status: existing.status === "APPROVED" ? "APPROVED" : "PENDING",
          verificationCode: existing.status === "APPROVED" ? existing.verificationCode : generateVerificationCode(),
        },
      });
      return NextResponse.json({ ...reactivated, verificationCode: reactivated.verificationCode }, { status: 201 });
    }
  } catch {}

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
