import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Pre-launch data reset — OWNER only. Soft-delete (no DELETE FROM). Every
 * flagged row stays in the DB and can be restored with scripts/restore-deleted.ts
 * inside a 24 h window. GET previews counts; POST performs the reset inside
 * a single transaction using the SAME selector so preview and execute never
 * drift.
 *
 * Protection order — any failure short-circuits before mutation:
 *   1. session present + role === "OWNER"
 *   2. ban check
 *   3. DB re-read of OWNER role (don't trust the session cookie alone)
 *   4. Production guard — require ?confirm=RESET_PRODUCTION_DATA
 *   5. Self-protection — session.user.id is never in the delete set
 */

const REAL_EARNINGS_THRESHOLD = 10; // $ — clips above this mark users/campaigns as "real"
const USER_INACTIVITY_DAYS = 7;

type Tx = typeof db;

interface ResetTargets {
  campaignIds: string[];
  clipIds: string[];
  userIds: string[];
}

/**
 * Compute which rows would be soft-deleted. Called in both preview (GET) and
 * execute (POST). Callers pass `selfUserId` so the current OWNER is always
 * protected no matter what the role check says.
 */
async function selectTargets(tx: Tx, selfUserId: string): Promise<ResetTargets> {
  // "Real earners" = users with at least one approved clip over the threshold.
  const realEarnerRows = await tx.clip.groupBy({
    by: ["userId"],
    where: {
      status: "APPROVED",
      isDeleted: false,
      videoUnavailable: false,
      earnings: { gt: REAL_EARNINGS_THRESHOLD },
    },
    _count: true,
  });
  const realEarnerIds = new Set(realEarnerRows.map((r: any) => r.userId));

  // "Real campaigns" = any campaign that's ever produced an approved clip over threshold.
  const realCampaignRows = await tx.clip.groupBy({
    by: ["campaignId"],
    where: {
      status: "APPROVED",
      isDeleted: false,
      videoUnavailable: false,
      earnings: { gt: REAL_EARNINGS_THRESHOLD },
    },
    _count: true,
  });
  const realCampaignIds = Array.from(new Set(realCampaignRows.map((r: any) => r.campaignId)));

  // ─ Campaigns to delete: not already archived AND not a "real" campaign.
  const campaignTargets = await tx.campaign.findMany({
    where: {
      isArchived: false,
      ...(realCampaignIds.length > 0 ? { id: { notIn: realCampaignIds } } : {}),
    },
    select: { id: true },
    take: 10000,
  });

  // ─ Clips to delete: any not-yet-deleted clip that's either REJECTED or under
  // the earnings threshold. Real-earning clips are protected automatically.
  const clipTargets = await tx.clip.findMany({
    where: {
      isDeleted: false,
      OR: [
        { status: "REJECTED" },
        { earnings: { lte: REAL_EARNINGS_THRESHOLD } },
      ],
    },
    select: { id: true },
    take: 50000,
  });

  // ─ Users to delete: role = CLIPPER, not already deleted, not a real earner,
  // inactive for > 7 days OR never active. OWNER/ADMIN/CLIENT never touched.
  // Self is explicitly excluded even if somehow they matched.
  const cutoff = new Date(Date.now() - USER_INACTIVITY_DAYS * 86_400_000);
  const realEarnerList = Array.from(realEarnerIds);
  const userTargets = await tx.user.findMany({
    where: {
      role: "CLIPPER",
      isDeleted: false,
      id: { not: selfUserId, ...(realEarnerList.length > 0 ? { notIn: realEarnerList } : {}) } as any,
      OR: [
        { lastActiveDate: { lt: cutoff } },
        { lastActiveDate: null },
      ],
    },
    select: { id: true },
    take: 10000,
  });

  return {
    campaignIds: campaignTargets.map((c: any) => c.id),
    clipIds: clipTargets.map((c: any) => c.id),
    userIds: userTargets.map((u: any) => u.id),
  };
}

/**
 * Confirm OWNER role in DB. Session cookie alone can be stale — this forces a
 * round-trip before any destructive action.
 */
async function verifyOwner(userId: string): Promise<boolean> {
  if (!db) return false;
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, isDeleted: true, status: true },
  });
  return !!row && row.role === "OWNER" && !row.isDeleted && row.status !== "BANNED";
}

/**
 * GET /api/admin/reset-data  — preview-only, returns exact counts the POST
 * would act on when invoked at this moment. Re-running POST immediately after
 * preview is race-free because POST re-queries inside its transaction.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if ((session.user as any).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const verified = await verifyOwner(session.user.id);
  if (!verified) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const targets = await selectTargets(db, session.user.id);

  return NextResponse.json({
    preview: {
      campaigns: targets.campaignIds.length,
      clips: targets.clipIds.length,
      users: targets.userIds.length,
    },
    protections: {
      realEarningsThresholdUSD: REAL_EARNINGS_THRESHOLD,
      userInactivityDays: USER_INACTIVITY_DAYS,
      note:
        "OWNER + ADMIN never touched. Users with any approved clip over " +
        `$${REAL_EARNINGS_THRESHOLD} (real earners) are protected along with their campaigns. ` +
        "You cannot delete yourself.",
    },
  });
}

/**
 * POST /api/admin/reset-data — execute the soft-delete. Body:
 *   { deleteCampaigns?: boolean, deleteClips?: boolean, deleteUsers?: boolean }
 * Flags default to false — the client must explicitly opt each one in.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if ((session.user as any).role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const verified = await verifyOwner(session.user.id);
  if (!verified) {
    return NextResponse.json({ error: "Owner role not verified in DB" }, { status: 403 });
  }

  // Production guard — hard to hit this endpoint by accident in prod.
  if (process.env.NODE_ENV === "production") {
    const confirmParam = req.nextUrl.searchParams.get("confirm");
    if (confirmParam !== "RESET_PRODUCTION_DATA") {
      return NextResponse.json(
        { error: "Production requires ?confirm=RESET_PRODUCTION_DATA in the URL" },
        { status: 400 },
      );
    }
  }

  if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const deleteCampaigns = body.deleteCampaigns === true;
  const deleteClips = body.deleteClips === true;
  const deleteUsers = body.deleteUsers === true;

  if (!deleteCampaigns && !deleteClips && !deleteUsers) {
    return NextResponse.json({ error: "Pick at least one category to delete" }, { status: 400 });
  }

  const now = new Date();
  let deletedCounts = { campaigns: 0, clips: 0, users: 0 };

  try {
    deletedCounts = await db.$transaction(async (tx: any) => {
      const targets = await selectTargets(tx, session.user.id);
      let c = 0, p = 0, u = 0;

      if (deleteCampaigns && targets.campaignIds.length > 0) {
        // Campaign soft-delete = reuse existing isArchived flag. The app
        // already treats isArchived=true as "hidden from all campaign views"
        // and there's an existing restore flow at /api/campaigns/[id]/restore.
        const updated = await tx.campaign.updateMany({
          where: { id: { in: targets.campaignIds }, isArchived: false },
          data: { isArchived: true, status: "ARCHIVED" },
        });
        c = updated.count;
        // Deactivate any still-active tracking jobs on these campaigns so the
        // Railway cron doesn't keep billing Apify for them.
        await tx.trackingJob.updateMany({
          where: { campaignId: { in: targets.campaignIds }, isActive: true },
          data: { isActive: false },
        });
      }

      if (deleteClips && targets.clipIds.length > 0) {
        const updated = await tx.clip.updateMany({
          where: { id: { in: targets.clipIds }, isDeleted: false },
          data: { isDeleted: true },
        });
        p = updated.count;
        await tx.trackingJob.updateMany({
          where: { clipId: { in: targets.clipIds }, isActive: true },
          data: { isActive: false },
        });
      }

      if (deleteUsers && targets.userIds.length > 0) {
        // Belt-and-suspenders — re-check role and self-exclusion at write time.
        const updated = await tx.user.updateMany({
          where: {
            id: { in: targets.userIds, not: session.user.id } as any,
            role: "CLIPPER",
            isDeleted: false,
          },
          data: { isDeleted: true, deletedAt: now },
        });
        u = updated.count;
      }

      return { campaigns: c, clips: p, users: u };
    });

    await logAudit({
      userId: session.user.id,
      action: "RESET_DATA",
      targetType: "SYSTEM",
      targetId: "reset-data",
      details: {
        deleteCampaigns,
        deleteClips,
        deleteUsers,
        deleted: deletedCounts,
        realEarningsThresholdUSD: REAL_EARNINGS_THRESHOLD,
        userInactivityDays: USER_INACTIVITY_DAYS,
      },
    });

    console.log(
      `[RESET-DATA] OWNER ${session.user.id} soft-deleted: ` +
      `${deletedCounts.campaigns} campaigns, ${deletedCounts.clips} clips, ${deletedCounts.users} users`,
    );

    return NextResponse.json({ success: true, deleted: deletedCounts });
  } catch (err: any) {
    console.error("[RESET-DATA] transaction failed:", err?.message);
    return NextResponse.json({ error: "Reset failed — no changes committed." }, { status: 500 });
  }
}
