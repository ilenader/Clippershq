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

  // Determine Browserless base URL (some accounts use different hosts)
  const baseUrl = process.env.BROWSERLESS_URL || "https://chrome.browserless.io";
  const browserlessUrl = `${baseUrl}/content?token=${apiKey}`;
  console.log(`[VERIFY] Browserless URL: ${baseUrl}/content?token=***`);
  console.log(`[VERIFY] Instagram profile: ${profileLink}`);
  console.log(`[VERIFY] Looking for code: ${code}`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40000);

    const res = await fetch(browserlessUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: profileLink,
        waitForTimeout: 6000,
        gotoOptions: { waitUntil: "networkidle0", timeout: 30000 },
      }),
    });
    clearTimeout(timeout);

    console.log(`[VERIFY] Browserless response: HTTP ${res.status} ${res.statusText}`);
    console.log(`[VERIFY] Response headers content-type: ${res.headers.get("content-type")}`);

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(empty)");
      console.log(`[VERIFY] Browserless ERROR body (first 500): ${errBody.substring(0, 500)}`);
      return {
        found: false,
        error: "Could not load Instagram profile. Make sure your profile is public and try again.",
        debug: `Browserless HTTP ${res.status}: ${errBody.substring(0, 100)}`,
      };
    }

    const html = await res.text();
    const len = html.length;
    console.log(`[VERIFY] Browserless returned ${len} chars`);
    console.log(`[VERIFY] First 500 chars: ${html.substring(0, 500)}`);

    // Log page title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    console.log(`[VERIFY] Page title: "${titleMatch?.[1]?.substring(0, 200) || "(no title)"}"`);

    // Check for login wall
    const hasLogin = /log\s*in/i.test(html.substring(0, 5000));
    const hasSignUp = /sign\s*up/i.test(html.substring(0, 5000));
    console.log(`[VERIFY] Login wall indicators: hasLogin=${hasLogin}, hasSignUp=${hasSignUp}`);

    if (len < 1000) {
      console.log(`[VERIFY] HTML too short (${len} chars) — likely blocked or error page`);
      return {
        found: false,
        error: "Could not load your Instagram profile. Make sure it's public and try again in a minute.",
        debug: `HTML too short: ${len}`,
      };
    }

    if (hasLogin && hasSignUp && len < 50000) {
      console.log(`[VERIFY] Instagram login wall detected`);
      return {
        found: false,
        error: "Instagram is blocking access. Make sure your profile is set to PUBLIC and try again. If it keeps failing, ask an admin to verify manually.",
        debug: "Login wall detected",
      };
    }

    const codeUpper = code.trim().toUpperCase();
    const htmlUpper = html.toUpperCase();

    // ── Method 1: Full text search ──
    if (htmlUpper.includes(codeUpper)) {
      console.log(`[VERIFY] ✓ Code found via full-text search`);
      return { found: true };
    }

    // ── Method 2: Search all meta tag contents ──
    const metaTags = html.match(/<meta[^>]+content="([^"]*)"/gi) || [];
    for (const tag of metaTags) {
      const contentMatch = tag.match(/content="([^"]*)"/i);
      if (contentMatch?.[1]?.toUpperCase().includes(codeUpper)) {
        console.log(`[VERIFY] ✓ Code found in meta tag: ${tag.substring(0, 150)}`);
        return { found: true };
      }
    }

    // ── Method 3: Search all JSON-LD blocks ──
    const jsonLdBlocks = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of jsonLdBlocks) {
      if (block.toUpperCase().includes(codeUpper)) {
        console.log(`[VERIFY] ✓ Code found in JSON-LD block`);
        return { found: true };
      }
    }

    // ── Method 4: Search all script tags for "biography" or "bio" ──
    const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const script of scriptBlocks) {
      if (/biography|"bio"/i.test(script) && script.toUpperCase().includes(codeUpper)) {
        console.log(`[VERIFY] ✓ Code found in script tag with bio data`);
        return { found: true };
      }
    }

    // ── Method 5: Decoded/unescaped search ──
    // Instagram sometimes HTML-encodes or unicode-escapes content
    const decoded = html.replace(/\\u[\dA-Fa-f]{4}/g, (m) => String.fromCharCode(parseInt(m.slice(2), 16)));
    if (decoded.toUpperCase().includes(codeUpper)) {
      console.log(`[VERIFY] ✓ Code found after unicode-unescape`);
      return { found: true };
    }

    // ── NOT FOUND — dump diagnostic snippets ──
    console.log(`[VERIFY] ✗ Code "${codeUpper}" NOT found by any method`);

    // Log snippets at 0%, 25%, 50%, 75%, near end
    const positions = [0, Math.floor(len * 0.25), Math.floor(len * 0.5), Math.floor(len * 0.75), Math.max(0, len - 200)];
    positions.forEach((pos, i) => {
      console.log(`[VERIFY] Snippet ${i} (pos ${pos}): "${html.substring(pos, pos + 200)}"`);
    });

    // Log bio-area if found
    const bioIdx = htmlUpper.indexOf("BIOGRAPHY");
    if (bioIdx >= 0) {
      console.log(`[VERIFY] BIOGRAPHY found at pos ${bioIdx}: "${html.substring(Math.max(0, bioIdx - 50), bioIdx + 300)}"`);
    } else {
      console.log(`[VERIFY] "BIOGRAPHY" keyword NOT found in HTML`);
    }

    // Log username area
    const username = profileLink.split("/").filter(Boolean).pop() || "";
    if (username) {
      const usernameIdx = htmlUpper.indexOf(username.toUpperCase());
      if (usernameIdx >= 0) {
        console.log(`[VERIFY] Username "${username}" found at pos ${usernameIdx}: "${html.substring(usernameIdx, usernameIdx + 300)}"`);
      } else {
        console.log(`[VERIFY] Username "${username}" NOT found in HTML`);
      }
    }

    return {
      found: false,
      error: "Verification code not found in your Instagram bio. Make sure the code is in your bio, your profile is PUBLIC, wait 30 seconds, and try again.",
      debug: `${len} chars rendered, code not found, title: ${titleMatch?.[1]?.substring(0, 80) || "none"}`,
    };
  } catch (err: any) {
    console.error(`[VERIFY] Browserless EXCEPTION: name=${err?.name} message=${err?.message}`);
    console.error(`[VERIFY] Stack:`, err?.stack?.substring(0, 300));
    if (err?.name === "AbortError") {
      return { found: false, error: "Instagram profile check timed out (40s). Try again or ask admin to verify manually.", debug: "Browserless timeout" };
    }
    return {
      found: false,
      error: "Could not load Instagram profile. Make sure your profile is public and try again.",
      debug: `Exception: ${err?.message?.substring(0, 100)}`,
    };
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
// Uses the STORED platform from the database, NOT auto-detected from URL.

async function checkBioForCode(profileLink: string, code: string, storedPlatform: string): Promise<{ found: boolean; error?: string; debug?: string }> {
  const platform = storedPlatform.toLowerCase();
  const urlPlatform = detectPlatform(profileLink);
  console.log(`[VERIFY] ─── START ───`);
  console.log(`[VERIFY] Stored platform: ${storedPlatform} (${platform})`);
  console.log(`[VERIFY] URL-detected platform: ${urlPlatform}`);
  console.log(`[VERIFY] Profile: ${profileLink}`);
  console.log(`[VERIFY] Code: ${code}`);

  // Mismatch check: if the URL doesn't match the stored platform, reject
  if (urlPlatform !== "unknown" && urlPlatform !== platform) {
    console.log(`[VERIFY] ✗ Platform mismatch: stored=${platform}, URL=${urlPlatform}`);
    return {
      found: false,
      error: `This profile link is for ${urlPlatform}, not ${storedPlatform}. Please remove this account and re-add it with the correct platform.`,
      debug: `Platform mismatch: ${platform} vs ${urlPlatform}`,
    };
  }

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
  const result = await checkBioForCode(account.profileLink, account.verificationCode, account.platform);

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
