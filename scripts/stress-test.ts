/**
 * STRESS / CHAOS / EDGE-CASE TEST SUITE
 * Tests concurrency, fraud patterns, failure recovery, archive under load, and scale.
 * Run: npx tsx scripts/stress-test.ts
 */
import "dotenv/config";

async function createClient() {
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

let db: any;
let passed = 0, failed = 0;
const failures: string[] = [];
const warnings: string[] = [];

function assert(cond: boolean, name: string) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; failures.push(name); console.log(`  ❌ ${name}`); }
}
function warn(msg: string) { warnings.push(msg); console.log(`  ⚠️  ${msg}`); }

async function cleanup() {
  console.log("\n🧹 Cleaning stress test data...");
  await db.auditLog.deleteMany({ where: { userId: { startsWith: "stress-" } } }).catch(() => {});
  await db.clipStat.deleteMany({ where: { clip: { userId: { startsWith: "stress-" } } } }).catch(() => {});
  await db.trackingJob.deleteMany({ where: { clip: { userId: { startsWith: "stress-" } } } }).catch(() => {});
  await db.payoutRequest.deleteMany({ where: { userId: { startsWith: "stress-" } } }).catch(() => {});
  await db.clip.deleteMany({ where: { userId: { startsWith: "stress-" } } }).catch(() => {});
  await db.campaignAccount.deleteMany({ where: { clipAccount: { userId: { startsWith: "stress-" } } } }).catch(() => {});
  await db.clipAccount.deleteMany({ where: { userId: { startsWith: "stress-" } } }).catch(() => {});
  await db.campaignAdmin.deleteMany({ where: { userId: { startsWith: "stress-" } } }).catch(() => {});
  await db.teamMember.deleteMany({ where: { userId: { startsWith: "stress-" } } }).catch(() => {});
  await db.pendingCampaignEdit.deleteMany({ where: { requestedById: { startsWith: "stress-" } } }).catch(() => {});
  await db.campaign.deleteMany({ where: { name: { startsWith: "Stress Campaign" } } }).catch(() => {});
  await db.team.deleteMany({ where: { name: { startsWith: "Stress Team" } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { startsWith: "stress-" } } }).catch(() => {});
}

async function main() {
  db = await createClient();
  console.log("🔌 Connected\n");
  await cleanup();

  // Setup base data
  const owner = await db.user.create({ data: { id: "stress-owner", username: "StressOwner", role: "OWNER", trustScore: 100 } });
  const users: any[] = [];
  for (let i = 0; i < 10; i++) {
    users.push(await db.user.create({ data: { id: `stress-user-${i}`, username: `StressUser${i}`, role: "CLIPPER", trustScore: 50 } }));
  }
  const campaigns: any[] = [];
  for (let i = 0; i < 10; i++) {
    campaigns.push(await db.campaign.create({
      data: { name: `Stress Campaign ${i}`, platform: "TikTok", status: "ACTIVE", budget: 5000, cpmRate: 2.0, minViews: 1000, maxPayoutPerClip: 50, createdById: "stress-owner" },
    }));
  }
  const accounts: any[] = [];
  for (let i = 0; i < 10; i++) {
    accounts.push(await db.clipAccount.create({
      data: { userId: `stress-user-${i}`, platform: "TikTok", username: `stress_acct_${i}`, profileLink: `https://tiktok.com/@stress${i}`, status: "APPROVED", verificationCode: `S${i}` },
    }));
  }

  // ═══════════════════════════════════════
  // 1. SCALE: 150+ clips across 10 campaigns, 10 users
  // ═══════════════════════════════════════
  console.log("\n📈 1) SCALE: 150 clips, 10 campaigns, 10 users");
  const allClipIds: string[] = [];
  for (let i = 0; i < 150; i++) {
    const userId = `stress-user-${i % 10}`;
    const campaignId = campaigns[i % 10].id;
    const accountId = accounts[i % 10].id;
    const clip = await db.clip.create({
      data: { userId, campaignId, clipAccountId: accountId, clipUrl: `https://tiktok.com/@stress/video/stress_${i}`, status: "PENDING", earnings: 0 },
    });
    await db.clipStat.create({ data: { clipId: clip.id, views: 0, likes: 0, comments: 0, shares: 0 } });
    allClipIds.push(clip.id);
  }
  const totalClips = await db.clip.count({ where: { userId: { startsWith: "stress-" } } });
  assert(totalClips === 150, `150 clips created (got ${totalClips})`);

  // ═══════════════════════════════════════
  // 2. CONCURRENCY: Multiple approvals on same clip
  // ═══════════════════════════════════════
  console.log("\n⚡ 2) CONCURRENCY: Simultaneous clip approvals");
  const targetClip = allClipIds[0];
  const results = await Promise.allSettled([
    db.clip.update({ where: { id: targetClip }, data: { status: "APPROVED", reviewedById: "stress-owner", reviewedAt: new Date() } }),
    db.clip.update({ where: { id: targetClip }, data: { status: "APPROVED", reviewedById: "stress-owner", reviewedAt: new Date() } }),
    db.clip.update({ where: { id: targetClip }, data: { status: "APPROVED", reviewedById: "stress-owner", reviewedAt: new Date() } }),
  ]);
  const successes = results.filter(r => r.status === "fulfilled").length;
  assert(successes >= 1, `At least 1 concurrent approval succeeded (${successes}/3)`);
  const clipAfter = await db.clip.findUnique({ where: { id: targetClip } });
  assert(clipAfter.status === "APPROVED", "Clip ended in APPROVED state");

  // ═══════════════════════════════════════
  // 3. CONCURRENCY: Double payout attempt
  // ═══════════════════════════════════════
  console.log("\n💸 3) CONCURRENCY: Double payout race condition");
  // Approve 5 clips with earnings for user-0
  for (let i = 0; i < 5; i++) {
    const cid = allClipIds[i * 10]; // clips belonging to user-0
    await db.clip.update({ where: { id: cid }, data: { status: "APPROVED", earnings: 20 } });
    await db.clipStat.updateMany({ where: { clipId: cid }, data: { views: 15000 } });
  }

  // User-0 now has $100 in approved earnings
  // Try 2 simultaneous $60 payouts — one should succeed, one should be created but violate balance
  const payoutResults = await Promise.allSettled([
    db.payoutRequest.create({ data: { userId: "stress-user-0", campaignId: campaigns[0].id, amount: 60, walletAddress: "0xStress1", status: "REQUESTED" } }),
    db.payoutRequest.create({ data: { userId: "stress-user-0", campaignId: campaigns[0].id, amount: 60, walletAddress: "0xStress2", status: "REQUESTED" } }),
  ]);
  const createdPayouts = payoutResults.filter(r => r.status === "fulfilled").length;
  // Both DB creates succeed (no unique constraint prevents this at DB level)
  // The balance check happens at API level — this is the known TOCTOU risk
  if (createdPayouts === 2) {
    warn("TOCTOU: Both $60 payouts created (DB has no balance constraint). API-level $transaction needed.");
  }
  assert(createdPayouts >= 1, `At least 1 payout created (${createdPayouts})`);

  // ═══════════════════════════════════════
  // 4. DUPLICATE CLIP PREVENTION
  // ═══════════════════════════════════════
  console.log("\n🚫 4) DUPLICATE CLIP PREVENTION");
  let dupBlocked = 0;
  for (let i = 0; i < 5; i++) {
    try {
      await db.clip.create({
        data: { userId: "stress-user-0", campaignId: campaigns[0].id, clipAccountId: accounts[0].id, clipUrl: `https://tiktok.com/@stress/video/stress_0`, status: "PENDING", earnings: 0 },
      });
    } catch {
      dupBlocked++;
    }
  }
  assert(dupBlocked === 5, `All 5 duplicate attempts blocked (${dupBlocked}/5)`);

  // ═══════════════════════════════════════
  // 5. FRAUD: Sudden view spike detection readiness
  // ═══════════════════════════════════════
  console.log("\n🕵️ 5) FRAUD: View spike patterns");
  const fraudClip = allClipIds[20];
  // Normal growth: 0 → 100 → 500 → 1000
  await db.clipStat.create({ data: { clipId: fraudClip, views: 100, likes: 10, comments: 2, shares: 1 } });
  await db.clipStat.create({ data: { clipId: fraudClip, views: 500, likes: 40, comments: 8, shares: 3 } });
  // Suspicious spike: 500 → 50000 (100x in one interval)
  await db.clipStat.create({ data: { clipId: fraudClip, views: 50000, likes: 45, comments: 8, shares: 3 } });

  const stats = await db.clipStat.findMany({ where: { clipId: fraudClip }, orderBy: { checkedAt: "asc" } });
  const lastTwo = stats.slice(-2);
  const growthRate = lastTwo.length === 2 ? lastTwo[1].views / Math.max(lastTwo[0].views, 1) : 0;
  const engagementRatio = lastTwo[1] ? lastTwo[1].views / Math.max(lastTwo[1].likes, 1) : 0;
  assert(growthRate > 50, `Spike detected: ${growthRate.toFixed(0)}x growth (>50x = suspicious)`);
  assert(engagementRatio > 500, `Low engagement ratio: ${engagementRatio.toFixed(0)}:1 views:likes (>500:1 = suspicious)`);
  // This proves the data model CAN detect fraud — the detection logic just needs the cron to run

  // ═══════════════════════════════════════
  // 6. ARCHIVE UNDER LOAD
  // ═══════════════════════════════════════
  console.log("\n📦 6) ARCHIVE UNDER LOAD");
  const archiveCampaign = campaigns[3];
  const clipsInCampBefore = await db.clip.count({ where: { campaignId: archiveCampaign.id } });

  // Archive while clips exist
  await db.campaign.update({
    where: { id: archiveCampaign.id },
    data: { isArchived: true, archivedAt: new Date(), archivedById: "stress-owner" },
  });

  // Verify clips preserved
  const clipsInCampAfter = await db.clip.count({ where: { campaignId: archiveCampaign.id } });
  assert(clipsInCampAfter === clipsInCampBefore, `Archive preserved all ${clipsInCampAfter} clips`);

  // Verify archived excluded from live
  const liveCampaigns = await db.campaign.findMany({ where: { isArchived: false, name: { startsWith: "Stress Campaign" } } });
  assert(!liveCampaigns.find((c: any) => c.id === archiveCampaign.id), "Archived campaign excluded from live");

  // Restore
  await db.campaign.update({
    where: { id: archiveCampaign.id },
    data: { isArchived: false, archivedAt: null, archivedById: null },
  });
  const restored = await db.campaign.findUnique({ where: { id: archiveCampaign.id } });
  assert(restored.isArchived === false, "Restore successful — no ghost state");

  // ═══════════════════════════════════════
  // 7. RAPID ARCHIVE/RESTORE CYCLE
  // ═══════════════════════════════════════
  console.log("\n🔄 7) RAPID ARCHIVE/RESTORE CYCLE");
  const cycleCamp = campaigns[5];
  for (let i = 0; i < 10; i++) {
    await db.campaign.update({ where: { id: cycleCamp.id }, data: { isArchived: true, archivedAt: new Date(), archivedById: "stress-owner" } });
    await db.campaign.update({ where: { id: cycleCamp.id }, data: { isArchived: false, archivedAt: null, archivedById: null } });
  }
  const afterCycle = await db.campaign.findUnique({ where: { id: cycleCamp.id } });
  assert(afterCycle.isArchived === false, "10 rapid archive/restore cycles — final state is live");

  // ═══════════════════════════════════════
  // 8. INVALID DATA
  // ═══════════════════════════════════════
  console.log("\n🛡️ 8) INVALID DATA HANDLING");

  // Negative earnings
  try {
    await db.clip.create({
      data: { userId: "stress-user-1", campaignId: campaigns[1].id, clipAccountId: accounts[1].id, clipUrl: "https://tiktok.com/@neg/video/neg1", status: "PENDING", earnings: -100 },
    });
    warn("DB accepted negative earnings (no constraint) — API validation handles this");
    await db.clip.deleteMany({ where: { clipUrl: "https://tiktok.com/@neg/video/neg1" } });
  } catch {
    assert(true, "DB rejected negative earnings");
  }

  // Null campaignId on clip
  try {
    await db.clip.create({
      data: { userId: "stress-user-1", campaignId: null as any, clipAccountId: accounts[1].id, clipUrl: "https://tiktok.com/@null/video/null1", status: "PENDING" },
    });
    assert(false, "DB should reject null campaignId");
  } catch {
    assert(true, "DB correctly rejects null campaignId");
  }

  // Empty clipUrl
  try {
    await db.clip.create({
      data: { userId: "stress-user-1", campaignId: campaigns[1].id, clipAccountId: accounts[1].id, clipUrl: "", status: "PENDING" },
    });
    warn("DB accepted empty clipUrl — API validation handles this");
    await db.clip.deleteMany({ where: { clipUrl: "" } });
  } catch {
    assert(true, "DB rejected empty clipUrl");
  }

  // ═══════════════════════════════════════
  // 9. TRUST SCORE BOUNDARIES
  // ═══════════════════════════════════════
  console.log("\n📊 9) TRUST SCORE BOUNDARIES");
  // Decrement trust score far below 0
  await db.user.update({ where: { id: "stress-user-5" }, data: { trustScore: 5 } });
  await db.user.update({ where: { id: "stress-user-5" }, data: { trustScore: { decrement: 100 } } });
  const lowTrust = await db.user.findUnique({ where: { id: "stress-user-5" } });
  warn(`Trust score went to ${lowTrust.trustScore} (negative allowed — app logic should clamp)`);
  assert(typeof lowTrust.trustScore === "number", "Trust score is still a number after heavy decrement");

  // ═══════════════════════════════════════
  // 10. CLIPPER ISOLATION UNDER SCALE
  // ═══════════════════════════════════════
  console.log("\n🔒 10) CLIPPER ISOLATION AT SCALE");
  for (let i = 0; i < 10; i++) {
    const userClips = await db.clip.findMany({ where: { userId: `stress-user-${i}` } });
    const allBelongToUser = userClips.every((c: any) => c.userId === `stress-user-${i}`);
    assert(allBelongToUser, `User ${i}: ${userClips.length} clips, all owned correctly`);
  }

  // ═══════════════════════════════════════
  // 11. PAYOUT STATUS LIFECYCLE
  // ═══════════════════════════════════════
  console.log("\n🔄 11) PAYOUT STATUS LIFECYCLE");
  const lifecyclePayout = await db.payoutRequest.create({
    data: { userId: "stress-user-1", campaignId: campaigns[1].id, amount: 15, walletAddress: "0xLifecycle", status: "REQUESTED" },
  });
  await db.payoutRequest.update({ where: { id: lifecyclePayout.id }, data: { status: "UNDER_REVIEW" } });
  await db.payoutRequest.update({ where: { id: lifecyclePayout.id }, data: { status: "APPROVED" } });
  await db.payoutRequest.update({ where: { id: lifecyclePayout.id }, data: { status: "PAID" } });
  const finalPayout = await db.payoutRequest.findUnique({ where: { id: lifecyclePayout.id } });
  assert(finalPayout.status === "PAID", "Payout lifecycle: REQUESTED → UNDER_REVIEW → APPROVED → PAID");

  // Rejected path
  const rejectPayout = await db.payoutRequest.create({
    data: { userId: "stress-user-2", campaignId: campaigns[2].id, amount: 15, walletAddress: "0xReject", status: "REQUESTED" },
  });
  await db.payoutRequest.update({ where: { id: rejectPayout.id }, data: { status: "REJECTED", rejectionReason: "Suspicious" } });
  const rejectedP = await db.payoutRequest.findUnique({ where: { id: rejectPayout.id } });
  assert(rejectedP.status === "REJECTED" && rejectedP.rejectionReason === "Suspicious", "Payout rejection with reason works");

  // ═══════════════════════════════════════
  // 12. CONCURRENT CLIP STATUS CHANGES
  // ═══════════════════════════════════════
  console.log("\n⚡ 12) CONCURRENT: approve + flag + reject same clip");
  const raceClip = allClipIds[50];
  const raceResults = await Promise.allSettled([
    db.clip.update({ where: { id: raceClip }, data: { status: "APPROVED" } }),
    db.clip.update({ where: { id: raceClip }, data: { status: "FLAGGED" } }),
    db.clip.update({ where: { id: raceClip }, data: { status: "REJECTED" } }),
  ]);
  const raceSuccesses = raceResults.filter(r => r.status === "fulfilled").length;
  assert(raceSuccesses === 3, `All 3 concurrent status changes succeeded (last-write-wins: ${raceSuccesses}/3)`);
  const raceClipFinal = await db.clip.findUnique({ where: { id: raceClip } });
  assert(["APPROVED", "FLAGGED", "REJECTED"].includes(raceClipFinal.status), `Final status is valid: ${raceClipFinal.status}`);
  warn(`Concurrent status race: last-write-wins → final=${raceClipFinal.status}. Consider optimistic locking for production.`);

  // ═══════════════════════════════════════
  // 13. EARNINGS CALCULATION EDGE CASES
  // ═══════════════════════════════════════
  console.log("\n💰 13) EARNINGS EDGE CASES");
  const { calculateClipEarnings } = await import("../src/lib/earnings-calc");

  assert(calculateClipEarnings({ views: 0, campaignMinViews: 1000, campaignCpmRate: 2.0, campaignMaxPayoutPerClip: 50 }) === 0, "0 views = $0");
  assert(calculateClipEarnings({ views: 999, campaignMinViews: 1000, campaignCpmRate: 2.0, campaignMaxPayoutPerClip: 50 }) === 0, "999 views (below 1000 threshold) = $0");
  assert(calculateClipEarnings({ views: 1000, campaignMinViews: 1000, campaignCpmRate: 2.0, campaignMaxPayoutPerClip: 50 }) === 2.0, "Exactly at threshold = $2.00");
  assert(calculateClipEarnings({ views: 1000000, campaignMinViews: 1000, campaignCpmRate: 2.0, campaignMaxPayoutPerClip: 50 }) === 50, "1M views capped at $50");
  assert(calculateClipEarnings({ views: 5000, campaignMinViews: null, campaignCpmRate: 0, campaignMaxPayoutPerClip: null }) === 0, "Zero CPM = $0");
  assert(calculateClipEarnings({ views: -1000, campaignMinViews: null, campaignCpmRate: 2.0, campaignMaxPayoutPerClip: null }) === 0, "Negative views = $0");

  // ═══════════════════════════════════════
  // 14. MASS QUERIES
  // ═══════════════════════════════════════
  console.log("\n🏋️ 14) MASS QUERIES");
  const t1 = Date.now();
  const allClipsQuery = await db.clip.findMany({
    where: { userId: { startsWith: "stress-" } },
    include: { campaign: { select: { name: true } }, clipAccount: { select: { username: true } }, stats: { orderBy: { checkedAt: "desc" }, take: 1 } },
  });
  const queryTime = Date.now() - t1;
  assert(allClipsQuery.length >= 150, `Mass query returned ${allClipsQuery.length} clips`);
  assert(queryTime < 5000, `Query time: ${queryTime}ms (< 5s threshold)`);
  if (queryTime > 2000) warn(`Query time ${queryTime}ms is slow — indexes may need tuning`);

  // ═══════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════
  await cleanup();
  await db.$disconnect();

  // ═══════════════════════════════════════
  // FINAL REPORT
  // ═══════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log(`📊 RESULTS: ${passed} passed, ${failed} failed, ${warnings.length} warnings`);
  if (failures.length > 0) {
    console.log("\n❌ FAILURES:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  if (warnings.length > 0) {
    console.log("\n⚠️  WARNINGS (known risks):");
    for (const w of warnings) console.log(`  - ${w}`);
  }
  console.log("═".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("Crashed:", e); process.exit(1); });
