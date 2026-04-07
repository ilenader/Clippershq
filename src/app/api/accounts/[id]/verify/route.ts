import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

/**
 * Semi-automatic verification:
 * 1. Fetch the public profile page
 * 2. Check if the verification code appears in the page content
 * 3. If found → mark as VERIFIED
 * 4. If not found → return error message
 *
 * Fallback: Admin can manually verify via the review endpoint
 */

async function checkBioForCode(profileLink: string, code: string): Promise<{ found: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    console.log(`[VERIFY] Checking profile: ${profileLink} for code: ${code}`);

    const res = await fetch(profileLink, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`[VERIFY] Profile fetch failed: HTTP ${res.status}`);
      return { found: false, error: "Could not access profile page. Make sure your profile is public and try again." };
    }

    const html = await res.text();
    console.log(`[VERIFY] Profile HTML length: ${html.length} chars`);

    if (html.length < 200) {
      console.log(`[VERIFY] Response too short — may be blocked or empty`);
      return { found: false, error: "Could not read your profile. Make sure your profile is public and try again in a few minutes." };
    }

    // Case-insensitive search with trimming
    const codeUpper = code.trim().toUpperCase();
    const htmlUpper = html.toUpperCase();
    const found = htmlUpper.includes(codeUpper);

    console.log(`[VERIFY] Code "${codeUpper}" found: ${found}`);
    return { found };
  } catch (err: any) {
    console.error(`[VERIFY] Error:`, err?.message);
    if (err?.name === "AbortError") {
      return { found: false, error: "Profile check timed out. Try again or ask admin to verify manually." };
    }
    return { found: false, error: "Could not check profile automatically. Ask admin to verify manually." };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  // Rate limit: 5 verify attempts per 15 minutes per user
  const rl = checkRateLimit(`account-verify:${session.user.id}`, 5, 15 * 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const { id } = await params;

  // Find the account
  let account: any = null;

  if (db) {
    try {
      account = await db.clipAccount.findFirst({
        where: { id, userId: session.user.id },
      });
    } catch {
      // DB unavailable
    }
  }

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (account.status !== "PENDING") {
    return NextResponse.json({ error: "Account is not pending verification" }, { status: 400 });
  }

  if (!account.verificationCode) {
    return NextResponse.json({ error: "No verification code found" }, { status: 400 });
  }

  // Try automatic check
  const result = await checkBioForCode(account.profileLink, account.verificationCode);

  if (result.found) {
    // Code found → auto-approve (skip VERIFIED waiting state)
    if (db) {
      try {
        await db.clipAccount.update({
          where: { id },
          data: { status: "APPROVED", verifiedAt: new Date() },
        });
        return NextResponse.json({ verified: true, message: "Code found! Account approved." });
      } catch {
        return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  return NextResponse.json({
    verified: false,
    message: result.error || "Verification code not found in your bio. Make sure it's visible and try again.",
  });
}
