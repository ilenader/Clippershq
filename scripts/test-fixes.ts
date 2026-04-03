import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

let passed = 0, failed = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ❌ ${name}`); }
}

async function main() {
  console.log("🔌 Connected\n");

  // Clean up test data
  await db.clipStat.deleteMany({ where: { clip: { userId: { startsWith: "fix-test-" } } } }).catch(() => {});
  await db.payoutRequest.deleteMany({ where: { userId: { startsWith: "fix-test-" } } }).catch(() => {});
  await db.clip.deleteMany({ where: { userId: { startsWith: "fix-test-" } } }).catch(() => {});
  await db.clipAccount.deleteMany({ where: { userId: { startsWith: "fix-test-" } } }).catch(() => {});
  await db.campaign.deleteMany({ where: { name: { startsWith: "FIX-TEST" } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { startsWith: "fix-test-" } } }).catch(() => {});

  // Setup test data
  const owner = await db.user.create({ data: { id: "fix-test-owner", username: "FixOwner", role: "OWNER", email: "fixowner@test.com" } });
  const clipper = await db.user.create({ data: { id: "fix-test-clipper", username: "FixClipper", role: "CLIPPER", email: "fixclipper@test.com" } });
  const account = await db.clipAccount.create({ data: { userId: clipper.id, platform: "TikTok", username: "fix_clipper_tt", profileLink: "https://tiktok.com/@fixtest", status: "APPROVED", verificationCode: "T1E2" } });

  // ── TEST 1: CLIP VISIBILITY ──
  console.log("\n🎬 1) CLIP VISIBILITY");

  const campaign = await db.campaign.create({
    data: { name: "FIX-TEST Active", platform: "TikTok", status: "ACTIVE", cpmRate: 2.0, minViews: 1000, maxPayoutPerClip: 50, createdById: owner.id, isArchived: false },
  });

  // Submit clip as clipper
  const clip = await db.clip.create({
    data: { userId: clipper.id, campaignId: campaign.id, clipAccountId: account.id, clipUrl: "https://tiktok.com/@fixtest/video/999", status: "PENDING", earnings: 0 },
  });
  await db.clipStat.create({ data: { clipId: clip.id, views: 0, likes: 0, comments: 0, shares: 0 } });

  // Clipper sees own clip
  const clipperClips = await db.clip.findMany({ where: { userId: clipper.id, isDeleted: false, campaign: { isArchived: false } } });
  assert(clipperClips.length === 1, "Clipper sees own clip");

  // Owner sees clip (same query as API)
  const ownerClips = await db.clip.findMany({
    where: { isDeleted: false, campaign: { isArchived: false } },
    include: {
      user: { select: { username: true, trustScore: true } },
      campaign: { select: { name: true, platform: true, isArchived: true } },
      clipAccount: { select: { username: true, platform: true } },
      stats: { orderBy: { checkedAt: "desc" }, take: 3 },
    },
  });
  const testClip = ownerClips.find((c: any) => c.id === clip.id);
  assert(!!testClip, "Owner can see clipper's submitted clip");
  assert(testClip?.user?.username === "FixClipper", "Clip includes user info");
  assert(testClip?.campaign?.name === "FIX-TEST Active", "Clip includes campaign info");
  assert(testClip?.status === "PENDING", "Clip status is PENDING");

  // ── TEST 2: ARCHIVE + PERMANENT DELETE ──
  console.log("\n🗑️ 2) PERMANENT DELETE");

  const archiveCampaign = await db.campaign.create({
    data: { name: "FIX-TEST Archive Target", platform: "Instagram", status: "ACTIVE", createdById: owner.id, isArchived: false, budget: 500 },
  });

  // Add clips to it
  const archClip1 = await db.clip.create({ data: { userId: clipper.id, campaignId: archiveCampaign.id, clipAccountId: account.id, clipUrl: "https://tiktok.com/@fixtest/video/a1", status: "APPROVED", earnings: 15 } });
  await db.clipStat.create({ data: { clipId: archClip1.id, views: 5000, likes: 200 } });
  const archClip2 = await db.clip.create({ data: { userId: clipper.id, campaignId: archiveCampaign.id, clipAccountId: account.id, clipUrl: "https://tiktok.com/@fixtest/video/a2", status: "PENDING", earnings: 0 } });
  await db.clipStat.create({ data: { clipId: archClip2.id, views: 100, likes: 5 } });

  // Archive it
  await db.campaign.update({ where: { id: archiveCampaign.id }, data: { isArchived: true, archivedAt: new Date(), archivedById: owner.id, status: "PAUSED" } });

  // Verify archived clips not in live view
  const liveClips = await db.clip.findMany({ where: { isDeleted: false, campaign: { isArchived: false } } });
  assert(!liveClips.find((c: any) => c.campaignId === archiveCampaign.id), "Archived campaign clips not in live view");

  // Archived clips still exist
  const archivedClips = await db.clip.findMany({ where: { campaignId: archiveCampaign.id } });
  assert(archivedClips.length === 2, "Archived campaign clips still exist in DB");

  // Now PERMANENTLY DELETE
  // Delete in FK order (same as destroy endpoint)
  await db.clipStat.deleteMany({ where: { clip: { campaignId: archiveCampaign.id } } });
  await db.trackingJob.deleteMany({ where: { campaignId: archiveCampaign.id } }).catch(() => {});
  await db.payoutRequest.deleteMany({ where: { campaignId: archiveCampaign.id } }).catch(() => {});
  await db.pendingCampaignEdit.deleteMany({ where: { campaignId: archiveCampaign.id } }).catch(() => {});
  await db.campaignAccount.deleteMany({ where: { campaignId: archiveCampaign.id } }).catch(() => {});
  await db.campaignAdmin.deleteMany({ where: { campaignId: archiveCampaign.id } }).catch(() => {});
  await db.teamCampaign.deleteMany({ where: { campaignId: archiveCampaign.id } }).catch(() => {});
  await db.note.deleteMany({ where: { campaignId: archiveCampaign.id } }).catch(() => {});
  await db.clip.deleteMany({ where: { campaignId: archiveCampaign.id } });
  await db.campaign.delete({ where: { id: archiveCampaign.id } });

  // Verify everything is gone
  const remainingCampaign = await db.campaign.findUnique({ where: { id: archiveCampaign.id } });
  assert(remainingCampaign === null, "Campaign permanently deleted");

  const remainingClips = await db.clip.findMany({ where: { campaignId: archiveCampaign.id } });
  assert(remainingClips.length === 0, "All campaign clips deleted");

  const remainingStats = await db.clipStat.findMany({ where: { clip: { campaignId: archiveCampaign.id } } });
  assert(remainingStats.length === 0, "All clip stats deleted");

  // Verify OTHER campaign's clip still exists
  const otherClip = await db.clip.findUnique({ where: { id: clip.id } });
  assert(otherClip !== null, "Other campaign's clip untouched");

  // ── TEST 3: REGRESSION ──
  console.log("\n🔄 3) REGRESSION");

  // Archive and restore should work
  await db.campaign.update({ where: { id: campaign.id }, data: { isArchived: true, archivedAt: new Date(), archivedById: owner.id } });
  const archivedCamp = await db.campaign.findUnique({ where: { id: campaign.id } });
  assert(archivedCamp?.isArchived === true, "Campaign archived");

  await db.campaign.update({ where: { id: campaign.id }, data: { isArchived: false, archivedAt: null, archivedById: null, status: "PAUSED" } });
  const restoredCamp = await db.campaign.findUnique({ where: { id: campaign.id } });
  assert(restoredCamp?.isArchived === false, "Campaign restored");

  // Clip still visible after restore
  const afterRestore = await db.clip.findMany({ where: { isDeleted: false, campaign: { isArchived: false } } });
  assert(afterRestore.some((c: any) => c.id === clip.id), "Clip visible after campaign restore");

  // ── CLEANUP ──
  await db.clipStat.deleteMany({ where: { clip: { userId: { startsWith: "fix-test-" } } } }).catch(() => {});
  await db.payoutRequest.deleteMany({ where: { userId: { startsWith: "fix-test-" } } }).catch(() => {});
  await db.clip.deleteMany({ where: { userId: { startsWith: "fix-test-" } } }).catch(() => {});
  await db.clipAccount.deleteMany({ where: { userId: { startsWith: "fix-test-" } } }).catch(() => {});
  await db.campaign.deleteMany({ where: { name: { startsWith: "FIX-TEST" } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { startsWith: "fix-test-" } } }).catch(() => {});

  await db.$disconnect();

  console.log(`\n${"═".repeat(50)}`);
  console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) { console.log("\n❌ FAILURES:"); failures.forEach(f => console.log(`  - ${f}`)); }
  console.log("═".repeat(50));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("CRASH:", e); process.exit(1); });
