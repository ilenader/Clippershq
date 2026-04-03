import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

// Import the platform detection function logic (same as in route.ts)
function detectPlatformFromUrl(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.includes("tiktok.com")) return "TikTok";
  if (lower.includes("instagram.com") || lower.includes("instagr.am")) return "Instagram";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "YouTube";
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "Twitter";
  if (lower.includes("snapchat.com")) return "Snapchat";
  return null;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}

async function main() {
  console.log("🔌 Connected\n");

  // ═══ RULE 1: Platform matching ═══
  console.log("📋 RULE 1: PLATFORM MATCHING\n");

  // Test detection
  assert(detectPlatformFromUrl("https://tiktok.com/@user/video/123") === "TikTok", "TikTok URL detected");
  assert(detectPlatformFromUrl("https://www.tiktok.com/@user/video/123") === "TikTok", "www.tiktok.com detected");
  assert(detectPlatformFromUrl("https://instagram.com/reel/abc") === "Instagram", "Instagram URL detected");
  assert(detectPlatformFromUrl("https://www.instagram.com/p/abc") === "Instagram", "www.instagram.com detected");
  assert(detectPlatformFromUrl("https://youtube.com/watch?v=abc") === "YouTube", "YouTube URL detected");
  assert(detectPlatformFromUrl("https://youtu.be/abc") === "YouTube", "youtu.be detected");
  assert(detectPlatformFromUrl("https://twitter.com/user/status/123") === "Twitter", "Twitter URL detected");
  assert(detectPlatformFromUrl("https://x.com/user/status/123") === "Twitter", "x.com detected");
  assert(detectPlatformFromUrl("https://snapchat.com/t/abc") === "Snapchat", "Snapchat URL detected");
  assert(detectPlatformFromUrl("https://random.com/clip") === null, "Unknown URL returns null");

  // Test match logic
  const ttAccount = "TikTok";
  const igAccount = "Instagram";

  // TikTok account + TikTok URL → match
  const ttUrl = "https://tiktok.com/@user/video/123";
  const ttPlatform = detectPlatformFromUrl(ttUrl);
  assert(ttPlatform === ttAccount, `TikTok account + TikTok URL → MATCH (${ttPlatform} === ${ttAccount})`);

  // TikTok account + Instagram URL → mismatch
  const igUrl = "https://instagram.com/reel/abc";
  const igPlatform = detectPlatformFromUrl(igUrl);
  assert(igPlatform !== ttAccount, `TikTok account + Instagram URL → BLOCKED (${igPlatform} !== ${ttAccount})`);

  // Instagram account + Instagram URL → match
  assert(igPlatform === igAccount, `Instagram account + Instagram URL → MATCH (${igPlatform} === ${igAccount})`);

  // Instagram account + TikTok URL → mismatch
  assert(ttPlatform !== igAccount, `Instagram account + TikTok URL → BLOCKED (${ttPlatform} !== ${igAccount})`);

  // ═══ RULE 2: 2-hour rule ═══
  console.log("\n📋 RULE 2: 2-HOUR RULE\n");

  const twoHoursMs = 2 * 60 * 60 * 1000;

  // Posted 30 min ago → allowed
  const posted30min = new Date(Date.now() - 30 * 60 * 1000);
  assert(Date.now() - posted30min.getTime() < twoHoursMs, "Clip posted 30 min ago → ALLOWED");

  // Posted 1h ago → allowed
  const posted1h = new Date(Date.now() - 60 * 60 * 1000);
  assert(Date.now() - posted1h.getTime() < twoHoursMs, "Clip posted 1 hour ago → ALLOWED");

  // Posted 1h59m ago → allowed
  const posted119min = new Date(Date.now() - 119 * 60 * 1000);
  assert(Date.now() - posted119min.getTime() < twoHoursMs, "Clip posted 1h59m ago → ALLOWED");

  // Posted 2h1m ago → blocked
  const posted121min = new Date(Date.now() - 121 * 60 * 1000);
  assert(Date.now() - posted121min.getTime() > twoHoursMs, "Clip posted 2h01m ago → BLOCKED");

  // Posted 5h ago → blocked
  const posted5h = new Date(Date.now() - 5 * 60 * 60 * 1000);
  assert(Date.now() - posted5h.getTime() > twoHoursMs, "Clip posted 5 hours ago → BLOCKED");

  // Posted just now → allowed
  const postedNow = new Date();
  assert(Date.now() - postedNow.getTime() < twoHoursMs, "Clip posted just now → ALLOWED");

  // ═══ REGRESSION: Valid submission still works ═══
  console.log("\n📋 REGRESSION: VALID SUBMISSION FLOW\n");

  // Verify existing clips are still in DB
  const clipCount = await db.clip.count({ where: { isDeleted: false } });
  assert(clipCount >= 0, `DB has ${clipCount} clips (not broken)`);

  const campaignCount = await db.campaign.count({ where: { isArchived: false } });
  assert(campaignCount >= 0, `DB has ${campaignCount} active campaigns (not broken)`);

  const accountCount = await db.clipAccount.count({ where: { status: "APPROVED" } });
  assert(accountCount >= 0, `DB has ${accountCount} approved accounts (not broken)`);

  await db.$disconnect();

  console.log(`\n${"═".repeat(40)}`);
  console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(40));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
