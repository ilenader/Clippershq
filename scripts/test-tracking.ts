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

  // Find real clips with tracking jobs
  const jobs = await db.trackingJob.findMany({
    include: { clip: { select: { id: true, clipUrl: true, status: true } } },
  });
  console.log(`📋 Tracking jobs in DB: ${jobs.length}`);
  for (const j of jobs) {
    console.log(`  ${j.id} | clip=${j.clip?.id?.slice(0,8)} | active=${j.isActive} | interval=${j.checkIntervalMin}min | next=${j.nextCheckAt.toISOString()} | flats=${j.consecutiveFlats}`);
  }

  // Find all clip stats
  const allStats = await db.clipStat.findMany({
    orderBy: { checkedAt: "asc" },
    include: { clip: { select: { id: true, clipUrl: true } } },
  });
  console.log(`\n📊 Total ClipStat snapshots in DB: ${allStats.length}`);

  // Group by clip
  const byClip: Record<string, typeof allStats> = {};
  for (const s of allStats) {
    if (!byClip[s.clipId]) byClip[s.clipId] = [];
    byClip[s.clipId].push(s);
  }

  for (const [clipId, stats] of Object.entries(byClip)) {
    console.log(`\n  Clip ${clipId.slice(0, 8)}... (${stats.length} snapshots):`);
    for (const s of stats) {
      const t = new Date(s.checkedAt);
      console.log(`    ${t.getMonth()+1}/${t.getDate()} ${t.getHours().toString().padStart(2,"0")}:${t.getMinutes().toString().padStart(2,"0")} | views=${s.views} likes=${s.likes} comments=${s.comments} shares=${s.shares} | manual=${s.isManual}`);
    }
  }

  // Test: manually simulate what the cron would do
  console.log("\n── Simulating cron execution ──");
  const dueJobs = await db.trackingJob.findMany({
    where: { isActive: true, nextCheckAt: { lte: new Date(Date.now() + 60 * 60 * 1000) } }, // due within 1h
    include: { clip: { select: { clipUrl: true } } },
  });
  console.log(`  Jobs due within 1 hour: ${dueJobs.length}`);
  for (const j of dueJobs) {
    console.log(`    ${j.id} | ${j.clip?.clipUrl?.slice(0, 50)} | due at ${j.nextCheckAt.toISOString()}`);
  }

  // Test the cron endpoint directly (if server is running)
  console.log("\n── Calling cron endpoint ──");
  try {
    const res = await fetch("http://localhost:3000/api/cron/tracking", { signal: AbortSignal.timeout(120000) });
    const data = await res.json();
    console.log(`  Status: ${res.status}`);
    console.log(`  Result:`, JSON.stringify(data, null, 2));
    assert(res.ok, "Cron endpoint returned OK");
  } catch (e: any) {
    console.log(`  Error (server may not be running): ${e.message}`);
    console.log("  ⚠️  Skipping cron test — restart dev server and try again");
  }

  // Check if any new snapshots were created
  const afterStats = await db.clipStat.count();
  console.log(`\n  Total snapshots after cron: ${afterStats} (was ${allStats.length})`);
  if (afterStats > allStats.length) {
    console.log(`  ✅ New snapshots created by cron! (+${afterStats - allStats.length})`);
  }

  await db.$disconnect();
  console.log(`\n${"═".repeat(40)}`);
  console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(40));
}

main().catch(e => { console.error(e); process.exit(1); });
