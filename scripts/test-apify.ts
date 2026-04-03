/**
 * Test Apify API integration directly.
 * Run with: npx tsx scripts/test-apify.ts
 */
import "dotenv/config";
// Also load .env.local
import { config } from "dotenv";
config({ path: ".env.local" });

console.log("🔌 Testing Apify Integration\n");

// Verify env vars (show key exists but not the value)
const apiKey = process.env.APIFY_API_KEY;
const ttActor = process.env.APIFY_TIKTOK_ACTOR || "clockworks/tiktok-scraper";
const igActor = process.env.APIFY_INSTAGRAM_ACTOR || "apidojo/instagram-scraper";

console.log("Environment:");
console.log(`  APIFY_API_KEY: ${apiKey ? `set (${apiKey.slice(0, 10)}...)` : "❌ NOT SET"}`);
console.log(`  TikTok Actor: ${ttActor}`);
console.log(`  Instagram Actor: ${igActor}`);

if (!apiKey) {
  console.error("\n❌ APIFY_API_KEY is not set. Cannot test.");
  process.exit(1);
}

// Security check: ensure key is NOT in any NEXT_PUBLIC var
const publicKeys = Object.keys(process.env).filter(k => k.startsWith("NEXT_PUBLIC") && process.env[k]?.includes("apify"));
if (publicKeys.length > 0) {
  console.error(`\n❌ SECURITY ISSUE: Apify key found in public env vars: ${publicKeys.join(", ")}`);
  process.exit(1);
}
console.log("  Security: ✅ Key is NOT in any NEXT_PUBLIC_ variable\n");

const APIFY_BASE = "https://api.apify.com/v2";

// ─── Test 1: TikTok ───
async function testTikTok() {
  // Use a known public video
  const testUrl = "https://www.tiktok.com/@zachking/video/7339739874887976235";
  console.log(`── TEST 1: TikTok ──`);
  console.log(`  URL: ${testUrl}`);
  console.log(`  Actor: ${ttActor}`);
  console.log(`  Sending request...`);

  const startTime = Date.now();
  try {
    const runUrl = `${APIFY_BASE}/acts/${ttActor.replace("/", "~")}/run-sync-get-dataset-items?token=${apiKey}`;
    const res = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postURLs: [testUrl],
        resultsPerPage: 1,
        maxItems: 1,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
        shouldDownloadSubtitles: false,
        shouldDownloadSlideshowImages: false,
      }),
      signal: AbortSignal.timeout(90000),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  Response: ${res.status} ${res.statusText} (${elapsed}s)`);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log(`  ❌ Error body: ${text.slice(0, 300)}`);
      return false;
    }

    const data = await res.json();
    console.log(`  Results: ${Array.isArray(data) ? data.length : "not array"} items`);

    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      const stats = {
        views: item.playCount ?? item.viewCount ?? item.plays ?? "missing",
        likes: item.diggCount ?? item.likes ?? item.heartCount ?? "missing",
        comments: item.commentCount ?? item.comments ?? "missing",
        shares: item.shareCount ?? item.shares ?? "missing",
        createdAt: item.createTimeISO ?? item.createTime ?? "missing",
      };
      console.log(`  ✅ Stats:`, stats);

      // Print full response for field discovery
      console.log(`  Full item: ${JSON.stringify(item, null, 2).slice(0, 1000)}`);
      return true;
    } else {
      console.log(`  ❌ No items in response`);
      return false;
    }
  } catch (err: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ❌ Error (${elapsed}s): ${err.message}`);
    return false;
  }
}

// ─── Test 2: Instagram ───
async function testInstagram() {
  const testUrl = "https://www.instagram.com/reel/C1wkJCKMGIE/";
  console.log(`\n── TEST 2: Instagram ──`);
  console.log(`  URL: ${testUrl}`);
  console.log(`  Actor: ${igActor}`);
  console.log(`  Sending request...`);

  const startTime = Date.now();
  try {
    const runUrl = `${APIFY_BASE}/acts/${igActor.replace("/", "~")}/run-sync-get-dataset-items?token=${apiKey}`;
    const res = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: [testUrl],
        resultsLimit: 1,
      }),
      signal: AbortSignal.timeout(90000),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  Response: ${res.status} ${res.statusText} (${elapsed}s)`);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log(`  ❌ Error body: ${text.slice(0, 300)}`);
      return false;
    }

    const data = await res.json();
    console.log(`  Results: ${Array.isArray(data) ? data.length : "not array"} items`);

    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      const stats = {
        views: item.videoViewCount ?? item.playCount ?? "missing",
        likes: item.likesCount ?? item.likes ?? "missing",
        comments: item.commentsCount ?? item.comments ?? "missing",
        shares: "N/A (Instagram)",
        createdAt: item.timestamp ?? item.takenAtTimestamp ?? "missing",
      };
      console.log(`  ✅ Stats:`, stats);
      console.log(`  Available fields: ${Object.keys(item).join(", ")}`);
      return true;
    } else {
      console.log(`  ❌ No items in response`);
      return false;
    }
  } catch (err: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ❌ Error (${elapsed}s): ${err.message}`);
    return false;
  }
}

async function main() {
  const ttOk = await testTikTok();
  const igOk = await testInstagram();

  console.log(`\n${"═".repeat(40)}`);
  console.log(`TikTok:    ${ttOk ? "✅ Working" : "❌ Failed"}`);
  console.log(`Instagram: ${igOk ? "✅ Working" : "❌ Failed"}`);
  console.log("═".repeat(40));

  process.exit(ttOk && igOk ? 0 : 1);
}

main();
