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

/**
 * Detect platform from profile URL.
 */
function detectPlatform(url: string): "tiktok" | "instagram" | "youtube" | "unknown" {
  const l = url.toLowerCase();
  if (l.includes("tiktok.com")) return "tiktok";
  if (l.includes("instagram.com") || l.includes("instagr.am")) return "instagram";
  if (l.includes("youtube.com") || l.includes("youtu.be")) return "youtube";
  return "unknown";
}

// ─── Instagram: Browserless (headless Chrome) ──────────────

async function checkInstagramBio(profileLink: string, code: string): Promise<{ found: boolean; error?: string; debug?: string }> {
  const apiKey = process.env.BROWSERLESS_API_KEY || process.env.BROWSERLESS_TOKEN || "";
  if (!apiKey) {
    console.log(`[VERIFY] No BROWSERLESS_API_KEY set — cannot verify Instagram`);
    return { found: false, error: "Instagram verification is not configured. Ask an admin to verify manually.", debug: "No BROWSERLESS_API_KEY" };
  }

  console.log(`[VERIFY] Using Browserless for Instagram: ${profileLink}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);

    const res = await fetch(`https://chrome.browserless.io/content?token=${apiKey}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: profileLink,
        waitForTimeout: 5000,
        gotoOptions: { waitUntil: "networkidle0", timeout: 30000 },
      }),
    });
    clearTimeout(timeout);

    console.log(`[VERIFY] Browserless HTTP ${res.status}`);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.log(`[VERIFY] Browserless error: ${errText.substring(0, 300)}`);
      return { found: false, error: "Could not load Instagram profile. Make sure your profile is public and try again.", debug: `Browserless HTTP ${res.status}` };
    }

    const html = await res.text();
    console.log(`[VERIFY] Browserless rendered HTML: ${html.length} chars`);

    if (html.length < 1000) {
      console.log(`[VERIFY] Rendered HTML too short: ${html.substring(0, 500)}`);
      return { found: false, error: "Could not load Instagram profile. Make sure your profile is public and try again.", debug: `Rendered HTML too short: ${html.length}` };
    }

    const codeUpper = code.trim().toUpperCase();
    const htmlUpper = html.toUpperCase();

    // Log a snippet around "biography" or the bio area
    const bioIdx = htmlUpper.indexOf("BIOGRAPHY");
    const headerIdx = htmlUpper.indexOf("HEADER");
    const snippetStart = bioIdx >= 0 ? Math.max(0, bioIdx - 100) : headerIdx >= 0 ? Math.max(0, headerIdx - 100) : 0;
    if (snippetStart > 0) {
      console.log(`[VERIFY] Bio-area snippet: "${html.substring(snippetStart, snippetStart + 500)}"`);
    }

    // Primary: search the full rendered HTML
    if (htmlUpper.includes(codeUpper)) {
      console.log(`[VERIFY] ✓ Code "${codeUpper}" found in Browserless rendered HTML`);
      return { found: true };
    }

    // Also try with the code surrounded by common text patterns
    // Instagram may wrap the bio text in spans or divs
    console.log(`[VERIFY] ✗ Code "${codeUpper}" NOT found in rendered HTML`);

    // Log the page title for context
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) console.log(`[VERIFY] Page title: "${titleMatch[1].substring(0, 150)}"`);

    return {
      found: false,
      error: "Verification code not found in your Instagram bio. Make sure the code is in your bio, your profile is PUBLIC, wait 30 seconds, and try again.",
    };
  } catch (err: any) {
    console.error(`[VERIFY] Browserless exception:`, err?.name, err?.message);
    if (err?.name === "AbortError") {
      return { found: false, error: "Instagram profile check timed out. Try again or ask admin to verify manually.", debug: "Browserless timeout" };
    }
    return { found: false, error: "Could not load Instagram profile. Make sure your profile is public and try again." };
  }
}

// ─── TikTok / YouTube / fallback: plain fetch ─────────────

async function checkBioPlainFetch(profileLink: string, code: string, platform: string): Promise<{ found: boolean; error?: string; debug?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(profileLink, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);

    console.log(`[VERIFY] Plain fetch HTTP ${res.status} for ${platform}`);

    if (!res.ok) {
      return { found: false, error: `Could not access your profile (HTTP ${res.status}). Make sure your profile is public.`, debug: `HTTP ${res.status}` };
    }

    const html = await res.text();
    console.log(`[VERIFY] HTML length: ${html.length} chars`);

    if (html.length < 500) {
      return { found: false, error: "Could not read your profile. Make sure it's public and try again.", debug: `HTML too short: ${html.length}` };
    }

    const codeUpper = code.trim().toUpperCase();
    const htmlUpper = html.toUpperCase();

    if (htmlUpper.includes(codeUpper)) {
      console.log(`[VERIFY] ✓ Code found in raw HTML`);
      return { found: true };
    }

    console.log(`[VERIFY] ✗ Code "${codeUpper}" not found in plain fetch HTML`);
    return { found: false, error: "Verification code not found in your bio. Make sure it's visible and try again." };
  } catch (err: any) {
    console.error(`[VERIFY] Plain fetch exception:`, err?.name, err?.message);
    if (err?.name === "AbortError") {
      return { found: false, error: "Profile check timed out. Try again or ask admin to verify manually." };
    }
    return { found: false, error: "Could not check profile. Ask admin to verify manually." };
  }
}

// ─── Router: pick the right method per platform ────────────

async function checkBioForCode(profileLink: string, code: string): Promise<{ found: boolean; error?: string; debug?: string }> {
  const platform = detectPlatform(profileLink);
  console.log(`[VERIFY] ─── START ───`);
  console.log(`[VERIFY] Platform: ${platform}`);
  console.log(`[VERIFY] Profile: ${profileLink}`);
  console.log(`[VERIFY] Code: ${code}`);

  let result: { found: boolean; error?: string; debug?: string };

  if (platform === "instagram") {
    result = await checkInstagramBio(profileLink, code);
  } else {
    result = await checkBioPlainFetch(profileLink, code, platform);
  }

  console.log(`[VERIFY] Result: found=${result.found}, error=${result.error || "none"}`);
  console.log(`[VERIFY] ─── END ───`);
  return result;
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

  console.log(`[VERIFY] Account: ${account.id}, platform: ${account.platform}, link: ${account.profileLink}, code: ${account.verificationCode}`);

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
        console.log(`[VERIFY] ✓ Account ${account.id} approved!`);
        return NextResponse.json({ verified: true, message: "Code found! Account approved." });
      } catch (dbErr: any) {
        console.error(`[VERIFY] DB update failed:`, dbErr?.message);
        return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
  }

  console.log(`[VERIFY] ✗ Verification failed for account ${account.id}: ${result.error || "code not found"}`);

  return NextResponse.json({
    verified: false,
    message: result.error || "Verification code not found in your bio. Make sure it's visible and try again.",
    debug: result.debug || null,
  });
}
