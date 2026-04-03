import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeBalance, computeCampaignBalances } from "../src/lib/balance";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

let passed = 0, failed = 0;
function assert(ok: boolean, msg: string) {
  if (ok) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; console.log(`  ❌ ${msg}`); }
}

async function main() {
  const P = "esync-";
  // Cleanup
  await db.clipStat.deleteMany({ where: { clip: { userId: { startsWith: P } } } }).catch(() => {});
  await db.clip.deleteMany({ where: { userId: { startsWith: P } } }).catch(() => {});
  await db.clipAccount.deleteMany({ where: { userId: { startsWith: P } } }).catch(() => {});
  await db.campaign.deleteMany({ where: { name: { startsWith: "ESYNC-" } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});

  // Setup
  await db.user.create({ data: { id: P + "clipper", username: "ESync Clipper", role: "CLIPPER" } });
  const campaign = await db.campaign.create({ data: { name: "ESYNC-Test", platform: "TikTok", status: "ACTIVE", cpmRate: 2.0, minViews: 1000, maxPayoutPerClip: 50 } });
  const account = await db.clipAccount.create({ data: { userId: P + "clipper", platform: "TikTok", username: "esync_tt", profileLink: "https://tiktok.com/@esync", status: "APPROVED", verificationCode: "ES01" } });
  const clip = await db.clip.create({ data: { userId: P + "clipper", campaignId: campaign.id, clipAccountId: account.id, clipUrl: "https://tiktok.com/@esync/video/001", status: "PENDING", earnings: 0 } });
  await db.clipStat.create({ data: { clipId: clip.id, views: 5000, likes: 200 } });

  console.log("\n📊 A) PENDING clip — earnings should be $0");
  let clips = await db.clip.findMany({ where: { userId: P + "clipper", isDeleted: false }, select: { earnings: true, status: true, campaignId: true } });
  let bal = computeBalance({ clips, payouts: [] });
  assert(bal.approvedEarnings === 0, `Approved earnings = $${bal.approvedEarnings} (expected $0)`);
  assert(bal.totalEarned === 0, `Total earned = $${bal.totalEarned} (expected $0)`);
  assert(bal.available === 0, `Available = $${bal.available} (expected $0)`);

  console.log("\n📊 B) APPROVE clip + set earnings = $10");
  await db.clip.update({ where: { id: clip.id }, data: { status: "APPROVED", earnings: 10 } });
  clips = await db.clip.findMany({ where: { userId: P + "clipper", isDeleted: false }, select: { earnings: true, status: true, campaignId: true } });
  bal = computeBalance({ clips, payouts: [] });
  assert(bal.approvedEarnings === 10, `Approved earnings = $${bal.approvedEarnings} (expected $10)`);
  assert(bal.totalEarned === 10, `Total earned = $${bal.totalEarned} (expected $10)`);
  assert(bal.available === 10, `Available = $${bal.available} (expected $10)`);

  console.log("\n📊 C) UNDO approval → back to PENDING");
  await db.clip.update({ where: { id: clip.id }, data: { status: "PENDING" } });
  clips = await db.clip.findMany({ where: { userId: P + "clipper", isDeleted: false }, select: { earnings: true, status: true, campaignId: true } });
  bal = computeBalance({ clips, payouts: [] });
  // Even though earnings field is still 10 in DB, balance should show $0 for approved
  assert(bal.approvedEarnings === 0, `Approved earnings = $${bal.approvedEarnings} (expected $0 after undo)`);
  assert(bal.totalEarned === 0, `Total earned = $${bal.totalEarned} (expected $0 after undo)`);
  assert(bal.available === 0, `Available = $${bal.available} (expected $0 after undo)`);

  console.log("\n📊 D) REJECT clip");
  await db.clip.update({ where: { id: clip.id }, data: { status: "REJECTED" } });
  clips = await db.clip.findMany({ where: { userId: P + "clipper", isDeleted: false }, select: { earnings: true, status: true, campaignId: true } });
  bal = computeBalance({ clips, payouts: [] });
  assert(bal.approvedEarnings === 0, `Approved earnings = $${bal.approvedEarnings} (expected $0 after reject)`);
  assert(bal.available === 0, `Available = $${bal.available} (expected $0 after reject)`);

  console.log("\n📊 E) RE-APPROVE clip");
  await db.clip.update({ where: { id: clip.id }, data: { status: "APPROVED" } });
  clips = await db.clip.findMany({ where: { userId: P + "clipper", isDeleted: false }, select: { earnings: true, status: true, campaignId: true } });
  bal = computeBalance({ clips, payouts: [] });
  assert(bal.approvedEarnings === 10, `Approved earnings = $${bal.approvedEarnings} (expected $10 after re-approve)`);
  assert(bal.available === 10, `Available = $${bal.available} (expected $10 after re-approve)`);

  console.log("\n📊 F) Campaign-scoped balance");
  const campBal = computeCampaignBalances({ clips, payouts: [] });
  const thisCamp = campBal.find(b => b.campaignId === campaign.id);
  assert(thisCamp?.earned === 10, `Campaign earned = $${thisCamp?.earned} (expected $10)`);
  assert(thisCamp?.available === 10, `Campaign available = $${thisCamp?.available} (expected $10)`);

  console.log("\n📊 G) Undo again — campaign balance drops");
  await db.clip.update({ where: { id: clip.id }, data: { status: "PENDING" } });
  clips = await db.clip.findMany({ where: { userId: P + "clipper", isDeleted: false }, select: { earnings: true, status: true, campaignId: true } });
  const campBal2 = computeCampaignBalances({ clips, payouts: [] });
  const thisCamp2 = campBal2.find(b => b.campaignId === campaign.id);
  assert(!thisCamp2 || thisCamp2.earned === 0, `Campaign earned after undo = $${thisCamp2?.earned || 0} (expected $0)`);

  // Cleanup
  await db.clipStat.deleteMany({ where: { clip: { userId: { startsWith: P } } } }).catch(() => {});
  await db.clip.deleteMany({ where: { userId: { startsWith: P } } }).catch(() => {});
  await db.clipAccount.deleteMany({ where: { userId: { startsWith: P } } }).catch(() => {});
  await db.campaign.deleteMany({ where: { name: { startsWith: "ESYNC-" } } }).catch(() => {});
  await db.user.deleteMany({ where: { id: { startsWith: P } } }).catch(() => {});

  await db.$disconnect();
  console.log(`\n${"═".repeat(40)}\n📊 RESULTS: ${passed} passed, ${failed} failed\n${"═".repeat(40)}`);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
