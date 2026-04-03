/**
 * This script traces the EXACT clip submission + visibility flow
 * by reproducing what the API endpoints do, step by step.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

async function main() {
  console.log("🔌 Connected to DB\n");

  const PREFIX = "trace-";

  // Clean
  await db.clipStat.deleteMany({ where: { clip: { userId: { startsWith: PREFIX } } } }).catch(() => {});
  await db.clip.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {});
  await db.clipAccount.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {});
  await db.campaign.deleteMany({ where: { name: { startsWith: "TRACE-" } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {});

  // 1. Create users
  const owner = await db.user.create({ data: { id: PREFIX + "owner", username: "TraceOwner", role: "OWNER", email: "traceowner@test.com" } });
  const clipper = await db.user.create({ data: { id: PREFIX + "clipper", username: "TraceClipper", role: "CLIPPER", email: "traceclipper@test.com" } });
  const admin = await db.user.create({ data: { id: PREFIX + "admin", username: "TraceAdmin", role: "ADMIN", email: "traceadmin@test.com" } });
  console.log("✅ Users created: owner, clipper, admin");

  // 2. Create campaign
  const campaign = await db.campaign.create({
    data: {
      name: "TRACE-Test Campaign",
      platform: "TikTok",
      status: "ACTIVE",
      cpmRate: 2.0,
      minViews: 1000,
      maxPayoutPerClip: 50,
      createdById: owner.id,
      isArchived: false,
    },
  });
  console.log(`✅ Campaign created: ${campaign.id} | isArchived=${campaign.isArchived}`);

  // 3. Create approved account for clipper
  const account = await db.clipAccount.create({
    data: {
      userId: clipper.id,
      platform: "TikTok",
      username: "trace_clipper_tt",
      profileLink: "https://tiktok.com/@tracetest",
      status: "APPROVED",
      verificationCode: "TR01",
    },
  });
  console.log(`✅ Account created: ${account.id} | status=${account.status}`);

  // 4. Submit 2 clips (simulating POST /api/clips)
  const clip1 = await db.clip.create({
    data: {
      userId: clipper.id,
      campaignId: campaign.id,
      clipAccountId: account.id,
      clipUrl: "https://tiktok.com/@tracetest/video/trace001",
      status: "PENDING",
      earnings: 0,
    },
  });
  await db.clipStat.create({ data: { clipId: clip1.id, views: 0, likes: 0, comments: 0, shares: 0 } });

  const clip2 = await db.clip.create({
    data: {
      userId: clipper.id,
      campaignId: campaign.id,
      clipAccountId: account.id,
      clipUrl: "https://tiktok.com/@tracetest/video/trace002",
      status: "PENDING",
      earnings: 0,
    },
  });
  await db.clipStat.create({ data: { clipId: clip2.id, views: 0, likes: 0, comments: 0, shares: 0 } });
  console.log(`✅ 2 clips submitted: ${clip1.id}, ${clip2.id}`);

  // 5. SIMULATE /api/clips/mine (clipper view)
  console.log("\n── SIMULATING /api/clips/mine (clipper view) ──");
  const clipperClips = await db.clip.findMany({
    where: {
      userId: clipper.id,
      isDeleted: false,
      campaign: { isArchived: false },
    },
    include: {
      campaign: { select: { name: true, platform: true } },
      clipAccount: { select: { username: true, platform: true } },
      stats: { orderBy: { checkedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
  console.log(`  Result: ${clipperClips.length} clips`);
  for (const c of clipperClips) {
    console.log(`    ${c.id} | ${c.clipUrl} | status=${c.status} | campaign=${c.campaign?.name}`);
  }
  if (clipperClips.length === 2) console.log("  ✅ Clipper sees both clips");
  else console.log(`  ❌ Clipper sees ${clipperClips.length} clips (expected 2)`);

  // 6. SIMULATE /api/clips (owner view)
  console.log("\n── SIMULATING /api/clips (owner view) ──");
  const ownerClips = await db.clip.findMany({
    where: {
      isDeleted: false,
      campaign: { isArchived: false },
    },
    include: {
      user: { select: { username: true, image: true, discordId: true, trustScore: true } },
      campaign: { select: { name: true, platform: true, createdById: true, isArchived: true } },
      clipAccount: { select: { username: true, platform: true } },
      stats: { orderBy: { checkedAt: "desc" }, take: 3 },
    },
    orderBy: { createdAt: "desc" },
  });
  // Filter to only our test clips
  const testOwnerClips = ownerClips.filter(c => c.campaignId === campaign.id);
  console.log(`  Result: ${testOwnerClips.length} clips (from total ${ownerClips.length})`);
  for (const c of testOwnerClips) {
    console.log(`    ${c.id} | ${c.user?.username} | ${c.campaign?.name} | status=${c.status}`);
  }
  if (testOwnerClips.length === 2) console.log("  ✅ Owner sees both clips");
  else console.log(`  ❌ Owner sees ${testOwnerClips.length} clips (expected 2)`);

  // 7. DUPLICATE CHECK
  console.log("\n── SIMULATING DUPLICATE CHECK ──");
  const dup = await db.clip.findFirst({
    where: { clipUrl: "https://tiktok.com/@tracetest/video/trace001", campaignId: campaign.id },
  });
  if (dup) console.log("  ✅ Duplicate correctly detected — would block re-upload");
  else console.log("  ❌ Duplicate NOT detected — re-upload would incorrectly succeed");

  // 8. Verify original still visible after dup check
  const afterDup = await db.clip.findMany({
    where: { userId: clipper.id, isDeleted: false, campaign: { isArchived: false } },
  });
  console.log(`  After duplicate check, clipper clips: ${afterDup.length}`);
  if (afterDup.length === 2) console.log("  ✅ Originals still visible");
  else console.log("  ❌ Original clips disappeared!");

  // 9. Test that real user's clips are also correct
  console.log("\n── CHECKING REAL USER DATA ──");
  const realUsers = await db.user.findMany({ where: { id: { not: { startsWith: PREFIX } } }, select: { id: true, username: true, role: true } });
  for (const u of realUsers) {
    if (u.id.startsWith("dev-")) continue;
    const clips = await db.clip.findMany({
      where: { userId: u.id, isDeleted: false, campaign: { isArchived: false } },
    });
    console.log(`  ${u.username} (${u.role}): ${clips.length} clips visible`);
  }

  // 10. Check what ACTUAL /api/clips response would be (owner, no filters)
  console.log("\n── FULL OWNER RESPONSE (no filters, including all users) ──");
  const fullOwner = await db.clip.findMany({
    where: { isDeleted: false, campaign: { isArchived: false } },
    include: {
      user: { select: { username: true, trustScore: true } },
      campaign: { select: { name: true, isArchived: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  console.log(`  Total clips owner would see: ${fullOwner.length}`);
  for (const c of fullOwner) {
    console.log(`    ${c.id} | ${c.user?.username} | ${c.campaign?.name} | status=${c.status} | archived=${c.campaign?.isArchived}`);
  }

  // Cleanup
  await db.clipStat.deleteMany({ where: { clip: { userId: { startsWith: PREFIX } } } }).catch(() => {});
  await db.clip.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {});
  await db.clipAccount.deleteMany({ where: { userId: { startsWith: PREFIX } } }).catch(() => {});
  await db.campaign.deleteMany({ where: { name: { startsWith: "TRACE-" } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { startsWith: PREFIX } } }).catch(() => {});

  await db.$disconnect();
  console.log("\n✅ Done — test data cleaned up");
  process.exit(0);
}

main().catch(e => { console.error("CRASH:", e); process.exit(1); });
