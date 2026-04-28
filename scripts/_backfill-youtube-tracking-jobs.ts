/**
 * One-time recovery: backfill TrackingJob rows for YouTube clips that were
 * submitted before the platform allowlist was widened to include YouTube.
 *
 * BACKGROUND
 * ----------
 * Pre-fix, src/app/api/clips/route.ts and src/actions/clips.ts only created
 * a TrackingJob if the detected platform was "tiktok" or "instagram".
 * YouTube clips therefore had no tracking row, so the cron query
 * (`isActive=true AND nextCheckAt <= now()`) never picked them up. View data
 * for the first 8-10 hours of those clips is lost.
 *
 * The fix at src/app/api/clips/route.ts and src/actions/clips.ts adds
 * "youtube" to the allowlist for new submissions. This script patches the
 * existing rows that pre-date the fix.
 *
 * SAFETY
 * ------
 *  - Idempotent: existence-checks each clip's TrackingJob before creating
 *    one. Safe to run multiple times — second run is a no-op.
 *  - Read-modify-write per clip via withDbRetry — survives transient DB
 *    blips on Supabase.
 *  - Non-destructive: only INSERTS into tracking_jobs. Does not touch the
 *    clip row, ClipStat history, or any other table.
 *  - No audit log: this is one-time recovery, not ongoing operation.
 *
 * USAGE
 * -----
 * From the project root, with .env present and DATABASE_URL set to the
 * production Supabase connection string:
 *
 *   npx tsx scripts/_backfill-youtube-tracking-jobs.ts
 *
 * The script prints one line per clip processed and a final summary.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withDbRetry } from "../src/lib/db-retry";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

function isYouTubeUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes("youtube.com") || lower.includes("youtu.be");
}

async function main() {
  console.log("[BACKFILL] Starting YouTube TrackingJob backfill");

  // Find every non-deleted clip whose URL is a YouTube link AND has no
  // TrackingJob row. The relation filter `trackingJob: null` leverages
  // the 1:1 relation defined on the Clip model.
  const candidates = await withDbRetry(
    () => db.clip.findMany({
      where: {
        isDeleted: false,
        trackingJob: null,
        OR: [
          { clipUrl: { contains: "youtube.com", mode: "insensitive" } },
          { clipUrl: { contains: "youtu.be", mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        campaignId: true,
        clipUrl: true,
        status: true,
        createdAt: true,
      },
      take: 5000,
    }),
    "backfill.youtube.findCandidates",
  );

  console.log(`[BACKFILL] Found ${candidates.length} YouTube clip(s) without a TrackingJob`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const clip of candidates) {
    // Defensive double-check: the Prisma `trackingJob: null` filter above is
    // authoritative, but we re-check here so a parallel run (or the review
    // route's safety net firing concurrently) cannot cause a duplicate-key
    // (P2002) error on the unique clipId constraint.
    if (!isYouTubeUrl(clip.clipUrl)) {
      console.log(`[BACKFILL] Skipped (not YouTube on second look): ${clip.id}`);
      skipped++;
      continue;
    }

    try {
      const existing = await withDbRetry(
        () => db.trackingJob.findUnique({ where: { clipId: clip.id }, select: { id: true } }),
        "backfill.youtube.checkExisting",
      );
      if (existing) {
        console.log(`[BACKFILL] Skipped (already has job): ${clip.id}`);
        skipped++;
        continue;
      }

      await withDbRetry(
        () => db.trackingJob.create({
          data: {
            clipId: clip.id,
            campaignId: clip.campaignId,
            nextCheckAt: new Date(), // pick up on next 5-min cron tick
            checkIntervalMin: 120,
            isActive: true,
          },
        }),
        "backfill.youtube.createJob",
      );
      console.log(`[BACKFILL] Created TrackingJob for clip ${clip.id} (status=${clip.status}, age=${Math.round((Date.now() - clip.createdAt.getTime()) / 3_600_000)}h)`);
      created++;
    } catch (err: any) {
      // P2002 = a parallel writer just created the row. Treat as success.
      if (err?.code === "P2002") {
        console.log(`[BACKFILL] Skipped (race: P2002): ${clip.id}`);
        skipped++;
        continue;
      }
      console.error(`[BACKFILL] Error on clip ${clip.id}: ${err?.message || err}`);
      errors++;
    }
  }

  console.log(
    `[BACKFILL] Done — ${created} created, ${skipped} skipped, ${errors} errors, ${candidates.length} total candidates`,
  );

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("[BACKFILL] Fatal:", err);
  await db.$disconnect();
  process.exit(1);
});
