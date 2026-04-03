import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

let passed = 0, failed = 0;
function assert(ok: boolean, msg: string) { ok ? (passed++, console.log(`  ✅ ${msg}`)) : (failed++, console.log(`  ❌ ${msg}`)); }

async function main() {
  console.log("🔌 Connected\n");

  const P = "spend-test-";
  // Cleanup
  await db.clipStat.deleteMany({ where: { clip: { userId: { startsWith: P } } } }).catch(() => {});
  await db.clip.deleteMany({ where: { userId: { startsWith: P } } }).catch(() => {});
  await db.clipAccount.deleteMany({ where: { userId: { startsWith: P } } }).catch(() => {});
  await db.campaign.deleteMany({ where: { name: "SPEND-TEST" } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});

  // Setup
  const userA = await db.user.create({ data: { id: P + "a", username: "SpendA" } });
  const userB = await db.user.create({ data: { id: P + "b", username: "SpendB" } });
  const campaign = await db.campaign.create({ data: { name: "SPEND-TEST", platform: "TikTok", status: "ACTIVE", budget: 100, cpmRate: 2, createdById: P + "a" } });
  const accA = await db.clipAccount.create({ data: { userId: userA.id, platform: "TikTok", username: "spendA_tt", profileLink: "https://tiktok.com/@spendA", status: "APPROVED", verificationCode: "S1" } });
  const accB = await db.clipAccount.create({ data: { userId: userB.id, platform: "TikTok", username: "spendB_tt", profileLink: "https://tiktok.com/@spendB", status: "APPROVED", verificationCode: "S2" } });

  // User A: 2 approved clips with earnings
  await db.clip.create({ data: { userId: userA.id, campaignId: campaign.id, clipAccountId: accA.id, clipUrl: "https://tiktok.com/@spendA/v/1", status: "APPROVED", earnings: 5.0 } });
  await db.clip.create({ data: { userId: userA.id, campaignId: campaign.id, clipAccountId: accA.id, clipUrl: "https://tiktok.com/@spendA/v/2", status: "APPROVED", earnings: 3.0 } });

  // User B: 1 approved clip, 1 pending clip
  await db.clip.create({ data: { userId: userB.id, campaignId: campaign.id, clipAccountId: accB.id, clipUrl: "https://tiktok.com/@spendB/v/1", status: "APPROVED", earnings: 2.0 } });
  await db.clip.create({ data: { userId: userB.id, campaignId: campaign.id, clipAccountId: accB.id, clipUrl: "https://tiktok.com/@spendB/v/2", status: "PENDING", earnings: 0 } });

  console.log("── GLOBAL SPEND (what /api/campaigns/spend returns) ──");

  // This is the EXACT query from the API endpoint
  const result = await db.clip.groupBy({
    by: ["campaignId"],
    where: { status: "APPROVED", isDeleted: false, campaign: { isArchived: false } },
    _sum: { earnings: true },
  });

  const spendMap: Record<string, number> = {};
  for (const row of result) {
    spendMap[row.campaignId] = Math.round((row._sum.earnings || 0) * 100) / 100;
  }

  const globalSpend = spendMap[campaign.id] || 0;
  console.log(`  Campaign spend: $${globalSpend}`);
  assert(globalSpend === 10, `Global spend = $${globalSpend} (expected $10: $5 + $3 + $2)`);

  // Verify per-user queries would give WRONG results (the old bug)
  console.log("\n── PER-USER SPEND (the old broken behavior) ──");
  const userAClips = await db.clip.findMany({ where: { userId: userA.id, status: "APPROVED", isDeleted: false } });
  const userASpend = userAClips.reduce((s, c) => s + c.earnings, 0);
  console.log(`  User A sees: $${userASpend} (was showing this as campaign spend)`);
  assert(userASpend === 8, `User A own earnings = $${userASpend}`);
  assert(userASpend !== globalSpend, `User A spend ($${userASpend}) ≠ global ($${globalSpend}) — proves the bug`);

  const userBClips = await db.clip.findMany({ where: { userId: userB.id, status: "APPROVED", isDeleted: false } });
  const userBSpend = userBClips.reduce((s, c) => s + c.earnings, 0);
  console.log(`  User B sees: $${userBSpend} (was showing this as campaign spend)`);
  assert(userBSpend === 2, `User B own earnings = $${userBSpend}`);
  assert(userBSpend !== globalSpend, `User B spend ($${userBSpend}) ≠ global ($${globalSpend}) — proves the bug`);

  // Verify: if we undo approval on User A's $5 clip, global drops to $5
  console.log("\n── UNDO APPROVE → SPEND UPDATES ──");
  const clipToUndo = await db.clip.findFirst({ where: { userId: userA.id, earnings: 5, status: "APPROVED" } });
  if (clipToUndo) {
    await db.clip.update({ where: { id: clipToUndo.id }, data: { status: "PENDING" } });
    const afterUndo = await db.clip.groupBy({
      by: ["campaignId"],
      where: { status: "APPROVED", isDeleted: false, campaign: { isArchived: false } },
      _sum: { earnings: true },
    });
    const newSpend = afterUndo.find(r => r.campaignId === campaign.id)?._sum.earnings || 0;
    console.log(`  After undo: $${newSpend}`);
    assert(newSpend === 5, `Spend after undo = $${newSpend} (expected $5: $3 + $2)`);

    // Re-approve
    await db.clip.update({ where: { id: clipToUndo.id }, data: { status: "APPROVED" } });
    const afterReapprove = await db.clip.groupBy({
      by: ["campaignId"],
      where: { status: "APPROVED", isDeleted: false, campaign: { isArchived: false } },
      _sum: { earnings: true },
    });
    const reSpend = afterReapprove.find(r => r.campaignId === campaign.id)?._sum.earnings || 0;
    assert(reSpend === 10, `Spend after re-approve = $${reSpend} (expected $10)`);
  }

  // Cleanup
  await db.clip.deleteMany({ where: { userId: { startsWith: P } } });
  await db.clipAccount.deleteMany({ where: { userId: { startsWith: P } } });
  await db.campaign.deleteMany({ where: { name: "SPEND-TEST" } });
  await db.user.deleteMany({ where: { id: { startsWith: P } } });

  await db.$disconnect();
  console.log(`\n${"═".repeat(40)}`);
  console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(40));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
