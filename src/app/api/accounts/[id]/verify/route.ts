import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
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

    const res = await fetch(profileLink, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { found: false, error: "Could not access profile page. Try again or ask admin to verify manually." };
    }

    const html = await res.text();
    const found = html.includes(code);
    return { found };
  } catch (err: any) {
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
