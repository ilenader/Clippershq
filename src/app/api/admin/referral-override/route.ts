import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { checkBanStatus } from "@/lib/check-ban";
import { checkRoleAwareRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { recalculateUnpaidEarnings } from "@/lib/gamification";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * OWNER-only referral override. Lets the owner retroactively set a referrer on
 * any clipper when the referral happened outside the platform (Discord DM,
 * word of mouth, etc.) so the link-based flow never fired.
 *
 * Effects:
 *   • referredById is written so the existing fee logic (earnings-calc.ts)
 *     immediately applies the 4% referred-user fee.
 *   • All unpaid APPROVED clips are recalculated via
 *     recalculateUnpaidEarnings — the referred user's earnings shift to
 *     reflect the lower fee going forward.
 *   • The referrer's 5% is computed on-the-fly from the referred user's
 *     aggregate totalEarnings (referrals.ts/getReferralStats), so no
 *     separate ReferralEarning row needs to be created — lifetime credit is
 *     automatic.
 *
 * Override vs natural: referrerOverriddenBy/At are the markers. DELETE only
 * clears the override; natural referrals (both fields null) cannot be removed
 * through this endpoint.
 *
 * Clipper-side UI is deliberately identical for natural and overridden
 * referrals — the referred user should never see an "override" indicator.
 */

async function assertOwner(session: any) {
  if (!session?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const banCheck = checkBanStatus(session);
  if (banCheck) return { error: banCheck };
  if (!db) return { error: NextResponse.json({ error: "Database unavailable" }, { status: 500 }) };
  // Session role can be stale — reverify against DB.
  const fresh = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (fresh?.role !== "OWNER") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true as const };
}

/**
 * Walks the referral chain up from `startId`, returning true if we ever hit
 * `targetUserId` (which would mean setting targetUserId → startId creates a
 * cycle). Cap at 50 hops to defend against bad data.
 */
async function wouldCreateCycle(targetUserId: string, newReferrerId: string): Promise<boolean> {
  if (!db) return false;
  if (targetUserId === newReferrerId) return true;
  let currentId: string | null = newReferrerId;
  const visited = new Set<string>();
  let hops = 0;
  while (currentId && hops < 50) {
    if (currentId === targetUserId) return true;
    if (visited.has(currentId)) return true;
    visited.add(currentId);
    const next: { referredById: string | null } | null = await db.user.findUnique({
      where: { id: currentId },
      select: { referredById: true },
    });
    currentId = next?.referredById ?? null;
    hops += 1;
  }
  return false;
}

/**
 * GET — list every CLIPPER with their current referrer info. Used to populate
 * both the main table and the "pick a referrer" modal on the admin page.
 * Excludes deleted + banned users from the selectable side; includes them in
 * the main list so the owner can still see / remove overrides on inactive
 * accounts.
 */
export async function GET() {
  const session = await getSession();
  const gate = await assertOwner(session);
  if ("error" in gate) return gate.error;
  if (!db) return NextResponse.json([]);

  try {
    const clippers = await db.user.findMany({
      where: { role: "CLIPPER", isDeleted: false },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        status: true,
        totalEarnings: true,
        referredById: true,
        referrerOverriddenBy: true,
        referrerOverriddenAt: true,
        createdAt: true,
        referredBy: {
          select: { id: true, username: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    return NextResponse.json(clippers);
  } catch (err: any) {
    console.error("[REFERRAL-OVERRIDE] GET failed:", err?.message);
    return NextResponse.json([]);
  }
}

/**
 * POST — set or change a clipper's referrer. Body: { userId, referrerId }.
 * Blocks when the target already has ANY referrer (natural or overridden) —
 * the spec requires the owner to explicitly remove an existing referrer first
 * rather than silently replacing one.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  const gate = await assertOwner(session);
  if ("error" in gate) return gate.error;
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const role = (session?.user as any)?.role;
  const rl = checkRoleAwareRateLimit(`referral-override:${session!.user.id}`, 30, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : null;
  const referrerId = typeof body.referrerId === "string" ? body.referrerId : null;
  if (!userId || !referrerId) {
    return NextResponse.json({ error: "userId and referrerId are required" }, { status: 400 });
  }
  if (userId === referrerId) {
    return NextResponse.json({ error: "A user cannot refer themselves" }, { status: 400 });
  }

  const [target, referrer] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isDeleted: true, referredById: true, username: true },
    }),
    db.user.findUnique({
      where: { id: referrerId },
      select: { id: true, role: true, isDeleted: true, status: true, username: true },
    }),
  ]);

  if (!target || target.isDeleted) return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  if (target.role !== "CLIPPER") return NextResponse.json({ error: "Target must be a CLIPPER" }, { status: 400 });
  if (target.referredById) {
    return NextResponse.json(
      { error: "User already has a referrer. Remove it first if you want to set a different one." },
      { status: 400 },
    );
  }
  if (!referrer || referrer.isDeleted) return NextResponse.json({ error: "Referrer not found" }, { status: 404 });
  if (referrer.role !== "CLIPPER") return NextResponse.json({ error: "Referrer must be a CLIPPER" }, { status: 400 });
  if ((referrer as any).status === "BANNED") {
    return NextResponse.json({ error: "Referrer is banned" }, { status: 400 });
  }

  if (await wouldCreateCycle(userId, referrerId)) {
    return NextResponse.json({ error: "That would create a circular referral chain" }, { status: 400 });
  }

  try {
    const now = new Date();
    await db.$transaction(async (tx: any) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          referredById: referrerId,
          referrerOverriddenBy: session!.user!.id,
          referrerOverriddenAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session!.user!.id,
          action: "REFERRAL_OVERRIDE",
          targetType: "user",
          targetId: userId,
          details: JSON.stringify({
            referrerId,
            referrerUsername: referrer.username,
            targetUsername: target.username,
          }),
        },
      }).catch(() => {}); // AuditLog schema drift shouldn't fail the write
    });

    // Recalc outside the transaction — it touches many clips and runs its own
    // writes. Failure here doesn't roll back the override, which is fine:
    // referredById is already set so future tracking/approval writes will
    // pick up the new fee automatically.
    let clipsUpdated = 0;
    try {
      const res = await recalculateUnpaidEarnings(userId);
      clipsUpdated = res.clipsUpdated;
    } catch (recalcErr: any) {
      console.error("[REFERRAL-OVERRIDE] Post-set recalc failed:", recalcErr?.message);
    }

    return NextResponse.json({ success: true, clipsUpdated });
  } catch (err: any) {
    console.error("[REFERRAL-OVERRIDE] POST failed:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to set referrer" }, { status: 500 });
  }
}

/**
 * DELETE — remove an override. Natural referrals (no `referrerOverriddenBy`
 * marker) are rejected to protect the attach-at-signup flow. Body comes in
 * via ?userId=... since DELETE doesn't conventionally carry a JSON body in
 * our existing admin endpoints.
 */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  const gate = await assertOwner(session);
  if ("error" in gate) return gate.error;
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const role = (session?.user as any)?.role;
  const rl = checkRoleAwareRateLimit(`referral-override:${session!.user.id}`, 30, 60 * 60_000, role);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const target = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      referredById: true,
      referrerOverriddenBy: true,
    },
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!target.referredById) {
    return NextResponse.json({ error: "User has no referrer to remove" }, { status: 400 });
  }
  if (!target.referrerOverriddenBy) {
    return NextResponse.json(
      { error: "Cannot remove a natural referral. Only manual overrides can be removed here." },
      { status: 400 },
    );
  }

  try {
    const previousReferrerId = target.referredById;
    await db.$transaction(async (tx: any) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          referredById: null,
          referrerOverriddenBy: null,
          referrerOverriddenAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: session!.user!.id,
          action: "REFERRAL_OVERRIDE_REMOVED",
          targetType: "user",
          targetId: userId,
          details: JSON.stringify({
            previousReferrerId,
            targetUsername: target.username,
          }),
        },
      }).catch(() => {});
    });

    let clipsUpdated = 0;
    try {
      const res = await recalculateUnpaidEarnings(userId);
      clipsUpdated = res.clipsUpdated;
    } catch (recalcErr: any) {
      console.error("[REFERRAL-OVERRIDE] Post-remove recalc failed:", recalcErr?.message);
    }

    return NextResponse.json({ success: true, clipsUpdated });
  } catch (err: any) {
    console.error("[REFERRAL-OVERRIDE] DELETE failed:", err?.message);
    return NextResponse.json({ error: err?.message || "Failed to remove override" }, { status: 500 });
  }
}
