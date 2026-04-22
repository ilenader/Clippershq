/**
 * Reversal utility for the pre-launch reset tool (/admin/reset-data).
 *
 * By default restores anything soft-deleted in the last 24 h:
 *   npm run restore:deleted               (defaults to 24 h window)
 *   RESTORE_WINDOW_HOURS=72 npm run restore:deleted
 *   DRY_RUN=1 npm run restore:deleted     (prints counts, commits nothing)
 *
 * Scope:
 *   - Users where deletedAt is within the window → isDeleted=false, deletedAt=null
 *   - Campaigns where updatedAt is within the window AND isArchived=true AND
 *     status="ARCHIVED" → isArchived=false, status="PAUSED" (conservative; owner
 *     can re-activate manually if they want it LIVE)
 *   - Clips where updatedAt is within the window AND isDeleted=true → isDeleted=false
 *   - Tracking jobs where lastCheckedAt/updatedAt falls in the window AND
 *     isActive=false AND the underlying clip is now un-deleted → isActive=true
 *
 * Loads env first via dotenv/config; uses relative imports so tsx resolves
 * without TS path-alias support.
 */
import "dotenv/config";

async function main() {
  const hours = parseInt(process.env.RESTORE_WINDOW_HOURS || "24", 10);
  const dryRun = process.env.DRY_RUN === "1";
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  console.log(`[RESTORE] Window: last ${hours} h (since ${cutoff.toISOString()})`);
  console.log(`[RESTORE] Mode: ${dryRun ? "DRY-RUN (no writes)" : "COMMIT"}`);

  const { db } = await import("../src/lib/db");
  if (!db) {
    console.error("[RESTORE] DB unavailable. Is DATABASE_URL set?");
    process.exit(1);
  }

  try {
    const [userCount, campaignCount, clipCount] = await Promise.all([
      db.user.count({ where: { isDeleted: true, deletedAt: { gte: cutoff } } }),
      // CampaignStatus enum has no "ARCHIVED" value — the convention is
      // isArchived=true + archivedAt timestamp; status sits at "PAUSED".
      // Scope the restore to things the reset tool actually archived by
      // using archivedAt as the cutoff key.
      db.campaign.count({ where: { isArchived: true, archivedAt: { gte: cutoff } } }),
      db.clip.count({ where: { isDeleted: true, updatedAt: { gte: cutoff } } }),
    ]);

    console.log(`[RESTORE] Would restore: ${userCount} users · ${campaignCount} campaigns · ${clipCount} clips`);

    if (dryRun) {
      console.log("[RESTORE] DRY-RUN complete, no writes performed.");
      await db.$disconnect();
      process.exit(0);
    }

    const result = await db.$transaction(async (tx: any) => {
      const u = await tx.user.updateMany({
        where: { isDeleted: true, deletedAt: { gte: cutoff } },
        data: { isDeleted: false, deletedAt: null },
      });
      const c = await tx.campaign.updateMany({
        where: { isArchived: true, archivedAt: { gte: cutoff } },
        data: { isArchived: false, archivedAt: null, archivedById: null },
      });
      const cl = await tx.clip.updateMany({
        where: { isDeleted: true, updatedAt: { gte: cutoff } },
        data: { isDeleted: false },
      });
      // Reactivate any tracking jobs for clips we just restored.
      const restoredClips = await tx.clip.findMany({
        where: { isDeleted: false, updatedAt: { gte: cutoff } },
        select: { id: true },
        take: 50000,
      });
      const t = await tx.trackingJob.updateMany({
        where: { clipId: { in: restoredClips.map((c: any) => c.id) }, isActive: false },
        data: { isActive: true },
      });
      return { users: u.count, campaigns: c.count, clips: cl.count, trackingJobs: t.count };
    });

    console.log(`[RESTORE] DONE: ${JSON.stringify(result)}`);
    await db.$disconnect();
    process.exit(0);
  } catch (err) {
    console.error("[RESTORE] Failed:", err);
    try { await db.$disconnect(); } catch {}
    process.exit(1);
  }
}

main();
