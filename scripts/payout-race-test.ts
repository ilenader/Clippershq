/**
 * PAYOUT RACE CONDITION TEST
 * Simulates 10 concurrent payout requests against the same balance.
 * Expected: only valid ones succeed, no double-spend.
 * Run: npx tsx scripts/payout-race-test.ts
 */
import "dotenv/config";

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
  await db.payoutRequest.deleteMany({ where: { userId: "race-test-user" } }).catch(() => {});
  await db.clipStat.deleteMany({ where: { clip: { userId: "race-test-user" } } }).catch(() => {});
  await db.clip.deleteMany({ where: { userId: "race-test-user" } }).catch(() => {});
  await db.clipAccount.deleteMany({ where: { userId: "race-test-user" } }).catch(() => {});
  await db.campaign.deleteMany({ where: { name: "Race Test Campaign" } }).catch(() => {});
  await db.user.deleteMany({ where: { id: "race-test-user" } }).catch(() => {});

  // Setup: user with exactly $100 available
  await db.user.create({ data: { id: "race-test-user", username: "RaceTestUser", role: "CLIPPER" } });
  const campaign = await db.campaign.create({
    data: { name: "Race Test Campaign", platform: "TikTok", status: "ACTIVE", budget: 5000, cpmRate: 2.0, minViews: 100, maxPayoutPerClip: 100, createdById: "race-test-user" },
  });
  const account = await db.clipAccount.create({
    data: { userId: "race-test-user", platform: "TikTok", username: "race_acct", profileLink: "https://tiktok.com/@race", status: "APPROVED", verificationCode: "RACE" },
  });

  // Create 5 approved clips each earning $20 = $100 total
  for (let i = 0; i < 5; i++) {
    const clip = await db.clip.create({
      data: { userId: "race-test-user", campaignId: campaign.id, clipAccountId: account.id, clipUrl: `https://tiktok.com/@race/video/race_${i}`, status: "APPROVED", earnings: 20 },
    });
    await db.clipStat.create({ data: { clipId: clip.id, views: 15000, likes: 500 } });
  }

  const totalBefore = await db.clip.aggregate({ where: { userId: "race-test-user", status: "APPROVED" }, _sum: { earnings: true } });
  console.log(`💰 Total available: $${totalBefore._sum.earnings?.toFixed(2)}`);
  console.log(`\n🏁 Launching 10 concurrent $20 payout requests...\n`);

  // Fire 10 concurrent $20 requests against $100 balance
  // Only 5 should succeed, 5 should fail with insufficient balance
  const attempts = 10;
  const amountEach = 20;

  // Use separate Prisma clients to simulate truly concurrent connections
  const clients: any[] = [];
  for (let i = 0; i < attempts; i++) {
    const { PrismaClient } = await import("../src/generated/prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    clients.push(new PrismaClient({ adapter }));
  }

  const results = await Promise.allSettled(
    clients.map((client, i) =>
      client.$transaction(async (tx: any) => {
        // Acquire per-user advisory lock
        const lockKeyResult = await tx.$queryRaw`SELECT hashtext(${"race-test-user"})::int AS lock_key`;
        const lockKey = (lockKeyResult as any)[0].lock_key;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)::text`;

        // Compute balance inside lock
        const clips = await tx.clip.findMany({
          where: { userId: "race-test-user", isDeleted: false, status: "APPROVED" },
          select: { earnings: true },
        });
        const payouts = await tx.payoutRequest.findMany({
          where: { userId: "race-test-user" },
          select: { amount: true, status: true },
        });

        const earned = clips.reduce((s: number, c: any) => s + (c.earnings || 0), 0);
        const paidOut = payouts.filter((p: any) => p.status === "PAID").reduce((s: number, p: any) => s + (p.amount || 0), 0);
        const locked = payouts.filter((p: any) => ["REQUESTED", "UNDER_REVIEW", "APPROVED"].includes(p.status)).reduce((s: number, p: any) => s + (p.amount || 0), 0);
        const available = Math.round(Math.max(earned - paidOut - locked, 0) * 100) / 100;

        if (amountEach > available) {
          throw new Error(`BLOCKED: Request #${i} — insufficient balance ($${available.toFixed(2)} available)`);
        }

        return tx.payoutRequest.create({
          data: { userId: "race-test-user", campaignId: campaign.id, amount: amountEach, walletAddress: `0xRace${i}`, status: "REQUESTED" },
        });
      }, { timeout: 30000 })
    )
  );

  // Analyze results
  let succeeded = 0, blocked = 0, errors = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      succeeded++;
      console.log(`  ✅ Request #${i}: CREATED (payout id: ${r.value.id})`);
    } else {
      const msg = (r.reason as Error).message;
      if (msg.includes("BLOCKED") || msg.includes("insufficient") || msg.includes("Insufficient")) {
        blocked++;
        console.log(`  🛡️ Request #${i}: BLOCKED (${msg.split("—")[1]?.trim() || "insufficient balance"})`);
      } else {
        errors++;
        console.log(`  ❌ Request #${i}: ERROR (${msg})`);
      }
    }
  }

  // Verify final state
  const finalPayouts = await db.payoutRequest.findMany({ where: { userId: "race-test-user" } });
  const totalRequested = finalPayouts.reduce((s: number, p: any) => s + p.amount, 0);

  console.log(`\n${"═".repeat(50)}`);
  console.log(`📊 RESULTS:`);
  console.log(`   Succeeded: ${succeeded}`);
  console.log(`   Blocked:   ${blocked}`);
  console.log(`   Errors:    ${errors}`);
  console.log(`   Total payouts in DB: ${finalPayouts.length}`);
  console.log(`   Total requested: $${totalRequested.toFixed(2)}`);
  console.log(`   Available was: $100.00`);

  const safe = totalRequested <= 100;
  console.log(`\n   ${safe ? "✅ NO DOUBLE SPEND — system is safe" : "❌ DOUBLE SPEND DETECTED — CRITICAL BUG"}`);
  console.log(`${"═".repeat(50)}`);

  // Cleanup
  for (const c of clients) await c.$disconnect().catch(() => {});
  await db.payoutRequest.deleteMany({ where: { userId: "race-test-user" } });
  await db.clipStat.deleteMany({ where: { clip: { userId: "race-test-user" } } });
  await db.clip.deleteMany({ where: { userId: "race-test-user" } });
  await db.clipAccount.deleteMany({ where: { userId: "race-test-user" } });
  await db.campaign.deleteMany({ where: { name: "Race Test Campaign" } });
  await db.user.deleteMany({ where: { id: "race-test-user" } });
  await db.$disconnect();

  process.exit(safe ? 0 : 1);
}

main().catch(e => { console.error("Crashed:", e); process.exit(1); });
