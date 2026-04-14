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

const APIFY_IG_PROFILE_ACTOR = process.env.APIFY_IG_PROFILE_ACTOR || "apify~instagram-profile-scraper";

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

/** Helper: search html for code using multiple methods */
function searchHtmlForCode(html: string, code: string): { found: boolean; method?: string } {
  const codeUpper = code.trim().toUpperCase();
  const htmlUpper = html.toUpperCase();

  // Full text
  if (htmlUpper.includes(codeUpper)) return { found: true, method: "full-text" };

  // Meta tags
  const metaTags = html.match(/<meta[^>]+content="([^"]*)"/gi) || [];
  for (const tag of metaTags) {
    const m = tag.match(/content="([^"]*)"/i);
    if (m?.[1]?.toUpperCase().includes(codeUpper)) return { found: true, method: `meta: ${tag.substring(0, 100)}` };
  }

  // JSON-LD
  const jsonLd = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of jsonLd) {
    if (block.toUpperCase().includes(codeUpper)) return { found: true, method: "json-ld" };
  }

  // Script tags with bio
  const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const s of scripts) {
    if (/biography|"bio"/i.test(s) && s.toUpperCase().includes(codeUpper)) return { found: true, method: "script-bio" };
  }

  // Unicode unescape
  const decoded = html.replace(/\\u[\dA-Fa-f]{4}/g, (m) => String.fromCharCode(parseInt(m.slice(2), 16)));
  if (decoded.toUpperCase().includes(codeUpper)) return { found: true, method: "unicode-decoded" };

  return { found: false };
}

/** Helper: dump diagnostics about the HTML */
function logHtmlDiagnostics(html: string, code: string, profileLink: string) {
  const len = html.length;
  const codeUpper = code.trim().toUpperCase();
  const htmlUpper = html.toUpperCase();

  // First 1000 and last 500 chars
  console.log(`[VERIFY] FIRST 1000: ${html.substring(0, 1000)}`);
  console.log(`[VERIFY] LAST 500: ${html.substring(Math.max(0, len - 500))}`);

  // Login wall
  const hasLogin = /log\s*in/i.test(html.substring(0, 5000));
  const hasSignUp = /sign\s*up/i.test(html.substring(0, 5000));
  const hasCreateAccount = /create\s*an?\s*account/i.test(html.substring(0, 5000));
  console.log(`[VERIFY] Login wall: login=${hasLogin} signup=${hasSignUp} createAccount=${hasCreateAccount}`);

  // Username presence
  const username = profileLink.split("/").filter(Boolean).pop() || "";
  if (username) {
    const idx = htmlUpper.indexOf(username.toUpperCase());
    console.log(`[VERIFY] Username "${username}" ${idx >= 0 ? `FOUND at pos ${idx}: "${html.substring(idx, idx + 300)}"` : "NOT FOUND"}`);
  }

  // All meta content attributes
  const metas = html.match(/<meta[^>]+content="([^"]*)"/gi) || [];
  console.log(`[VERIFY] Meta tags (${metas.length}):`);
  metas.forEach((tag, i) => {
    const c = tag.match(/content="([^"]*)"/i);
    if (c?.[1]) console.log(`[VERIFY]   meta[${i}]: ${c[1].substring(0, 100)}`);
  });

  // Biography in JSON/scripts
  const bioMatches = html.match(/.{0,150}biography.{0,150}/gi) || [];
  if (bioMatches.length > 0) {
    console.log(`[VERIFY] "biography" contexts (${bioMatches.length}):`);
    bioMatches.forEach((m, i) => console.log(`[VERIFY]   bio[${i}]: ${m}`));
  } else {
    console.log(`[VERIFY] "biography" NOT found anywhere in HTML`);
  }

  // Snippets at intervals
  [0, 0.25, 0.5, 0.75].forEach((pct) => {
    const pos = Math.floor(len * pct);
    console.log(`[VERIFY] Snippet @${Math.round(pct * 100)}% (pos ${pos}): "${html.substring(pos, pos + 200)}"`);
  });
}

async function checkInstagramBio(profileLink: string, code: string): Promise<{ found: boolean; error?: string; debug?: string }> {
  const username = profileLink.split("/").filter(Boolean).pop() || "";
  console.log(`[VERIFY] ════ INSTAGRAM VERIFY START ════`);
  console.log(`[VERIFY] Profile: ${profileLink}`);
  console.log(`[VERIFY] Username: ${username}`);
  console.log(`[VERIFY] Code: ${code}`);

  // ── ATTEMPT 1: Apify Instagram Profile Scraper (fastest, ~4s) ──
  const apifyToken = process.env.APIFY_API_KEY || process.env.APIFY_TOKEN || "";
  if (apifyToken) {
    try {
      console.log(`[VERIFY] Trying Apify first for Instagram`);
      const apifyCtrl = new AbortController();
      const apifyTimeout = setTimeout(() => apifyCtrl.abort(), 60000);

      const apifyRes = await fetch(
        `https://api.apify.com/v2/acts/${APIFY_IG_PROFILE_ACTOR}/run-sync-get-dataset-items?token=${apifyToken}`,
        {
          method: "POST",
          signal: apifyCtrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            usernames: [username],
            resultsLimit: 1,
          }),
        }
      );
      clearTimeout(apifyTimeout);

      if (apifyRes.ok) {
        const apifyData = await apifyRes.json();
        const bio = apifyData?.[0]?.biography || apifyData?.[0]?.bio || "";
        console.log(`[VERIFY] Apify returned bio: "${String(bio).substring(0, 200)}"`);

        const codeUpper = code.trim().toUpperCase();
        const bioUpper = String(bio).toUpperCase();
        const foundInBio = bioUpper.includes(codeUpper);
        console.log(`[VERIFY] Code "${code}" found in bio: ${foundInBio}`);

        if (foundInBio) {
          console.log(`[VERIFY] ✓ Code found via Apify`);
          return { found: true };
        }
        console.log(`[VERIFY] ✗ Apify: code not found in bio`);
      } else {
        const errText = await apifyRes.text().catch(() => "");
        console.log(`[VERIFY] Apify failed: HTTP ${apifyRes.status} - ${errText.substring(0, 300)}`);
      }
    } catch (err: any) {
      console.log(`[VERIFY] Apify exception: ${err?.name} ${err?.message}`);
    }
  } else {
    console.log(`[VERIFY] No APIFY_API_KEY set — skipping Apify`);
  }

  // ── Browserless fallback ──
  const apiKey = process.env.BROWSERLESS_API_KEY || process.env.BROWSERLESS_TOKEN || "";
  if (!apiKey) {
    console.log(`[VERIFY] No BROWSERLESS_API_KEY set — no fallback available`);
    return { found: false, error: "Instagram verification failed. Ask an admin to verify manually.", debug: "Apify failed, no Browserless key" };
  }

  console.log(`[VERIFY] Apify failed, falling back to Browserless`);
  const baseUrl = process.env.BROWSERLESS_URL || "https://chrome.browserless.io";
  console.log(`[VERIFY] Browserless URL: ${baseUrl}`);

  // ── ATTEMPT 2: /content endpoint (full rendered HTML) ──
  try {
    console.log(`[VERIFY] ── Attempt 2: /content ──`);
    const contentUrl = `${baseUrl}/content?token=${apiKey}`;
    const ctrl1 = new AbortController();
    const t1 = setTimeout(() => ctrl1.abort(), 40000);

    const res1 = await fetch(contentUrl, {
      method: "POST",
      signal: ctrl1.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: profileLink,
        waitForTimeout: 6000,
        gotoOptions: { waitUntil: "networkidle0", timeout: 30000 },
      }),
    });
    clearTimeout(t1);

    console.log(`[VERIFY] /content: HTTP ${res1.status} ${res1.statusText}, content-type: ${res1.headers.get("content-type")}`);

    if (res1.ok) {
      const html = await res1.text();
      console.log(`[VERIFY] /content: ${html.length} chars`);

      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      console.log(`[VERIFY] /content title: "${titleMatch?.[1]?.substring(0, 200) || "(none)"}"`);

      if (html.length > 1000) {
        const result = searchHtmlForCode(html, code);
        if (result.found) {
          console.log(`[VERIFY] ✓ Code found via /content (${result.method})`);
          return { found: true };
        }
        console.log(`[VERIFY] ✗ /content: code not found. Dumping diagnostics...`);
        logHtmlDiagnostics(html, code, profileLink);
      } else {
        console.log(`[VERIFY] /content HTML too short (${html.length}). First 500: ${html.substring(0, 500)}`);
      }
    } else {
      const errBody = await res1.text().catch(() => "");
      console.log(`[VERIFY] /content failed: ${errBody.substring(0, 500)}`);
    }
  } catch (err: any) {
    console.log(`[VERIFY] /content exception: ${err?.name} ${err?.message}`);
  }

  // ── ATTEMPT 3: /scrape endpoint (targeted element extraction) ──
  try {
    console.log(`[VERIFY] ── Attempt 3: /scrape ──`);
    const scrapeUrl = `${baseUrl}/scrape?token=${apiKey}`;
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 35000);

    const res2 = await fetch(scrapeUrl, {
      method: "POST",
      signal: ctrl2.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: profileLink,
        elements: [
          { selector: "meta[property='og:description']" },
          { selector: "header section" },
          { selector: "span" },
        ],
        waitForTimeout: 5000,
        gotoOptions: { waitUntil: "networkidle0", timeout: 30000 },
      }),
    });
    clearTimeout(t2);

    console.log(`[VERIFY] /scrape: HTTP ${res2.status}`);

    if (res2.ok) {
      const scrapeData = await res2.json();
      const scrapeStr = JSON.stringify(scrapeData);
      console.log(`[VERIFY] /scrape result (${scrapeStr.length} chars): ${scrapeStr.substring(0, 1000)}`);

      if (scrapeStr.toUpperCase().includes(code.trim().toUpperCase())) {
        console.log(`[VERIFY] ✓ Code found via /scrape`);
        return { found: true };
      }
      console.log(`[VERIFY] ✗ /scrape: code not found in scraped elements`);
    } else {
      const errBody = await res2.text().catch(() => "");
      console.log(`[VERIFY] /scrape failed: ${errBody.substring(0, 500)}`);
    }
  } catch (err: any) {
    console.log(`[VERIFY] /scrape exception: ${err?.name} ${err?.message}`);
  }

  // ── ATTEMPT 4: /function endpoint (custom JS to extract bio) ──
  try {
    console.log(`[VERIFY] ── Attempt 4: /function ──`);
    const fnUrl = `${baseUrl}/function?token=${apiKey}`;
    const ctrl3 = new AbortController();
    const t3 = setTimeout(() => ctrl3.abort(), 35000);

    const jsCode = `module.exports=async({page})=>{await page.goto('${profileLink}',{waitUntil:'networkidle0',timeout:30000});await new Promise(r=>setTimeout(r,3000));const bio=await page.evaluate(()=>{const spans=document.querySelectorAll('header section span, header section div');let text='';spans.forEach(s=>{if(s.textContent)text+=s.textContent+' '});const ogDesc=document.querySelector('meta[property="og:description"]');if(ogDesc)text+=' OG:'+ogDesc.content;return text.substring(0,2000)});return{type:'application/json',data:JSON.stringify({bio})}};`;

    const res3 = await fetch(fnUrl, {
      method: "POST",
      signal: ctrl3.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: jsCode }),
    });
    clearTimeout(t3);

    console.log(`[VERIFY] /function: HTTP ${res3.status}`);

    if (res3.ok) {
      const fnText = await res3.text();
      console.log(`[VERIFY] /function result (${fnText.length} chars): ${fnText.substring(0, 1000)}`);

      if (fnText.toUpperCase().includes(code.trim().toUpperCase())) {
        console.log(`[VERIFY] ✓ Code found via /function`);
        return { found: true };
      }
      console.log(`[VERIFY] ✗ /function: code not found in bio extract`);
    } else {
      const errBody = await res3.text().catch(() => "");
      console.log(`[VERIFY] /function failed: ${errBody.substring(0, 500)}`);
    }
  } catch (err: any) {
    console.log(`[VERIFY] /function exception: ${err?.name} ${err?.message}`);
  }

  console.log(`[VERIFY] ════ ALL METHODS FAILED ════`);
  return {
    found: false,
    error: "Instagram verification failed. Please ask an admin to verify manually.",
    debug: "All Apify + Browserless methods failed",
  };
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
        where: { id, userId: session.user.id, deletedByUser: false },
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
        // Duplicate check: ensure no other user already has this account approved
        const duplicate = await db.clipAccount.findFirst({
          where: {
            username: account.username,
            platform: account.platform,
            status: "APPROVED",
            userId: { not: session.user.id },
            deletedByUser: false,
          },
        });
        if (duplicate) {
          console.log(`[VERIFY] ✗ Duplicate: account ${account.username}/${account.platform} already approved for user ${duplicate.userId}`);
          return NextResponse.json({ verified: false, message: "This account is already verified by another user." }, { status: 400 });
        }

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
