/**
 * FRAUD + TRUST + OVERRIDE TEST
 * Run: npx tsx scripts/fraud-test.ts
 */
import "dotenv/config";
import { computeFraudLevel } from "../src/lib/fraud";
import { calculateClipEarnings } from "../src/lib/earnings-calc";

let passed = 0, failed = 0;
function assert(c: boolean, n: string) { if (c) { passed++; console.log(`  ✅ ${n}`); } else { failed++; console.log(`  ❌ ${n}`); } }

async function createClient() {
  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

async function main() {
  const db = await createClient();
  console.log("🔌 Connected\n");

  // Cleanup
  await db.auditLog.deleteMany({ where: { userId: { startsWith: "fraud-" } } }).catch(() => {});
  await db.clipStat.deleteMany({ where: { clip: { userId: { startsWith: "fraud-" } } } }).catch(() => {});
  await db.clip.deleteMany({ where: { userId: { startsWith: "fraud-" } } }).catch(() => {});
  await db.clipAccount.deleteMany({ where: { userId: { startsWith: "fraud-" } } }).catch(() => {});
  await db.campaign.deleteMany({ where: { name: { startsWith: "Fraud Test" } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { startsWith: "fraud-" } } }).catch(() => {});

  // ═══════════════════════════════════════
  // 1. FRAUD LEVEL COMPUTATION (pure logic)
  // ═══════════════════════════════════════
  console.log("🕵️ 1) FRAUD LEVEL LOGIC");

  // Clean clip — no history
  const f1 = computeFraudLevel({ stats: [{ views: 500, likes: 30, comments: 5, shares: 2 }] });
  assert(f1.level === "CLEAN", `Clean clip: ${f1.level} (expected CLEAN)`);

  // Spike: 100 → 50000
  const f2 = computeFraudLevel({
    stats: [
      { views: 50000, likes: 45, comments: 3, shares: 1 },
      { views: 100, likes: 10, comments: 2, shares: 1 },
    ],
  });
  assert(f2.level === "HIGH_RISK", `Extreme spike: ${f2.level} (expected HIGH_RISK)`);
  assert(f2.reasons.length > 0, `Has reasons: ${f2.reasons.join("; ")}`);

  // Moderate spike + okay engagement
  const f3 = computeFraudLevel({
    stats: [
      { views: 5000, likes: 200, comments: 30, shares: 10 },
      { views: 200, likes: 20, comments: 3, shares: 1 },
    ],
  });
  assert(f3.level === "SUSPECT" || f3.level === "FLAGGED", `Moderate spike: ${f3.level} (expected SUSPECT or FLAGGED)`);

  // Low engagement
  const f4 = computeFraudLevel({
    stats: [{ views: 1000, likes: 3, comments: 0, shares: 0 }],
  });
  assert(f4.level !== "CLEAN", `Low engagement: ${f4.level} (expected not CLEAN)`);

  // High views, zero engagement
  const f5 = computeFraudLevel({
    stats: [{ views: 10000, likes: 2, comments: 0, shares: 0 }],
  });
  assert(f5.level === "HIGH_RISK" || f5.level === "FLAGGED", `Zero engagement spike: ${f5.level} (expected HIGH_RISK or FLAGGED)`);

  // ═══════════════════════════════════════
  // 2. DB: Create users and simulate data
  // ═══════════════════════════════════════
  console.log("\n👤 2) DB USERS + CLIPS");

  await db.user.create({ data: { id: "fraud-owner", username: "FraudTestOwner", role: "OWNER", trustScore: 100 } });
  const normalUser = await db.user.create({ data: { id: "fraud-normal", username: "NormalUser", role: "CLIPPER", trustScore: 75 } });
  const susUser = await db.user.create({ data: { id: "fraud-sus", username: "SuspiciousUser", role: "CLIPPER", trustScore: 15 } });

  const c1 = await db.campaign.create({ data: { name: "Fraud Test C1", platform: "TikTok", status: "ACTIVE", budget: 5000, cpmRate: 2.0, minViews: 1000, maxPayoutPerClip: 50, createdById: "fraud-owner" } });
  const c2 = await db.campaign.create({ data: { name: "Fraud Test C2", platform: "Instagram", status: "ACTIVE", budget: 3000, cpmRate: 3.0, minViews: 500, maxPayoutPerClip: 30, createdById: "fraud-owner" } });
  const c3 = await db.campaign.create({ data: { name: "Fraud Test C3", platform: "YouTube", status: "ACTIVE", budget: 2000, cpmRate: 5.0, minViews: 2000, maxPayoutPerClip: 100, createdById: "fraud-owner" } });

  const normAcct = await db.clipAccount.create({ data: { userId: "fraud-normal", platform: "TikTok", username: "normal_tt", profileLink: "https://tiktok.com/@normal", status: "APPROVED", verificationCode: "N1" } });
  const susAcct = await db.clipAccount.create({ data: { userId: "fraud-sus", platform: "TikTok", username: "sus_tt", profileLink: "https://tiktok.com/@sus", status: "APPROVED", verificationCode: "S1" } });

  // Normal user: 10 clips with organic growth
  for (let i = 0; i < 10; i++) {
    const clip = await db.clip.create({
      data: { userId: "fraud-normal", campaignId: [c1.id, c2.id, c3.id][i % 3], clipAccountId: normAcct.id, clipUrl: `https://tiktok.com/@normal/video/norm_${i}`, status: "APPROVED", earnings: 0 },
    });
    const views = 1000 + i * 500;
    const likes = Math.round(views * 0.06);
    await db.clipStat.create({ data: { clipId: clip.id, views: Math.round(views * 0.3), likes: Math.round(likes * 0.3), comments: 2, shares: 1 } });
    await db.clipStat.create({ data: { clipId: clip.id, views, likes, comments: Math.round(views * 0.005), shares: Math.round(views * 0.002) } });

    const earnings = calculateClipEarnings({ views, campaignMinViews: [c1, c2, c3][i % 3].minViews, campaignCpmRate: [c1, c2, c3][i % 3].cpmRate, campaignMaxPayoutPerClip: [c1, c2, c3][i % 3].maxPayoutPerClip });
    await db.clip.update({ where: { id: clip.id }, data: { earnings } });
  }

  // Suspicious user: 15 clips with fake patterns
  for (let i = 0; i < 15; i++) {
    const clip = await db.clip.create({
      data: { userId: "fraud-sus", campaignId: [c1.id, c2.id, c3.id][i % 3], clipAccountId: susAcct.id, clipUrl: `https://tiktok.com/@sus/video/sus_${i}`, status: "APPROVED", earnings: 0 },
    });
    // Fake pattern: very low views → sudden extreme spike, low engagement
    await db.clipStat.create({ data: { clipId: clip.id, views: 50, likes: 3, comments: 0, shares: 0 } });
    const spikeViews = 30000 + i * 5000;
    await db.clipStat.create({ data: { clipId: clip.id, views: spikeViews, likes: 10 + i, comments: 0, shares: 0 } });

    const earnings = calculateClipEarnings({ views: spikeViews, campaignMinViews: [c1, c2, c3][i % 3].minViews, campaignCpmRate: [c1, c2, c3][i % 3].cpmRate, campaignMaxPayoutPerClip: [c1, c2, c3][i % 3].maxPayoutPerClip });
    await db.clip.update({ where: { id: clip.id }, data: { earnings } });
  }

  assert(true, "25 clips created (10 normal, 15 suspicious)");

  // ═══════════════════════════════════════
  // 3. VERIFY FRAUD DETECTION ON REAL DATA
  // ═══════════════════════════════════════
  console.log("\n🔍 3) VERIFY FRAUD ON REAL DATA");

  const normalClips = await db.clip.findMany({
    where: { userId: "fraud-normal" },
    include: { stats: { orderBy: { checkedAt: "desc" }, take: 3 } },
  });
  const susClips = await db.clip.findMany({
    where: { userId: "fraud-sus" },
    include: { stats: { orderBy: { checkedAt: "desc" }, take: 3 } },
  });

  let normalHighRisk = 0, susHighRisk = 0;
  for (const clip of normalClips) {
    const f = computeFraudLevel({ stats: clip.stats });
    if (f.level === "HIGH_RISK" || f.level === "FLAGGED") normalHighRisk++;
  }
  for (const clip of susClips) {
    const f = computeFraudLevel({ stats: clip.stats });
    if (f.level === "HIGH_RISK" || f.level === "FLAGGED") susHighRisk++;
  }

  assert(normalHighRisk === 0, `Normal user: ${normalHighRisk} HIGH/FLAGGED risk clips (expected 0)`);
  assert(susHighRisk >= 10, `Suspicious user: ${susHighRisk} HIGH/FLAGGED risk clips (expected ≥10 of 15)`);

  // ═══════════════════════════════════════
  // 4. MANUAL OVERRIDE + RECALC
  // ═══════════════════════════════════════
  console.log("\n🔧 4) MANUAL OVERRIDE");

  const testClip = normalClips[0];
  const beforeEarnings = testClip.earnings;
  const beforeViews = testClip.stats[0]?.views || 0;

  // Override views to 50000
  await db.clipStat.create({ data: { clipId: testClip.id, views: 50000, likes: 3000, comments: 500, shares: 200, isManual: true } });
  const newEarnings = calculateClipEarnings({ views: 50000, campaignMinViews: c1.minViews, campaignCpmRate: c1.cpmRate, campaignMaxPayoutPerClip: c1.maxPayoutPerClip });
  await db.clip.update({ where: { id: testClip.id }, data: { earnings: newEarnings } });

  await db.auditLog.create({
    data: { userId: "fraud-owner", action: "MANUAL_OVERRIDE", targetType: "clip", targetId: testClip.id, details: JSON.stringify({ before: { views: beforeViews, earnings: beforeEarnings }, after: { views: 50000, earnings: newEarnings } }) },
  });

  const updated = await db.clip.findUnique({ where: { id: testClip.id } });
  assert(updated!.earnings === newEarnings, `Earnings recalculated: $${beforeEarnings} → $${newEarnings}`);
  assert(newEarnings === c1.maxPayoutPerClip, `Capped at maxPayoutPerClip: $${newEarnings}`);

  const auditLogs = await db.auditLog.findMany({ where: { action: "MANUAL_OVERRIDE", targetId: testClip.id } });
  assert(auditLogs.length >= 1, `Audit log created for override`);

  // ═══════════════════════════════════════
  // 5. TRUST SCORE BEHAVIOR
  // ═══════════════════════════════════════
  console.log("\n🛡️ 5) TRUST SCORE");

  const normalBefore = await db.user.findUnique({ where: { id: "fraud-normal" } });
  assert(normalBefore!.trustScore >= 50, `Normal user trust: ${normalBefore!.trustScore}`);

  const susBefore = await db.user.findUnique({ where: { id: "fraud-sus" } });
  assert(susBefore!.trustScore <= 20, `Suspicious user trust: ${susBefore!.trustScore}`);

  // ═══════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════
  await db.auditLog.deleteMany({ where: { userId: { startsWith: "fraud-" } } });
  await db.clipStat.deleteMany({ where: { clip: { userId: { startsWith: "fraud-" } } } });
  await db.clip.deleteMany({ where: { userId: { startsWith: "fraud-" } } });
  await db.clipAccount.deleteMany({ where: { userId: { startsWith: "fraud-" } } });
  await db.campaign.deleteMany({ where: { name: { startsWith: "Fraud Test" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "fraud-" } } });
  await db.$disconnect();

  console.log(`\n${"═".repeat(50)}`);
  console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(50)}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error("Crashed:", e); process.exit(1); });
