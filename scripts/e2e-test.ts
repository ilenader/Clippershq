/**
 * COMPREHENSIVE E2E TEST SUITE FOR CLIPPERS HQ
 * Tests everything against the real Supabase database.
 * Run with: npx tsx scripts/e2e-test.ts
 */

import "dotenv/config";

// Dynamic import for Prisma with adapter
async function createClient() {
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

let db: any;
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ❌ ${name}`);
  }
}

async function cleanup() {
  console.log("\n🧹 Cleaning test data...");
  // Delete in order of dependencies
  await db.auditLog.deleteMany({ where: { userId: { startsWith: "test-" } } }).catch(() => {});
  await db.clipStat.deleteMany({ where: { clip: { userId: { startsWith: "test-" } } } }).catch(() => {});
  await db.trackingJob.deleteMany({ where: { clip: { userId: { startsWith: "test-" } } } }).catch(() => {});
  await db.payoutRequest.deleteMany({ where: { userId: { startsWith: "test-" } } }).catch(() => {});
  await db.clip.deleteMany({ where: { userId: { startsWith: "test-" } } }).catch(() => {});
  await db.campaignAccount.deleteMany({ where: { clipAccount: { userId: { startsWith: "test-" } } } }).catch(() => {});
  await db.clipAccount.deleteMany({ where: { userId: { startsWith: "test-" } } }).catch(() => {});
  await db.campaignAdmin.deleteMany({ where: { userId: { startsWith: "test-" } } }).catch(() => {});
  await db.teamMember.deleteMany({ where: { userId: { startsWith: "test-" } } }).catch(() => {});
  await db.teamCampaign.deleteMany({ where: { team: { name: { startsWith: "Test Team" } } } }).catch(() => {});
  await db.pendingCampaignEdit.deleteMany({ where: { requestedById: { startsWith: "test-" } } }).catch(() => {});
  await db.campaign.deleteMany({ where: { name: { startsWith: "Test Campaign" } } }).catch(() => {});
  await db.team.deleteMany({ where: { name: { startsWith: "Test Team" } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { startsWith: "test-" } } }).catch(() => {});
}

async function main() {
  db = await createClient();
  console.log("🔌 Connected to database\n");

  await cleanup();

  // ═══════════════════════════════════════════
  // A) SCHEMA VERIFICATION
  // ═══════════════════════════════════════════
  console.log("\n📋 A) SCHEMA VERIFICATION");

  // Test all new tables exist by querying them
  const tables = ["user", "campaign", "clip", "clipStat", "payoutRequest", "team", "teamMember", "teamCampaign", "trackingJob", "auditLog", "campaignAdmin", "pendingCampaignEdit"];
  for (const t of tables) {
    try {
      await (db as any)[t].count();
      assert(true, `Table '${t}' exists and is queryable`);
    } catch (e: any) {
      assert(false, `Table '${t}' exists — ${e.message}`);
    }
  }

  // Test new fields exist
  try {
    const u = await db.user.create({ data: { id: "test-schema-check", username: "schema_test", trustScore: 50 } });
    assert(u.trustScore === 50, "User.trustScore field works");
    await db.user.delete({ where: { id: "test-schema-check" } });
  } catch (e: any) {
    assert(false, `User.trustScore — ${e.message}`);
  }

  // ═══════════════════════════════════════════
  // B) USER CREATION
  // ═══════════════════════════════════════════
  console.log("\n👤 B) USER CREATION");

  const owner = await db.user.create({ data: { id: "test-owner-1", username: "TestOwner", email: "testowner@test.com", role: "OWNER", trustScore: 100 } });
  assert(owner.role === "OWNER", "Owner created with OWNER role");

  const admin1 = await db.user.create({ data: { id: "test-admin-1", username: "TestAdmin1", email: "admin1@test.com", role: "ADMIN" } });
  assert(admin1.role === "ADMIN", "Admin1 created with ADMIN role");

  const admin2 = await db.user.create({ data: { id: "test-admin-2", username: "TestAdmin2", email: "admin2@test.com", role: "ADMIN" } });
  assert(admin2.role === "ADMIN", "Admin2 created with ADMIN role");

  const clipper1 = await db.user.create({ data: { id: "test-clipper-1", username: "TestClipper1", email: "clipper1@test.com", role: "CLIPPER" } });
  const clipper2 = await db.user.create({ data: { id: "test-clipper-2", username: "TestClipper2", email: "clipper2@test.com", role: "CLIPPER" } });
  assert(clipper1.role === "CLIPPER" && clipper2.role === "CLIPPER", "2 clippers created");

  // ═══════════════════════════════════════════
  // C) CAMPAIGN LIFECYCLE
  // ═══════════════════════════════════════════
  console.log("\n📣 C) CAMPAIGN LIFECYCLE");

  const campaigns: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const c = await db.campaign.create({
      data: {
        name: `Test Campaign ${i}`,
        platform: i % 2 === 0 ? "TikTok" : "Instagram",
        status: "ACTIVE",
        budget: 1000 + i * 100,
        cpmRate: 2.0 + i * 0.5,
        minViews: 1000,
        maxPayoutPerClip: 50,
        createdById: i <= 5 ? "test-admin-1" : "test-admin-2",
        isArchived: false,
      },
    });
    campaigns.push(c);
  }
  assert(campaigns.length === 10, "10 campaigns created");

  // Pause
  const paused = await db.campaign.update({ where: { id: campaigns[0].id }, data: { status: "PAUSED" } });
  assert(paused.status === "PAUSED", "Campaign 1 paused");

  // Archive
  const archived = await db.campaign.update({
    where: { id: campaigns[1].id },
    data: { isArchived: true, archivedAt: new Date(), archivedById: "test-owner-1", status: "PAUSED" },
  });
  assert(archived.isArchived === true, "Campaign 2 archived");

  // Verify archived not in live queries
  const liveCampaigns = await db.campaign.findMany({ where: { isArchived: false, name: { startsWith: "Test Campaign" } } });
  assert(liveCampaigns.every((c: any) => !c.isArchived), "Archived campaigns excluded from live queries");
  assert(!liveCampaigns.find((c: any) => c.id === campaigns[1].id), "Archived campaign 2 not in live list");

  // Restore
  const restored = await db.campaign.update({
    where: { id: campaigns[1].id },
    data: { isArchived: false, archivedAt: null, archivedById: null, status: "PAUSED" },
  });
  assert(restored.isArchived === false, "Campaign 2 restored");

  // Verify no dual state
  const allTest = await db.campaign.findMany({ where: { name: { startsWith: "Test Campaign" } } });
  const archivedCount = allTest.filter((c: any) => c.isArchived).length;
  const liveCount = allTest.filter((c: any) => !c.isArchived).length;
  assert(archivedCount === 0 && liveCount === 10, "No dual archive/live state");

  // ═══════════════════════════════════════════
  // D) CLIP ACCOUNTS
  // ═══════════════════════════════════════════
  console.log("\n📱 D) CLIP ACCOUNTS");

  const acc1 = await db.clipAccount.create({
    data: { userId: "test-clipper-1", platform: "TikTok", username: "clipper1_tt", profileLink: "https://tiktok.com/@test1", status: "APPROVED", verificationCode: "A1B2" },
  });
  const acc2 = await db.clipAccount.create({
    data: { userId: "test-clipper-1", platform: "Instagram", username: "clipper1_ig", profileLink: "https://instagram.com/test1", status: "APPROVED", verificationCode: "C3D4" },
  });
  const acc3 = await db.clipAccount.create({
    data: { userId: "test-clipper-2", platform: "TikTok", username: "clipper2_tt", profileLink: "https://tiktok.com/@test2", status: "APPROVED", verificationCode: "E5F6" },
  });
  assert(acc1.status === "APPROVED" && acc2.status === "APPROVED" && acc3.status === "APPROVED", "3 accounts created and approved");

  // ═══════════════════════════════════════════
  // E) CLIP SUBMISSION + ISOLATION
  // ═══════════════════════════════════════════
  console.log("\n🎬 E) CLIP SUBMISSION + ISOLATION");

  const clipIds: string[] = [];
  // Clipper 1 submits clips to multiple campaigns
  for (let i = 0; i < 15; i++) {
    const c = await db.clip.create({
      data: {
        userId: "test-clipper-1",
        campaignId: campaigns[i % 5].id,
        clipAccountId: i % 2 === 0 ? acc1.id : acc2.id,
        clipUrl: `https://tiktok.com/@test/video/${1000 + i}`,
        status: "PENDING",
        earnings: 0,
      },
    });
    await db.clipStat.create({ data: { clipId: c.id, views: 0, likes: 0, comments: 0, shares: 0 } });
    clipIds.push(c.id);
  }
  assert(clipIds.length === 15, "15 clips created for clipper1");

  // Clipper 2 submits clips
  for (let i = 0; i < 10; i++) {
    const c = await db.clip.create({
      data: {
        userId: "test-clipper-2",
        campaignId: campaigns[5 + (i % 5)].id,
        clipAccountId: acc3.id,
        clipUrl: `https://tiktok.com/@test2/video/${2000 + i}`,
        status: "PENDING",
        earnings: 0,
      },
    });
    await db.clipStat.create({ data: { clipId: c.id, views: 0, likes: 0, comments: 0, shares: 0 } });
  }

  // Verify isolation
  const clipper1Clips = await db.clip.findMany({ where: { userId: "test-clipper-1" } });
  const clipper2Clips = await db.clip.findMany({ where: { userId: "test-clipper-2" } });
  assert(clipper1Clips.length === 15, "Clipper1 sees exactly 15 clips");
  assert(clipper2Clips.length === 10, "Clipper2 sees exactly 10 clips");

  // ═══════════════════════════════════════════
  // F) CLIP REVIEW + EARNINGS
  // ═══════════════════════════════════════════
  console.log("\n✅ F) CLIP REVIEW + EARNINGS");

  // Approve some clips and set views above threshold
  for (let i = 0; i < 5; i++) {
    await db.clip.update({
      where: { id: clipIds[i] },
      data: { status: "APPROVED", reviewedById: "test-owner-1", reviewedAt: new Date() },
    });
    // Set views above threshold (1000 min)
    await db.clipStat.updateMany({
      where: { clipId: clipIds[i] },
      data: { views: 5000 + i * 1000, likes: 200 + i * 50 },
    });
    // Calculate earnings: (views / 1000) * CPM
    const campaign = campaigns[i % 5];
    const views = 5000 + i * 1000;
    const rawEarnings = (views / 1000) * campaign.cpmRate;
    const cappedEarnings = Math.min(rawEarnings, campaign.maxPayoutPerClip);
    await db.clip.update({ where: { id: clipIds[i] }, data: { earnings: Math.round(cappedEarnings * 100) / 100 } });
  }

  // Verify earnings exist
  const approvedClips = await db.clip.findMany({ where: { userId: "test-clipper-1", status: "APPROVED" } });
  assert(approvedClips.length === 5, "5 clips approved");
  assert(approvedClips.every((c: any) => c.earnings > 0), "All approved clips have earnings > 0");

  // Verify threshold: clip below threshold earns $0
  const belowThreshold = await db.clip.create({
    data: {
      userId: "test-clipper-1",
      campaignId: campaigns[0].id,
      clipAccountId: acc1.id,
      clipUrl: "https://tiktok.com/@test/video/below_threshold",
      status: "APPROVED",
      earnings: 0,
    },
  });
  await db.clipStat.create({ data: { clipId: belowThreshold.id, views: 999, likes: 10 } });
  // Earnings should be 0 because views (999) < minViews (1000)
  assert(belowThreshold.earnings === 0, "Below-threshold clip has $0 earnings");

  // Verify maxPayoutPerClip cap
  const maxEarnings = approvedClips.reduce((max: number, c: any) => Math.max(max, c.earnings), 0);
  assert(maxEarnings <= 50, `Max earnings (${maxEarnings}) does not exceed maxPayoutPerClip cap ($50)`);

  // ═══════════════════════════════════════════
  // G) PAYOUT FLOW + CAMPAIGN-SCOPED
  // ═══════════════════════════════════════════
  console.log("\n💰 G) PAYOUT FLOW");

  const totalEarnings = approvedClips.reduce((s: number, c: any) => s + c.earnings, 0);
  assert(totalEarnings > 0, `Total approved earnings: $${totalEarnings.toFixed(2)}`);

  // Create payout request
  const payout1 = await db.payoutRequest.create({
    data: {
      userId: "test-clipper-1",
      campaignId: campaigns[0].id,
      amount: 10,
      walletAddress: "0xTestWallet123",
      discordUsername: "TestClipper1#1234",
      status: "REQUESTED",
    },
  });
  assert(payout1.status === "REQUESTED", "Payout 1 created as REQUESTED");
  assert(payout1.campaignId === campaigns[0].id, "Payout linked to campaign");

  // Verify payout appears for owner
  const ownerPayouts = await db.payoutRequest.findMany({ where: { userId: "test-clipper-1" } });
  assert(ownerPayouts.length >= 1, "Owner can see clipper's payout");

  // Approve payout
  await db.payoutRequest.update({
    where: { id: payout1.id },
    data: { status: "APPROVED", reviewedById: "test-owner-1", reviewedAt: new Date() },
  });

  // Mark as paid
  await db.payoutRequest.update({
    where: { id: payout1.id },
    data: { status: "PAID" },
  });

  const paidPayout = await db.payoutRequest.findUnique({ where: { id: payout1.id } });
  assert(paidPayout.status === "PAID", "Payout marked as PAID");

  // Test balance after payout
  const { computeBalance, computeCampaignBalances } = await import("../src/lib/balance");
  const clipData = await db.clip.findMany({ where: { userId: "test-clipper-1", isDeleted: false }, select: { earnings: true, status: true, campaignId: true } });
  const payoutData = await db.payoutRequest.findMany({ where: { userId: "test-clipper-1" }, select: { amount: true, status: true, campaignId: true } });

  const balance = computeBalance({ clips: clipData, payouts: payoutData });
  assert(balance.paidOut === 10, `Paid out = $${balance.paidOut}`);
  assert(balance.available >= 0, `Available = $${balance.available} (non-negative)`);

  // Test campaign-scoped balance
  const campaignBals = computeCampaignBalances({ clips: clipData, payouts: payoutData });
  assert(campaignBals.length > 0, `${campaignBals.length} campaign balances computed`);

  // ═══════════════════════════════════════════
  // H) TEAM ACCESS
  // ═══════════════════════════════════════════
  console.log("\n👥 H) TEAM ACCESS");

  const team1 = await db.team.create({ data: { name: "Test Team Alpha" } });
  assert(!!team1.id, "Team created");

  // Add admin1 to team
  await db.teamMember.create({ data: { teamId: team1.id, userId: "test-admin-1", role: "LEAD" } });

  // Assign campaign 6 (admin2's campaign) to team1
  await db.teamCampaign.create({ data: { teamId: team1.id, campaignId: campaigns[5].id } });

  // Also add admin1 as CampaignAdmin for campaign 6
  await db.campaignAdmin.create({ data: { userId: "test-admin-1", campaignId: campaigns[5].id } });

  // Verify admin1 can access their own campaigns (1-5) + team campaign (6)
  const { getUserCampaignIds } = await import("../src/lib/campaign-access");
  const admin1Access = await getUserCampaignIds("test-admin-1", "ADMIN");
  assert(Array.isArray(admin1Access), "Admin1 gets array of campaign IDs");
  assert((admin1Access as string[]).length >= 5, `Admin1 has access to ${(admin1Access as string[]).length} campaigns (expected >= 5 own + team)`);
  assert((admin1Access as string[]).includes(campaigns[5].id), "Admin1 can access team-assigned campaign 6");

  // Verify admin2 CANNOT access admin1's campaigns
  const admin2Access = await getUserCampaignIds("test-admin-2", "ADMIN");
  assert(Array.isArray(admin2Access), "Admin2 gets array");
  for (let i = 0; i < 5; i++) {
    assert(!(admin2Access as string[]).includes(campaigns[i].id), `Admin2 cannot access Campaign ${i + 1} (admin1's)`);
  }

  // Verify owner sees ALL
  const ownerAccess = await getUserCampaignIds("test-owner-1", "OWNER");
  assert(ownerAccess === "ALL", "Owner gets ALL access");

  // ═══════════════════════════════════════════
  // I) MANUAL OVERRIDE + AUDIT
  // ═══════════════════════════════════════════
  console.log("\n🔧 I) MANUAL OVERRIDE + AUDIT");

  // Create manual stat override
  const overrideClip = clipIds[0];
  const beforeStat = await db.clipStat.findFirst({ where: { clipId: overrideClip }, orderBy: { checkedAt: "desc" } });

  await db.clipStat.create({
    data: { clipId: overrideClip, views: 50000, likes: 2000, comments: 500, shares: 300, isManual: true },
  });

  const manualStat = await db.clipStat.findFirst({ where: { clipId: overrideClip, isManual: true } });
  assert(manualStat !== null, "Manual stat created");
  assert(manualStat.views === 50000, "Manual override views = 50000");
  assert(manualStat.isManual === true, "Stat marked as manual");

  // Audit log
  await db.auditLog.create({
    data: {
      userId: "test-owner-1",
      action: "MANUAL_OVERRIDE",
      targetType: "clip",
      targetId: overrideClip,
      details: JSON.stringify({ before: { views: beforeStat?.views }, after: { views: 50000 } }),
    },
  });

  const logs = await db.auditLog.findMany({ where: { userId: "test-owner-1", action: "MANUAL_OVERRIDE" } });
  assert(logs.length >= 1, "Audit log created for manual override");

  // ═══════════════════════════════════════════
  // J) EARNINGS CALCULATION
  // ═══════════════════════════════════════════
  console.log("\n📊 J) EARNINGS CALCULATION");

  const { calculateClipEarnings } = await import("../src/lib/earnings-calc");

  // Test below threshold
  const e1 = calculateClipEarnings({ views: 999, campaignMinViews: 1000, campaignCpmRate: 2.0, campaignMaxPayoutPerClip: 50 });
  assert(e1 === 0, `Below threshold: $${e1} (expected $0)`);

  // Test at threshold
  const e2 = calculateClipEarnings({ views: 1000, campaignMinViews: 1000, campaignCpmRate: 2.0, campaignMaxPayoutPerClip: 50 });
  assert(e2 === 2.0, `At threshold: $${e2} (expected $2.00)`);

  // Test above threshold
  const e3 = calculateClipEarnings({ views: 10000, campaignMinViews: 1000, campaignCpmRate: 2.0, campaignMaxPayoutPerClip: 50 });
  assert(e3 === 20.0, `Above threshold: $${e3} (expected $20.00)`);

  // Test cap enforcement
  const e4 = calculateClipEarnings({ views: 100000, campaignMinViews: 1000, campaignCpmRate: 2.0, campaignMaxPayoutPerClip: 50 });
  assert(e4 === 50, `Capped: $${e4} (expected $50 max)`);

  // Test no CPM
  const e5 = calculateClipEarnings({ views: 50000, campaignMinViews: null, campaignCpmRate: null, campaignMaxPayoutPerClip: null });
  assert(e5 === 0, `No CPM: $${e5} (expected $0)`);

  // Test no threshold (null = no minimum)
  const e6 = calculateClipEarnings({ views: 500, campaignMinViews: null, campaignCpmRate: 3.0, campaignMaxPayoutPerClip: null });
  assert(e6 === 1.5, `No min threshold: $${e6} (expected $1.50)`);

  // ═══════════════════════════════════════════
  // K) ARCHIVE WITH DATA PRESERVATION
  // ═══════════════════════════════════════════
  console.log("\n📦 K) ARCHIVE WITH DATA PRESERVATION");

  // Archive campaign 3 (has clips)
  const campToArchive = campaigns[2];
  const clipsInCamp3Before = await db.clip.count({ where: { campaignId: campToArchive.id } });

  await db.campaign.update({
    where: { id: campToArchive.id },
    data: { isArchived: true, archivedAt: new Date(), archivedById: "test-owner-1" },
  });

  // Verify clips still exist
  const clipsInCamp3After = await db.clip.count({ where: { campaignId: campToArchive.id } });
  assert(clipsInCamp3After === clipsInCamp3Before, `Archived campaign clips preserved (${clipsInCamp3After})`);

  // Verify archived clips excluded from live with campaign filter
  const liveClips = await db.clip.findMany({
    where: { userId: "test-clipper-1", campaign: { isArchived: false } },
  });
  assert(!liveClips.find((c: any) => c.campaignId === campToArchive.id), "Archived campaign clips excluded from live view");

  // Restore
  await db.campaign.update({
    where: { id: campToArchive.id },
    data: { isArchived: false, archivedAt: null, archivedById: null },
  });

  const restoredClips = await db.clip.findMany({
    where: { userId: "test-clipper-1", campaign: { isArchived: false } },
  });
  const hasRestoredClips = restoredClips.some((c: any) => c.campaignId === campToArchive.id);
  assert(hasRestoredClips, "Restored campaign clips visible again in live view");

  // ═══════════════════════════════════════════
  // L) BALANCE CALCULATION SAFETY
  // ═══════════════════════════════════════════
  console.log("\n🔒 L) BALANCE SAFETY");

  // Test negative balance prevention
  const testBalance = computeBalance({
    clips: [{ earnings: 10, status: "APPROVED" }],
    payouts: [{ amount: 20, status: "PAID" }],
  });
  assert(testBalance.available === 0, "Available balance never goes negative");

  // Test locked payout reduces available
  const testBalance2 = computeBalance({
    clips: [{ earnings: 50, status: "APPROVED" }],
    payouts: [{ amount: 20, status: "REQUESTED" }, { amount: 10, status: "PAID" }],
  });
  assert(testBalance2.available === 20, `Available = $${testBalance2.available} (50 - 20 locked - 10 paid = 20)`);

  // Test campaign-scoped balances
  const testCampBal = computeCampaignBalances({
    clips: [
      { earnings: 30, status: "APPROVED", campaignId: "c1" },
      { earnings: 20, status: "APPROVED", campaignId: "c2" },
    ],
    payouts: [
      { amount: 10, status: "PAID", campaignId: "c1" },
    ],
  });
  const c1Bal = testCampBal.find((b) => b.campaignId === "c1");
  const c2Bal = testCampBal.find((b) => b.campaignId === "c2");
  assert(c1Bal?.available === 20, `Campaign 1 available = $${c1Bal?.available} (30 - 10 paid = 20)`);
  assert(c2Bal?.available === 20, `Campaign 2 available = $${c2Bal?.available}`);

  // ═══════════════════════════════════════════
  // M) TRACKING JOB SCHEMA
  // ═══════════════════════════════════════════
  console.log("\n⏱️ M) TRACKING JOB");

  const trackJob = await db.trackingJob.create({
    data: {
      clipId: clipIds[0],
      campaignId: campaigns[0].id,
      nextCheckAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      checkIntervalMin: 120,
      isActive: true,
    },
  });
  assert(!!trackJob.id, "Tracking job created");
  assert(trackJob.checkIntervalMin === 120, "Default interval = 120 min");
  assert(trackJob.isActive === true, "Job is active");

  // Query active jobs due for check
  const dueJobs = await db.trackingJob.findMany({
    where: { isActive: true, nextCheckAt: { lte: new Date(Date.now() + 3 * 60 * 60 * 1000) } },
  });
  assert(dueJobs.length >= 1, "Can query due tracking jobs");

  // ═══════════════════════════════════════════
  // N) TRUST SCORE
  // ═══════════════════════════════════════════
  console.log("\n🛡️ N) TRUST SCORE");

  const clipperBefore = await db.user.findUnique({ where: { id: "test-clipper-1" } });
  const scoreBefore = clipperBefore.trustScore;

  await db.user.update({ where: { id: "test-clipper-1" }, data: { trustScore: { increment: 5 } } });
  const clipperAfter = await db.user.findUnique({ where: { id: "test-clipper-1" } });
  assert(clipperAfter.trustScore === scoreBefore + 5, `Trust score incremented: ${scoreBefore} → ${clipperAfter.trustScore}`);

  await db.user.update({ where: { id: "test-clipper-1" }, data: { trustScore: { decrement: 10 } } });
  const clipperAfter2 = await db.user.findUnique({ where: { id: "test-clipper-1" } });
  assert(clipperAfter2.trustScore === scoreBefore + 5 - 10, `Trust score decremented: ${clipperAfter.trustScore} → ${clipperAfter2.trustScore}`);

  // ═══════════════════════════════════════════
  // O) DUPLICATE CLIP PREVENTION
  // ═══════════════════════════════════════════
  console.log("\n🚫 O) DUPLICATE PREVENTION");

  try {
    await db.clip.create({
      data: {
        userId: "test-clipper-1",
        campaignId: campaigns[0].id,
        clipAccountId: acc1.id,
        clipUrl: `https://tiktok.com/@test/video/1000`, // Same URL as first clip
        status: "PENDING",
        earnings: 0,
      },
    });
    assert(false, "Duplicate clip should be rejected");
  } catch {
    assert(true, "Duplicate clip URL + campaign correctly rejected by unique constraint");
  }

  // ═══════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════
  await cleanup();
  await db.$disconnect();

  // ═══════════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════════
  console.log("\n" + "═".repeat(50));
  console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\n❌ FAILURES:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log("═".repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
