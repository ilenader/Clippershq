import { runDueTrackingJobs } from "@/lib/tracking";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/dev/run-tracking
 *
 * Dev-only endpoint to manually trigger tracking execution.
 * Also shows current tracking state for debugging.
 *
 * Usage:
 *   /api/dev/run-tracking           → run all due jobs
 *   /api/dev/run-tracking?force=1   → make ALL active jobs due right now, then run them
 *   /api/dev/run-tracking?status=1  → just show current job state, don't run anything
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Dev-only endpoint" }, { status: 403 });
  }

  // Require OWNER session even in dev/preview
  const { getSession } = await import("@/lib/get-session");
  const session = await getSession();
  if (!session?.user || (session.user as any).role !== "OWNER") {
    return NextResponse.json({ error: "Owner authentication required" }, { status: 403 });
  }

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const force = req.nextUrl.searchParams.get("force") === "1";
  const statusOnly = req.nextUrl.searchParams.get("status") === "1";

  // Always show current state of all tracking jobs
  const allJobs = await db.trackingJob.findMany({
    include: {
      clip: {
        select: {
          id: true,
          clipUrl: true,
          status: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const jobSummary = allJobs.map((j: any) => ({
    jobId: j.id,
    clipId: j.clipId,
    clipStatus: j.clip?.status,
    clipUrl: j.clip?.clipUrl?.slice(0, 60),
    isActive: j.isActive,
    nextCheckAt: j.nextCheckAt?.toISOString(),
    lastCheckedAt: j.lastCheckedAt?.toISOString(),
    isDueNow: j.nextCheckAt <= new Date(),
    checkIntervalMin: j.checkIntervalMin,
    consecutiveFlats: j.consecutiveFlats,
  }));

  // Count snapshots per clip
  const snapshotCounts: Record<string, number> = {};
  for (const j of allJobs) {
    const count = await db.clipStat.count({ where: { clipId: j.clipId } });
    snapshotCounts[j.clipId] = count;
  }

  if (statusOnly) {
    return NextResponse.json({
      message: "Status only — no jobs executed",
      totalJobs: allJobs.length,
      activeJobs: allJobs.filter((j: any) => j.isActive).length,
      dueNow: allJobs.filter((j: any) => j.isActive && j.nextCheckAt <= new Date()).length,
      jobs: jobSummary,
      snapshotCounts,
      now: new Date().toISOString(),
    });
  }

  // Force mode: set all active jobs to be due right now
  if (force) {
    const updated = await db.trackingJob.updateMany({
      where: { isActive: true },
      data: { nextCheckAt: new Date(Date.now() - 60000) }, // 1 minute ago
    });
    console.log(`[DEV] Force-triggered ${updated.count} tracking jobs`);
  }

  // Run the tracking
  const result = await runDueTrackingJobs();

  return NextResponse.json({
    ...result,
    forced: force,
    jobs: jobSummary,
    snapshotCounts,
    now: new Date().toISOString(),
  });
}
