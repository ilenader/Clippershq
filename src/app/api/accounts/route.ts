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

  // Only clippers can add accounts
  const role = (session.user as any).role;
  if (role === "CLIENT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: 5 account creations per hour per user
  const rl = checkRateLimit(`account-add:${session.user.id}`, 5, 3_600_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  let data: any;
  try {
    data = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!data.platform || !data.username) {
    return NextResponse.json({ error: "Platform and username are required" }, { status: 400 });
  }

  // Platform allowlist — match casing used elsewhere in the app (TikTok/Instagram/YouTube)
  const ALLOWED_PLATFORMS = ["TikTok", "Instagram", "YouTube"];
  if (typeof data.platform !== "string" || !ALLOWED_PLATFORMS.includes(data.platform)) {
    return NextResponse.json({ error: "Platform must be one of: TikTok, Instagram, YouTube" }, { status: 400 });
  }

  if (typeof data.username !== "string" || data.username.length > 100) {
    return NextResponse.json({ error: "Username is too long (max 100 chars)" }, { status: 400 });
  }

  // Strip @ prefix from username
  data.username = data.username.replace(/^@/, "").trim();
  if (!data.username) {
    return NextResponse.json({ error: "Please enter a valid username" }, { status: 400 });
  }

  // Auto-build profileLink if not provided
  if (!data.profileLink) {
    const clean = data.username;
    if (data.platform === "TikTok") data.profileLink = `https://www.tiktok.com/@${clean}`;
    else if (data.platform === "Instagram") data.profileLink = `https://www.instagram.com/${clean}`;
    else if (data.platform === "YouTube") data.profileLink = `https://www.youtube.com/@${clean}`;
  }

  if (!data.profileLink) {
    return NextResponse.json({ error: "Unsupported platform" }, { status: 400 });
  }

  // Validate platform matches the profile link
  const validation = validateAccountLink(data.platform, data.profileLink);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  // Check 1: Same user already has this username+platform (case-insensitive)
  try {
    const existingOwn = await db.clipAccount.findFirst({
      where: {
        userId: session.user.id,
        username: { equals: data.username, mode: "insensitive" },
        platform: data.platform,
        deletedByUser: false,
      },
    });
    if (existingOwn) {
      return NextResponse.json({ error: "You already have this account added." }, { status: 400 });
    }
  } catch {}

  // Check 2: Another user already has an APPROVED account with same username+platform (case-insensitive)
  try {
    const existingOther = await db.clipAccount.findFirst({
      where: {
        username: { equals: data.username, mode: "insensitive" },
        platform: data.platform,
        status: "APPROVED",
        userId: { not: session.user.id },
        deletedByUser: false,
      },
    });
    if (existingOther) {
      return NextResponse.json({ error: "This account is already claimed by another clipper." }, { status: 400 });
    }
  } catch {}

  // Check for a soft-deleted account with the same username+platform — reactivate it
  // Always reset to PENDING with a fresh verification code so the user re-proves ownership
  try {
    const existing = await db.clipAccount.findFirst({
      where: {
        userId: session.user.id,
        username: { equals: data.username, mode: "insensitive" },
        platform: data.platform,
        deletedByUser: true,
      },
    });
    if (existing) {
      const newCode = generateVerificationCode();
      const reactivated = await db.clipAccount.update({
        where: { id: existing.id },
        data: {
          deletedByUser: false,
          deletedAt: null,
          username: data.username,
          platform: data.platform,
          profileLink: data.profileLink || existing.profileLink,
          status: "PENDING",
          verificationCode: newCode,
          verifiedAt: null,
        },
      });
      return NextResponse.json({ ...reactivated, verificationCode: newCode }, { status: 201 });
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
